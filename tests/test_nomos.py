"""Spec for NOMOS (F12): rules are M-P AND units over DWH rows —
per-input live counts, threshold = n conditions, fires/conform/violate,
MXN P&L from real prices only. Writes only via Sustrato (create +
toggle, never delete); invalid fields are rejected at the gate."""
import sqlite3

import pytest

from autogenes.nomos import evaluar_reglas
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed) VALUES ('2026-07-10', 7, 2026)")
    filas = [("V1", "F1", 100000, "J", "BRA"), ("V2", "F2", 200000, "N", "BRA"),
             ("V3", "F3", None, "J", "BRA"), ("V4", "F4", 400000, "J", "DEU")]
    for ch, fa, pr, jn, pa in filas:
        c.execute(
            "INSERT INTO importaciones (session_id, chasis, factura, precio,"
            " j_y_n, pais_code) VALUES (1, ?, ?, ?, ?, ?)", (ch, fa, pr, jn, pa))
    return c


def test_regla_mp_anatomia_disparos_y_pnl(conn):
    s = Sustrato(conn, 1)
    s.crear_regla("BRA no aplica preferencia",
                  [{"campo": "pais_code", "valor": "BRA"}],
                  {"campo": "j_y_n", "valor": "N"})
    r = evaluar_reglas(conn, 1)
    e = r["reglas"][0]
    assert e["entradas"] == [{"campo": "pais_code", "valor": "BRA", "n": 3}]
    assert e["umbral"] == 1 and e["n_disparos"] == 3      # V1, V2, V3
    assert e["n_conformes"] == 1                          # V2 es N
    assert e["n_violaciones"] == 2                        # V1, V3 son J
    assert e["pnl_mxn"] == 100000                         # V3 sin precio NO se estima
    assert e["sin_precio"] == 1
    assert r["pnl_activas_mxn"] == 100000
    # bitácora WORM registró la creación
    assert conn.execute(
        "SELECT COUNT(*) FROM ag_bitacora WHERE accion='regla'").fetchone()[0] == 1


def test_regla_multicondicion_es_and_con_umbral_n(conn):
    s = Sustrato(conn, 1)
    s.crear_regla("BRA con J", [{"campo": "pais_code", "valor": "BRA"},
                                {"campo": "j_y_n", "valor": "J"}],
                  {"campo": "j_y_n", "valor": "N"})
    e = evaluar_reglas(conn, 1)["reglas"][0]
    assert e["umbral"] == 2
    assert [x["n"] for x in e["entradas"]] == [3, 3]      # BRA=3, J=3
    assert e["n_disparos"] == 2                           # V1, V3 (AND)
    assert e["n_violaciones"] == 2                        # ambas dicen J


def test_alternar_no_borra_y_separa_pnl(conn):
    s = Sustrato(conn, 1)
    regla = s.crear_regla("BRA=N", [{"campo": "pais_code", "valor": "BRA"}],
                          {"campo": "j_y_n", "valor": "N"})
    s.alternar_regla(regla["id"], False)
    r = evaluar_reglas(conn, 1)
    assert r["total"] == 1                                # sigue existiendo
    assert r["reglas"][0]["n_violaciones"] == 2           # se evalúa igual
    assert r["pnl_activas_mxn"] == 0                      # pero no suma al P&L
    assert r["activas"] == 0


def test_crear_regla_rechaza_campos_fuera_de_lista(conn):
    s = Sustrato(conn, 1)
    with pytest.raises(ValueError):
        s.crear_regla("mala", [{"campo": "precio; DROP", "valor": "x"}],
                      {"campo": "j_y_n", "valor": "N"})
    with pytest.raises(ValueError):
        s.crear_regla("vacia", [], {"campo": "j_y_n", "valor": "N"})
    assert conn.execute("SELECT COUNT(*) FROM ag_reglas").fetchone()[0] == 0


def test_estado_publica_conteo_de_reglas(conn):
    from autogenes.estado import estado_de_sesion
    s = Sustrato(conn, 1)
    s.crear_regla("BRA=N", [{"campo": "pais_code", "valor": "BRA"}],
                  {"campo": "j_y_n", "valor": "N"})
    assert estado_de_sesion(conn, 1)["reglas"] == 1
