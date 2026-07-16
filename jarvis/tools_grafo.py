"""Tools de grafo para Gnosis AI (F8) — la vista chat del sustrato.

Cada wrapper resuelve la sesion, abre la conexion y delega en
autogenes/consultas.py (motor puro); aqui NO vive logica de analisis.
Las seis tools responden con citas resueltas fragmento -> pagina -> PDF;
si el sustrato AUTOGENES aun no esta migrado en la base, se dice.
"""

import sqlite3

from database import get_connection
from database.persistence import get_latest_session_id
from autogenes import consultas


def _ejecutar(fn, session_id=None, **kwargs):
    sid = int(session_id) if session_id else get_latest_session_id()
    if not sid:
        return {'error': 'No hay sesiones procesadas'}
    conn = get_connection()
    try:
        return fn(conn, sid, **kwargs)
    except sqlite3.OperationalError:
        return {'error': 'El sustrato AUTOGENES no esta migrado en esta base'}
    finally:
        conn.close()


def expediente_entidad(nombre, session_id=None):
    """Dossier citado de una entidad del grafo de evidencia."""
    return _ejecutar(consultas.expediente_entidad, session_id, nombre=nombre)


def camino_entre(desde, hasta, session_id=None):
    """Camino mas corto entre dos nombres, con citas por salto."""
    return _ejecutar(consultas.camino_entre, session_id, desde=desde, hasta=hasta)


def vecindario(nombre, grados=2, session_id=None):
    """Vecinos a <= N grados de un nombre, por anillo de distancia."""
    return _ejecutar(consultas.vecindario_de, session_id, nombre=nombre,
                     grados=grados)


def resumen_grafo(session_id=None):
    """Hechos estructurales del caso: hubs, puentes, comunidades, monolitos."""
    return _ejecutar(consultas.resumen_grafo, session_id)


def senales_caso(session_id=None):
    """El Radar condensado: vencimientos, fuentes frias, huerfanas, negocio."""
    return _ejecutar(consultas.senales_caso, session_id)


def hallazgos_pendientes(session_id=None):
    """Anomalias QUALIA contra la base del operador + faltantes/errores."""
    return _ejecutar(consultas.hallazgos_pendientes, session_id)


def conciliacion(session_id=None):
    """CONCILIA (F9): flujo tri-fuente + hallazgos monetizados + cupos."""
    from autogenes.concilia import conciliar, cupos_what_if

    def _todo(conn, sid):
        return {**conciliar(conn, sid), "cupos": cupos_what_if(conn, sid)}
    return _ejecutar(_todo, session_id)


def validacion(session_id=None):
    """VALIDACIÓN (F10): conformidad por regla + % de filas conformes."""
    from autogenes.validacion import validar
    return _ejecutar(validar, session_id)


GRAFO_TOOL_FUNCTIONS = {
    'expediente_entidad': expediente_entidad,
    'camino_entre': camino_entre,
    'vecindario': vecindario,
    'resumen_grafo': resumen_grafo,
    'senales_caso': senales_caso,
    'hallazgos_pendientes': hallazgos_pendientes,
    'conciliacion': conciliacion,
    'validacion': validacion,
}

_SESSION_PROP = {"type": "integer",
                 "description": "ID de sesion (opcional, usa la mas reciente)"}

GRAFO_TOOL_DEFINITIONS = [
    {
        "name": "expediente_entidad",
        "description": (
            "Dossier de una entidad del grafo de evidencia AUTOGENES "
            "(persona, organizacion, lugar, concepto): que es, que fragmentos "
            "de que PDF/pagina la sustentan, sus relaciones tipadas con "
            "evidencia, eventos y productos que la citan. Usar cuando el "
            "usuario pregunta por un actor del caso."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "nombre": {"type": "string",
                           "description": "Nombre (o alias) de la entidad"},
                "session_id": _SESSION_PROP,
            },
            "required": ["nombre"],
        },
    },
    {
        "name": "camino_entre",
        "description": (
            "Camino mas corto entre dos nombres del caso (entidades, marcas, "
            "paises, pedimentos, PDFs...): cada salto con su tipo de vinculo "
            "y las citas (PDF + pagina) que lo sostienen. Usar para explicar "
            "COMO se conectan dos cosas."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "desde": {"type": "string", "description": "Nombre de origen"},
                "hasta": {"type": "string", "description": "Nombre de destino"},
                "session_id": _SESSION_PROP,
            },
            "required": ["desde", "hasta"],
        },
    },
    {
        "name": "vecindario",
        "description": (
            "Todo lo que rodea a un nombre del caso a N grados de distancia, "
            "agrupado por anillo. Usar para mapear el contexto inmediato de "
            "una entidad, marca, pais o documento."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "nombre": {"type": "string", "description": "Nombre del centro"},
                "grados": {"type": "integer",
                           "description": "Radio en saltos (1-4, default 2)"},
                "session_id": _SESSION_PROP,
            },
            "required": ["nombre"],
        },
    },
    {
        "name": "resumen_grafo",
        "description": (
            "Hechos estructurales del grafo del caso: tamano, densidad, "
            "comunidades, islas, concentradores (hubs), puentes criticos de "
            "articulacion, exponente de la ley de grado y los tres monolitos "
            "por centralidad. Usar para 'como se ve el caso' o antes de "
            "profundizar."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"session_id": _SESSION_PROP},
            "required": [],
        },
    },
    {
        "name": "senales_caso",
        "description": (
            "El Radar de atencion del caso: eventos que vencen en 30 dias, "
            "fuentes frias (documentos que nadie convirtio en conocimiento), "
            "entidades huerfanas sin relaciones y pendientes de negocio "
            "(faltantes/errores). Usar para 'que requiere atencion'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"session_id": _SESSION_PROP},
            "required": [],
        },
    },
    {
        "name": "hallazgos_pendientes",
        "description": (
            "Anomalias QUALIA medidas contra la linea base fijada por el "
            "operador (concentradores nuevos, puentes caidos, islas, rafagas "
            "de actividad) con severidad, mas el detalle de facturas "
            "faltantes y con error. Si no hay base fijada lo dice: sin "
            "referencia no se inventan desviaciones."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"session_id": _SESSION_PROP},
            "required": [],
        },
    },
    {
        "name": "conciliacion",
        "description": (
            "Estado CONCILIA de la sesion: flujo tri-fuente (vendido DWH / "
            "conciliado / llegado PDF), hallazgos monetizados (vendido sin "
            "llegada, llegado sin venta por moneda, J/N y pais en disputa, "
            "VIN duplicado, sin pedimento, PDFs ilegibles), valor en riesgo "
            "MXN por unidad distinta, y what-if de cupos con run-rate "
            "medido. Usar para 'cuanto valor esta en riesgo', 'que no "
            "concilia' o 'cuando se agota el cupo'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"session_id": _SESSION_PROP},
            "required": [],
        },
    },
    {
        "name": "validacion",
        "description": (
            "Estado VALIDACION de la sesion (glosa preventiva F10): cada "
            "regla determinista evaluada sobre todas las filas (obligatorios, "
            "VIN de 17 y sin I/O/Q, pais y moneda en catalogo, fecha DDMMYY, "
            "precio/importe en cero fabricado, preferencia J/N contra la "
            "norma por pais), el conteo de violaciones y el porcentaje de "
            "filas plenamente conformes. Usar para 'que no cumple la norma', "
            "'que glosaria el SAT' o 'cual es la conformidad de la sesion'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"session_id": _SESSION_PROP},
            "required": [],
        },
    },
]
