"""Spec de la CADENA DE SELLOS — hallazgo H5 del diagnóstico.

La bitácora WORM es la única propiedad forense del sistema: un expediente de
defensa vale lo que vale su procedencia. `_registrar` sellaba así:

    SELECT hash ... ORDER BY id DESC LIMIT 1     <- fuera del candado
    INSERT INTO ag_bitacora ...                  <- aquí abre transacción
    UPDATE ag_bitacora SET hash = ...

Dos mutaciones concurrentes leen el MISMO `prev_hash` (el SELECT no toma
candado), el candado serializa los INSERT, y la cadena se BIFURCA. El
verificador entonces grita "manipulación" por uso normal. Una alarma que
miente una vez deja de creerse — es peor que no tenerla.

Segundo modo: morir entre el INSERT y el UPDATE deja una fila sin sello. El
verificador la saltaba y declaraba rota la cadena PARA SIEMPRE, sin poder
distinguir el hueco de una manipulación real.
"""
import sqlite3

import pytest

from autogenes.sustrato import Sustrato
from database import models, models_autogenes


def _base(ruta):
    c = sqlite3.connect(ruta, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode = WAL")
    return c


@pytest.fixture()
def ruta(tmp_path):
    p = tmp_path / "b.db"
    c = _base(p)
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.commit()
    c.close()
    return str(p)


def test_el_sello_se_lee_bajo_el_candado_de_escritura(ruta):
    """La invariante que hace IMPOSIBLE la bifurcación.

    Si dos escritores leen el mismo `prev_hash` antes de que ninguno inserte,
    la cadena se bifurca y el verificador grita "manipulación" por uso normal
    (comprobado a mano: da `motivo: cadena`). Eso no ocurría porque todo
    método que registra escribe primero, así que la transacción implícita de
    sqlite3 ya tenía el candado — una garantía PRESTADA, que `autocommit` o un
    método que solo registre se llevan por delante.

    Aquí se fija la invariante directamente: cuando `_registrar` lee el sello
    previo, la conexión ya está en transacción."""
    c = _base(ruta)
    s = Sustrato(c, 1)
    assert not c.in_transaction, "arranque limpio"

    # _registrar SIN escritura previa: el caso que la transacción implícita
    # de sqlite3 no cubría.
    s._registrar("prueba", "sin escritura previa")
    assert c.in_transaction, "_registrar no tomó el candado de escritura"

    # y el candado es real: otro escritor no puede colarse entre la lectura
    # del sello y su escritura.
    otro = sqlite3.connect(ruta, timeout=0.2)   # no esperar el busy_timeout
    with pytest.raises(sqlite3.OperationalError, match="locked"):
        otro.execute("INSERT INTO ag_bitacora (session_id, accion, detalle)"
                     " VALUES (1, 'intruso', 'x')")
        otro.commit()
    otro.close()
    c.commit()
    c.close()


def test_escrituras_concurrentes_dejan_la_cadena_valida(ruta):
    """Y de punta a punta: dos conexiones escribiendo sobre la misma base
    producen una cadena que verifica."""
    c1, c2 = _base(ruta), _base(ruta)
    s1, s2 = Sustrato(c1, 1), Sustrato(c2, 1)
    for i in range(6):
        a1 = s1.crear_artefacto("nota", f"a{i}.txt")
        a2 = s2.crear_artefacto("nota", f"b{i}.txt")
        assert a1.id != a2.id
    veredicto = Sustrato(_base(ruta), 1).verificar_bitacora()
    c1.close()
    c2.close()
    assert veredicto["valido"], (
        f"escrituras concurrentes normales rompieron la cadena: {veredicto}")


def test_un_hueco_se_declara_hueco_no_manipulacion(ruta):
    """Morir entre el INSERT y el UPDATE deja una fila sin sello. Eso es un
    hueco declarable, no una manipulación: decir 'cadena rota' sería mentir."""
    c = _base(ruta)
    s = Sustrato(c, 1)
    for i in range(4):
        s.crear_artefacto("nota", f"x{i}.txt")
    fila = c.execute("SELECT id FROM ag_bitacora ORDER BY id LIMIT 1"
                     " OFFSET 1").fetchone()["id"]
    c.execute("UPDATE ag_bitacora SET hash = NULL WHERE id = ?", (fila,))
    c.commit()

    v = Sustrato(c, 1).verificar_bitacora()
    c.close()
    assert v["motivo"] == "hueco", f"se declaró {v!r} en vez de un hueco"
    assert v["roto_en"] == fila
    assert v["valido"] is False


def test_una_manipulacion_real_si_rompe_la_cadena(ruta):
    """La alarma tiene que seguir sonando cuando alguien edita la historia."""
    c = _base(ruta)
    s = Sustrato(c, 1)
    for i in range(4):
        s.crear_artefacto("nota", f"y{i}.txt")
    fila = c.execute("SELECT id FROM ag_bitacora ORDER BY id LIMIT 1"
                     " OFFSET 2").fetchone()["id"]
    c.execute("UPDATE ag_bitacora SET detalle = 'reescrito' WHERE id = ?", (fila,))
    c.commit()

    v = Sustrato(c, 1).verificar_bitacora()
    c.close()
    assert v["valido"] is False and v["motivo"] == "hash"
    assert v["roto_en"] == fila


def test_la_verificacion_tiene_superficie(ruta, tmp_path, monkeypatch):
    """La única propiedad forense del sistema no puede ser invisible: sin una
    ruta, quien necesita el sello no puede pedirlo."""
    import database
    monkeypatch.setattr(database, "DB_PATH", ruta)
    import app as gnosis
    gnosis.app.config["TESTING"] = True
    r = gnosis.app.test_client().get("/api/v1/autogenes/bitacora/verificar")
    assert r.status_code == 200, r.data[:200]
    cuerpo = r.get_json()
    assert "valido" in cuerpo and "filas" in cuerpo
