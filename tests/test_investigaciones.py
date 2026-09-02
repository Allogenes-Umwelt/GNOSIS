"""Spec de P1 · investigaciones guardadas: dockeo como Producto por la puerta
del Sustrato (procedencia), listado y borrado, y la migración que amplía el
CHECK de ag_productos.clase para aceptar 'investigacion'."""
import sqlite3

import pytest

from autogenes.sustrato import Sustrato
from database import models, models_autogenes
from database.migrations import MIGRATIONS, apply_migrations

# El schema VIEJO de ag_productos (solo informe/camino), para probar la migración.
SCHEMA_VIEJO = """
CREATE TABLE ag_productos (
    id TEXT PRIMARY KEY, session_id INTEGER NOT NULL,
    clase TEXT NOT NULL CHECK (clase IN ('informe','camino')),
    titulo TEXT NOT NULL, unidad TEXT NOT NULL, cuerpo TEXT,
    entidades TEXT NOT NULL DEFAULT '[]', evidencia TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE ag_relaciones (
    id TEXT PRIMARY KEY, session_id INTEGER NOT NULL, desde_id TEXT NOT NULL,
    hasta_id TEXT NOT NULL, tipo TEXT NOT NULL,
    peso REAL NOT NULL DEFAULT 0.5, evidencia TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE ag_bitacora (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL,
    ts TEXT DEFAULT (datetime('now')), accion TEXT NOT NULL, detalle TEXT NOT NULL);
"""


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    return c


def test_dockear_investigacion_por_la_puerta_del_sustrato(conn):
    p = Sustrato(conn, 1).dockear_producto(
        'investigacion', 'Caso VW julio', 'grafo',
        {'estado': 'k=1.800&x=71&y=-391&n=marca:5', 'nota': 'revisar DEU'})
    assert p.clase == 'investigacion'
    assert p.cuerpo['estado'] == 'k=1.800&x=71&y=-391&n=marca:5'
    assert p.cuerpo['nota'] == 'revisar DEU'


def test_investigacion_registra_procedencia_en_bitacora(conn):
    Sustrato(conn, 1).dockear_producto('investigacion', 'X', 'grafo', {'estado': 'k=1'})
    n = conn.execute("SELECT COUNT(*) FROM ag_bitacora WHERE accion = 'producto'").fetchone()[0]
    assert n == 1


def test_listado_solo_trae_investigaciones(conn):
    s = Sustrato(conn, 1)
    s.dockear_producto('investigacion', 'Inv A', 'grafo', {'estado': 'k=1'})
    s.dockear_producto('camino', 'Un camino', 'vinculos', {'desde': 'a', 'hasta': 'b'})
    filas = conn.execute("SELECT titulo FROM ag_productos WHERE clase = 'investigacion'").fetchall()
    assert [f["titulo"] for f in filas] == ['Inv A']


def test_borrar_investigacion_no_toca_evidencia(conn):
    s = Sustrato(conn, 1)
    p = s.dockear_producto('investigacion', 'X', 'grafo', {'estado': 'k=1'})
    s.quitar_producto(p.id)
    assert conn.execute("SELECT COUNT(*) FROM ag_productos").fetchone()[0] == 0


def test_migracion_amplia_el_check_y_preserva_los_productos_previos():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("CREATE TABLE processing_sessions (id INTEGER PRIMARY KEY,"
              " session_date TEXT, month_processed INT, year_processed INT)")
    c.execute("INSERT INTO processing_sessions (id, session_date, month_processed,"
              " year_processed) VALUES (1, '2026-07-10', 7, 2026)")
    c.executescript(SCHEMA_VIEJO)
    c.execute("INSERT INTO ag_productos (id, session_id, clase, titulo, unidad)"
              " VALUES ('a', 1, 'camino', 'Un camino', 'vinculos')")
    # con el CHECK viejo, 'investigacion' se rechaza
    with pytest.raises(sqlite3.IntegrityError):
        c.execute("INSERT INTO ag_productos (id, session_id, clase, titulo, unidad)"
                  " VALUES ('b', 1, 'investigacion', 'I', 'grafo')")
    apply_migrations(c)
    # el producto previo sobrevive a la recreación de la tabla
    assert c.execute("SELECT titulo FROM ag_productos WHERE id = 'a'").fetchone()["titulo"] == 'Un camino'
    # y ahora 'investigacion' se acepta
    c.execute("INSERT INTO ag_productos (id, session_id, clase, titulo, unidad)"
              " VALUES ('b', 1, 'investigacion', 'I', 'grafo')")
    assert c.execute("SELECT COUNT(*) FROM ag_productos WHERE clase = 'investigacion'").fetchone()[0] == 1


def test_investigacion_no_se_proyecta_como_nodo(conn):
    # una investigación es meta (snapshot de navegación), no un hallazgo del
    # caso: no debe aparecer como nodo del grafo, pero sí en el listado.
    from autogenes.proyeccion import construir_grafo
    Sustrato(conn, 1).dockear_producto('investigacion', 'Snapshot', 'grafo', {'estado': 'k=1'})
    g = construir_grafo(conn, 1)
    assert not [n for n in g["nodos"] if n["kind"] == "producto"]
    assert conn.execute("SELECT COUNT(*) FROM ag_productos WHERE clase='investigacion'").fetchone()[0] == 1


def test_migracion_es_idempotente():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("CREATE TABLE processing_sessions (id INTEGER PRIMARY KEY,"
              " session_date TEXT, month_processed INT, year_processed INT)")
    c.executescript(SCHEMA_VIEJO)
    apply_migrations(c)
    apply_migrations(c)   # segunda vez: no-op, no explota
    assert c.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0] == len(MIGRATIONS)
