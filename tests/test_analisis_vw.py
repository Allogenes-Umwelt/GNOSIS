"""Spec del análisis de red de negocio (I1): la red de flujo derivada
país→aduana→marca y las lentes (intermediación, corte, redundancia, HHI).
Todo verificable a mano y determinista."""
import sqlite3

import pytest

from autogenes import analisis_vw
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    sid = 1
    vw = c.execute("SELECT id FROM marcas WHERE nombre='VOLKSWAGEN'").fetchone()["id"]
    audi = c.execute("SELECT id FROM marcas WHERE nombre='AUDI'").fetchone()["id"]
    c.execute("INSERT INTO catalogo_vehiculos (session_id, auto_code, tipo, marca_id)"
              " VALUES (?,?,?,?),(?,?,?,?)",
              (sid, 'VW01', 'Tiguan', vw, sid, 'AU01', 'Q5', audi))
    cvw, caudi = [r["id"] for r in c.execute("SELECT id FROM catalogo_vehiculos ORDER BY id")]
    c.execute("INSERT INTO pedimentos (session_id, numero_pedimento, aduana)"
              " VALUES (?,?,?),(?,?,?),(?,?,?)",
              (sid, 'P1', 'Veracruz', sid, 'P2', 'Manzanillo', sid, 'P3', 'Nuevo Laredo'))
    pv, pm, pn = [r["id"] for r in c.execute("SELECT id FROM pedimentos ORDER BY id")]
    # VW: DEU×Veracruz=5, DEU×Manzanillo=3, USA×NuevoLaredo=2 (vol 10);
    # AUDI: DEU×Veracruz=4 (comparte Veracruz con VW → la vuelve broker).
    # VW usa preferencia N; AUDI usa J en la misma ruta DEU×Veracruz → brecha.
    plan = [(pv, cvw, 'DEU', 5, 'N'), (pm, cvw, 'DEU', 3, 'N'),
            (pn, cvw, 'USA', 2, 'J'), (pv, caudi, 'DEU', 4, 'J')]
    vin = 1
    for ped, cat, pais, n, jn in plan:
        for _ in range(n):
            c.execute("INSERT INTO importaciones (session_id, pedimento_id, catalogo_id,"
                      " chasis, pais_code, precio, auto_code, j_y_n) VALUES (?,?,?,?,?,?,?,?)",
                      (sid, ped, cat, f'VIN{vin:05d}', pais, 100000, 'X', jn))
            vin += 1
    c.commit()
    return c


def test_red_flujo_tiene_pais_aduana_marca(conn):
    a = analisis_vw.analisis(conn, 1)
    assert a["suficiente"] is True
    assert a["n_paises"] == 2      # DEU, USA
    assert a["n_aduanas"] == 3     # Veracruz, Manzanillo, Nuevo Laredo
    assert a["n_marcas"] == 2      # VOLKSWAGEN, AUDI


def test_broker_es_la_aduana_compartida(conn):
    # Veracruz conecta DEU con VW y AUDI: la aduana con mayor intermediación.
    # (El máximo global lo puede tener la marca VW, hub de 3 aduanas; la
    # normalización es al máximo del grafo — aquí importa el ranking de aduanas.)
    a = analisis_vw.analisis(conn, 1)
    assert a["brokers"], "debe haber aduanas broker"
    assert a["brokers"][0]["etiqueta"] == "Veracruz"
    assert a["brokers"][0]["kind"] == "aduana"
    assert a["brokers"][0]["intermediacion"] > 0
    assert a["brokers"][0]["intermediacion"] >= a["brokers"][-1]["intermediacion"]


def test_marca_foco_es_vw_por_defecto(conn):
    a = analisis_vw.analisis(conn, 1)
    assert a["marca"]["nombre"] == "VOLKSWAGEN"
    assert a["marca"]["es_defecto"] is True
    assert a["marca"]["volumen"] == 10


def test_hhi_origenes_mide_dependencia_de_alemania(conn):
    # DEU=8, USA=2 sobre 10 -> HHI = .8² + .2² = .68 (alta concentración)
    a = analisis_vw.analisis(conn, 1)
    assert a["marca"]["hhi_origenes"]["hhi"] == pytest.approx(0.68)
    assert "alta" in a["marca"]["hhi_origenes"]["banda"]
    assert a["marca"]["n_origenes"] == 2


def test_redundancia_es_el_numero_de_origenes_independientes(conn):
    # VW se surte por 2 orígenes (DEU, USA): 2 rutas de suministro disjuntas
    a = analisis_vw.analisis(conn, 1)
    assert a["marca"]["redundancia_rutas"] == 2


def test_corte_critico_cubre_todo_el_suministro(conn):
    # red en serie país→aduana→marca sin bypass: el cuello lleva el 100%
    a = analisis_vw.analisis(conn, 1)
    cc = a["marca"]["corte_critico"]
    assert cc["pct_suministro"] == pytest.approx(1.0)
    assert cc["n_rutas"] >= 1
    assert cc["volumen"] == 10


def test_desglose_de_origenes_ordenado_por_volumen(conn):
    # DEU=8 (80%), USA=2 (20%): el mayor origen primero, con su share medido
    a = analisis_vw.analisis(conn, 1)
    orig = a["marca"]["origenes"]
    assert orig[0]["nombre"] == "DEU"
    assert orig[0]["unidades"] == 8
    assert orig[0]["pct"] == pytest.approx(0.8)
    assert orig[1]["nombre"] == "USA"


def test_marca_explicita_gana_al_defecto(conn):
    a = analisis_vw.analisis(conn, 1, marca="AUDI")
    assert a["marca"]["nombre"] == "AUDI"
    assert a["marca"]["es_defecto"] is False
    assert a["marca"]["volumen"] == 4


def test_similitud_conductual_rankea_audi_como_pariente_de_vw(conn):
    # AUDI comparte origen DEU y aduana Veracruz con VW: la más parecida
    a = analisis_vw.analisis(conn, 1)
    sim = a["marca"]["similitud_conductual"]
    assert sim, "debe haber marcas comparables"
    assert sim[0]["marca"] == "AUDI"
    assert 0 < sim[0]["similitud"] <= 1.0
    assert any("DEU" in c or "Veracruz" in c for c in sim[0]["comparten"])


def test_similitud_es_determinista_y_omite_muestra_chica(conn):
    a1 = analisis_vw.similitud_conductual(analisis_vw._filas_flujo(conn, 1), "VOLKSWAGEN")
    a2 = analisis_vw.similitud_conductual(analisis_vw._filas_flujo(conn, 1), "VOLKSWAGEN")
    assert a1 == a2
    # SEAT/PORSCHE no existen en esta sesión -> no aparecen; AUDI (4) sí
    assert all(s["n"] >= 3 for s in a1)


def test_brecha_jn_detecta_que_vw_usa_menos_la_preferencia(conn):
    # ruta DEU×Veracruz: VW=0% J, AUDI=100% J -> brecha a favor de los pares
    a = analisis_vw.analisis(conn, 1)
    br = a["marca"]["brecha_jn"]
    assert br, "debe detectar la brecha en DEU×Veracruz"
    top = br[0]
    assert top["pais"] == "DEU" and top["aduana"] == "Veracruz"
    assert top["share_foco"] == 0.0
    assert top["share_pares"] == 1.0
    assert top["brecha"] == 1.0


def test_rutas_ausentes_vs_pares(conn):
    filas = analisis_vw._filas_flujo(conn, 1)
    # AUDI solo usa DEU×Veracruz; sus pares (VW) usan también Manzanillo y USA
    aus = {(a["pais"], a["aduana"]) for a in analisis_vw.rutas_ausentes_vs_pares(filas, "AUDI")}
    assert ("DEU", "Manzanillo") in aus
    assert ("USA", "Nuevo Laredo") in aus
    # VW usa todas las rutas que AUDI usa: nada ausente para VW vs sus pares
    assert analisis_vw.rutas_ausentes_vs_pares(filas, "VOLKSWAGEN") == []


def test_deriva_entre_sesiones_gana_y_pierde_rutas():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    vw = c.execute("SELECT id FROM marcas WHERE nombre='VOLKSWAGEN'").fetchone()["id"]

    def poblar(sid, rutas):   # rutas: [(aduana, pais, n)]
        c.execute("INSERT INTO processing_sessions (id, session_date, month_processed,"
                  " year_processed) VALUES (?,?,?,?)", (sid, f'2026-0{sid}-01', sid, 2026))
        c.execute("INSERT INTO catalogo_vehiculos (session_id, auto_code, tipo, marca_id)"
                  " VALUES (?,?,?,?)", (sid, 'VW01', 'Tiguan', vw))
        cvw = c.execute("SELECT id FROM catalogo_vehiculos WHERE session_id=?", (sid,)).fetchone()["id"]
        vin = sid * 1000
        for aduana, pais, n in rutas:
            c.execute("INSERT INTO pedimentos (session_id, numero_pedimento, aduana)"
                      " VALUES (?,?,?)", (sid, f'P-{sid}-{aduana}', aduana))
            ped = c.execute("SELECT id FROM pedimentos WHERE session_id=? AND aduana=?",
                            (sid, aduana)).fetchone()["id"]
            for _ in range(n):
                c.execute("INSERT INTO importaciones (session_id, pedimento_id, catalogo_id,"
                          " chasis, pais_code, precio) VALUES (?,?,?,?,?,?)",
                          (sid, ped, cvw, f'V{vin}', pais, 100000))
                vin += 1

    poblar(1, [('Veracruz', 'DEU', 5), ('Manzanillo', 'DEU', 3)])        # referencia
    poblar(2, [('Veracruz', 'DEU', 6), ('Nuevo Laredo', 'USA', 4)])      # actual
    c.commit()
    d = analisis_vw.deriva_vw(c, 2, 1, 'VOLKSWAGEN')
    ganadas = {(g["pais"], g["aduana"]) for g in d["rutas_ganadas"]}
    perdidas = {(p["pais"], p["aduana"]) for p in d["rutas_perdidas"]}
    assert ("USA", "Nuevo Laredo") in ganadas   # ruta nueva
    assert ("DEU", "Manzanillo") in perdidas     # ruta abandonada (esperada-pero-ausente)
    assert d["delta_volumen"] == 2               # (6+4) − (5+3)


def test_analisis_es_determinista(conn):
    assert analisis_vw.analisis(conn, 1) == analisis_vw.analisis(conn, 1)


def test_estructura_insuficiente_se_declara(conn):
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    a = analisis_vw.analisis(c, 1)
    assert a["suficiente"] is False
    assert "insuficiente" in a["motivo"]


def test_analisis_no_escribe_nada(conn):
    def conteos():
        return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                for t in ("importaciones", "pedimentos", "ag_relaciones",
                          "ag_entidades", "ag_productos")}
    antes = conteos()
    analisis_vw.analisis(conn, 1)
    assert conteos() == antes


def test_hhi_reparto_parejo_es_bajo():
    # cuatro rutas iguales -> HHI = 4 × .25² = .25 (frontera moderada/alta)
    r = analisis_vw.hhi([5, 5, 5, 5])
    assert r["hhi"] == pytest.approx(0.25)
    assert r["n"] == 4
