"""Spec de CONTROL (A3): SPC transversal con bandas medidas y señal de
régimen. Determinista; sin historia no inventa banda."""
import sqlite3

import pytest

from autogenes.control import control
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    return c


def _sesion(c, mes, anio=2026):
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES (?, ?, ?)", (f"{anio}-{mes:02d}-10", mes, anio))
    return c.execute("SELECT MAX(id) FROM processing_sessions").fetchone()[0]


def _vender(c, sid, chasis, precio=100000.0):
    c.execute("INSERT INTO importaciones (session_id, chasis, factura, precio,"
              " j_y_n, pais_code) VALUES (?, ?, ?, ?, 'J', 'DEU')",
              (sid, chasis, "F" + chasis, precio))


def test_sin_historia_no_hay_banda(conn):
    sid = _sesion(conn, 7)
    _vender(conn, sid, "WVGZZZ5NZMW900001")
    r = control(conn, sid)
    assert r["n_sesiones"] == 1
    for m in r["metricas"]:
        assert m["banda"] is None and m["senal"] is None   # nada de placebo


def test_banda_medida_y_metodo_declarado(conn):
    # tres sesiones con valor_en_riesgo distinto; la actual dentro de banda
    for mes in (5, 6, 7):
        s = _sesion(conn, mes)
        _vender(conn, s, f"WVGZZZ5NZMW90000{mes}", precio=100000.0)  # sin llegada → riesgo
    actual = conn.execute("SELECT MAX(id) FROM processing_sessions").fetchone()[0]
    r = control(conn, actual)
    riesgo = next(m for m in r["metricas"] if m["clave"] == "valor_en_riesgo_mxn")
    assert riesgo["banda"] is not None
    assert riesgo["banda"]["k"] == 3
    assert "MAD" in riesgo["metodo"] and "pronóstico" in riesgo["metodo"]
    assert riesgo["senal"] in ("dentro", "fuera")
    assert len(riesgo["serie"]) == 3


def test_outlier_se_senala_fuera(conn):
    # una historia plana y una sesión actual muy por encima
    for mes in (1, 2, 3, 4):
        s = _sesion(conn, mes)
        _vender(conn, s, f"WVGZZZ5NZMW9000{mes:02d}", precio=100000.0)
    actual = _sesion(conn, 5)
    for i in range(20):                                    # riesgo 20x
        _vender(conn, actual, f"WVGZZZ5NZMW9100{i:02d}", precio=100000.0)
    r = control(conn, actual)
    riesgo = next(m for m in r["metricas"] if m["clave"] == "valor_en_riesgo_mxn")
    assert riesgo["senal"] == "fuera"                      # cambió de régimen


def test_lectura_pura_doble_corrida(conn):
    for mes in (6, 7):
        s = _sesion(conn, mes)
        _vender(conn, s, f"WVGZZZ5NZMW90000{mes}")
    actual = conn.execute("SELECT MAX(id) FROM processing_sessions").fetchone()[0]
    assert control(conn, actual) == control(conn, actual)
