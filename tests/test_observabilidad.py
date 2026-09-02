"""Spec de OBSERVABILIDAD — hallazgos H8, H9 y H22 del diagnóstico.

Antes: 34 `print(` en el árbol vivo y cero `import logging`. Bajo gunicorn eso
va a stdout sin nivel, sin petición y sin filtro. Y el tablero degradaba a una
pantalla VACÍA ante cualquier excepción, que es una afirmación falsa sobre el
expediente: dice "no hay datos" cuando lo que pasó es "no pude leerlos".
"""
import logging
import sqlite3

import pytest

from database import models, models_autogenes


@pytest.fixture()
def cliente(tmp_path, monkeypatch):
    import database
    ruta = tmp_path / "g.db"
    c = sqlite3.connect(ruta)
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.commit()
    c.close()
    monkeypatch.setattr(database, "DB_PATH", str(ruta))
    import app as gnosis
    gnosis.app.config["TESTING"] = True
    return gnosis.app.test_client()


def test_cada_peticion_lleva_una_referencia(cliente):
    """Sin id de petición, dos operaciones concurrentes entrelazan sus líneas
    en el log y ninguna se puede seguir."""
    r = cliente.get("/api/v1/status")
    assert r.headers.get("X-Peticion-Id"), "la respuesta no trae referencia"
    otra = cliente.get("/api/v1/status")
    assert otra.headers["X-Peticion-Id"] != r.headers["X-Peticion-Id"], \
        "dos peticiones distintas comparten referencia"


def test_el_arbol_vivo_no_usa_print(cliente):
    """El gate real de H8: el código mantenido registra, no imprime."""
    import glob
    import re

    sospechosos = []
    vivos = (["app.py", "registro.py"] + glob.glob("rutas/*.py")
             + glob.glob("autogenes/*.py") + glob.glob("database/*.py")
             + glob.glob("jarvis/*.py") + glob.glob("tableros/*.py"))
    for archivo in vivos:
        if archivo.endswith("backup_proton.py"):
            continue          # script huérfano, fuera del árbol mantenido
        for n, linea in enumerate(open(archivo, encoding="utf-8"), 1):
            if re.match(r"^\s*print\(", linea):
                sospechosos.append(f"{archivo}:{n}")
    assert not sospechosos, f"quedan print() sin nivel ni contexto: {sospechosos}"


def test_el_registro_lleva_nivel_y_peticion(caplog):
    from registro import log, nuevo_id_peticion

    pid = nuevo_id_peticion()
    with caplog.at_level(logging.WARNING, logger="gnosis.prueba"):
        log("prueba").warning("algo raro")
    registro_ = caplog.records[-1]
    assert registro_.levelname == "WARNING"
    assert getattr(registro_, "peticion", None) == pid


def test_el_tablero_declara_el_fallo_en_vez_de_fingir_vacio(cliente, monkeypatch):
    """H9: un fallo de consulta se presentaba como 'no hay datos'."""
    import app as gnosis

    def explota(*a, **k):
        raise RuntimeError("consulta rota")

    # el tablero importa dentro de la función: hay que parchear el origen
    import database.persistence as persistencia
    monkeypatch.setattr(persistencia, "get_latest_session_id", explota)
    assert gnosis.app
    r = cliente.get("/")
    assert r.status_code == 200, "el tablero debe degradar, no caer"
    cuerpo = r.data.decode("utf-8")
    assert "no pudo cargarse" in cuerpo, \
        "el tablero mostró un vacío silencioso en vez de declarar el fallo"
    assert "Referencia:" in cuerpo


def test_un_500_de_api_es_rastreable(cliente, monkeypatch, caplog):
    """H22, resuelto en su parte real: 93 sitios devolvían `str(e)` y NO
    dejaban rastro. El texto se conserva —en una herramienta de un operador
    ese detalle es la parte honesta del error— pero ahora va acompañado de
    una línea de log y de una referencia que las casa."""
    import database

    def explota(*a, **k):
        raise RuntimeError("la base no abre")

    monkeypatch.setattr(database, "get_connection", explota)
    with caplog.at_level(logging.ERROR, logger="gnosis.rutas"):
        r = cliente.get("/api/v1/status")
    assert r.status_code == 500
    cuerpo = r.get_json()
    assert cuerpo.get("referencia"), "sin referencia, el 500 no es rastreable"
    assert cuerpo["referencia"] == r.headers["X-Peticion-Id"]
    assert any("la base no abre" in reg.getMessage() for reg in caplog.records), \
        "el fallo no dejó línea en el log"
