"""
Orquestador de conversacion Gnosis AI.
Maneja el loop de tool calling y deofuscacion de respuestas.
"""

import json
import uuid

from .ambito import ambito_de_sesion
from .identidades import enmascarar, identificadores_de_sesion
from .llm_interface import LLMProvider
from .ofuscation import ObfuscationLayer
from .tool_executor import ToolExecutor
from .tools import TOOL_DEFINITIONS
from .prompts import SYSTEM_PROMPT
from database import get_connection

from registro import log

_log = log("jarvis.chat")


MAX_TOOL_ROUNDS = 5      # Maximo de rondas de tool calling por mensaje
MAX_TURNOS_HISTORIA = 12  # Turnos (usuario+asistente) que se reenvian al modelo


def olvidar_conversacion(chat_session_id: str) -> None:
    """Borra un hilo. Vive fuera de la clase a proposito: el reset tiene que
    alcanzar a TODOS los procesos, y la unica cosa que todos comparten es la
    base. Antes reiniciaba el objeto en memoria de un solo worker."""
    conn = get_connection()
    try:
        conn.execute("DELETE FROM chat_conversations WHERE chat_session_id = ?",
                     (chat_session_id,))
        conn.commit()
    finally:
        conn.close()


class ChatHandler:
    """Maneja una conversacion de chat con Gnosis AI."""

    def __init__(self, llm_provider: LLMProvider, session_id=None,
                 chat_session_id=None):
        self.llm = llm_provider
        # El ambito lo fija quien atiende al operador, no el modelo: las
        # tools solo veran esta sesion (ver jarvis/ambito.py).
        self.session_id = session_id
        # El HILO identifica la conversacion, y viaja en una cookie firmada.
        # No es estado de proceso: cualquier worker reconstruye el hilo desde
        # SQLite (12-factor; antes vivia en un global de modulo y con dos
        # workers el modelo veia la mitad de la historia).
        self.chat_session_id = chat_session_id or str(uuid.uuid4())
        self.obfuscation = ObfuscationLayer(semilla=self.chat_session_id)
        self.tool_executor = ToolExecutor(self.obfuscation)
        self.total_tokens_in = 0
        self.total_tokens_out = 0
        self._ids_precargados = False
        self._ids_turno = None

    def reset(self):
        """Olvida el hilo — en la base, para todos los procesos."""
        olvidar_conversacion(self.chat_session_id)
        self.chat_session_id = str(uuid.uuid4())
        self.obfuscation = ObfuscationLayer(semilla=self.chat_session_id)
        self.tool_executor = ToolExecutor(self.obfuscation)
        self.total_tokens_in = 0
        self.total_tokens_out = 0
        self._ids_precargados = False
        self._ids_turno = None

    def _precargar_tokens(self):
        """Siembra el mapa de ofuscacion con los identificadores de la sesion.

        La historia guardada esta ENMASCARADA (ADR-0011); sin este mapa, un
        proceso que reconstruye el hilo no sabria revertir los tokens que
        escribio otro."""
        if self._ids_precargados:
            return
        self.obfuscation.precargar(self._identificadores())
        self._ids_precargados = True

    def _historia(self):
        """Los ultimos turnos del hilo, desde SQLite.

        Acotada a MAX_TURNOS_HISTORIA: la lista en memoria crecia sin cota, y
        el coste por turno subia hasta que el proveedor rechazaba el contexto.
        """
        conn = get_connection()
        try:
            filas = conn.execute(
                "SELECT role, content FROM chat_conversations"
                " WHERE chat_session_id = ? ORDER BY id DESC LIMIT ?",
                (self.chat_session_id, MAX_TURNOS_HISTORIA * 2),
            ).fetchall()
        except Exception:
            return []
        finally:
            conn.close()
        return [{'role': f['role'], 'content': f['content']}
                for f in reversed(filas)]

    def _sesion(self):
        if self.session_id:
            return self.session_id
        from database.persistence import get_latest_session_id
        return get_latest_session_id()

    def _identificadores(self):
        """Los identificadores reales de la sesion, para enmascarar lo que
        escribe el OPERADOR. La ley de ADR-0007 no distingue entre lo que
        dice el modelo y lo que dice el operador: si pega un VIN en el chat,
        el VIN saldria en claro al proveedor.

        Se cargan UNA vez por turno y se comparten con el executor: son seis
        SELECT DISTINCT, y se pedian tres veces por turno (precargar tokens,
        enmascarar la entrada, y otra vez dentro del executor)."""
        if self._ids_turno is not None:
            return self._ids_turno
        sid = self._sesion()
        if not sid:
            self._ids_turno = {}
            return self._ids_turno
        conn = get_connection()
        try:
            self._ids_turno = identificadores_de_sesion(conn, sid)
        except Exception:
            self._ids_turno = {}
        finally:
            conn.close()
        return self._ids_turno

    def _enmascarar(self, texto):
        ids = self._identificadores()
        if not ids:
            return texto
        return enmascarar(texto, ids, self.obfuscation)

    def handle_message(self, user_message):
        """Procesa un mensaje del usuario y retorna la respuesta.
        Returns: dict con response, tools_used, tokens
        """
        with ambito_de_sesion(self._sesion()):
            return self._handle_message(user_message)

    def _handle_message(self, user_message):
        self._ids_turno = None                 # turno nuevo: una lectura fresca
        self._precargar_tokens()
        # el executor reusa el conjunto ya cargado en vez de repetir la consulta
        self.tool_executor.usar_identificadores(self._identificadores())
        # El texto del OPERADOR se enmascara antes de salir: pegar un VIN
        # en el chat no debe filtrarlo (hallazgo H6 del diagnostico).
        mensaje_seguro = self._enmascarar(user_message)
        # La historia se RECONSTRUYE por turno desde la base: es la unica
        # verdad que todos los workers comparten. `self.messages` es papel
        # de borrador del turno, no estado de la conversacion.
        self.messages = self._historia()
        self.messages.append({
            'role': 'user',
            'content': mensaje_seguro
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

                # Se persiste lo ENMASCARADO, nunca el texto revertido: si no,
                # el turno 2 lee en claro por consulta_sql lo que el turno 1
                # guardo (hallazgo H2). El operador ve la version revertida en
                # su pantalla; la base guarda tokens.
                self._save_conversation(mensaje_seguro,
                                        self.obfuscation.mask_known(final_text),
                                        tools_used)

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
            _log.error(f"[DB] Error guardando conversacion: {e}", exc_info=True)
