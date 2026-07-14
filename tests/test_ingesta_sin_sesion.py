"""Regresión: dockear evidencia NO exige un mes aduanal ya procesado.

El bug reportado: en un contenedor recién levantado (sin haber corrido el
pipeline mensual) la Ingesta dejaba la carga «en blanco» — cualquier archivo
(txt, pdf, xls, zip) devolvía 404 «No hay sesiones procesadas», porque toda
ruta exigía una `processing_session` previa. El sustrato es local-first: la
primera evidencia debe poder anclarse creando su propia sesión de trabajo.
"""
import io

import pytest


@pytest.fixture()
def cliente_sin_sesion(tmp_path):
    """App real sobre una DB con esquema completo pero SIN ninguna sesión."""
    import database
    db = tmp_path / "vacia.db"
    original = database.DB_PATH
    database.DB_PATH = str(db)

    import app as gnosis  # cacheado si otro test ya lo importó
    database.init_db()    # idempotente: crea el esquema en la DB vacía

    # sin siembra de processing_sessions: el estado que reproduce el bug
    assert database.get_connection().execute(
        "SELECT COUNT(*) c FROM processing_sessions").fetchone()["c"] == 0

    gnosis.app.config["TESTING"] = True
    yield gnosis.app.test_client()
    database.DB_PATH = original


def _subir(cliente, nombre, contenido):
    return cliente.post(
        "/api/v1/autogenes/ingestar",
        data={"documento": (io.BytesIO(contenido), nombre)},
        content_type="multipart/form-data",
    )


def test_txt_dockea_creando_la_sesion_de_trabajo(cliente_sin_sesion):
    import database
    r = _subir(cliente_sin_sesion, "contrato.txt",
               b"Fianza numero 12345 garantiza a la Agencia Aduanal del Puerto.")
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["status"] == "ok"
    # se creo exactamente UNA sesion de trabajo para anclar el artefacto
    ses = database.get_connection().execute(
        "SELECT COUNT(*) c FROM processing_sessions").fetchone()["c"]
    assert ses == 1
    # el artefacto quedo realmente dockeado (no fantasma)
    arte = cliente_sin_sesion.get("/api/v1/autogenes/artefactos").get_json()
    assert any(a["nombre"] == "contrato.txt" for a in arte["artefactos"])


def test_segundo_archivo_reutiliza_la_misma_sesion(cliente_sin_sesion):
    import database
    _subir(cliente_sin_sesion, "a.txt", b"Pedimento 700 en la aduana de Veracruz.")
    _subir(cliente_sin_sesion, "b.txt", b"Otro pedimento 800 en la aduana de Manzanillo.")
    ses = database.get_connection().execute(
        "SELECT COUNT(*) c FROM processing_sessions").fetchone()["c"]
    assert ses == 1   # la segunda carga NO fragmenta la evidencia en otra sesion
