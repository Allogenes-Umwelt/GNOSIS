"""Spec for SINAPSIS (F11): insights only exist as conjunctions of
facts already present in engine outputs (verified by construction);
gravity derives from component measures; no conjunction, no insight.
The composer is pure — tested here with engine-output fixtures."""
from autogenes.sinapsis import componer_insights

RESUMEN = {
    "hubs": [{"id": "art:pdf:c.pdf", "etiqueta": "c.pdf", "grado": 10.0}],
    "puentes": [{"id": "art:pdf:c.pdf", "etiqueta": "c.pdf", "grado": 10.0}],
}
MONOLITOS = [{"id": "art:pdf:c.pdf", "etiqueta": "c.pdf", "masa": 1.0},
             {"id": "e-vw", "etiqueta": "VW", "masa": 0.5}]
CONC_VACIO = {"hallazgos": [], "flujo": {"sin_llegada": 0}}
CUPOS_VACIO = {"cupos": []}
VAL_VACIO = {"reglas": []}


def test_sin_conjuncion_no_hay_insight():
    r = componer_insights(RESUMEN, MONOLITOS, CONC_VACIO, CUPOS_VACIO,
                          VAL_VACIO)
    assert r == []


def test_puente_y_monolito_en_hallazgo_componen():
    conc = {
        "hallazgos": [{
            "clave": "conc-x", "clase": "llegado_sin_venta",
            "titulo": "3 llegadas sin venta",
            "unidades": [], "refs": [{"filename": "c.pdf"}],
        }],
        "flujo": {"sin_llegada": 0},
    }
    r = componer_insights(RESUMEN, MONOLITOS, conc, CUPOS_VACIO, VAL_VACIO)
    claves = [i["clave"] for i in r]
    assert "sin-puente-art:pdf:c.pdf" in claves
    assert "sin-monolito-c.pdf" in claves
    puente = next(i for i in r if i["clave"].startswith("sin-puente"))
    assert puente["gravedad"] == 1.0            # grado 10 / grado_max 10
    assert {h["motor"] for h in puente["hechos"]} == {"qualia.topologia",
                                                      "concilia"}
    assert "3 llegadas sin venta" in puente["hechos"][1]["hecho"]
    # el monolito VW (masa 0.5) NO aparece: no protagoniza hallazgo alguno
    assert not any("VW" in i["clave"] for i in r)


def test_cupo_comprometido_deriva_gravedad_de_la_fraccion():
    conc = {"hallazgos": [], "flujo": {"sin_llegada": 40}}
    cupos = {"cupos": [{"tipo": "PRODUCCION", "numero": "P1", "saldo": 200,
                        "inicial": 1200, "meses_restantes": 2.7},
                       {"tipo": "INVERSION", "numero": "I1", "saldo": 0,
                        "inicial": 300}]}
    r = componer_insights({"hubs": [], "puentes": []}, [], conc, cupos,
                          VAL_VACIO)
    assert len(r) == 1                          # el cupo sin saldo no compone
    assert r[0]["gravedad"] == 0.2              # 40 / 200
    assert "20%" in r[0]["lectura"]
    assert "~2.7 meses" in r[0]["hechos"][1]["hecho"]


def test_error_confirmado_solo_en_la_interseccion():
    conc = {
        "hallazgos": [{
            "clave": "conc-jn-disputa", "clase": "jn_en_disputa",
            "titulo": "2 en disputa", "unidades": [],
            "refs": [{"chasis": "VIN-A"}, {"chasis": "VIN-B"}],
        }],
        "flujo": {"sin_llegada": 0},
    }
    val = {"reglas": [{"clave": "val-dwh-jn-norma",
                       "refs": [{"chasis": "VIN-B"}, {"chasis": "VIN-C"}]}]}
    r = componer_insights({"hubs": [], "puentes": []}, [], conc,
                          CUPOS_VACIO, val)
    assert len(r) == 1
    ins = r[0]
    assert ins["clave"] == "sin-error-confirmado"
    assert ins["refs"] == [{"chasis": "VIN-B"}]   # SOLO la intersección
    assert ins["gravedad"] == 0.5                 # 1 confirmado / 2 en disputa
    assert "glosa segura" in ins["lectura"]


def test_orquestador_sobre_base_real():
    import sqlite3
    from autogenes.sinapsis import insights_de_sesion
    from database import models, models_autogenes
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed) VALUES ('2026-07-10', 7, 2026)")
    # disputa J/N que TAMBIÉN viola la norma BRA=N → error confirmado
    c.execute(
        "INSERT INTO importaciones (session_id, chasis, factura, precio,"
        " j_y_n, pais_code) VALUES (1, 'WVWBRA00000090002', 'F2700-BR1',"
        " 298000, 'J', 'BRA')")
    c.execute(
        "INSERT INTO extraccion_facturas (session_id, chasis, factura,"
        " amount, moneda, j_y_n, pais_code, filename) VALUES (1,"
        " 'WVWBRA00000090002', 'F2700-BR', '12,000.00', 'EUR', 'N', 'BRA',"
        " 'tiguan.pdf')")
    r = insights_de_sesion(c, 1)
    confirmado = next(i for i in r["insights"]
                      if i["clave"] == "sin-error-confirmado")
    assert confirmado["refs"] == [{"chasis": "WVWBRA00000090002"}]
    assert r["total"] >= 1


# ── el lattice de refinamiento ───────────────────────────────────────


def test_reticula_celdas_son_intersecciones_reales():
    from autogenes.sinapsis import componer_reticula
    veredictos = {"en_paz": [1, 2, 3], "en_disputa": [4], "sin_llegada": [5, 6]}
    particion = {"conformes": [1, 2, 5], "contra_norma": [4, 6],
                 "otra_violacion": [3]}
    insights = [{"clave": "sin-error-confirmado"}]
    r = componer_reticula(veredictos, particion, insights)
    assert r["universo"] == {"n": 6, "coincide": True}
    celdas = {(c["concilia"], c["validacion"]): c
              for c in r["refinamiento"]["celdas"]}
    assert celdas[("en_paz", "conformes")]["n"] == 2       # {1,2}
    assert celdas[("en_disputa", "contra_norma")]["n"] == 1
    assert celdas[("en_disputa", "contra_norma")]["insight"] == "sin-error-confirmado"
    assert ("en_paz", "contra_norma") not in celdas        # celda vacía no se dibuja
    # suma de celdas == universo: es una partición de verdad
    assert sum(c["n"] for c in r["refinamiento"]["celdas"]) == 6


def test_reticula_sin_insight_no_marca_celda():
    from autogenes.sinapsis import componer_reticula
    r = componer_reticula({"en_disputa": [1]}, {"contra_norma": [1]}, [])
    celda = r["refinamiento"]["celdas"][0]
    assert celda["n"] == 1 and celda["insight"] is None    # el hecho existe;
    # el insight compuesto no está en la lista → no se marca


def test_reticula_universos_desalineados_se_confiesa():
    from autogenes.sinapsis import componer_reticula
    r = componer_reticula({"en_paz": [1]}, {"conformes": [1, 2]}, [])
    assert r["universo"]["coincide"] is False


def test_orquestador_incluye_reticula_coherente():
    import sqlite3
    from autogenes.sinapsis import insights_de_sesion
    from database import models, models_autogenes
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.execute(
        "INSERT INTO importaciones (session_id, chasis, factura, precio,"
        " j_y_n, pais_code) VALUES (1, 'WVWBRA00000090002', 'F2700-BR1',"
        " 298000, 'J', 'BRA')")
    c.execute(
        "INSERT INTO extraccion_facturas (session_id, chasis, factura,"
        " amount, moneda, j_y_n, pais_code, filename) VALUES (1,"
        " 'WVWBRA00000090002', 'F2700-BR', '12,000.00', 'EUR', 'N', 'BRA',"
        " 'tiguan.pdf')")
    r = insights_de_sesion(c, 1)
    ret = r["reticula"]
    assert ret["universo"] == {"n": 1, "coincide": True}
    celda = ret["refinamiento"]["celdas"][0]
    assert (celda["concilia"], celda["validacion"]) == ("en_disputa",
                                                        "contra_norma")
    assert celda["insight"] == "sin-error-confirmado"
