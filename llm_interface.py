"""
Interfaz abstracta para proveedores LLM.
Implementaciones: AnthropicProvider (principal), OllamaProvider (fallback offline).
"""

import os
import json
from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Interfaz abstracta para proveedores LLM."""

    @abstractmethod
    def chat(self, messages, tools=None, system=None):
        """Envia mensajes al LLM y retorna la respuesta.
        Returns: dict con keys: content, tool_calls, stop_reason, tokens_input, tokens_output
        """
        pass


class AnthropicProvider(LLMProvider):
    """Proveedor de Anthropic Claude via API."""

    def __init__(self, api_key=None, model="claude-sonnet-4-5-20250929"):
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY no configurada")
        self.model = model

        import anthropic
        self.client = anthropic.Anthropic(api_key=self.api_key)

    def chat(self, messages, tools=None, system=None):
        kwargs = {
            'model': self.model,
            'max_tokens': 4096,
            'messages': messages,
        }
        if system:
            kwargs['system'] = system
        if tools:
            kwargs['tools'] = tools

        response = self.client.messages.create(**kwargs)

        # Parse response
        content_text = ""
        tool_calls = []

        for block in response.content:
            if block.type == 'text':
                content_text += block.text
            elif block.type == 'tool_use':
                tool_calls.append({
                    'id': block.id,
                    'name': block.name,
                    'input': block.input
                })

        return {
            'content': content_text,
            'tool_calls': tool_calls,
            'stop_reason': response.stop_reason,
            'tokens_input': response.usage.input_tokens,
            'tokens_output': response.usage.output_tokens,
        }


class OllamaProvider(LLMProvider):
    """Proveedor Ollama para uso offline (fallback)."""

    def __init__(self, model="llama3.1", base_url="http://localhost:11434"):
        self.model = model
        self.base_url = base_url

    def chat(self, messages, tools=None, system=None):
        import requests

        ollama_messages = []
        if system:
            ollama_messages.append({'role': 'system', 'content': system})

        for msg in messages:
            if isinstance(msg.get('content'), str):
                ollama_messages.append(msg)
            elif isinstance(msg.get('content'), list):
                # Flatten content blocks for Ollama
                text = ' '.join(
                    b.get('text', '') for b in msg['content']
                    if b.get('type') == 'text'
                )
                if text:
                    ollama_messages.append({'role': msg['role'], 'content': text})

        payload = {
            'model': self.model,
            'messages': ollama_messages,
            'stream': False,
        }

        resp = requests.post(f"{self.base_url}/api/chat", json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()

        return {
            'content': data.get('message', {}).get('content', ''),
            'tool_calls': [],  # Ollama basic mode doesn't support tool calling
            'stop_reason': 'end_turn',
            'tokens_input': data.get('prompt_eval_count', 0),
            'tokens_output': data.get('eval_count', 0),
        }
