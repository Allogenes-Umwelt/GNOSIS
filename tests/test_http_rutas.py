"""Red de seguridad a nivel HTTP: importa la app REAL contra una base
temporal, siembra una sesión, y verifica que cada familia de rutas siga
registrada y respondiendo con el status honesto. Es el contrato que
protege el split en blueprints: si una ruta se cae del registro, aquí
pasa de 200/405 a 404 y el test grita.

Cubre además el contrato de errores endurecido: un 404/405 conserva su
código (no se entierra como 500) y las rutas /api/ responden en JSON.
"""
import os

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
    # ...salvo que otro test ya haya importado app: entonces el import es
    # cache y el esquema no existe aqui. init_db() es idempotente.
    database.init_db()

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
    "/", "/welcome", "/gnosisia",
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


def test_procesar_redirige_al_cockpit(cliente):
    """La carga vive en una sola página; /procesar redirige a / (menú «Áreas»
    y el link «Pipeline completo» siguen funcionando, sin página duplicada)."""
    r = cliente.get("/procesar")
    assert r.status_code in (301, 302)
    assert r.headers["Location"] in ("/", "http://localhost/")


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
    "/procesar/fase1", "/procesar/pipeline",
    "/api/v1/chat", "/api/v1/chat/reset",
    "/api/v1/autogenes/ingestar", "/api/v1/autogenes/extraer",
    "/api/v1/autogenes/sintetizar",
    "/api/v1/autogenes/integrar", "/api/v1/autogenes/nomos/regla",
    "/api/v1/autogenes/relacion", "/api/v1/autogenes/telemetria/snapshot",
    "/api/v1/autogenes/ingestar/zip",
]


@pytest.mark.parametrize("ruta", SOLO_POST)
def test_post_only_esta_registrada(cliente, ruta):
    # 405 (método no permitido) prueba que la ruta EXISTE; 404 sería que
    # se cayó del registro al mover blueprints.
    assert cliente.get(ruta).status_code == 405


# ── Ingesta masiva: el snapshot QUALIA se difiere en modo lote ───────

def test_ingesta_en_lote_difiere_el_snapshot(cliente, monkeypatch):
    """En una carga masiva (lote=1) el snapshot QUALIA NO corre por archivo
    —reconstruye toda la red, así que por archivo es O(n^2)—: corre UNA sola
    vez cuando el cliente cierra el lote vía telemetria/snapshot."""
    import io

    import rutas.autogenes as ra
    llamadas = []
    monkeypatch.setattr(ra, "_snapshot_telemetria",
                        lambda *a, **k: llamadas.append(1))

    for i in range(3):
        data = {"documento": (io.BytesIO(f"documento de lote numero {i}".encode()),
                              f"lote{i}.txt"),
                "lote": "1"}
        r = cliente.post("/api/v1/autogenes/ingestar", data=data,
                         content_type="multipart/form-data")
        assert r.status_code == 200
    assert llamadas == [], "el snapshot no debe correr por archivo en modo lote"

    r = cliente.post("/api/v1/autogenes/telemetria/snapshot")
    assert r.status_code == 200
    assert len(llamadas) == 1, "el snapshot corre UNA vez al cerrar el lote"


def test_ingesta_suelta_conserva_snapshot_inmediato(cliente, monkeypatch):
    """Un archivo suelto (sin lote) conserva su snapshot inmediato: la
    optimización de lote no debe cambiar el comportamiento de una sola carga."""
    import io

    import rutas.autogenes as ra
    llamadas = []
    monkeypatch.setattr(ra, "_snapshot_telemetria",
                        lambda *a, **k: llamadas.append(1))
    data = {"documento": (io.BytesIO(b"un documento suelto y distinto"), "suelto.txt")}
    r = cliente.post("/api/v1/autogenes/ingestar", data=data,
                     content_type="multipart/form-data")
    assert r.status_code == 200
    assert len(llamadas) == 1


def test_zip_por_goteo_extremo_a_extremo(cliente):
    """Subir un ZIP no lo procesa en el request: registra un lote (staging) y
    el cliente lo drena en tandas hasta done. Ningún request ingiere todo el
    ZIP — así no se tumba el worker con miles de facturas."""
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("uno.txt", b"documento http de goteo uno")
        z.writestr("dos.txt", b"documento http de goteo dos")
    buf.seek(0)

    r = cliente.post("/api/v1/autogenes/ingestar/zip",
                     data={"documento": (buf, "facturas.zip")},
                     content_type="multipart/form-data")
    assert r.status_code == 200
    j = r.get_json()
    assert j["total"] == 2 and j["lote_id"] and j["done"] is False

    p = None
    for _ in range(10):
        p = cliente.post("/api/v1/autogenes/ingestar/lote/" + j["lote_id"]).get_json()
        if p["done"]:
            break
    assert p["done"] and p["ingeridos"] == 2 and p["pendientes"] == 0


def test_zip_no_zip_al_endpoint_de_goteo_es_400(cliente):
    r = cliente.post("/api/v1/autogenes/ingestar/zip",
                     data={"documento": (__import__("io").BytesIO(b"x"), "a.txt")},
                     content_type="multipart/form-data")
    assert r.status_code == 400


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


def test_camino_evitar_nodo_inexistente_es_404_declarado(cliente):
    # una restricción evitar/via sobre un nodo que no existe se declara, no se
    # ignora en silencio devolviendo caminos que no la respetan
    r = cliente.get("/api/v1/autogenes/camino"
                    "?desde=a&hasta=b&k=2&evitar=nodo-fantasma")
    assert r.status_code == 404
    assert "fantasma" in r.get_json()["error"]


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


# ── Endurecimiento de seguridad (regresión de la auditoría) ──────────

def test_errores_delete_bloquea_path_traversal(cliente, tmp_path_factory, monkeypatch):
    """POST /errores/delete con filename traversal no debe borrar fuera del
    directorio de errores (secure_filename neutraliza el ../)."""
    import app as gnosis
    victima = tmp_path_factory.mktemp("victima") / "no_borrar.txt"
    victima.write_text("intacto")
    up = gnosis.app.config['UPLOAD_FOLDER']
    rel = os.path.relpath(str(victima), os.path.join(up, 'errores', '1'))
    cliente.post("/errores/delete", json={"sid": 1, "filename": rel})
    assert victima.exists(), "el traversal borró un archivo fuera de errores/"


def test_candado_operador_cubre_post_no_api(cliente, monkeypatch):
    """Con GNOSIS_TOKEN puesto, una ruta mutante fuera de /api/ (p.ej.
    /errores/delete) exige el token — antes quedaba libre."""
    monkeypatch.setenv("GNOSIS_TOKEN", "secreto-operador")
    r = cliente.post("/errores/delete", json={"sid": 1, "filename": "x.pdf"})
    assert r.status_code == 401
    r_ok = cliente.post("/errores/delete",
                        json={"sid": 1, "filename": "x.pdf"},
                        headers={"X-Gnosis-Token": "secreto-operador"})
    assert r_ok.status_code != 401
    monkeypatch.delenv("GNOSIS_TOKEN")


def test_secret_key_no_es_el_default_conocido(cliente):
    import app as gnosis
    assert gnosis.app.config['SECRET_KEY'] != 'Gestel2025'
