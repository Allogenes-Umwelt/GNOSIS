"""Spec for CRONOS (F13): additive time travel over created_at — the
state at T counts only what existed by T and still lives; strata are
real cumulative counts per bitacora moment; limits are declared."""
import sqlite3

import pytest

from autogenes.cronos import estado_en, estratos, momentos
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed) VALUES ('2026-07-10', 7, 2026)")
    s = Sustrato(c, 1)
    art = s.crear_artefacto("pdf", "contrato.pdf")
    frag = s.agregar_fragmentos(art.id, [(1, "texto")])[0]
    e1 = s.upsert_entidad("VW", "organizacion", "synesis", evidencia=[frag.id])
    e2 = s.upsert_entidad("Veracruz", "lugar", "synesis", evidencia=[frag.id])
    s.agregar_relacion(e1.id, e2.id, "importa por", 0.8, [frag.id])
    # el pasado: artefacto+fragmento en T1; entidades y relación después.
    # created_at cae en el mismo segundo en un test — se separa a mano
    # (es semilla de prueba, no mentira de motor).
    c.execute("UPDATE ag_artefactos SET created_at = '2026-07-01 10:00:00'")
    c.execute("UPDATE ag_fragmentos SET created_at = '2026-07-01 10:00:00'")
    c.execute("UPDATE ag_entidades SET created_at = '2026-07-05 10:00:00'")
    c.execute("UPDATE ag_relaciones SET created_at = '2026-07-05 10:00:00'")
    c.execute("UPDATE ag_bitacora SET ts = '2026-07-01 10:00:00' WHERE id <= 2")
    c.execute("UPDATE ag_bitacora SET ts = '2026-07-05 10:00:00' WHERE id > 2")
    c.commit()
    return c


def test_estado_en_reconstruye_solo_lo_que_existia(conn):
    pasado = estado_en(conn, 1, "2026-07-02 00:00:00")
    assert pasado["capas"]["artefactos"] == 1
    assert pasado["capas"]["fragmentos"] == 1
    assert pasado["capas"]["entidades"] == 0          # aún no nacían
    assert pasado["resumen"]["n_nodos"] == 2          # artefacto + fragmento
    assert pasado["acciones_hasta"] == 2

    ahora = estado_en(conn, 1)
    assert ahora["capas"]["entidades"] == 2
    assert ahora["resumen"]["n_enlaces"] >= 3         # cita + evidencias + relación


def test_estratos_acumulan_por_momento_y_declaran_recorte(conn):
    r = estratos(conn, 1)
    assert r["recortado"] is False
    assert len(r["puntos"]) == r["total_momentos"]
    primero, ultimo = r["puntos"][0], r["puntos"][-1]
    assert primero["capas"]["entidades"] == 0
    assert ultimo["capas"]["entidades"] == 2
    # monotonía: los estratos jamás decrecen (reconstrucción aditiva)
    for capa in ("artefactos", "entidades", "relaciones"):
        serie = [p["capas"][capa] for p in r["puntos"]]
        assert serie == sorted(serie)
    assert "no resucita" in r["nota"]


def test_momentos_son_la_bitacora_en_orden(conn):
    linea = momentos(conn, 1)
    assert len(linea) >= 4
    assert all({"ts", "accion", "detalle"} <= set(m) for m in linea)
