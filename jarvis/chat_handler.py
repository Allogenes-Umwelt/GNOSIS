"""
Orquestador de conversacion Gnosis AI.
Maneja el loop de tool calling y deofuscacion de respuestas.
"""

import json
import uuid

from .llm_interface import LLMProvider
from .ofuscation import ObfuscationLayer
from .tool_executor import ToolExecutor
from .tools import TOOL_DEFINITIONS
from .prompts import SYSTEM_PROMPT
from database import get_connection


MAX_TOOL_ROUNDS = 5  # Maximo de rondas de tool calling por mensaje


class ChatHandler:
    """Maneja una conversacion de chat con Gnosis AI."""

    def __init__(self, llm_provider: LLMProvider):
        self.llm = llm_provider
        self.obfuscation = ObfuscationLayer()
        self.tool_executor = ToolExecutor(self.obfuscation)
        self.messages = []
        self.chat_session_id = str(uuid.uuid4())
        self.total_tokens_in = 0
        self.total_tokens_out = 0

    def reset(self):
        """Reinicia la conversacion."""
        self.obfuscation = ObfuscationLayer()
        self.tool_executor = ToolExecutor(self.obfuscation)
        self.messages = []
        self.chat_session_id = str(uuid.uuid4())
        self.total_tokens_in = 0
        self.total_tokens_out = 0

    def handle_message(self, user_message):
        """Procesa un mensaje del usuario y retorna la respuesta.
        Returns: dict con response, tools_used, tokens
        """
        # Agregar mensaje del usuario
        self.messages.append({
            'role': 'user',
            'content': user_message
        })

        tools_used = []

        # Loop de tool calling
        for round_num in range(MAX_TOOL_ROUNDS):
            response = self.llm.chat(
                messages=self.messages,
                tools=TOOL_DEFINITIONS,
                system=SYSTEM_PROMPT
            )

            self.total_tokens_in += response.get('tokens_input', 0)
            self.total_tokens_out += response.get('tokens_output', 0)

            # Si no hay tool calls, tenemos la respuesta final
            if not response['tool_calls']:
                final_text = response['content']
                # Deofuscar la respuesta
                final_text = self.obfuscation.unmask_text(final_text)

                self.messages.append({
                    'role': 'assistant',
                    'content': final_text
                })

                # Persistir conversacion
                self._save_conversation(user_message, final_text, tools_used)

                return {
                    'response': final_text,
                    'tools_used': tools_used,
                    'tokens': {
                        'input': response.get('tokens_input', 0),
                        'output': response.get('tokens_output', 0),
                        'total_session_input': self.total_tokens_in,
                        'total_session_output': self.total_tokens_out,
                    }
                }

            # Hay tool calls - ejecutarlas
            # Agregar el mensaje del asistente con tool calls
            assistant_content = []
            if response['content']:
                assistant_content.append({
                    'type': 'text',
                    'text': response['content']
                })
            for tc in response['tool_calls']:
                assistant_content.append({
                    'type': 'tool_use',
                    'id': tc['id'],
                    'name': tc['name'],
                    'input': tc['input']
                })

            self.messages.append({
                'role': 'assistant',
                'content': assistant_content
            })

            # Ejecutar cada tool y agregar resultados
            tool_results = []
            for tc in response['tool_calls']:
                result_str, _ = self.tool_executor.execute(tc['name'], tc['input'])
                tools_used.append(tc['name'])
                tool_results.append({
                    'type': 'tool_result',
                    'tool_use_id': tc['id'],
                    'content': result_str
                })

            self.messages.append({
                'role': 'user',
                'content': tool_results
            })

        # Si llegamos aqui, se alcanzo el limite de rondas
        fallback = "He consultado multiples fuentes pero necesito simplificar la consulta. Por favor, intenta con una pregunta mas especifica."
        self.messages.append({
            'role': 'assistant',
            'content': fallback
        })
        return {
            'response': fallback,
            'tools_used': tools_used,
            'tokens': {
                'input': 0,
                'output': 0,
                'total_session_input': self.total_tokens_in,
                'total_session_output': self.total_tokens_out,
            }
        }

    def _save_conversation(self, user_message, assistant_response, tools_used):
        """Guarda la conversacion en la base de datos."""
        try:
            conn = get_connection()
            # Save user message
            conn.execute(
                """INSERT INTO chat_conversations
                   (chat_session_id, role, content, tokens_input, tokens_output)
                   VALUES (?, ?, ?, ?, ?)""",
                (self.chat_session_id, 'user', user_message, 0, 0)
            )
            # Save assistant response
            conn.execute(
                """INSERT INTO chat_conversations
                   (chat_session_id, role, content, tool_calls, tokens_input, tokens_output)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (self.chat_session_id, 'assistant', assistant_response,
                 json.dumps(tools_used) if tools_used else None,
                 self.total_tokens_in, self.total_tokens_out)
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] Error guardando conversacion: {e}")
