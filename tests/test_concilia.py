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


# ── ola 2: what-if de cupos + dossier ────────────────────────────────


def _cupo(c, tipo, saldo, inicial=200, agotado=None):
    c.execute(
        "INSERT INTO cupos (session_id, tipo, numero_autorizacion,"
        " cantidad_inicial, cantidad_consumida, cantidad_saldo, mes_agotado)"
        " VALUES (?, ?, 'A-1', ?, ?, ?, ?)",
        (SID, tipo, inicial, inicial - saldo, saldo, agotado),
    )


def _mes(c, mes, prod, inv=0):
    c.execute(
        "INSERT INTO seguimiento_mensual (session_id, mes, mes_nombre,"
        " consumo_produccion, consumo_inversion) VALUES (?, ?, ?, ?, ?)",
        (SID, mes, f"M{mes}", prod, inv),
    )


def test_cupos_sin_historia_no_proyecta(conn):
    from autogenes.concilia import cupos_what_if
    _cupo(conn, "PRODUCCION", saldo=100)
    _mes(conn, 1, prod=50)
    r = cupos_what_if(conn, SID)
    cupo = r["cupos"][0]
    assert cupo["run_rate"] is None
    assert "insuficiente" in cupo["motivo"].lower()


def test_cupos_proyecta_con_run_rate_medido(conn):
    from autogenes.concilia import cupos_what_if
    _cupo(conn, "PRODUCCION", saldo=100)
    _mes(conn, 1, prod=40)
    _mes(conn, 2, prod=60)
    r = cupos_what_if(conn, SID)
    cupo = r["cupos"][0]
    assert cupo["run_rate"] == 50.0
    assert cupo["meses_restantes"] == 2.0
    assert cupo["mes_estimado_agote"] == 4        # último mes 2 + 2
    assert cupo["motivo"] is None
    assert "no es una promesa" in r["nota"] or "instrumento" in r["nota"]


def test_cupo_agotado_es_hecho_no_proyeccion(conn):
    from autogenes.concilia import cupos_what_if
    _cupo(conn, "INVERSION", saldo=0, agotado="junio")
    _mes(conn, 1, prod=0, inv=50)
    _mes(conn, 2, prod=0, inv=50)
    r = cupos_what_if(conn, SID)
    cupo = r["cupos"][0]
    assert cupo["run_rate"] is None and "agotado" in cupo["motivo"].lower()


def test_dossier_dockea_snapshot_completo_sin_tope(conn):
    from autogenes.concilia import dockear_dossier
    ped = _pedimento(conn)
    for i in range(15):
        _vender(conn, f"VIN000000000000000{i:02d}", f"F26{i:02d}-8Y3",
                precio=1000.0, pedimento_id=ped)
    r = dockear_dossier(conn, SID, "conc-vendido-sin-llegada")
    assert "error" not in r
    p = r["producto"]
    assert p["clase"] == "informe" and p["unidad"] == "concilia"
    assert len(p["cuerpo"]["hallazgo"]["unidades"]) == 15   # SIN tope de 12
    assert p["cuerpo"]["flujo"]["vendidos"] == 15
    assert p["evidencia"] == [] and p["entidades"] == []


def test_dossier_clave_inexistente_no_escribe(conn):
    from autogenes.concilia import dockear_dossier
    _vender(conn, "VIN00000000000000001", "F2601-8Y3")
    r = dockear_dossier(conn, SID, "conc-no-existe")
    assert "error" in r
    assert conn.execute("SELECT COUNT(*) FROM ag_productos").fetchone()[0] == 0


# ── ola 2: lookup directo por VIN ────────────────────────────────────


def test_estado_vin_tri_fuente_con_disputas(conn):
    from autogenes.concilia import estado_vin
    ped = _pedimento(conn)
    _vender(conn, "WVGZZZ5NZMW900001", "F2699-5N1", precio=512000, jn="J",
            pais="DEU", pedimento_id=ped)
    _llegar(conn, "WVGZZZ5NZMW900001", "F2699-5N", jn="N", pais="BRA",
            filename="tiguan.pdf")
    r = estado_vin(conn, SID, "MW900001")          # parcial casa único
    assert r["chasis"] == "WVGZZZ5NZMW900001"
    assert r["conciliado"] is True
    assert r["dwh"][0]["numero_pedimento"] == "26-001"
    assert r["llegadas"][0]["filename"] == "tiguan.pdf"
    campos = {d["campo"] for d in r["disputas"]}
    assert campos == {"j_y_n", "pais"}


def test_estado_vin_ambiguo_y_ausente(conn):
    from autogenes.concilia import estado_vin
    _vender(conn, "VIN00000000000000001", "F2601-8Y3")
    _vender(conn, "VIN00000000000000002", "F2602-8W2")
    amb = estado_vin(conn, SID, "VIN0000000000000000")
    assert amb.get("ambiguo") and len(amb["candidatos"]) == 2
    assert "error" in estado_vin(conn, SID, "NOEXISTE")
    # exacto gana aunque haya otros parciales
    ex = estado_vin(conn, SID, "VIN00000000000000001")
    assert ex["chasis"] == "VIN00000000000000001" and ex["conciliado"] is False


# ── ola 2: pedimento sin unidades + VIN inter-sesión ─────────────────


def test_pedimento_sin_unidades(conn):
    ped_usado = _pedimento(conn)                       # 26-001, sí citado
    _vender(conn, "VIN00000000000000001", "F2601-8Y3", pedimento_id=ped_usado)
    conn.execute("INSERT INTO pedimentos (session_id, numero_pedimento, aduana)"
                 " VALUES (?, '26-777', 'Veracruz')", (SID,))   # nadie lo cita
    r = conciliar(conn, SID)
    h = next(x for x in r["hallazgos"]
             if x["clave"] == "conc-pedimento-sin-unidades")
    assert h["clase"] == "pedimento_sin_unidades"
    assert h["n_unidades"] == 1 and h["monto"] is None          # no se adivina
    assert h["unidades"] == ["26-777"]
    assert h["refs"][0]["aduana"] == "Veracruz"


def test_pedimento_todos_citados_sin_hallazgo(conn):
    ped = _pedimento(conn)
    _vender(conn, "VIN00000000000000001", "F2601-8Y3", pedimento_id=ped)
    r = conciliar(conn, SID)
    assert not any(x["clase"] == "pedimento_sin_unidades" for x in r["hallazgos"])


def test_vin_inter_sesion(conn):
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed) VALUES ('2026-06-10', 6, 2026)")
    _vender(conn, "WVGZZZ5NZMW900001", "F2699-5N1")               # sesión 1
    conn.execute("INSERT INTO importaciones (session_id, chasis, factura, precio)"
                 " VALUES (2, 'WVGZZZ5NZMW900001', 'F2599-5N1', 500000)")  # sesión 2
    r = conciliar(conn, SID)
    h = next(x for x in r["hallazgos"] if x["clave"] == "conc-vin-inter-sesion")
    assert h["clase"] == "vin_inter_sesion" and h["monto"] is None
    assert h["unidades"] == ["WVGZZZ5NZMW900001"]
    ses = h["refs"][0]["sesiones"]
    assert "1" in ses and "2" in ses


def test_vin_una_sola_sesion_sin_hallazgo(conn):
    _vender(conn, "WVGZZZ5NZMW900001", "F2699-5N1")
    _vender(conn, "WVGZZZ5NZMW900002", "F2699-5N2")
    r = conciliar(conn, SID)
    assert not any(x["clase"] == "vin_inter_sesion" for x in r["hallazgos"])


def test_cero_fabricado_no_es_precio_real(conn):
    # DWH precio 0 (slice vacío) y PDF amount '0,00' (fabricado) NO se cuentan
    # como $0 real: se declaran no estimables (ley cero-snake-oil).
    _vender(conn, "VIN00000000000000001", "F2601-8Y3", precio=0.0)   # sin llegada
    _llegar(conn, "VIN00000000000000009", "SUELTA-1", amount="0,00",
            moneda="USD")                                            # sin venta
    r = conciliar(conn, SID)
    vsl = next(x for x in r["hallazgos"] if x["clase"] == "vendido_sin_llegada")
    assert vsl["monto"] is None                       # precio 0 no suma
    assert "sin precio" in vsl["detalle"]
    lsv = next(x for x in r["hallazgos"] if x["clase"] == "llegado_sin_venta")
    assert lsv["monto"] is None                       # '0,00' no suma
    assert "en cero" in lsv["detalle"]
    assert r["valor_en_riesgo_mxn"] == 0.0            # ningún $0 fabricado infla


def test_cobertura_respaldo_documental(conn):
    from autogenes.concilia import cobertura
    ped = _pedimento(conn)
    # respaldada: precio + factura física
    _vender(conn, "WVGZZZ5NZMW900001", "F2699-5N1", precio=500000, pedimento_id=ped)
    _llegar(conn, "WVGZZZ5NZMW900001", "F2699-5N", amount="500,000.00")
    # vendida sin llegada: precio pero sin factura
    _vender(conn, "WVGZZZ5NZMW900002", "F2699-5N2", precio=300000)
    # sin precio (slice vacío): no medible
    _vender(conn, "WVGZZZ5NZMW900003", "F2699-5N3", precio=0.0)
    c = cobertura(conn, SID)
    assert c["unidades"] == 3
    assert c["con_precio"] == 2 and c["sin_precio"] == 1
    assert c["unidades_sin_factura"] == 2         # la 2 y la 3
    assert c["valor_medible_mxn"] == 800000.0     # 500k + 300k (el 0 no medible)
    assert c["valor_respaldado_mxn"] == 500000.0  # solo la casada
    assert c["pct_respaldado"] == 62              # 500k / 800k = 62.5, round→62
    assert cobertura(conn, SID) == c              # doble corrida idéntica


def test_dossier_lleva_cobertura_y_sello_verificable(conn):
    from autogenes.concilia import dockear_dossier
    from autogenes.sello import verificar
    _vender(conn, "WVGZZZ5NZMW900002", "F2699-5N2", precio=300000)  # sin llegada
    r = dockear_dossier(conn, SID, "conc-vendido-sin-llegada")
    cuerpo = r["producto"]["cuerpo"]
    assert "cobertura" in cuerpo and "sello" in cuerpo
    assert verificar(cuerpo)["valido"] is True    # sello re-derivable


def test_ola2_lectura_pura_doble_corrida(conn):
    ped = _pedimento(conn)
    _vender(conn, "WVGZZZ5NZMW900001", "F2699-5N1", pedimento_id=ped)
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed) VALUES ('2026-06-10', 6, 2026)")
    conn.execute("INSERT INTO importaciones (session_id, chasis, factura, precio)"
                 " VALUES (2, 'WVGZZZ5NZMW900001', 'F2599-5N1', 500000)")
    conn.execute("INSERT INTO pedimentos (session_id, numero_pedimento)"
                 " VALUES (?, '26-777')", (SID,))
    assert conciliar(conn, SID) == conciliar(conn, SID)   # misma base, misma salida
