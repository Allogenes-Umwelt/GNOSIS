"""`consulta_sql` runs against a connection the engine will not write through.

The keyword filter in front of it is a parser, and a parser has to be right
about every way a statement can be spelled. These tests hold the boundary
that does not depend on being right, and the one that keeps the driver's
own words away from the model.
"""
import sqlite3

import pytest

import database
from database import get_readonly_connection
from jarvis import tools


@pytest.fixture()
def db(tmp_path, monkeypatch):
    ruta = tmp_path / "aduanas.db"
    conn = sqlite3.connect(ruta)
    conn.execute("CREATE TABLE importaciones (id INTEGER PRIMARY KEY, marca TEXT)")
    conn.execute("INSERT INTO importaciones (marca) VALUES ('VW')")
    conn.commit()
    conn.close()
    monkeypatch.setattr(database, "DB_PATH", str(ruta))
    return ruta


def test_lee(db):
    assert tools.consulta_sql("SELECT marca FROM importaciones") == [{"marca": "VW"}]


def test_el_motor_rechaza_la_escritura_pase_lo_que_pase_por_el_filtro(db):
    """The regex is not what stops a write here -- SQLite is."""
    conn = get_readonly_connection()
    try:
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            conn.execute("INSERT INTO importaciones (marca) VALUES ('SEAT')")
    finally:
        conn.close()


def test_un_error_no_devuelve_el_mensaje_del_driver(db, caplog):
    salida = tools.consulta_sql("SELECT no_existe FROM importaciones")
    assert set(salida) == {"error"}
    assert "no_existe" not in salida["error"]
    assert "importaciones" not in salida["error"]
    assert "ref " in salida["error"]


def test_el_detalle_del_error_si_queda_en_el_log(db, caplog):
    import logging
    with caplog.at_level(logging.ERROR, logger="jarvis.tools"):
        salida = tools.consulta_sql("SELECT no_existe FROM importaciones")
    ref = salida["error"].split("ref ")[1].rstrip(").")
    registrado = " ".join(r.getMessage() for r in caplog.records)
    assert ref in registrado
    assert "no_existe" in registrado
