"""`consulta_sql` corre contra una conexión por la que el motor no escribe.

Estas pruebas vienen de `main`, donde delante de la conexión había un filtro
de palabras. Ese filtro es un parser, y un parser tiene que acertar en todas
las formas de escribir una sentencia; el sandbox de ADR-0011 lo sustituyó por
una garantía ESTRUCTURAL —conexión `mode=ro`, allowlist de tablas por
autorizador y vistas acotadas a la sesión del ámbito—. Lo que estas pruebas
sostienen sigue siendo cierto y sigue haciendo falta:

1. quien impide la escritura es SQLite, no una expresión regular;
2. el mensaje del driver —que nombra tablas, columnas y rutas— no llega al
   modelo;
3. pero sí queda en el registro, con una referencia que citar.

Lo que cambia respecto de `main` es el montaje: el sandbox exige una sesión
en ámbito, porque una consulta sin sesión no está acotada a nada.
"""
import sqlite3

import pytest

import database
from database import get_readonly_connection, models
from jarvis import tools
from jarvis.ambito import ambito_de_sesion


@pytest.fixture()
def db(tmp_path, monkeypatch):
    ruta = tmp_path / "aduanas.db"
    conn = sqlite3.connect(ruta)
    conn.executescript(models.SCHEMA_SQL)
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed) VALUES ('2026-07-10', 7, 2026)")
    sid = conn.execute("SELECT id FROM processing_sessions").fetchone()[0]
    conn.execute("INSERT INTO importaciones (session_id, chasis, factura)"
                 " VALUES (?, 'WVWZZZ000000001', 'FA-1')", (sid,))
    conn.commit()
    conn.close()
    monkeypatch.setattr(database, "DB_PATH", str(ruta))
    return sid


def test_lee(db):
    with ambito_de_sesion(db):
        filas = tools.consulta_sql("SELECT factura FROM importaciones")
    assert filas == [{"factura": "FA-1"}]


def test_el_motor_rechaza_la_escritura_pase_lo_que_pase_por_el_filtro(db):
    """Quien detiene una escritura aquí no es una regex: es SQLite."""
    conn = get_readonly_connection()
    try:
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            conn.execute("INSERT INTO importaciones (chasis) VALUES ('X')")
    finally:
        conn.close()


def test_un_error_no_devuelve_el_mensaje_del_driver(db):
    """El mensaje del driver nombra tablas, columnas y rutas de archivo, e
    iba derecho al modelo y de ahí al navegador."""
    with ambito_de_sesion(db):
        salida = tools.consulta_sql("SELECT no_existe FROM importaciones")
    assert set(salida) == {"error"}
    assert "no_existe" not in salida["error"]
    assert "importaciones" not in salida["error"]
    assert "ref " in salida["error"]


def test_el_detalle_del_error_si_queda_en_el_log(db, caplog):
    import logging

    with caplog.at_level(logging.ERROR, logger="jarvis.tools"), ambito_de_sesion(db):
        salida = tools.consulta_sql("SELECT no_existe FROM importaciones")
    ref = salida["error"].split("ref ")[1].rstrip(").")
    registrado = " ".join(r.getMessage() for r in caplog.records)
    assert ref in registrado
    assert "no_existe" in registrado


def test_sin_ambito_explicito_cae_a_la_ultima_sesion(db):
    """Añadido al integrar. Sin ámbito NO se rechaza: `jarvis/ambito.py` cae a
    la última sesión a propósito, para que el chat funcione sin que nadie fije
    una. Lo que no puede pasar —y no pasa, lo cubre `test_frontera_llm`— es
    que se vea una sesión DISTINTA de la del ámbito cuando sí lo hay."""
    filas = tools.consulta_sql("SELECT factura FROM importaciones")
    assert filas == [{"factura": "FA-1"}]
