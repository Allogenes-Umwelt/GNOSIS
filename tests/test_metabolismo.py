"""Spec del metabolismo del caso (Radar reframeado como FBA de la vía de
producción de conocimiento)."""
import sqlite3

import pytest

from autogenes.metabolismo import metabolismo_de_sesion
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    return c


def test_via_metabolica_con_fugas_reales(conn):
    s = Sustrato(conn, 1)
    # fuente metabolizada
    caliente = s.crear_artefacto("pdf", "caliente.pdf")
    fc = s.agregar_fragmentos(caliente.id, [(1, "a"), (2, "b")])
    # fuente fría: fragmento que nadie cita → fuga en extracción
    fria = s.crear_artefacto("pdf", "fria.pdf")
    s.agregar_fragmentos(fria.id, [(1, "nadie me lee")])
    # entidades: una conectada + en producto, una huérfana
    e1 = s.upsert_entidad("Agencia", "organizacion", "synesis", evidencia=[fc[0].id])
    e2 = s.upsert_entidad("Puerto", "lugar", "operador", evidencia=[fc[1].id])
    s.upsert_entidad("Isla", "concepto", "operador")           # huérfana + sin producto
    s.agregar_relacion(e1.id, e2.id, "opera en", 0.8, [fc[0].id])
    s.dockear_producto("informe", "R", "sintesis", {}, entidades=[e1.id],
                       evidencia=[fc[0].id])

    m = metabolismo_de_sesion(conn, 1, hoy="2026-07-10")

    pools = {p["kind"]: p["total"] for p in m["pools"]}
    assert pools["fuente"] == 2 and pools["fragmentos" if False else "fragmento"] == 3
    assert pools["entidad"] == 3 and pools["relacion"] == 1 and pools["producto"] == 1

    reac = {r["clave"]: r for r in m["reacciones"]}
    # extracción: 3 fragmentos potenciales, 2 citados → fuga 1, item = fría
    assert reac["extraccion"]["potencial"] == 3
    assert reac["extraccion"]["realizado"] == 2
    assert reac["extraccion"]["fuga"] == 1
    assert [f["nombre"] for f in reac["extraccion"]["items"]] == ["fria.pdf"]
    # vinculación: 3 entidades, 2 conectadas → fuga 1 (Isla)
    assert reac["vinculacion"]["realizado"] == 2
    assert reac["vinculacion"]["fuga"] == 1
    assert [h["nombre"] for h in reac["vinculacion"]["items"]] == ["Isla"]
    # síntesis: 3 entidades, 1 en producto → fuga 2
    assert reac["sintesis"]["realizado"] == 1 and reac["sintesis"]["fuga"] == 2

    # salud = media de realizado/potencial sobre uniones con sustrato
    # (2/3 + 2/3 + 1/3)/3 = 0.5555 → 56
    assert m["salud"] == 56
    assert m["total_fugas"] == 1 + 1 + 2


def test_urgencias_van_al_riel_lateral_no_a_la_via(conn):
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("pdf", "x.pdf")
    fr = s.agregar_fragmentos(art.id, [(1, "x")])
    s.agregar_eventos([{"titulo": "Vence fianza", "fecha": "2026-07-15",
                        "precision": "dia", "evidencia": [fr[0].id],
                        "origen": "synesis"}])
    conn.execute("INSERT INTO facturas_faltantes (session_id, factura) VALUES (1, 'F')")
    conn.commit()
    m = metabolismo_de_sesion(conn, 1, hoy="2026-07-10")
    tipos = {u["tipo"] for u in m["urgencias"]}
    assert tipos == {"vencimiento", "negocio"}
    venc = next(u for u in m["urgencias"] if u["tipo"] == "vencimiento")
    assert venc["critico"] is True and "en 5 días" in venc["sub"]
    # el vencimiento carga su id de evento: habilita "Resolver" inline (T2)
    assert venc["id"] and venc["id"] == conn.execute(
        "SELECT id FROM ag_eventos WHERE session_id = 1").fetchone()["id"]


def test_caso_vacio_no_truena(conn):
    m = metabolismo_de_sesion(conn, 1, hoy="2026-07-10")
    assert m["salud"] is None          # sin sustrato, sin rendimiento definido
    assert m["total_fugas"] == 0 and m["urgencias"] == []
    assert all(p["total"] == 0 for p in m["pools"])
    assert m["benchmark"] is None       # sin sesión previa


def test_benchmark_vs_sesion_previa(conn):
    # sesión 1 (previa): un fragmento sin citar → salud baja
    s1 = Sustrato(conn, 1)
    a1 = s1.crear_artefacto("pdf", "prev.pdf")
    s1.agregar_fragmentos(a1.id, [(1, "nadie")])
    salud_prev = metabolismo_de_sesion(conn, 1, hoy="2026-07-10")["salud"]

    # sesión 2 (activa): todo metabolizado → salud alta
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed) VALUES ('2026-08-10', 8, 2026)")
    s2 = Sustrato(conn, 2)
    a2 = s2.crear_artefacto("pdf", "hot.pdf")
    fr = s2.agregar_fragmentos(a2.id, [(1, "x")])
    e1 = s2.upsert_entidad("A", "organizacion", "synesis", evidencia=[fr[0].id])
    e2 = s2.upsert_entidad("B", "lugar", "operador", evidencia=[fr[0].id])
    s2.agregar_relacion(e1.id, e2.id, "opera en", 0.8, [fr[0].id])
    s2.dockear_producto("informe", "R", "sintesis", {}, entidades=[e1.id, e2.id],
                        evidencia=[fr[0].id])

    m2 = metabolismo_de_sesion(conn, 2, hoy="2026-08-10")
    assert m2["benchmark"] is not None
    assert m2["benchmark"]["prev_id"] == 1
    assert m2["benchmark"]["prev_salud"] == salud_prev
    assert m2["benchmark"]["delta"] == m2["salud"] - salud_prev


def _sesion(conn, mes, entidades_modelos):
    """Siembra una sesión con VW + N modelos + geografía; devuelve su id."""
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed) VALUES (?, ?, 2026)", (f"2026-{mes:02d}-10", mes))
    sid = conn.execute("SELECT MAX(id) FROM processing_sessions").fetchone()[0]
    s = Sustrato(conn, sid)
    art = s.crear_artefacto("pdf", f"f{mes}.pdf")
    fr = [f.id for f in s.agregar_fragmentos(art.id, [(1, "t")])]
    vw = s.upsert_entidad("VOLKSWAGEN", "organizacion", "synesis", evidencia=fr)
    al = s.upsert_entidad("Alemania", "lugar", "synesis", evidencia=fr)
    s.agregar_relacion(vw.id, al.id, "origen", 0.8, fr)
    for mod in entidades_modelos:
        v = s.upsert_entidad(f"VW {mod}", "concepto", "synesis", evidencia=fr)
        s.agregar_relacion(vw.id, v.id, "importa", 0.7, fr)
    return sid


def test_deriva_se_publica_al_radar_como_urgencia():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(models.SCHEMA_SQL)
    conn.executescript(models_autogenes.AG_SCHEMA_SQL)
    from autogenes.senales import senales_de_sesion

    ref = _sesion(conn, 6, ["Taos"])                     # referencia pequeña
    act = _sesion(conn, 7, ["Taos", "Jetta", "Tiguan", "Virtus", "Amarok", "Polo"])

    sen = senales_de_sesion(conn, act, hoy="2026-07-10")
    assert sen["deriva"] is not None
    assert sen["deriva"]["de"] == "06/2026" and sen["deriva"]["a"] == "07/2026"
    assert sen["deriva"]["delta_conceptos"] >= 5          # creció de forma notable

    m = metabolismo_de_sesion(conn, act, hoy="2026-07-10")
    derivas = [u for u in m["urgencias"] if u["tipo"] == "deriva"]
    assert derivas and derivas[0]["accion"] == "/autogenes/qualia/deriva"

    # la primera sesión no tiene contra qué comparar: deriva honesta = None
    assert senales_de_sesion(conn, ref, hoy="2026-06-10")["deriva"] is None
