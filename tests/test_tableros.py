"""Spec for the TBV business boards: pure engines over the aduanal
tables — tolerant date parsing that never guesses, dense ranks that
never interpolate, and declared exclusions."""
import sqlite3
from datetime import date

import pytest

from database import models, models_autogenes
from tableros.dominio import dominio
from tableros.fechas import parsear_fecha, periodo_de


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed) VALUES ('2026-07-10', 7, 2026)")
    # marcas viene pre-sembrada por el schema (AUDI, SEAT, ... ya existen)
    aid = c.execute("SELECT id FROM marcas WHERE nombre='AUDI'").fetchone()[0]
    sid = c.execute("SELECT id FROM marcas WHERE nombre='SEAT'").fetchone()[0]
    c.execute("INSERT INTO catalogo_vehiculos (session_id, auto_code, tipo,"
              " marca_id) VALUES (1, 'A3SPB1', 'A3 SPORTBACK', ?)", (aid,))
    c.execute("INSERT INTO catalogo_vehiculos (session_id, auto_code, tipo,"
              " marca_id) VALUES (1, 'LEON01', 'LEON', ?)", (sid,))
    return c


def _vender(c, catalogo_id, fecha, n=1):
    for _ in range(n):
        c.execute(
            "INSERT INTO importaciones (session_id, catalogo_id, chasis,"
            " factura, fecha_factura) VALUES (1, ?, 'V', 'F', ?)",
            (catalogo_id, fecha))


def test_parsear_fecha_tolerante_sin_adivinar():
    assert parsear_fecha("2026-03-15") == date(2026, 3, 15)
    assert parsear_fecha("2026-03-15 00:00:00") == date(2026, 3, 15)
    assert parsear_fecha("15/03/26") == date(2026, 3, 15)
    assert parsear_fecha("15/3/2026") == date(2026, 3, 15)
    assert parsear_fecha("32/01/26") is None      # día imposible
    assert parsear_fecha("marzo 15") is None
    assert parsear_fecha(None) is None


def test_periodos_de_las_cuatro_escalas():
    f = date(2026, 8, 9)
    assert periodo_de(f, "mes") == "2026-08"
    assert periodo_de(f, "trimestre") == "2026-Q3"
    assert periodo_de(f, "semestre") == "2026-S2"
    assert periodo_de(f, "anio") == "2026"


def test_dominio_rankea_por_periodo_sin_interpolar(conn):
    _vender(conn, 1, "2026-01-10", n=3)           # A3 domina enero
    _vender(conn, 2, "2026-01-12", n=1)
    _vender(conn, 2, "2026-02-05", n=4)           # LEON domina febrero
    _vender(conn, 1, "15/03/26", n=2)             # A3 solo en marzo (dd/mm/aa)
    _vender(conn, 1, "fecha rota", n=1)           # se declara, no se adivina
    r = dominio(conn, 1, "mes")
    assert r["periodos"] == ["2026-01", "2026-02", "2026-03"]
    a3 = next(s for s in r["series"] if s["modelo"] == "A3 SPORTBACK")
    leon = next(s for s in r["series"] if s["modelo"] == "LEON")
    assert a3["rangos"] == [1, None, 1]           # sin ventas = None, no 0
    assert leon["rangos"] == [2, 1, None]
    assert a3["ventas"] == [3, 0, 2]
    assert r["sin_fecha"] == 1
    assert r["facturadas"] == 10


def test_dominio_ranking_escalonado_por_marca_con_desglose(conn):
    _vender(conn, 1, "2026-01-10", n=5)
    _vender(conn, 2, "2026-01-10", n=7)
    r = dominio(conn, 1, "anio")
    assert [m["marca"] for m in r["ranking_marcas"]] == ["SEAT", "AUDI"]
    seat = r["ranking_marcas"][0]
    assert seat["top_modelo"] == "LEON" and seat["top_n"] == 7
    assert r["periodos"] == ["2026"]


# ── TBV-01 · Maduración ──────────────────────────────────────────────


def _pedimento_con_fecha(c, fecha):
    c.execute("INSERT INTO pedimentos (session_id, numero_pedimento,"
              " fecha_pedimento) VALUES (1, ?, ?)", (f"P-{fecha}", fecha))
    return c.execute("SELECT MAX(id) FROM pedimentos").fetchone()[0]


def test_maduracion_mide_dias_reales_por_marca(conn):
    from tableros.maduracion import maduracion
    ped = _pedimento_con_fecha(conn, "2026-01-01")
    for chasis, venta in (("VA", "2026-01-11"), ("VB", "2026-01-31"),
                          ("VC", "2026-02-20")):
        conn.execute(
            "INSERT INTO importaciones (session_id, catalogo_id, pedimento_id,"
            " chasis, factura, fecha_factura) VALUES (1, 1, ?, ?, 'F', ?)",
            (ped, chasis, venta))
    # sin fecha de venta: se declara, no se adivina
    conn.execute(
        "INSERT INTO importaciones (session_id, catalogo_id, pedimento_id,"
        " chasis, factura, fecha_factura) VALUES (1, 1, ?, 'VD', 'F', NULL)",
        (ped,))
    # vendido ANTES de importarse: anomalía declarada aparte
    conn.execute(
        "INSERT INTO importaciones (session_id, catalogo_id, pedimento_id,"
        " chasis, factura, fecha_factura) VALUES (1, 1, ?, 'VE', 'F',"
        " '2025-12-25')", (ped,))
    r = maduracion(conn, 1)
    audi = next(m for m in r["marcas"] if m["marca"] == "AUDI")
    assert audi["n"] == 3
    assert audi["deltas"] == [10, 30, 50]
    assert audi["mediana"] == 30 and audi["min"] == 10 and audi["max"] == 50
    assert audi["extremos"][0]["chasis"] == "VC"      # la más lenta, citada
    assert r["sin_fechas"] == 1 and r["negativos"] == 1
    assert r["max_dias"] == 50


def test_maduracion_percentiles_rango_mas_cercano(conn):
    from tableros.maduracion import _percentil
    assert _percentil([10, 20, 30, 40, 50], 0.5) == 30
    assert _percentil([10, 20, 30, 40, 50], 0.9) == 50
    assert _percentil([10], 0.25) == 10
    assert _percentil([], 0.5) == 0
