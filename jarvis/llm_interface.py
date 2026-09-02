"""
Interfaz abstracta para proveedores LLM y registro de seleccion.

Implementaciones: DeepSeekProvider (default), AnthropicProvider
(fallback activable en admin), OllamaProvider (fallback offline).

Contrato interno (formato Anthropic): los mensajes viajan como bloques
text / tool_use / tool_result y las tools con input_schema. Cada
proveedor convierte HACIA/DESDE su propio formato en sus fronteras;
ChatHandler y las funciones de extraccion nunca ven diferencias.
"""

import os
import json
from abc import ABC, abstractmethod

from registro import log

_log = log("jarvis.llm")


class LLMProvider(ABC):
    """Interfaz abstracta para proveedores LLM."""

    @abstractmethod
    def chat(self, messages, tools=None, system=None):
        """Envia mensajes al LLM y retorna la respuesta.
        Returns: dict con keys: content, tool_calls, stop_reason, tokens_input, tokens_output
        """
        pass


#: Reintentos ante fallos TRANSITORIOS del proveedor. Un 429 o un 5xx puntual
#: abortaba el turno entero y el operador perdía la pregunta; Anthropic ya
#: reintenta dentro de su SDK, DeepSeek y Ollama no. La llamada de chat es
#: idempotente para este uso (no muta nada), así que reintentarla es seguro.
REINTENTOS = 2
ESPERA_BASE = 1.5     # segundos; se dobla en cada intento
_TRANSITORIOS = (429, 500, 502, 503, 504, 529)


def _reintentar(llamada, quien):
    """Ejecuta `llamada`, reintentando solo lo transitorio."""
    import time

    import requests as _rq

    ultimo = None
    for intento in range(REINTENTOS + 1):
        try:
            return llamada()
        except _rq.HTTPError as e:
            codigo = getattr(e.response, "status_code", None)
            if codigo not in _TRANSITORIOS or intento == REINTENTOS:
                raise
            ultimo = e
        except (_rq.ConnectionError, _rq.Timeout) as e:
            if intento == REINTENTOS:
                raise
            ultimo = e
        espera = ESPERA_BASE * (2 ** intento)
        _log.warning("%s falló de forma transitoria (%s); reintento %s/%s en %.1fs",
                     quien, ultimo, intento + 1, REINTENTOS, espera)
        time.sleep(espera)
    raise RuntimeError(f"{quien}: reintentos agotados")


class AnthropicProvider(LLMProvider):
    """Proveedor de Anthropic Claude via API."""

    #: Último recurso si no hay ni configuración ni entorno. Cuál debe ser
    #: el default es decisión del operador, no de este archivo.
    MODELO_DE_RESERVA = 'claude-sonnet-4-5-20250929'

    @classmethod
    def modelo_por_defecto(cls):
        """El id de modelo NO se codifica aquí: se declara por entorno
        (`ANTHROPIC_MODEL`) o por configuración (`claude_model` en admin),
        igual que ya hacía DeepSeek con `DEEPSEEK_MODEL`. Un id fijo en el
        código envejece en silencio — este apuntaba a una generación anterior
        y nadie se enteraba.

        Se lee al CONSTRUIR, no al importar: leerlo en el cuerpo de la clase
        lo congela en el primer import y lo vuelve intestable."""
        return os.environ.get('ANTHROPIC_MODEL') or cls.MODELO_DE_RESERVA

    def __init__(self, api_key=None, model=None):
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY no configurada")
        self.model = model or self.modelo_por_defecto()

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


def tools_a_openai(tools):
    """Convierte TOOL_DEFINITIONS (formato Anthropic, input_schema) al
    formato function-calling OpenAI-compatible que usa DeepSeek."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            },
        }
        for t in (tools or [])
    ]


def mensajes_a_openai(messages, system=None):
    """Convierte el historial interno (bloques estilo Anthropic) a la
    secuencia de mensajes OpenAI-compatible: tool_use -> tool_calls del
    asistente; cada tool_result -> un mensaje role=tool."""
    salida = []
    if system:
        salida.append({"role": "system", "content": system})
    for msg in messages:
        contenido = msg.get("content")
        if isinstance(contenido, str):
            salida.append({"role": msg["role"], "content": contenido})
            continue
        if msg["role"] == "assistant":
            texto = "".join(
                b.get("text", "") for b in contenido if b.get("type") == "text"
            )
            tool_calls = [
                {
                    "id": b["id"],
                    "type": "function",
                    "function": {
                        "name": b["name"],
                        "arguments": json.dumps(b.get("input", {}), ensure_ascii=False),
                    },
                }
                for b in contenido
                if b.get("type") == "tool_use"
            ]
            m = {"role": "assistant", "content": texto or None}
            if tool_calls:
                m["tool_calls"] = tool_calls
            salida.append(m)
        else:  # user con tool_result blocks
            for b in contenido:
                if b.get("type") == "tool_result":
                    salida.append({
                        "role": "tool",
                        "tool_call_id": b["tool_use_id"],
                        "content": b.get("content", ""),
                    })
                elif b.get("type") == "text":
                    salida.append({"role": "user", "content": b.get("text", "")})
    return salida


class DeepSeekProvider(LLMProvider):
    """Proveedor DeepSeek via su API OpenAI-compatible (default del sistema)."""

    BASE_URL = "https://api.deepseek.com/v1/chat/completions"

    def __init__(self, api_key=None, model=None):
        self.api_key = api_key or os.environ.get('DEEPSEEK_API_KEY')
        if not self.api_key:
            raise ValueError("DEEPSEEK_API_KEY no configurada")
        # 'deepseek-chat' sigue al modelo vigente del proveedor; fija
        # DEEPSEEK_MODEL (o config deepseek_model) para anclar una version.
        self.model = model or os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')

    def chat(self, messages, tools=None, system=None):
        import requests

        payload = {
            'model': self.model,
            'messages': mensajes_a_openai(messages, system=system),
            'max_tokens': 4096,
        }
        if tools:
            payload['tools'] = tools_a_openai(tools)

        def pedir():
            r = requests.post(
                self.BASE_URL,
                json=payload,
                headers={'Authorization': f'Bearer {self.api_key}'},
                timeout=180,
            )
            r.raise_for_status()
            return r

        resp = _reintentar(pedir, "DeepSeek")
        data = resp.json()

        # DeepSeek puede responder HTTP 200 con cuerpo de error o choices
        # vacío (rate-limit suave, error de proveedor): indexar a ciegas
        # rompía con KeyError/IndexError en vez de degradar con mensaje.
        choices = data.get('choices')
        if not choices:
            detalle = data.get('error') or data
            raise RuntimeError(f"Respuesta sin choices del proveedor: {detalle}")

        eleccion = choices[0]
        mensaje = eleccion.get('message', {})
        tool_calls = []
        for tc in mensaje.get('tool_calls') or []:
            try:
                argumentos = json.loads(tc['function'].get('arguments') or '{}')
            except json.JSONDecodeError:
                argumentos = {}
            tool_calls.append({
                'id': tc['id'],
                'name': tc['function']['name'],
                'input': argumentos,
            })

        finish = eleccion.get('finish_reason')
        uso = data.get('usage', {})
        return {
            'content': mensaje.get('content') or '',
            'tool_calls': tool_calls,
            'stop_reason': 'tool_use' if finish == 'tool_calls' else 'end_turn',
            'tokens_input': uso.get('prompt_tokens', 0),
            'tokens_output': uso.get('completion_tokens', 0),
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

        def pedir():
            r = requests.post(f"{self.base_url}/api/chat", json=payload, timeout=120)
            r.raise_for_status()
            return r

        resp = _reintentar(pedir, "Ollama")
        data = resp.json()

        return {
            'content': data.get('message', {}).get('content', ''),
            'tool_calls': [],  # Ollama basic mode doesn't support tool calling
            'stop_reason': 'end_turn',
            'tokens_input': data.get('prompt_eval_count', 0),
            'tokens_output': data.get('eval_count', 0),
        }


# ── Registro y seleccion de proveedores ──────────────────────────────

def proveedores_disponibles(config=None):
    """Que proveedores pueden servir AHORA (llave presente / habilitado).

    config: dict opcional (database.config.get_all_config) — gobierna el
    fallback de Claude (activable en admin) y el permiso de Ollama.
    """
    config = config or {}
    disponibles = {}
    disponibles['deepseek'] = bool(os.environ.get('DEEPSEEK_API_KEY'))
    disponibles['claude'] = (
        bool(os.environ.get('ANTHROPIC_API_KEY'))
        and config.get('llm_fallback_claude', 'off') == 'on'
    )
    disponibles['ollama'] = config.get('llm_ollama', 'off') == 'on'
    return disponibles


def crear_proveedor(nombre, config=None):
    config = config or {}
    if nombre == 'deepseek':
        return DeepSeekProvider(model=config.get('deepseek_model'))
    if nombre == 'claude':
        modelo = config.get('claude_model')
        return AnthropicProvider(model=modelo) if modelo else AnthropicProvider()
    if nombre == 'ollama':
        return OllamaProvider()
    raise ValueError(f"Proveedor LLM desconocido: {nombre}")


def seleccionar_proveedor(config=None):
    """El proveedor activo: el default configurado si esta disponible,
    despues los fallbacks en orden. Retorna (nombre, instancia).
    Levanta RuntimeError si ningun proveedor puede servir."""
    config = config or {}
    disponibles = proveedores_disponibles(config)
    default = config.get('llm_default', 'deepseek')
    orden = [default] + [n for n in ('deepseek', 'claude', 'ollama') if n != default]
    for nombre in orden:
        if disponibles.get(nombre):
            return nombre, crear_proveedor(nombre, config)
    raise RuntimeError(
        "Ningun proveedor LLM disponible: configura DEEPSEEK_API_KEY o "
        "activa el fallback de Claude en admin."
    )


def proveedores_para_quorum(config=None, maximo=2):
    """Hasta `maximo` proveedores DISTINTOS disponibles, default primero.
    Con uno solo, las funcionalidades de quorum degradan a modo simple."""
    config = config or {}
    disponibles = proveedores_disponibles(config)
    default = config.get('llm_default', 'deepseek')
    orden = [default] + [n for n in ('deepseek', 'claude', 'ollama') if n != default]
    pares = []
    for nombre in orden:
        if disponibles.get(nombre) and len(pares) < maximo:
            pares.append((nombre, crear_proveedor(nombre, config)))
    return pares
