"""Sandbox de solo lectura para la tool `consulta_sql`.

Antes, la tool aceptaba cualquier `SELECT` filtrado por una lista NEGRA de
palabras (`INSERT|UPDATE|DROP|…`) más un rechazo de `PRAGMA`. Una lista
negra sobre SQL es una carrera perdida: no acotaba la sesión, no acotaba
las tablas, y `SELECT content FROM chat_conversations` o
`SELECT accion, detalle FROM ag_bitacora` eran consultas perfectamente
válidas — el historial del propio chat y la bitácora forense completa,
servidos al modelo.

Aquí la garantía es estructural, no léxica:

1. **Conexión de solo lectura** (`mode=ro`): ninguna escritura es posible
   aunque la lista negra falle. SQLite lo impone, no nosotros.
2. **Autorizador** (`set_authorizer`): allowlist de tablas. `sqlite_master`,
   `chat_conversations`, `ag_bitacora` y `config` no son alcanzables ni por
   error tipográfico ni por subconsulta.
3. **Vistas por sesión**: el modelo consulta `importaciones`, pero lo que
   ese nombre resuelve es una vista TEMP filtrada por SU sesión. El
   predicado no depende de que el modelo lo escriba.

El truco de (3): las vistas TEMP viven en la base temporal, que es
escribible aunque `main` sea de solo lectura. El autorizador distingue una
lectura MEDIADA por la vista (arg4 = nombre de la vista) de una lectura
DIRECTA de la tabla base (arg4 = None) y solo permite la primera.
"""
import sqlite3
from typing import Any

#: Tablas que el modelo puede consultar, a través de su vista de sesión.
#: Fuera de esta lista, a propósito: chat_conversations (su propio
#: historial — ver el hallazgo H2), ag_bitacora (la cadena forense),
#: config (configuración del operador), sqlite_master (el esquema).
TABLAS_VISIBLES = (
    "importaciones",
    "extraccion_facturas",
    "catalogo_vehiculos",
    "pedimentos",
    "facturas_faltantes",
    "facturas_errores",
    "cupos",
    "seguimiento_mensual",
    "insumos_archivos",
)

#: Catálogos sin `session_id`: se ven enteros, no tienen dato de sesión.
CATALOGOS = ("marcas", "paises")

_LIMITE_FILAS = 100


class ConsultaRechazada(ValueError):
    """La consulta salió del sandbox."""


def _autorizador(vistas: frozenset[str], bases: frozenset[str]):
    def revisar(accion, arg1, arg2, arg3, arg4):
        if accion in (sqlite3.SQLITE_SELECT, sqlite3.SQLITE_FUNCTION):
            return sqlite3.SQLITE_OK
        if accion == sqlite3.SQLITE_READ:
            if arg1 in vistas:
                return sqlite3.SQLITE_OK
            # lectura de la tabla base SOLO si la origina una de mis vistas
            if arg1 in bases and arg4 in vistas:
                return sqlite3.SQLITE_OK
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_DENY
    return revisar


def conexion_sandbox(ruta_db: str, session_id: int) -> sqlite3.Connection:
    """Conexión de solo lectura, acotada a `session_id` por vistas."""
    conn = sqlite3.connect(f"file:{ruta_db}?mode=ro", uri=True, timeout=15)
    conn.row_factory = sqlite3.Row

    vistas: set[str] = set()
    bases: set[str] = set()
    for tabla in TABLAS_VISIBLES:
        try:
            conn.execute(
                f"CREATE TEMP VIEW {tabla} AS SELECT * FROM main.{tabla}"  # noqa: S608 — el nombre de tabla sale de un literal fijo, nunca de entrada
                f" WHERE session_id = {int(session_id)}")
        except sqlite3.Error:
            continue          # tabla ausente en una base a medio migrar
        vistas.add(tabla)
        bases.add(tabla)
    for tabla in CATALOGOS:
        try:
            conn.execute(f"CREATE TEMP VIEW {tabla} AS SELECT * FROM main.{tabla}")  # noqa: S608 — el nombre de tabla sale de un literal fijo, nunca de entrada
        except sqlite3.Error:
            continue
        vistas.add(tabla)
        bases.add(tabla)

    conn.set_authorizer(_autorizador(frozenset(vistas), frozenset(bases)))
    return conn


def ejecutar_select(ruta_db: str, session_id: int, query: str) -> Any:
    """Ejecuta UNA sentencia SELECT dentro del sandbox.

    El tope de filas se aplica envolviendo la consulta, no buscando la
    palabra LIMIT en el texto: `'LIMIT' not in query.upper()` se satisface
    con cualquier literal que contenga esa palabra.
    """
    limpia = (query or "").strip().rstrip(";").strip()
    if not limpia:
        raise ConsultaRechazada("Consulta vacía.")
    if ";" in limpia:
        raise ConsultaRechazada(
            "Una sola sentencia por consulta; no se permiten sentencias encadenadas.")
    if not limpia.upper().startswith(("SELECT", "WITH")):
        raise ConsultaRechazada("Solo se permiten consultas SELECT.")

    conn = conexion_sandbox(ruta_db, session_id)
    try:
        envuelta = f"SELECT * FROM ({limpia}) LIMIT {_LIMITE_FILAS}"  # noqa: S608 — el LIMIT se fuerza a int()
        try:
            filas = conn.execute(envuelta).fetchall()
        except sqlite3.DatabaseError as e:
            # el autorizador rechaza con DatabaseError ("not authorized")
            if "not authorized" in str(e).lower():
                raise ConsultaRechazada(
                    "Consulta rechazada: esa tabla no está disponible para el "
                    "asistente. Consultables: "
                    f"{', '.join(sorted(TABLAS_VISIBLES + CATALOGOS))}.") from e
            raise ConsultaRechazada(f"Error SQL: {e}") from e
        return [dict(f) for f in filas]
    finally:
        conn.close()
