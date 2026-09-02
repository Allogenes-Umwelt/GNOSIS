"""Spec del RESPALDO — hallazgo H16 del diagnóstico.

El respaldo es lo único que separa al operador de perder el expediente.
`backup_database` hacía `wal_checkpoint(TRUNCATE)` y copiaba el archivo. El
checkpoint es *best-effort*: con otra conexión leyendo no completa, se imprime
un aviso y **se copia igual** — sin la cola del WAL. Un respaldo incompleto
que dice "Database backed up to: ..." es peor que no tener respaldo, porque
se confía en él.

Y el benchmark §13 pide "restores tested": no había ninguna prueba que
restaurara y comprobara.
"""
import sqlite3

import pytest

from database import models, models_autogenes


@pytest.fixture()
def base(tmp_path, monkeypatch):
    import database
    ruta = tmp_path / "aduanas.db"
    c = sqlite3.connect(ruta)
    c.execute("PRAGMA journal_mode = WAL")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.commit()
    c.close()
    monkeypatch.setattr(database, "DB_PATH", str(ruta))
    import database.backup as backup
    monkeypatch.setattr(backup, "DB_PATH", str(ruta))
    return str(ruta)


def test_el_respaldo_incluye_lo_escrito_con_un_lector_abierto(base, tmp_path):
    """El caso que rompía: otra conexión abierta impide el checkpoint."""
    from database.backup import backup_database

    escritor = sqlite3.connect(base)
    escritor.execute("INSERT INTO marcas (nombre) VALUES ('AUDI-TESTIGO')")
    escritor.commit()

    # un LECTOR abierto: con él, wal_checkpoint(TRUNCATE) no completa
    lector = sqlite3.connect(base)
    lector.execute("SELECT COUNT(*) FROM marcas").fetchone()

    destino = tmp_path / "copias"
    ruta_copia = backup_database(backup_dir=str(destino))
    lector.close()
    escritor.close()

    assert ruta_copia, "el respaldo no se realizó"
    copia = sqlite3.connect(ruta_copia)
    filas = copia.execute(
        "SELECT COUNT(*) FROM marcas WHERE nombre = 'AUDI-TESTIGO'").fetchone()[0]
    copia.close()
    assert filas == 1, "el respaldo perdió lo confirmado (quedó en el -wal)"


def test_la_copia_pasa_integrity_check(base, tmp_path):
    from database.backup import backup_database

    ruta_copia = backup_database(backup_dir=str(tmp_path / "c2"))
    copia = sqlite3.connect(ruta_copia)
    veredicto = copia.execute("PRAGMA integrity_check").fetchone()[0]
    copia.close()
    assert veredicto == "ok", f"la copia no está íntegra: {veredicto}"


def test_restaurar_devuelve_los_datos(base, tmp_path):
    """«Restores tested» del benchmark §13: no basta con copiar."""
    from database.backup import backup_database

    c = sqlite3.connect(base)
    c.execute("INSERT INTO marcas (nombre) VALUES ('PORSCHE-TESTIGO')")
    c.commit()
    esperado = c.execute("SELECT COUNT(*) FROM marcas").fetchone()[0]
    c.close()

    ruta_copia = backup_database(backup_dir=str(tmp_path / "c3"))

    # restaurar = poner la copia donde estaba y abrirla
    restaurada = tmp_path / "restaurada.db"
    import shutil
    shutil.copy2(ruta_copia, restaurada)
    r = sqlite3.connect(restaurada)
    assert r.execute("SELECT COUNT(*) FROM marcas").fetchone()[0] == esperado
    assert r.execute("SELECT COUNT(*) FROM marcas WHERE nombre ="
                     " 'PORSCHE-TESTIGO'").fetchone()[0] == 1
    assert r.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    r.close()


def test_sin_base_no_finge_respaldo(tmp_path, monkeypatch):
    import database.backup as backup
    monkeypatch.setattr(backup, "DB_PATH", str(tmp_path / "no-existe.db"))
    assert backup.backup_database(backup_dir=str(tmp_path / "c4")) is None


def test_el_respaldo_no_depende_de_que_el_checkpoint_complete(base, tmp_path):
    """La propiedad, no la anécdota: con una transacción de LECTURA abierta,
    `wal_checkpoint(TRUNCATE)` devuelve busy y no vuelca nada. El respaldo
    tiene que salir consistente igualmente."""
    from database.backup import backup_database

    esc = sqlite3.connect(base)
    esc.execute("INSERT INTO marcas (nombre) VALUES ('SEAT-TESTIGO')")
    esc.commit()

    lector = sqlite3.connect(base)
    lector.execute("BEGIN")
    lector.execute("SELECT COUNT(*) FROM marcas").fetchone()

    sonda = sqlite3.connect(base)
    ocupado = sonda.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]
    sonda.close()
    assert ocupado == 1, "el escenario no reprodujo el checkpoint ocupado"

    ruta_copia = backup_database(backup_dir=str(tmp_path / "c5"))
    lector.close()
    esc.close()

    copia = sqlite3.connect(ruta_copia)
    assert copia.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert copia.execute("SELECT COUNT(*) FROM marcas WHERE nombre ="
                         " 'SEAT-TESTIGO'").fetchone()[0] == 1
    copia.close()
