"""Red de seguridad a nivel HTTP: importa la app REAL contra una base
temporal, siembra una sesión, y verifica que cada familia de rutas siga
registrada y respondiendo con el status honesto. Es el contrato que
protege el split en blueprints: si una ruta se cae del registro, aquí
pasa de 200/405 a 404 y el test grita.

Cubre además el contrato de errores endurecido: un 404/405 conserva su
código (no se entierra como 500) y las rutas /api/ responden en JSON.
"""
import pytest


@pytest.fixture(scope="module")
def cliente(tmp_path_factory):
    """App real con DB temporal sembrada con una sola sesión. `import app`
    corre init_db() contra la ruta parchada, así que el esquema completo
    (models + autogenes + migraciones) queda en la base temporal."""
    import database
    db = tmp_path_factory.mktemp("http") / "gnosis.db"
    original = database.DB_PATH
    database.DB_PATH = str(db)

    import app as gnosis  # dispara init_db() sobre la DB temporal

    conn = database.get_connection()
    conn.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed, status) VALUES ('2026-07-10', 7, 2026, 'completed')")
    conn.commit()
    conn.close()

    gnosis.app.config["TESTING"] = True
    yield gnosis.app.test_client()
    database.DB_PATH = original


# ── Páginas (render de plantilla · 200) ──────────────────────────────

PAGINAS = [
    "/", "/welcome", "/procesar", "/gnosisia",
    "/autogenes", "/autogenes/grafo", "/autogenes/vinculos",
    "/autogenes/ingesta", "/autogenes/radar", "/autogenes/sintesis",
    "/autogenes/concilia", "/autogenes/validacion", "/autogenes/sinapsis",
    "/autogenes/nomos", "/autogenes/cronos", "/autogenes/qualia",
    "/autogenes/qualia/orbe", "/autogenes/qualia/cuerdas",
    "/autogenes/qualia/terreno", "/autogenes/qualia/cascada",
    "/autogenes/qualia/horizonte", "/autogenes/qualia/maquina",
    "/tableros", "/tableros/dominio", "/tableros/maduracion",
    "/tableros/rechazos", "/tableros/cupo", "/tableros/rutas",
]


@pytest.mark.parametrize("ruta", PAGINAS)
def test_pagina_renderiza(cliente, ruta):
    assert cliente.get(ruta).status_code == 200


# ── APIs GET con sesión activa (200) ─────────────────────────────────

APIS_GET = [
    "/health", "/api/v1/status", "/api/v1/sessions",
    "/api/v1/tableros/dominio", "/api/v1/tableros/maduracion",
    "/api/v1/tableros/rechazos", "/api/v1/tableros/cupo",
    "/api/v1/tableros/rutas",
    "/api/v1/autogenes/estado", "/api/v1/autogenes/grafo",
    "/api/v1/autogenes/radar", "/api/v1/autogenes/artefactos",
    "/api/v1/autogenes/concilia", "/api/v1/autogenes/validacion",
    "/api/v1/autogenes/sinapsis", "/api/v1/autogenes/nomos",
    "/api/v1/autogenes/cronos", "/api/v1/autogenes/qualia/estado",
    "/api/v1/autogenes/qualia/red", "/api/v1/autogenes/hubs",
    "/api/v1/autogenes/bitacora", "/api/v1/autogenes/exportar",
    "/api/v1/autogenes/metabolismo",
]


@pytest.mark.parametrize("ruta", APIS_GET)
def test_api_get_con_sesion(cliente, ruta):
    r = cliente.get(ruta)
    assert r.status_code == 200
    assert r.headers["Content-Type"].startswith("application/json")


# ── Rutas POST-only: registradas ⇒ un GET da 405, jamás 404 ──────────

SOLO_POST = [
    "/processing", "/procesar/fase1", "/procesar/pipeline",
    "/api/v1/chat", "/api/v1/chat/reset",
    "/api/v1/autogenes/ingestar", "/api/v1/autogenes/extraer",
    "/api/v1/autogenes/sintetizar",
    "/api/v1/autogenes/integrar", "/api/v1/autogenes/nomos/regla",
]


@pytest.mark.parametrize("ruta", SOLO_POST)
def test_post_only_esta_registrada(cliente, ruta):
    # 405 (método no permitido) prueba que la ruta EXISTE; 404 sería que
    # se cayó del registro al mover blueprints.
    assert cliente.get(ruta).status_code == 405


# ── Contrato de errores endurecido ───────────────────────────────────

def test_ruta_desconocida_es_404_no_500(cliente):
    assert cliente.get("/no-existe-esta-ruta").status_code == 404


def test_api_desconocida_es_404_json(cliente):
    r = cliente.get("/api/v1/no-existe")
    assert r.status_code == 404
    assert r.headers["Content-Type"].startswith("application/json")
    assert r.get_json()["status"] == 404


def test_api_405_responde_json(cliente):
    r = cliente.get("/api/v1/chat")
    assert r.status_code == 405
    assert r.get_json()["status"] == 405


def test_api_sin_sesion_es_404_honesto(tmp_path):
    """Sin sesiones procesadas, _con_sesion devuelve 404 declarado (no un
    500 críptico). Base virgen, sin sembrar."""
    import database
    db = tmp_path / "vacia.db"
    original = database.DB_PATH
    database.DB_PATH = str(db)
    try:
        database.init_db()
        import app as gnosis
        c = gnosis.app.test_client()
        r = c.get("/api/v1/tableros/rutas")
        assert r.status_code == 404
        assert "sesiones" in r.get_json()["error"].lower()
    finally:
        database.DB_PATH = original
