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
