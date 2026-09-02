"""Spec de la SUPERFICIE DE RED — hallazgos H4 y H12 del diagnóstico.

El contenedor escucha en `0.0.0.0:5001` (`docker/Containerfile`) y el candado
de operador solo cubría métodos MUTANTES. Todo lo que se sirve por GET
quedaba abierto a cualquier equipo de la red:

- `/download/<filename>` entrega los concentrados aduanales con nombre FIJO
  (`ZipGeneral.zip`, `Concentrado2.xlsx`, `Estadistico.xlsx`) — VIN, facturas
  y precios del mes, sin token y sin registro.
- los tickets de traceback se escribían en ese mismo directorio servible.
- `/errores/download` entrega los PDFs de factura originales.
- `GET /api/v1/admin/llm` expone la configuración del operador.

La ley que se aplica: con candado configurado, LECTURA también se autentica.
"""
import os
import sqlite3

import pytest

from database import models, models_autogenes

TOKEN = "candado-de-prueba"


@pytest.fixture()
def cliente(tmp_path, monkeypatch):
    import database
    ruta = tmp_path / "gnosis.db"
    c = sqlite3.connect(ruta)
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed, status) VALUES ('2026-07-10', 7, 2026, 'completed')")
    c.commit()
    c.close()
    monkeypatch.setattr(database, "DB_PATH", str(ruta))
    monkeypatch.setenv("GNOSIS_TOKEN", TOKEN)
    import app as gnosis
    gnosis.app.config["TESTING"] = True
    descargas = tmp_path / "downloads"
    descargas.mkdir()
    (descargas / "ZipGeneral.zip").write_bytes(b"datos aduanales reales")
    monkeypatch.setitem(gnosis.app.config, "DOWNLOAD_FOLDER", str(descargas))
    return gnosis.app.test_client()


@pytest.mark.parametrize("ruta", [
    "/download/ZipGeneral.zip",
    "/errores/download?sid=1&f=x.pdf",
    "/api/v1/admin/llm",
])
def test_lectura_sensible_exige_el_candado(cliente, ruta):
    r = cliente.get(ruta)
    assert r.status_code == 401, \
        f"{ruta} respondió {r.status_code} sin token: expuesta en la LAN"


def test_con_el_candado_puesto_la_descarga_funciona(cliente):
    r = cliente.get("/download/ZipGeneral.zip", headers={"X-Gnosis-Token": TOKEN})
    assert r.status_code == 200
    assert r.data == b"datos aduanales reales"


def test_las_lecturas_inocuas_siguen_abiertas(cliente):
    """El candado no puede volver inusable la app: el tablero y la salud
    siguen sirviéndose sin token."""
    assert cliente.get("/api/v1/status").status_code in (200, 500)
    assert cliente.get("/health").status_code in (200, 404)


def test_sin_candado_configurado_nada_cambia(tmp_path, monkeypatch):
    """Un operador local sin GNOSIS_TOKEN no debe notar la diferencia."""
    import database
    ruta = tmp_path / "g2.db"
    c = sqlite3.connect(ruta)
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.commit()
    c.close()
    monkeypatch.setattr(database, "DB_PATH", str(ruta))
    monkeypatch.delenv("GNOSIS_TOKEN", raising=False)
    import app as gnosis
    gnosis.app.config["TESTING"] = True
    descargas = tmp_path / "d2"
    descargas.mkdir()
    (descargas / "a.txt").write_text("hola")
    monkeypatch.setitem(gnosis.app.config, "DOWNLOAD_FOLDER", str(descargas))
    assert gnosis.app.test_client().get("/download/a.txt").status_code == 200


# ── los tickets de traceback ─────────────────────────────────────────

def test_el_ticket_de_error_no_cae_en_el_arbol_servible(tmp_path, monkeypatch):
    """Un 500 escribía el traceback completo en DOWNLOAD_FOLDER, servido por
    `/download/<filename>`. El traceback nombra rutas, consultas y datos."""
    import app as gnosis
    descargas = tmp_path / "dl"
    descargas.mkdir()
    monkeypatch.setitem(gnosis.app.config, "DOWNLOAD_FOLDER", str(descargas))
    monkeypatch.setitem(gnosis.app.config, "TICKET_FOLDER", str(tmp_path / "tickets"))

    nombre = gnosis.log_error_to_file(ValueError, "boom", "Traceback...\n  linea")
    assert not os.path.exists(os.path.join(str(descargas), str(nombre or ""))), \
        "el ticket quedó dentro del directorio servible"
    assert os.listdir(tmp_path / "tickets"), "el ticket no se escribió en su sitio"


# ── H17: la sesión fantasma ──────────────────────────────────────────

def test_dockear_evidencia_no_crea_una_sesion_paralela(tmp_path, monkeypatch):
    """`_asegurar_sesion` creaba una sesión de trabajo con el mes del reloj.
    Si luego el pipeline procesa ESE MISMO mes, `create_session` inserta otra
    (no hay unicidad por mes/año): la evidencia dockeada queda en una sesión
    sin dato aduanal y CONCILIA —que filtra por session_id— nunca las cruza.
    """
    import sqlite3 as sq

    import database
    from database import models, models_autogenes

    ruta = tmp_path / "h17.db"
    c = sq.connect(ruta)
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.commit()
    c.close()
    monkeypatch.setattr(database, "DB_PATH", str(ruta))

    import app as gnosis
    from rutas.comun import _asegurar_sesion

    with gnosis.app.test_request_context("/"):
        primera = _asegurar_sesion()
        segunda = _asegurar_sesion()
    assert primera == segunda, "dos llamadas seguidas fabricaron dos sesiones"

    # El camino que sí rompía: dockear evidencia y DESPUÉS procesar ese mismo
    # mes con el pipeline. `create_session` no tiene unicidad por (mes, año).
    import datetime

    from database.persistence import create_session
    ahora = datetime.datetime.now()
    del_pipeline = create_session(ahora.month, ahora.year)

    conn = database.get_connection()
    del_mes = conn.execute(
        "SELECT COUNT(*) FROM processing_sessions WHERE month_processed = ?"
        " AND year_processed = ?", (ahora.month, ahora.year)).fetchone()[0]
    conn.close()
    assert del_mes == 1, (
        f"hay {del_mes} sesiones para {ahora.month}/{ahora.year}: la evidencia "
        f"dockeada quedó en {primera} y el dato aduanal en {del_pipeline}, y "
        f"CONCILIA no puede cruzarlas")
