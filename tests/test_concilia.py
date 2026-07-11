"""Spec for CONCILIA (F9): the finding engine over the ALREADY-reconciled
tables. Laws under test: findings are typed, monetized from real prices
only (never estimated), referenced per unit; currencies never convert;
a clean session yields zero findings and says so via the flow."""
import sqlite3

import pytest

from autogenes.concilia import conciliar, parse_monto
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed)"
        " VALUES ('2026-07-10', 7, 2026)"
    )
    return c


SID = 1


def _vender(c, chasis, factura, precio=100000.0, jn="J", pais="DEU",
            pedimento_id=None):
    c.execute(
        "INSERT INTO importaciones (session_id, chasis, factura, precio, j_y_n,"
        " pais_code, pedimento_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (SID, chasis, factura, precio, jn, pais, pedimento_id),
    )


def _llegar(c, chasis, factura, amount="100,000.00", moneda="EUR", jn="J",
            pais="DEU", filename="f.pdf"):
    c.execute(
        "INSERT INTO extraccion_facturas (session_id, chasis, factura, amount,"
        " moneda, j_y_n, pais_code, filename) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (SID, chasis, factura, amount, moneda, jn, pais, filename),
    )


def _pedimento(c) -> int:
    c.execute(
        "INSERT INTO pedimentos (session_id, numero_pedimento) VALUES (?, '26-001')",
        (SID,),
    )
    return c.execute("SELECT MAX(id) FROM pedimentos").fetchone()[0]


def test_parse_monto_tolerante_y_honesto():
    assert parse_monto("485,000.00") == 485000.0
    assert parse_monto(" 1200 ") == 1200.0
    assert parse_monto("N/A") is None
    assert parse_monto(None) is None
    assert parse_monto("") is None


def test_sesion_limpia_cero_hallazgos_flujo_completo(conn):
    ped = _pedimento(conn)
    _vender(conn, "VIN00000000000000001", "F2601-8Y3", pedimento_id=ped)
    _llegar(conn, "VIN00000000000000001", "F2601-8Y")
    r = conciliar(conn, SID)
    assert r["hallazgos"] == [] and r["total"] == 0
    assert r["flujo"]["pct_conciliado"] == 100
    assert r["flujo"]["conciliados"] == 1
    assert r["valor_en_riesgo_mxn"] == 0


def test_vendido_sin_llegada_monetiza_en_mxn(conn):
    ped = _pedimento(conn)
    _vender(conn, "VIN00000000000000001", "F2601-8Y3", precio=320000,
            pedimento_id=ped)
    _vender(conn, "VIN00000000000000002", "F2602-8W2", precio=None,
            pedimento_id=ped)
    r = conciliar(conn, SID)
    h = next(x for x in r["hallazgos"] if x["clase"] == "vendido_sin_llegada")
    assert h["n_unidades"] == 2 and h["monto"] == 320000 and h["moneda"] == "MXN"
    assert "sin precio" in h["detalle"]          # la unidad sin precio se declara
    assert r["flujo"]["pct_conciliado"] == 0
    assert r["valor_en_riesgo_mxn"] == 320000


def test_llegado_sin_venta_agrupa_por_moneda_sin_convertir(conn):
    _llegar(conn, "VIN00000000000000001", "F2601-8Y", amount="10,000.00",
            moneda="EUR", filename="a.pdf")
    _llegar(conn, "VIN00000000000000002", "F2602-8W", amount="5000",
            moneda="USD", filename="b.pdf")
    _llegar(conn, "VIN00000000000000003", "F2603-KJ", amount="ilegible",
            moneda="EUR", filename="c.pdf")
    r = conciliar(conn, SID)
    grupos = {h["moneda"]: h for h in r["hallazgos"]
              if h["clase"] == "llegado_sin_venta"}
    assert grupos["EUR"]["monto"] == 10000 and grupos["EUR"]["n_unidades"] == 2
    assert "ilegible" in grupos["EUR"]["detalle"]
    assert grupos["USD"]["monto"] == 5000
    assert r["valor_en_riesgo_mxn"] == 0      # EUR/USD jamás se suman a MXN


def test_disputas_jn_y_pais_sobre_pares_conciliados(conn):
    ped = _pedimento(conn)
    _vender(conn, "VIN00000000000000001", "F2601-8Y3", precio=250000, jn="J",
            pais="DEU", pedimento_id=ped)
    _llegar(conn, "VIN00000000000000001", "F2601-8Y", jn="N", pais="BRA")
    r = conciliar(conn, SID)
    clases = {h["clase"]: h for h in r["hallazgos"]}
    assert clases["jn_en_disputa"]["monto"] == 250000
    assert clases["jn_en_disputa"]["refs"][0]["dwh"] == "J"
    assert clases["jn_en_disputa"]["refs"][0]["pdf"] == "N"
    assert clases["pais_en_disputa"]["n_unidades"] == 1
    # el par SÍ concilió: las disputas no rompen el flujo
    assert r["flujo"]["pct_conciliado"] == 100
    # la MISMA unidad en dos disputas cuenta UNA vez en el agregado
    assert r["valor_en_riesgo_mxn"] == 250000
    # singular honesto en el título
    assert clases["jn_en_disputa"]["titulo"].startswith("1 unidad con")


def test_vin_duplicado_no_adivina_monto(conn):
    ped = _pedimento(conn)
    _vender(conn, "VIN00000000000000001", "F2601-8Y3", pedimento_id=ped)
    _vender(conn, "VIN00000000000000001", "F2699-XX9", pedimento_id=ped)
    r = conciliar(conn, SID)
    h = next(x for x in r["hallazgos"] if x["clase"] == "vin_duplicado_dwh")
    assert h["monto"] is None and h["refs"][0]["veces"] == 2


def test_sin_pedimento_y_extraccion_fallida(conn):
    _vender(conn, "VIN00000000000000001", "F2601-8Y3", precio=180000,
            pedimento_id=None)
    _llegar(conn, "VIN00000000000000001", "F2601-8Y")
    conn.execute(
        "INSERT INTO facturas_errores (session_id, filename) VALUES (?, 'x.pdf')",
        (SID,))
    r = conciliar(conn, SID)
    clases = {h["clase"]: h for h in r["hallazgos"]}
    assert clases["sin_pedimento"]["monto"] == 180000
    assert clases["extraccion_fallida"]["monto"] is None
    assert "piso, no un techo" in clases["extraccion_fallida"]["detalle"]


def test_ranking_por_monto_y_topes_declarados(conn):
    ped = _pedimento(conn)
    for i in range(15):     # 15 vendidas sin llegada > MAX_UNIDADES
        _vender(conn, f"VIN000000000000000{i:02d}", f"F26{i:02d}-8Y3",
                precio=1000.0, pedimento_id=ped)
    conn.execute(
        "INSERT INTO facturas_errores (session_id, filename) VALUES (?, 'x.pdf')",
        (SID,))
    r = conciliar(conn, SID)
    assert r["hallazgos"][0]["clase"] == "vendido_sin_llegada"  # monto primero
    assert r["hallazgos"][-1]["monto"] is None                  # None al final
    top = r["hallazgos"][0]
    assert top["n_unidades"] == 15 and len(top["unidades"]) == 12  # tope + total


def test_estado_publica_conteo_de_hallazgos(conn):
    from autogenes.estado import estado_de_sesion
    _vender(conn, "VIN00000000000000001", "F2601-8Y3")
    e = estado_de_sesion(conn, SID)
    assert isinstance(e["hallazgos"], int) and e["hallazgos"] >= 1


def test_estado_hallazgos_latente_sin_datos_aduanales(conn):
    from autogenes.estado import estado_de_sesion
    e = estado_de_sesion(conn, SID)
    assert e["hallazgos"] is None
