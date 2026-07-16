"""NetworkX lens over the session graph.

SQLite is the truth; the NetworkX graph is a per-session, in-memory
projection built on demand and cached. The cache key is the session's
mutation version: the ag_bitacora high-water mark (every substrate
mutation appends there) plus row counts of the aduanal tables the
projection reads. The nx object is NEVER persisted.
"""
import sqlite3
from typing import Optional

import networkx as nx

from autogenes.proyeccion import construir_grafo

_TABLAS_VERSION = (
    "importaciones",
    "extraccion_facturas",
    "pedimentos",
    "catalogo_vehiculos",
    "ag_artefactos",
    "ag_fragmentos",
    "ag_entidades",
    "ag_relaciones",
    "ag_productos",
)

_cache: dict[int, tuple[tuple, nx.MultiDiGraph]] = {}


_TABLAS_ADUANALES = ("importaciones", "extraccion_facturas", "pedimentos",
                     "catalogo_vehiculos")


def version_de_sesion(conn: sqlite3.Connection, session_id: int) -> tuple:
    """Monotonic-enough version stamp: bitácora high-water mark + row counts."""
    marca = conn.execute(
        "SELECT COALESCE(MAX(id), 0) FROM ag_bitacora WHERE session_id = ?",
        (session_id,),
    ).fetchone()[0]
    conteos = tuple(
        conn.execute(
            f"SELECT COUNT(*) FROM {t} WHERE session_id = ?", (session_id,)  # noqa: S608 — table names from a fixed tuple
        ).fetchone()[0]
        for t in _TABLAS_VERSION
    )
    # las tablas aduanales NO escriben bitácora: un reproceso que borra y
    # reinserta cambia max(rowid) aunque el conteo coincida
    aduanal = tuple(
        conn.execute(
            f"SELECT COUNT(*), COALESCE(MAX(rowid), 0) FROM {t} WHERE session_id = ?",  # noqa: S608
            (session_id,),
        ).fetchone()
        for t in _TABLAS_ADUANALES
    )
    # huella de contenido: dos bases DISTINTAS con los mismos conteos no
    # deben compartir caché (los ids ag_* son uuid — únicos por base) y la
    # ruta del archivo separa una base restaurada de la viva
    huella = conn.execute(
        "SELECT COALESCE(MIN(id), '') || COALESCE(MAX(id), '') FROM ag_relaciones"
        " WHERE session_id = ?", (session_id,),
    ).fetchone()[0]
    ruta = conn.execute("PRAGMA database_list").fetchone()[2] or ":memory:"
    return (ruta, marca, huella, *conteos, *aduanal)


def construir_red(conn: sqlite3.Connection, session_id: int,
                  limite_vehiculos: Optional[int] = None) -> nx.MultiDiGraph:
    """Build the nx graph from the projection (no cache)."""
    g = construir_grafo(conn, session_id, limite_vehiculos=limite_vehiculos)
    red = nx.MultiDiGraph(session_id=session_id)
    for n in g["nodos"]:
        red.add_node(n["id"], **{k: v for k, v in n.items() if k != "id"})
    for e in g["enlaces"]:
        red.add_edge(
            e["source"], e["target"], key=e["id"],
            kind=e["kind"], peso=e["peso"], tipo=e.get("tipo"),
        )
    return red


def red_de_sesion(conn: sqlite3.Connection, session_id: int) -> nx.MultiDiGraph:
    """Cached accessor; rebuilds only when the session's version moved."""
    version = version_de_sesion(conn, session_id)
    cacheada = _cache.get(session_id)
    if cacheada and cacheada[0] == version:
        return cacheada[1]
    red = construir_red(conn, session_id)
    _cache[session_id] = (version, red)
    return red


def invalidar(session_id: Optional[int] = None) -> None:
    if session_id is None:
        _cache.clear()
    else:
        _cache.pop(session_id, None)
