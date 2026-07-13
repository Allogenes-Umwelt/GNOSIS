"""Spec de las acciones del Radar (T1): procedencia de relación, POST
/relacion y DELETE /evento, con la puerta única Sustrato."""
import sqlite3

import pytest

from autogenes.sustrato import Sustrato
from database import models, models_autogenes
from database.migrations import apply_migrations


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    return c


def test_relacion_registra_origen(conn):
    s = Sustrato(conn, 1)
    a = s.crear_artefacto("nota", "x")
    fr = s.agregar_fragmentos(a.id, [(1, "t")])
    e1 = s.upsert_entidad("A", "organizacion", "operador", evidencia=[fr[0].id])
    e2 = s.upsert_entidad("B", "lugar", "operador", evidencia=[fr[0].id])
    # default: synesis
    r0 = s.agregar_relacion(e1.id, e2.id, "opera en", 0.8, [fr[0].id])
    assert r0.origen == "synesis"
    # operador: la afirmación del analista desde el triage
    r1 = s.agregar_relacion(e1.id, e2.id, "garantiza a", 0.8, [fr[0].id],
                            origen="operador")
    assert r1.origen == "operador"
    fila = conn.execute("SELECT origen FROM ag_relaciones WHERE id = ?",
                        (r1.id,)).fetchone()
    assert fila["origen"] == "operador"


def test_migracion_add_origen_es_aditiva():
    # esquema completo (para las dependencias de migración #1), luego se
    # simula una base VIEJA recreando ag_relaciones SIN la columna origen
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("DROP TABLE ag_relaciones")
    c.execute("""CREATE TABLE ag_relaciones (
        id TEXT PRIMARY KEY, session_id INTEGER NOT NULL, desde_id TEXT NOT NULL,
        hasta_id TEXT NOT NULL, tipo TEXT NOT NULL,
        peso REAL NOT NULL DEFAULT 0.5, evidencia TEXT NOT NULL DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')))""")
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.execute("INSERT INTO ag_relaciones (id, session_id, desde_id, hasta_id, tipo)"
              " VALUES ('r1', 1, 'a', 'b', 'opera en')")
    c.commit()
    cols_antes = {r[1] for r in c.execute("PRAGMA table_info(ag_relaciones)")}
    assert "origen" not in cols_antes

    apply_migrations(c)

    cols = {r[1] for r in c.execute("PRAGMA table_info(ag_relaciones)")}
    assert "origen" in cols
    # la fila vieja se conserva, con origen por defecto declarado
    fila = c.execute("SELECT origen, tipo FROM ag_relaciones WHERE id = 'r1'").fetchone()
    assert fila["origen"] == "synesis" and fila["tipo"] == "opera en"


# ── rutas HTTP ────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def cliente_sembrado(tmp_path_factory):
    import database
    db = tmp_path_factory.mktemp("acc") / "gnosis.db"
    original = database.DB_PATH
    database.DB_PATH = str(db)
    import app as gnosis
    database.init_db()

    conn = database.get_connection()
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed, status) VALUES ('2026-07-10', 7, 2026, 'completed')")
    sid = conn.execute("SELECT id FROM processing_sessions").fetchone()["id"]
    s = Sustrato(conn, sid)
    art = s.crear_artefacto("nota", "seed.txt")
    fr = s.agregar_fragmentos(art.id, [(1, "texto")])
    e1 = s.upsert_entidad("Origen", "organizacion", "operador", evidencia=[fr[0].id])
    e2 = s.upsert_entidad("Destino", "lugar", "operador", evidencia=[fr[0].id])
    ev = s.agregar_eventos([{"titulo": "Vence", "fecha": "2026-07-20",
                             "precision": "dia", "evidencia": [fr[0].id],
                             "origen": "operador"}])
    conn.commit()
    conn.close()

    gnosis.app.config["TESTING"] = True
    ctx = {"cli": gnosis.app.test_client(), "sid": sid,
           "e1": e1.id, "e2": e2.id, "frag": fr[0].id, "evento": ev[0].id}
    yield ctx
    database.DB_PATH = original


def test_post_relacion_crea_con_origen_operador(cliente_sembrado):
    c = cliente_sembrado
    r = c["cli"].post(f"/api/v1/autogenes/relacion?session_id={c['sid']}",
                      json={"desde_id": c["e1"], "hasta_id": c["e2"],
                            "tipo": "opera en", "evidencia": [c["frag"]]})
    assert r.status_code == 200
    rel = r.get_json()["relacion"]
    assert rel["origen"] == "operador" and rel["tipo"] == "opera en"
    assert rel["evidencia"] == [c["frag"]]


def test_post_relacion_entidad_ajena_es_422(cliente_sembrado):
    c = cliente_sembrado
    r = c["cli"].post(f"/api/v1/autogenes/relacion?session_id={c['sid']}",
                      json={"desde_id": c["e1"], "hasta_id": "no-existe",
                            "tipo": "opera en"})
    assert r.status_code == 422


def test_post_relacion_evidencia_fabricada_se_filtra(cliente_sembrado):
    c = cliente_sembrado
    r = c["cli"].post(f"/api/v1/autogenes/relacion?session_id={c['sid']}",
                      json={"desde_id": c["e1"], "hasta_id": c["e2"],
                            "tipo": "factura a", "evidencia": ["frag-fabricado-999"]})
    assert r.status_code == 200
    assert r.get_json()["relacion"]["evidencia"] == []


def test_post_relacion_faltan_campos_es_400(cliente_sembrado):
    c = cliente_sembrado
    r = c["cli"].post(f"/api/v1/autogenes/relacion?session_id={c['sid']}",
                      json={"desde_id": c["e1"]})
    assert r.status_code == 400


def test_delete_evento_resuelve_vencimiento(cliente_sembrado):
    c = cliente_sembrado
    r = c["cli"].delete(f"/api/v1/autogenes/evento/{c['evento']}?session_id={c['sid']}")
    assert r.status_code == 200
    # idempotente: repetir no truena
    r2 = c["cli"].delete(f"/api/v1/autogenes/evento/{c['evento']}?session_id={c['sid']}")
    assert r2.status_code == 200
