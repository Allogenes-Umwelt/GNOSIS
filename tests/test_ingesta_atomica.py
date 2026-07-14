"""Ingesta atómica por archivo: el artefacto y sus fragmentos entran en un
solo commit — o los dos, o ninguno. Sin esto, morir entre ambos commits
dejaría un artefacto con hash pero SIN fragmentos, que el dedupe saltaría
para siempre: evidencia muda que viola "todo citable"."""
import sqlite3

import pytest

from autogenes.ingesta import artefacto_por_hash, ingestar_archivo, _hash
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


def test_ingesta_deja_artefacto_con_fragmentos(conn):
    r = ingestar_archivo(conn, 1, "carta.txt", b"un parrafo\n\notro parrafo")
    assert "artefacto_id" in r and r["fragmentos"] >= 1
    frags = conn.execute("SELECT COUNT(*) FROM ag_fragmentos WHERE artefacto_id = ?",
                         (r["artefacto_id"],)).fetchone()[0]
    assert frags == r["fragmentos"] and frags > 0


def test_fallo_entre_artefacto_y_fragmentos_no_deja_fantasma(conn, monkeypatch):
    contenido = b"Agencia Aduanal garantiza a Volkswagen de Mexico."
    h = _hash(contenido)

    # El proceso "muere" justo al anclar fragmentos (OOM/timeout SIGKILL
    # simulado): la escritura del artefacto NO debe sobrevivir.
    def boom(self, *a, **k):
        raise RuntimeError("kill simulado a mitad de la ingesta")
    monkeypatch.setattr(Sustrato, "agregar_fragmentos", boom)

    with pytest.raises(RuntimeError):
        ingestar_archivo(conn, 1, "carta.txt", contenido)

    # rollback total: ni artefacto, ni hash registrado -> el dedupe NO lo salta
    assert conn.execute("SELECT COUNT(*) FROM ag_artefactos").fetchone()[0] == 0
    assert artefacto_por_hash(conn, 1, h) is None

    # y al reintentar (ya sin el fallo) el archivo entra completo
    monkeypatch.undo()
    r = ingestar_archivo(conn, 1, "carta.txt", contenido)
    assert "artefacto_id" in r and r["fragmentos"] > 0
    assert artefacto_por_hash(conn, 1, h) == "carta.txt"


def test_reingesta_del_mismo_binario_es_dedupe_no_segundo_artefacto(conn):
    contenido = b"contenido identico dos veces"
    r1 = ingestar_archivo(conn, 1, "a.txt", contenido)
    r2 = ingestar_archivo(conn, 1, "a_copia.txt", contenido)
    assert "artefacto_id" in r1
    assert r2.get("duplicado") == "a.txt"
    assert conn.execute("SELECT COUNT(*) FROM ag_artefactos").fetchone()[0] == 1
