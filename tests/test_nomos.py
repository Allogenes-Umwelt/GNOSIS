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


def test_disposicion_contradice_regla_incumplida(conn):
    # O1 para NOMOS: 'vivo' = la regla SIGUE incumpliéndose. Marcarla resuelta
    # sin corregir el dato la deja contradicha — el motor no cree la palabra.
    from autogenes.disposiciones import (anotar, leer_disposiciones,
                                         resoluciones_verificadas)
    s = Sustrato(conn, 1)
    rg = s.crear_regla("BRA = N", [{"campo": "pais_code", "valor": "BRA"}],
                       {"campo": "j_y_n", "valor": "N"})
    s.disponer_hallazgo("nomos", rg["id"], "resuelto", "supuestamente corregido")
    r = evaluar_reglas(conn, 1)
    disp = leer_disposiciones(conn, 1, "nomos")
    for e in r["reglas"]:
        e["clave"] = e["id"]
    incumplidas = [e for e in r["reglas"] if e["n_violaciones"] > 0]
    anotar(incumplidas, disp)
    e = next(x for x in incumplidas if x["id"] == rg["id"])
    assert e["estado"] == "resuelto" and e["contradice"] is True
    # sigue viva: no cuenta como resolución verificada
    assert resoluciones_verificadas({x["clave"] for x in incumplidas}, disp) == []


def test_disposicion_de_regla_en_paz_se_verifica(conn):
    # una regla SIN violaciones marcada resuelta: sale del triaje y el motor
    # confirma la resolución (no aparece entre las incumplidas vivas)
    from autogenes.disposiciones import leer_disposiciones, resoluciones_verificadas
    s = Sustrato(conn, 1)
    rg = s.crear_regla("DEU = J", [{"campo": "pais_code", "valor": "DEU"}],
                       {"campo": "j_y_n", "valor": "J"})          # V4 cumple
    s.disponer_hallazgo("nomos", rg["id"], "resuelto", "modelo confirmado")
    r = evaluar_reglas(conn, 1)
    e = next(x for x in r["reglas"] if x["id"] == rg["id"])
    assert e["n_violaciones"] == 0
    disp = leer_disposiciones(conn, 1, "nomos")
    incumplidas = {x["id"] for x in r["reglas"] if x["n_violaciones"] > 0}
    verif = resoluciones_verificadas(incumplidas, disp)
    assert any(v["clave"] == rg["id"] for v in verif)


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


def test_backtest_corre_la_regla_sobre_toda_la_historia(conn):
    from autogenes.nomos import backtest_regla
    # una segunda sesión histórica con una violación BRA=J
    conn.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed) VALUES ('2026-06-10', 6, 2026)")
    conn.execute(
        "INSERT INTO importaciones (session_id, chasis, factura, precio,"
        " j_y_n, pais_code) VALUES (2, 'H1', 'FH1', 50000, 'J', 'BRA')")
    s = Sustrato(conn, 1)
    regla = s.crear_regla("BRA=N", [{"campo": "pais_code", "valor": "BRA"}],
                          {"campo": "j_y_n", "valor": "N"})
    r = backtest_regla(conn, 1, regla["id"])
    assert [c["sesion"] for c in r["corridas"]] == ["07/2026", "06/2026"]
    assert r["corridas"][0]["actual"] is True
    assert r["corridas"][1]["n_violaciones"] == 1
    assert r["corridas"][1]["pnl_mxn"] == 50000
    assert "error" in backtest_regla(conn, 1, "no-existe")


def test_triaje_o1_excluye_reglas_inactivas_del_ciclo(conn):
    # una regla que el operador APAGÓ es backtest ('qué pasaría'), no un
    # hallazgo vivo: no debe anotarse, contar en estados ni contradecir una
    # disposición. Solo las reglas ACTIVAS incumplidas entran al ciclo O1.
    from autogenes.disposiciones import leer_disposiciones
    from autogenes.nomos import triaje_o1
    s = Sustrato(conn, 1)
    act = s.crear_regla("BRA=N activa", [{"campo": "pais_code", "valor": "BRA"}],
                        {"campo": "j_y_n", "valor": "N"})          # V1,V3 violan
    ina = s.crear_regla("DEU=N inactiva", [{"campo": "pais_code", "valor": "DEU"}],
                        {"campo": "j_y_n", "valor": "N"})          # V4 viola
    s.alternar_regla(ina["id"], False)                            # apagada
    s.disponer_hallazgo("nomos", act["id"], "resuelto", "sin corregir")
    s.disponer_hallazgo("nomos", ina["id"], "resuelto", "apagada, no corregida")
    r = triaje_o1(evaluar_reglas(conn, 1), leer_disposiciones(conn, 1, "nomos"))
    por_id = {e["id"]: e for e in r["reglas"]}
    # la activa incumplida marcada resuelta: contradicha (el motor no la cree)
    assert por_id[act["id"]]["contradice"] is True
    # la inactiva: fuera del ciclo — ni anotada ni contradictoria
    assert "contradice" not in por_id[ina["id"]]
    assert "estado" not in por_id[ina["id"]]
    # estados cuenta solo la activa incumplida (una, resuelta y contradicha)
    assert sum(r["estados"][k] for k in
               ("nuevo", "en_gestion", "resuelto", "descartado")) == 1
    assert r["estados"]["resuelto"] == 1 and r["estados"]["contradice"] == 1
    # una inactiva dispuesta 'resuelto' NO es resolución verificada (se apagó,
    # no se corrigió)
    assert all(v["clave"] != ina["id"] for v in r["resoluciones_verificadas"])
