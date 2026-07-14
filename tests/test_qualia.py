"""Spec for the QUALIA session service (F7b): projection adapter,
auto-telemetry with dedup and cap, operator baseline, measured
anomalies and cross-session drift — all over the real schema."""
import sqlite3

import pytest

from autogenes import qualia
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


def _sesion(c: sqlite3.Connection, mes: int) -> int:
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed)"
        " VALUES (?, ?, 2026)", (f"2026-{mes:02d}-10", mes),
    )
    return c.execute("SELECT MAX(id) FROM processing_sessions").fetchone()[0]


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    sid = _sesion(c, 7)
    s = Sustrato(c, sid)
    art = s.crear_artefacto("pdf", "contrato.pdf")
    frag = s.agregar_fragmentos(art.id, [(1, "texto del contrato")])[0]
    e1 = s.upsert_entidad("VW", "organizacion", "synesis", evidencia=[frag.id])
    e2 = s.upsert_entidad("Veracruz", "lugar", "synesis", evidencia=[frag.id])
    s.agregar_relacion(e1.id, e2.id, "importa por", 0.8, [frag.id])
    return c


SID = 1


def test_red_de_sesion_proyecta_sin_escribir(conn):
    antes = conn.execute("SELECT COUNT(*) FROM ag_bitacora").fetchone()[0]
    red = qualia.red_de_sesion(conn, SID)
    assert len(red["nodos"]) > 0 and len(red["enlaces"]) > 0
    assert all({"id", "etiqueta"} <= set(n) for n in red["nodos"])
    assert conn.execute("SELECT COUNT(*) FROM ag_bitacora").fetchone()[0] == antes


def test_snapshot_automatico_deduplica_lo_identico(conn):
    assert qualia.registrar_snapshot(conn, SID) is not None
    assert qualia.registrar_snapshot(conn, SID) is None   # sin cambio, sin punto
    assert len(qualia.leer_snapshots(conn, SID)) == 1
    # una mutación real produce un punto nuevo
    s = Sustrato(conn, SID)
    frag = s.agregar_fragmentos(
        s.crear_artefacto("pdf", "factura.pdf").id, [(1, "x")])[0]
    s.upsert_entidad("AUDI", "organizacion", "synesis", evidencia=[frag.id])
    assert qualia.registrar_snapshot(conn, SID) is not None
    assert len(qualia.leer_snapshots(conn, SID)) == 2


def test_telemetria_se_acota_a_max_snapshots(conn, monkeypatch):
    monkeypatch.setattr(qualia, "MAX_SNAPSHOTS", 3)
    s = Sustrato(conn, SID)
    for i in range(5):
        art = s.crear_artefacto("nota", f"nota-{i}")
        frag = s.agregar_fragmentos(art.id, [(None, f"texto {i}")])[0]
        s.upsert_entidad(f"Entidad {i}", "concepto", "synesis", evidencia=[frag.id])
        qualia.registrar_snapshot(conn, SID)
    assert len(qualia.leer_snapshots(conn, SID)) == 3


def test_sin_base_no_hay_hallazgos_y_se_dice_por_que(conn):
    r = qualia.anomalias_de_sesion(conn, SID)
    assert r["base"] is None
    assert r["hallazgos"] == []
    assert "referencia" in r["motivo"].lower()


def test_base_fijada_por_operador_y_anomalias_medidas(conn):
    qualia.fijar_base(conn, SID)
    sin_cambio = qualia.anomalias_de_sesion(conn, SID)
    assert sin_cambio["base"] is not None
    assert sin_cambio["hallazgos"] == []      # nada de placebo
    # una isla nueva contra la referencia
    s = Sustrato(conn, SID)
    s.upsert_entidad("Isla nueva", "concepto", "operador")
    con_cambio = qualia.anomalias_de_sesion(conn, SID)
    assert any(h["detector"] == "islas" for h in con_cambio["hallazgos"])


def test_refijar_base_absorbe_el_cambio(conn):
    qualia.fijar_base(conn, SID)
    Sustrato(conn, SID).upsert_entidad("Isla", "concepto", "operador")
    assert qualia.anomalias_de_sesion(conn, SID)["hallazgos"]
    qualia.fijar_base(conn, SID)              # el operador acepta el nuevo estado
    assert qualia.anomalias_de_sesion(conn, SID)["hallazgos"] == []


def test_drift_entre_sesiones(conn):
    sid_b = _sesion(conn, 8)
    s = Sustrato(conn, sid_b)
    art = s.crear_artefacto("pdf", "contrato.pdf")
    frag = s.agregar_fragmentos(art.id, [(1, "texto")])[0]
    s.upsert_entidad("VW", "organizacion", "synesis", evidencia=[frag.id])
    d = qualia.drift_sesiones(conn, SID, sid_b)
    assert d["de"] == "07/2026" and d["a"] == "08/2026"
    assert isinstance(d["deltas"]["n_nodos"], int)


def test_drift_sesion_inexistente_es_error_claro(conn):
    with pytest.raises(ValueError, match="inexistente"):
        qualia.drift_sesiones(conn, SID, 99)


def test_estado_qualia_entrega_todo_en_una_llamada(conn):
    qualia.fijar_base(conn, SID)
    r = qualia.estado_qualia(conn, SID)
    assert {"resumen", "base", "hallazgos", "snapshots"} <= set(r)
    assert len(r["snapshots"]) >= 1


def _bitacora_dia(conn, dia: str, n: int):
    for _ in range(n):
        conn.execute(
            "INSERT INTO ag_bitacora (session_id, ts, accion, detalle)"
            " VALUES (1, ? || ' 12:00:00', 'op', 'x')", (dia,),
        )
    conn.commit()


def test_rafaga_de_actividad_sobre_bitacora(conn):
    """Un día con mucha más mutación que la cadencia previa dispara
    RÁFAGA — sin necesitar base (mide contra su propia historia)."""
    conn.execute("DELETE FROM ag_bitacora")
    for k, dia in enumerate(["2026-07-01", "2026-07-02", "2026-07-03",
                             "2026-07-04", "2026-07-05", "2026-07-06",
                             "2026-07-07"]):
        _bitacora_dia(conn, dia, 2 + (k % 2))
    _bitacora_dia(conn, "2026-07-08", 14)
    r = qualia.anomalias_de_sesion(conn, SID)
    assert r["base"] is None                       # sin base
    detectores = [h["detector"] for h in r["hallazgos"]]
    assert "rafaga" in detectores                  # pero la ráfaga es real
    rafaga = next(h for h in r["hallazgos"] if h["detector"] == "rafaga")
    assert 0 < rafaga["severidad"] <= 1
    assert rafaga["clave"] == "anom-rafaga"


def test_cadencia_estable_no_dispara_rafaga(conn):
    conn.execute("DELETE FROM ag_bitacora")
    for k in range(8):
        _bitacora_dia(conn, f"2026-07-{k + 1:02d}", 3)
    r = qualia.anomalias_de_sesion(conn, SID)
    assert all(h["detector"] not in ("rafaga", "ritmo") for h in r["hallazgos"])


# ── lente de negocio (Q2 del PLAN_QUALIA_UPLIFT) ──────────────────────

def test_lente_negocio_oculta_fontaneria_y_deja_el_resto(conn):
    """Por default QUALIA oculta artefactos/fragmentos; la capa documental
    sigue disponible con lente='completa'. Ningún enlace queda colgando de
    un nodo oculto."""
    completa = qualia.red_de_sesion(conn, SID, lente="completa")
    negocio = qualia.red_de_sesion(conn, SID, lente="negocio")
    kinds_completa = {n["kind"] for n in completa["nodos"]}
    kinds_negocio = {n["kind"] for n in negocio["nodos"]}
    assert {"artefacto", "fragmento"} <= kinds_completa
    assert not ({"artefacto", "fragmento"} & kinds_negocio)
    assert len(negocio["nodos"]) < len(completa["nodos"])
    ids = {n["id"] for n in negocio["nodos"]}
    assert all(e["origen"] in ids and e["destino"] in ids for e in negocio["enlaces"])


def test_lente_negocio_los_hubs_dejan_de_ser_documentos(conn):
    """La patología que motiva la lente: cuando muchas entidades citan el
    MISMO PDF, bajo la lente completa el PDF domina la centralidad (el hub
    ES un nombre de archivo). Bajo la lente de negocio, no."""
    from autogenes.topologia import resumen_red
    s = Sustrato(conn, SID)
    frag = conn.execute(
        "SELECT id FROM ag_fragmentos WHERE session_id = ? LIMIT 1", (SID,)
    ).fetchone()[0]
    for nombre in ("AUDI", "SEAT", "PORSCHE", "CUPRA"):
        s.upsert_entidad(nombre, "organizacion", "synesis", evidencia=[frag])
    hub_completa = resumen_red(
        qualia.red_de_sesion(conn, SID, lente="completa"))["hubs"][0]
    hub_negocio = resumen_red(
        qualia.red_de_sesion(conn, SID, lente="negocio"))["hubs"][0]
    assert hub_completa["etiqueta"] == "contrato.pdf"      # el documento manda
    assert hub_negocio["etiqueta"] != "contrato.pdf"       # ya no


def test_lente_negocio_determinista_doble_corrida(conn):
    """Métrica nueva → doble corrida idéntica (LEY de determinismo)."""
    from autogenes.topologia import resumen_red
    a = resumen_red(qualia.red_de_sesion(conn, SID, lente="negocio"))
    b = resumen_red(qualia.red_de_sesion(conn, SID, lente="negocio"))
    assert a == b
