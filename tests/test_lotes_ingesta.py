"""Ingesta de un ZIP grande por goteo: staging + manifiesto + tandas
acotadas por tiempo. Cubre el contrato que evita el freeze — ningún
request procesa todo el ZIP — y la reanudación por dedupe, más los
guardias anti zip-bomba y anti-traversal."""
import io
import os
import sqlite3
import zipfile

import pytest

from autogenes.ingesta import ingestar_archivo
from autogenes.lotes import (
    LoteError,
    _leer_manifiesto,
    _lote_dir,
    descartar,
    expandir_zip,
    procesar_tanda,
)
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


@pytest.fixture()
def base(tmp_path):
    return str(tmp_path / "uploads")


def _zip(tmp_path, archivos):
    """Escribe un ZIP a disco (expandir_zip toma una ruta) y la devuelve."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for nombre, contenido in archivos.items():
            z.writestr(nombre, contenido)
    ruta = str(tmp_path / "lote.zip")
    with open(ruta, "wb") as fh:
        fh.write(buf.getvalue())
    return ruta


def test_expandir_crea_staging_con_todo_pendiente(conn, base, tmp_path):
    z = _zip(tmp_path, {"a.txt": b"contenido a", "b.txt": b"contenido b"})
    r = expandir_zip(base, 1, z)
    assert r["total"] == 2 and r["pendientes"] == 2 and r["done"] is False
    lote_dir = _lote_dir(base, 1, r["lote_id"])
    assert os.path.isdir(lote_dir)
    man = _leer_manifiesto(lote_dir)
    assert all(e["estado"] == "pendiente" for e in man["entradas"])


def test_goteo_procesa_en_tandas_y_limpia_al_terminar(conn, base, tmp_path):
    z = _zip(tmp_path, {f"f{i}.txt": f"documento distinto {i}".encode()
                        for i in range(5)})
    r = expandir_zip(base, 1, z)
    lote_id = r["lote_id"]
    # una entrada por tanda -> ningún request procesa el ZIP entero
    p = None
    tandas = 0
    for _ in range(20):
        p = procesar_tanda(conn, base, 1, lote_id, max_entradas=1)
        tandas += 1
        if p["done"]:
            break
    assert p["done"] and p["ingeridos"] == 5 and p["pendientes"] == 0
    assert tandas == 5, "cada tanda ingiere una sola entrada (time-box respetado)"
    # staging borrado al cerrar
    assert not os.path.isdir(_lote_dir(base, 1, lote_id))
    # y los 5 artefactos quedaron en el sustrato
    assert conn.execute("SELECT COUNT(*) FROM ag_artefactos").fetchone()[0] == 5


def test_reanudar_no_duplica_lo_ya_dockeado(conn, base, tmp_path):
    ingestar_archivo(conn, 1, "x.txt", b"ya dockeado antes")
    z = _zip(tmp_path, {"x.txt": b"ya dockeado antes", "y.txt": b"contenido nuevo"})
    r = expandir_zip(base, 1, z)
    p = procesar_tanda(conn, base, 1, r["lote_id"], max_entradas=100)
    assert p["done"] and p["duplicados"] == 1 and p["ingeridos"] == 1
    assert conn.execute("SELECT COUNT(*) FROM ag_artefactos").fetchone()[0] == 2


def test_zip_danado_es_error_de_negocio(conn, base, tmp_path):
    bad = str(tmp_path / "bad.zip")
    with open(bad, "wb") as fh:
        fh.write(b"esto no es un zip")
    with pytest.raises(LoteError):
        expandir_zip(base, 1, bad)


def test_zip_vacio_se_rechaza(conn, base, tmp_path):
    z = _zip(tmp_path, {})
    with pytest.raises(LoteError):
        expandir_zip(base, 1, z)


def test_tope_de_numero_de_entradas(conn, base, tmp_path, monkeypatch):
    import autogenes.lotes as L
    monkeypatch.setattr(L, "MAX_ENTRADAS", 2)
    z = _zip(tmp_path, {f"f{i}.txt": f"x{i}".encode() for i in range(3)})
    with pytest.raises(LoteError):
        expandir_zip(base, 1, z)


def test_tope_descomprimido_anti_bomba(conn, base, tmp_path, monkeypatch):
    import autogenes.lotes as L
    monkeypatch.setattr(L, "MAX_UNZIPPED_BYTES", 5)
    z = _zip(tmp_path, {"big.txt": b"muchos mas de cinco bytes"})
    with pytest.raises(LoteError):
        expandir_zip(base, 1, z)


def test_lote_id_invalido_no_permite_traversal(base):
    with pytest.raises(LoteError):
        _lote_dir(base, 1, "../../etc/passwd")


def test_nombres_en_colision_no_se_pisan(conn, base, tmp_path):
    # dos entradas en carpetas distintas con el mismo basename
    z = _zip(tmp_path, {"carpeta1/f.txt": b"uno", "carpeta2/f.txt": b"dos"})
    r = expandir_zip(base, 1, z)
    assert r["total"] == 2
    p = procesar_tanda(conn, base, 1, r["lote_id"], max_entradas=100)
    assert p["ingeridos"] == 2   # ambos entraron: nombres distintos en staging


def test_descartar_borra_staging_y_es_idempotente(conn, base, tmp_path):
    z = _zip(tmp_path, {"a.txt": b"a"})
    r = expandir_zip(base, 1, z)
    lote_dir = _lote_dir(base, 1, r["lote_id"])
    assert os.path.isdir(lote_dir)
    descartar(base, 1, r["lote_id"])
    descartar(base, 1, r["lote_id"])   # idempotente
    assert not os.path.isdir(lote_dir)
