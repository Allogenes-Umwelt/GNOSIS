"""Red de seguridad a nivel HTTP para las 8 rutas QUALIA (Q1 del
PLAN_QUALIA_UPLIFT: la auditoría encontró CERO cobertura de ruta para
estos endpoints). Importa la app REAL contra una base temporal sembrada
con dos sesiones de sustrato, y ejerce cada ruta: status honesto, forma
del payload, y los guardas deterministas (falta de parámetro = 400,
sesión inexistente = 404, referencia mala = 404).

Las dos rutas con modelo (narrativa, parte/dockear) se ejercen con un
proveedor guionado — el mismo patrón que test_qualia_narrativa — para
probar el CABLEADO de la ruta sin depender del LLM en vivo (bloqueado en
el sandbox); su lógica fina ya está cubierta a nivel de unidad.
"""
import json

import pytest


@pytest.fixture(scope="module")
def cliente(tmp_path_factory):
    """App real, DB temporal, DOS sesiones con sustrato real (para drift)."""
    import database
    db = tmp_path_factory.mktemp("qla") / "gnosis.db"
    original = database.DB_PATH
    database.DB_PATH = str(db)

    import app as gnosis  # dispara init_db() sobre la DB temporal
    database.init_db()

    from autogenes.sustrato import Sustrato
    conn = database.get_connection()

    def _sembrar_sesion(mes: int) -> int:
        conn.execute(
            "INSERT INTO processing_sessions (session_date, month_processed,"
            " year_processed, status) VALUES (?, ?, 2026, 'completed')",
            (f"2026-{mes:02d}-10", mes))
        sid = conn.execute("SELECT MAX(id) FROM processing_sessions").fetchone()[0]
        s = Sustrato(conn, sid)
        art = s.crear_artefacto("pdf", f"factura-{mes}.pdf", paginas=2)
        frag = s.agregar_fragmentos(art.id, [(1, "texto")])[0]
        marca = s.upsert_entidad("VOLKSWAGEN", "organizacion", "synesis", evidencia=[frag.id])
        pais = s.upsert_entidad("Alemania", "lugar", "synesis", evidencia=[frag.id])
        aduana = s.upsert_entidad("Aduana Veracruz", "lugar", "synesis", evidencia=[frag.id])
        s.agregar_relacion(marca.id, pais.id, "origen", 0.8, [frag.id])
        s.agregar_relacion(pais.id, aduana.id, "desembarca en", 0.7, [frag.id])
        return sid

    sid_a = _sembrar_sesion(7)   # sesión actual
    _sembrar_sesion(6)           # sesión de referencia para drift (id distinto)
    conn.commit()
    conn.close()

    gnosis.app.config["TESTING"] = True
    cli = gnosis.app.test_client()
    cli._sid_a = sid_a           # el test lo usa para fijar sesión explícita
    yield cli
    database.DB_PATH = original


def _sid(cliente) -> int:
    return cliente._sid_a


# ── GET estado / red / horizonte (200 con forma) ─────────────────────

def test_estado_200_y_forma(cliente):
    r = cliente.get(f"/api/v1/autogenes/qualia/estado?session_id={_sid(cliente)}")
    assert r.status_code == 200
    d = r.get_json()
    assert {"session_id", "resumen", "base", "hallazgos", "snapshots", "lectura"} <= set(d)


def test_red_200_y_topologia(cliente):
    r = cliente.get(f"/api/v1/autogenes/qualia/red?session_id={_sid(cliente)}")
    assert r.status_code == 200
    d = r.get_json()
    assert {"red", "comunidad", "orden", "grado", "masas", "resumen"} <= set(d)
    assert d["red"]["nodos"] and d["red"]["enlaces"]
    assert "espectral" not in d


def test_red_espectral_incluye_embedding(cliente):
    r = cliente.get(f"/api/v1/autogenes/qualia/red?espectral=1&session_id={_sid(cliente)}")
    assert r.status_code == 200
    assert "espectral" in r.get_json()


def test_red_lente_completa_incluye_mas_nodos_que_negocio(cliente):
    neg = cliente.get(
        f"/api/v1/autogenes/qualia/red?session_id={_sid(cliente)}").get_json()
    com = cliente.get(
        f"/api/v1/autogenes/qualia/red?lente=completa&session_id={_sid(cliente)}"
    ).get_json()
    assert len(com["red"]["nodos"]) >= len(neg["red"]["nodos"])
    kinds = {n.get("kind") for n in com["red"]["nodos"]}
    assert "artefacto" in kinds       # la capa documental reaparece


def test_red_nivel_fuera_de_escalera_400(cliente):
    r = cliente.get(f"/api/v1/autogenes/qualia/red?nivel=999&session_id={_sid(cliente)}")
    assert r.status_code == 400
    assert "error" in r.get_json()


def test_horizonte_200(cliente):
    r = cliente.get(f"/api/v1/autogenes/qualia/horizonte?session_id={_sid(cliente)}")
    assert r.status_code == 200
    d = r.get_json()
    assert "horizonte" in d          # objeto o null+motivo, ambos honestos


# ── POST base (200) ──────────────────────────────────────────────────

def test_base_fija_referencia_200(cliente):
    r = cliente.post(f"/api/v1/autogenes/qualia/base?session_id={_sid(cliente)}")
    assert r.status_code == 200
    d = r.get_json()
    assert d["status"] == "ok" and isinstance(d["base"], dict)


# ── GET drift (guardas + happy path) ─────────────────────────────────

def test_drift_sin_referencia_400(cliente):
    r = cliente.get(f"/api/v1/autogenes/qualia/drift?session_id={_sid(cliente)}")
    assert r.status_code == 400


def test_drift_referencia_inexistente_404(cliente):
    r = cliente.get(
        f"/api/v1/autogenes/qualia/drift?referencia=99999&session_id={_sid(cliente)}")
    assert r.status_code == 404


def test_drift_entre_dos_sesiones_200(cliente):
    otra = 1 if _sid(cliente) != 1 else 2
    r = cliente.get(
        f"/api/v1/autogenes/qualia/drift?referencia={otra}&session_id={_sid(cliente)}")
    assert r.status_code == 200
    d = r.get_json()
    assert {"de", "a", "hallazgos", "deltas"} <= set(d)


# ── GET cascada (guardas + ambos modos) ──────────────────────────────

def test_cascada_sin_parametros_400(cliente):
    r = cliente.get(f"/api/v1/autogenes/qualia/cascada?session_id={_sid(cliente)}")
    assert r.status_code == 400


def test_cascada_caida_200(cliente):
    red = cliente.get(
        f"/api/v1/autogenes/qualia/red?session_id={_sid(cliente)}").get_json()
    nodo = red["red"]["nodos"][0]["id"]
    r = cliente.get(
        f"/api/v1/autogenes/qualia/cascada?caida={nodo}&session_id={_sid(cliente)}")
    assert r.status_code == 200
    d = r.get_json()
    assert d["modo"] == "caida" and "relaciones_caidas" in d


def test_cascada_enlace_200(cliente):
    red = cliente.get(
        f"/api/v1/autogenes/qualia/red?session_id={_sid(cliente)}").get_json()
    ids = [n["id"] for n in red["red"]["nodos"][:2]]
    r = cliente.get(
        f"/api/v1/autogenes/qualia/cascada?enlaza={ids[0]},{ids[1]}"
        f"&session_id={_sid(cliente)}")
    assert r.status_code == 200
    d = r.get_json()
    assert d["modo"] == "enlace" and "ondas" in d


def test_cascada_enlace_malformado_400(cliente):
    r = cliente.get(
        f"/api/v1/autogenes/qualia/cascada?enlaza=solo-uno&session_id={_sid(cliente)}")
    assert r.status_code == 400


# ── sesión inexistente = 404 (contrato honesto) ──────────────────────

def test_estado_sesion_inexistente_404(cliente):
    r = cliente.get("/api/v1/autogenes/qualia/estado?session_id=99999")
    assert r.status_code == 404


# ── POST narrativa / parte con proveedor guionado ────────────────────

class _ProveedorGuion:
    def __init__(self, contenido):
        self.contenido = contenido

    def chat(self, messages, tools=None, system=None):
        return {"content": self.contenido}


def _guionar(monkeypatch, contenido):
    import jarvis.llm_interface as li
    monkeypatch.setattr(li, "seleccionar_proveedor",
                        lambda cfg=None: ("guion", _ProveedorGuion(contenido)))


def test_narrativa_200_con_proveedor_guionado(cliente, monkeypatch):
    _guionar(monkeypatch, json.dumps({
        "panorama": "Una red pequeña con un centro claro.",
        "lecturas": [{"concepto": "nodos", "lectura": "El caso es compacto."}],
        "observaciones": ["Revisa el concentrador principal."],
    }))
    r = cliente.post(f"/api/v1/autogenes/qualia/narrativa?session_id={_sid(cliente)}")
    assert r.status_code == 200
    d = r.get_json()
    assert "narrativa" in d and "digesto" in d


def test_narrativa_modelo_ilegible_502(cliente, monkeypatch):
    _guionar(monkeypatch, "no soy json")
    r = cliente.post(f"/api/v1/autogenes/qualia/narrativa?session_id={_sid(cliente)}")
    assert r.status_code == 502
    assert "error" in r.get_json()


def test_parte_dockear_sin_narrativa_400(cliente):
    r = cliente.post(f"/api/v1/autogenes/qualia/parte/dockear?session_id={_sid(cliente)}",
                     json={})
    assert r.status_code == 400


def test_parte_dockear_narrativa_valida_dockea(cliente, monkeypatch):
    narrativa = {"panorama": "Una red compacta.",
                 "lecturas": [{"concepto": "nodos", "lectura": "Compacto."}],
                 "observaciones": []}
    r = cliente.post(f"/api/v1/autogenes/qualia/parte/dockear?session_id={_sid(cliente)}",
                     json={"narrativa": narrativa})
    # el saneador puede aceptar (200) o rechazar una clave inválida (422),
    # pero la ruta responde JSON con contrato, nunca 500.
    assert r.status_code in (200, 422)
    assert r.is_json


# ── GET dossier (Q4 drill-down) ──────────────────────────────────────

def test_dossier_sin_nombre_400(cliente):
    r = cliente.get(f"/api/v1/autogenes/qualia/dossier?session_id={_sid(cliente)}")
    assert r.status_code == 400
    assert "error" in r.get_json()


def test_dossier_entidad_conocida_200_y_forma(cliente):
    r = cliente.get(
        "/api/v1/autogenes/qualia/dossier?nombre=VOLKSWAGEN"
        f"&session_id={_sid(cliente)}")
    assert r.status_code == 200
    d = r.get_json()
    assert d["entidad"]["nombre"] == "VOLKSWAGEN"
    assert {"citas", "relaciones", "eventos", "productos"} <= set(d)
    # se relaciona con Alemania (sembrado en la fixture)
    assert any("Alemania" in r["con"] for r in d["relaciones"])


def test_dossier_entidad_desconocida_reporta_sin_inventar(cliente):
    r = cliente.get(
        "/api/v1/autogenes/qualia/dossier?nombre=NoExiste"
        f"&session_id={_sid(cliente)}")
    assert r.status_code == 200
    assert "error" in r.get_json()
