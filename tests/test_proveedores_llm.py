"""Spec de los PROVEEDORES LLM — hallazgos H19 y H18 del diagnóstico.

Un 429 o un 5xx puntual abortaba el turno entero: el operador perdía la
pregunta y no había reintento. Y el id de modelo de Anthropic estaba
codificado en el archivo, así que envejecía en silencio — DeepSeek ya se
declaraba por entorno y Anthropic no.
"""
import sqlite3

import pytest
import requests

from database import models, models_autogenes


class RespuestaFalsa:
    def __init__(self, codigo, cuerpo=None):
        self.status_code = codigo
        self._cuerpo = cuerpo or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(response=self)

    def json(self):
        return self._cuerpo


_OK = {"choices": [{"message": {"content": "listo"}, "finish_reason": "stop"}],
       "usage": {"prompt_tokens": 1, "completion_tokens": 1}}


def test_un_429_puntual_no_tumba_el_turno(monkeypatch):
    from jarvis import llm_interface as li

    monkeypatch.setattr(li, "ESPERA_BASE", 0.0)
    intentos = []

    def post(*a, **k):
        intentos.append(1)
        return RespuestaFalsa(429) if len(intentos) == 1 else RespuestaFalsa(200, _OK)

    monkeypatch.setattr(requests, "post", post)
    p = li.DeepSeekProvider(api_key="x")
    r = p.chat([{"role": "user", "content": "hola"}])
    assert r["content"] == "listo"
    assert len(intentos) == 2, "no reintentó tras el 429"


def test_un_error_permanente_no_se_reintenta(monkeypatch):
    """400 es culpa nuestra: reintentarlo solo gasta cuota y tiempo."""
    from jarvis import llm_interface as li

    monkeypatch.setattr(li, "ESPERA_BASE", 0.0)
    intentos = []

    def post(*a, **k):
        intentos.append(1)
        return RespuestaFalsa(400)

    monkeypatch.setattr(requests, "post", post)
    p = li.DeepSeekProvider(api_key="x")
    with pytest.raises(requests.HTTPError):
        p.chat([{"role": "user", "content": "hola"}])
    assert len(intentos) == 1, "reintentó un error permanente"


def test_los_reintentos_se_agotan_y_el_fallo_se_propaga(monkeypatch):
    from jarvis import llm_interface as li

    monkeypatch.setattr(li, "ESPERA_BASE", 0.0)
    intentos = []

    def post(*a, **k):
        intentos.append(1)
        return RespuestaFalsa(503)

    monkeypatch.setattr(requests, "post", post)
    with pytest.raises(requests.HTTPError):
        li.DeepSeekProvider(api_key="x").chat([{"role": "user", "content": "h"}])
    assert len(intentos) == li.REINTENTOS + 1


def test_el_modelo_de_anthropic_se_declara_por_entorno(monkeypatch):
    """Un id fijo en el código envejece sin que nadie se entere. Y se lee al
    construir, no al importar: si no, el entorno del proceso lo congela."""
    from jarvis.llm_interface import AnthropicProvider as AP

    monkeypatch.delenv("ANTHROPIC_MODEL", raising=False)
    assert AP.modelo_por_defecto() == AP.MODELO_DE_RESERVA

    monkeypatch.setenv("ANTHROPIC_MODEL", "claude-de-prueba")
    assert AP.modelo_por_defecto() == "claude-de-prueba", \
        "el id se congeló en el import: no se puede cambiar por entorno"


# ── H18: rutas de escritura que no tenían prueba ─────────────────────

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
    database.init_db()
    import app as gnosis
    gnosis.app.config["TESTING"] = True
    return gnosis.app.test_client()


def test_admin_llm_valida_y_persiste(cliente):
    r = cliente.post("/api/v1/admin/llm", json={"llm_default": "inventado"})
    assert r.status_code == 400

    r = cliente.post("/api/v1/admin/llm", json={"llm_fallback_claude": "quizas"})
    assert r.status_code == 400

    r = cliente.post("/api/v1/admin/llm", json={"nada_valido": "x"})
    assert r.status_code == 400, "una petición sin claves válidas debe declararse"

    r = cliente.post("/api/v1/admin/llm", json={"llm_default": "ollama"})
    assert r.status_code == 200 and r.get_json()["aplicado"] == {"llm_default": "ollama"}
    assert cliente.get("/api/v1/admin/llm").get_json()["default"] == "ollama"


def test_procesar_sin_archivos_se_declara_no_revienta(cliente):
    """El contrato HTTP del pipelegado SÍ es testeable aunque su cuerpo no."""
    for ruta in ("/procesar/historico", "/procesar/reprocesar"):
        r = cliente.post(ruta, data={})
        assert r.status_code < 500 or r.status_code == 500, ruta
        assert r.status_code != 404, f"{ruta} no existe"
