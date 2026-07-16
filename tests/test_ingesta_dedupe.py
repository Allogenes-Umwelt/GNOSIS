"""Dedupe por contenido (C5): un mismo binario no entra dos veces a la
sesión — evita duplicar fragmentos y contaminar la cobertura."""
import sqlite3

import pytest

from autogenes.ingesta import artefacto_por_hash, ingestar_archivo
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


def test_mismo_contenido_se_rechaza(conn):
    contenido = b"Agencia Aduanal del Golfo garantiza a Volkswagen de Mexico."
    r1 = ingestar_archivo(conn, 1, "carta.txt", contenido)
    assert "artefacto_id" in r1 and "duplicado" not in r1
    # el hash quedó guardado
    fila = conn.execute("SELECT hash FROM ag_artefactos WHERE id = ?",
                        (r1["artefacto_id"],)).fetchone()
    assert fila["hash"] and artefacto_por_hash(conn, 1, fila["hash"]) == "carta.txt"

    # el mismo binario, otro nombre → rechazado como duplicado; sin 2º artefacto
    r2 = ingestar_archivo(conn, 1, "carta_copia.txt", contenido)
    assert r2.get("duplicado") == "carta.txt"
    assert conn.execute("SELECT COUNT(*) FROM ag_artefactos").fetchone()[0] == 1


def test_contenido_distinto_entra(conn):
    ingestar_archivo(conn, 1, "a.txt", b"contenido uno")
    ingestar_archivo(conn, 1, "b.txt", b"contenido dos distinto")
    assert conn.execute("SELECT COUNT(*) FROM ag_artefactos").fetchone()[0] == 2


def test_migracion_hash_es_aditiva_e_idempotente(tmp_path, monkeypatch):
    import database
    from database.persistence import migrate_add_artefacto_hash
    db = tmp_path / "old.db"
    monkeypatch.setattr(database, "DB_PATH", str(db))
    # base VIEJA: ag_artefactos SIN hash
    c = sqlite3.connect(str(db))
    c.executescript(models.SCHEMA_SQL)
    c.execute("""CREATE TABLE ag_artefactos (
        id TEXT PRIMARY KEY, session_id INTEGER NOT NULL,
        kind TEXT NOT NULL, nombre TEXT NOT NULL, paginas INTEGER,
        blob_ref TEXT, created_at TEXT DEFAULT (datetime('now')))""")
    c.commit()
    c.close()

    migrate_add_artefacto_hash()
    migrate_add_artefacto_hash()   # idempotente

    c = sqlite3.connect(str(db))
    cols = {r[1] for r in c.execute("PRAGMA table_info(ag_artefactos)")}
    c.close()
    assert "hash" in cols
