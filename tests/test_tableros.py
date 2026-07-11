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


# ── TBV-04 · Rechazos ────────────────────────────────────────────────


def test_rechazos_pareto_con_acumulado_y_corte_80(conn):
    from tableros.rechazos import rechazos
    for i in range(6):
        conn.execute("INSERT INTO facturas_errores (session_id, filename,"
                     " error_type) VALUES (1, ?, 'parsing_failed')", (f"a{i}.pdf",))
    for i in range(3):
        conn.execute("INSERT INTO facturas_errores (session_id, filename,"
                     " error_type) VALUES (1, ?, '')", (f"b{i}.pdf",))
    conn.execute("INSERT INTO facturas_faltantes (session_id, factura)"
                 " VALUES (1, 'F-900')")
    r = rechazos(conn, 1)
    assert r["total"] == 10
    assert r["pareto"][0]["razon"] == "parsing_failed"
    assert r["pareto"][0]["n"] == 6 and r["pareto"][0]["acumulado_pct"] == 60.0
    assert r["pareto"][1]["razon"] == "sin razón registrada"   # vacío se confiesa
    assert r["pareto"][1]["acumulado_pct"] == 90.0
    assert r["razones_para_80"] == 2
    assert r["sin_razon"] == 3
    faltante = next(p for p in r["pareto"] if p["clase"] == "faltante")
    assert faltante["archivos"] == ["F-900"]


def test_rechazos_sesion_limpia_cero_honesto(conn):
    from tableros.rechazos import rechazos
    r = rechazos(conn, 1)
    assert r["total"] == 0 and r["pareto"] == [] and r["razones_para_80"] == 0


# ── TBV-05 · Cupo (pasado y presente, sin futuro) ────────────────────


def test_libro_cupo_corta_el_futuro_y_lo_declara(conn):
    from tableros.cupo import libro_cupo
    for mes, prod_ini, prod_cons, prod_fin in (
            (5, 500, 100, 400), (6, 400, 150, 250), (7, 250, 250, 0),
            (8, 0, 0, 0), (9, 0, 0, 0)):        # 8 y 9 son futuro (sesión=7)
        conn.execute(
            "INSERT INTO seguimiento_mensual (session_id, mes, mes_nombre,"
            " disponible_produccion_inicio, consumo_produccion,"
            " disponible_produccion_fin, consumo_inversion)"
            " VALUES (1, ?, ?, ?, ?, ?, 0)",
            (mes, f"M{mes}", prod_ini, prod_cons, prod_fin))
    r = libro_cupo(conn, 1)
    assert r["mes_corte"] == 7
    assert r["meses_futuros_excluidos"] == 2
    prod = next(s for s in r["series"] if s["tipo"] == "PRODUCCION")
    assert [m["mes"] for m in prod["meses"]] == [5, 6, 7]
    assert prod["meses"][-1]["agotado"] is True     # llegar a 0 es un hecho
    assert prod["meses"][0]["agotado"] is False
    assert "sin proyecciones" in r["nota"]


# ── TBV-03 · Rutas (país → aduana) ───────────────────────────────────


def _importar_por(c, aduana, pais_code, n=1):
    if aduana is None:
        ped = None
    else:
        consecutivo = c.execute(
            "SELECT COUNT(*) FROM pedimentos").fetchone()[0]
        c.execute("INSERT INTO pedimentos (session_id, numero_pedimento,"
                  " aduana) VALUES (1, ?, ?)",
                  (f"P-{consecutivo}-{aduana}", aduana))
        ped = c.execute("SELECT MAX(id) FROM pedimentos").fetchone()[0]
    for _ in range(n):
        c.execute(
            "INSERT INTO importaciones (session_id, catalogo_id, pedimento_id,"
            " chasis, factura, pais_code) VALUES (1, 1, ?, 'V', 'F', ?)",
            (ped, pais_code))


def test_rutas_agrupa_y_geolocaliza_solo_lo_conocido(conn):
    from tableros.rutas import rutas
    _importar_por(conn, "Veracruz", "DEU", n=5)
    _importar_por(conn, "ADUANA DE ALTAMIRA", "ESP", n=2)   # contiene la clave
    _importar_por(conn, "Puerto Fantasma", "DEU", n=3)      # aduana desconocida
    _importar_por(conn, "Veracruz", "XXX", n=1)             # país fuera de catálogo
    _importar_por(conn, None, "DEU", n=1)                   # sin pedimento/aduana
    r = rutas(conn, 1)
    assert r["total"] == 12 and r["geolocalizado"] == 7
    assert [f["n"] for f in r["flujos"]] == [5, 2]
    top = r["flujos"][0]
    assert top["pais_code"] == "DEU" and top["aduana"] == "Veracruz"
    assert top["destino"] == {"lat": 19.1738, "lon": -96.1342}
    assert top["origen"] == {"lat": 51.16, "lon": 10.45}    # centroide declarado
    motivos = {s["motivo"] for s in r["sin_geo"]}
    assert any("Puerto Fantasma" in m for m in motivos)
    assert any("XXX" in m for m in motivos)
    assert any("sin aduana" in m for m in motivos)
    assert sum(s["n"] for s in r["sin_geo"]) == 5


def test_rutas_sin_datos_es_honesto(conn):
    from tableros.rutas import rutas
    r = rutas(conn, 1)
    assert r["total"] == 0 and r["flujos"] == [] and r["sin_geo"] == []
