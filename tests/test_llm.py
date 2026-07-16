"""Spec de F1.5: conversion de formatos, seleccion de proveedor con
fallback gobernado por config, y quorum con degradacion elegante."""
import json
import sqlite3

import pytest

from database import models
from database.config import get_all_config, get_config, set_config
from jarvis import llm_interface as li
from jarvis.quorum import ejecutar_en_quorum


# ── conversion Anthropic-interno -> OpenAI-compatible ────────────────

def test_tools_a_openai_preserva_el_schema():
    tools = [{
        "name": "buscar_por_vin",
        "description": "Busca un VIN",
        "input_schema": {"type": "object", "properties": {"vin": {"type": "string"}},
                         "required": ["vin"]},
    }]
    out = li.tools_a_openai(tools)
    assert out[0]["type"] == "function"
    assert out[0]["function"]["name"] == "buscar_por_vin"
    assert out[0]["function"]["parameters"]["required"] == ["vin"]


def test_mensajes_a_openai_convierte_tool_use_y_tool_result():
    messages = [
        {"role": "user", "content": "¿cuántos Audi?"},
        {"role": "assistant", "content": [
            {"type": "text", "text": "Consulto."},
            {"type": "tool_use", "id": "tc1", "name": "contar_por_marca", "input": {"marca": "AUDI"}},
        ]},
        {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "tc1", "content": "42"},
        ]},
    ]
    out = li.mensajes_a_openai(messages, system="Eres Gnosis")
    assert out[0] == {"role": "system", "content": "Eres Gnosis"}
    assert out[1] == {"role": "user", "content": "¿cuántos Audi?"}
    asistente = out[2]
    assert asistente["role"] == "assistant" and asistente["content"] == "Consulto."
    assert asistente["tool_calls"][0]["function"]["name"] == "contar_por_marca"
    assert json.loads(asistente["tool_calls"][0]["function"]["arguments"]) == {"marca": "AUDI"}
    assert out[3] == {"role": "tool", "tool_call_id": "tc1", "content": "42"}


def test_deepseek_normaliza_la_respuesta(monkeypatch):
    capturado = {}

    class RespFake:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "choices": [{
                    "finish_reason": "tool_calls",
                    "message": {
                        "content": None,
                        "tool_calls": [{
                            "id": "call_1",
                            "function": {"name": "estado_cupos",
                                         "arguments": '{"anio": 2026}'},
                        }],
                    },
                }],
                "usage": {"prompt_tokens": 100, "completion_tokens": 20},
            }

    def post_fake(url, json=None, headers=None, timeout=None):
        capturado.update({"url": url, "payload": json, "headers": headers})
        return RespFake()

    import requests
    monkeypatch.setattr(requests, "post", post_fake)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")

    prov = li.DeepSeekProvider()
    out = prov.chat(
        [{"role": "user", "content": "cupos"}],
        tools=[{"name": "estado_cupos", "description": "", "input_schema": {"type": "object"}}],
        system="sistema",
    )
    assert capturado["payload"]["model"] == "deepseek-chat"
    assert capturado["payload"]["messages"][0]["role"] == "system"
    assert capturado["payload"]["tools"][0]["type"] == "function"
    assert capturado["headers"]["Authorization"] == "Bearer sk-test"
    assert out["stop_reason"] == "tool_use"
    assert out["tool_calls"] == [{"id": "call_1", "name": "estado_cupos",
                                  "input": {"anio": 2026}}]
    assert out["tokens_input"] == 100 and out["tokens_output"] == 20


# ── config y seleccion ───────────────────────────────────────────────

@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    return c


def test_config_roundtrip_y_defaults(conn):
    assert get_config(conn, "llm_default") == "deepseek"
    assert get_config(conn, "llm_fallback_claude") == "off"
    set_config(conn, "llm_fallback_claude", "on")
    assert get_config(conn, "llm_fallback_claude") == "on"
    todo = get_all_config(conn)
    assert todo["llm_fallback_claude"] == "on" and todo["llm_default"] == "deepseek"


def test_seleccion_default_deepseek(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-x")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-y")
    nombre, prov = li.seleccionar_proveedor({"llm_default": "deepseek"})
    assert nombre == "deepseek" and isinstance(prov, li.DeepSeekProvider)


def test_claude_solo_sirve_si_admin_lo_activa(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-y")
    # fallback apagado -> nadie puede servir
    with pytest.raises(RuntimeError):
        li.seleccionar_proveedor({"llm_fallback_claude": "off"})
    # admin lo enciende -> Claude toma el relevo
    nombre, prov = li.seleccionar_proveedor({"llm_fallback_claude": "on"})
    assert nombre == "claude" and isinstance(prov, li.AnthropicProvider)


def test_quorum_pide_dos_distintos_y_degrada_a_uno(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-x")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-y")
    dos = li.proveedores_para_quorum({"llm_fallback_claude": "on"})
    assert [n for n, _ in dos] == ["deepseek", "claude"]
    # sin Claude habilitado solo hay uno -> modo simple
    uno = li.proveedores_para_quorum({"llm_fallback_claude": "off"})
    assert [n for n, _ in uno] == ["deepseek"]


# ── quorum: mecanica de ejecucion ────────────────────────────────────

class ProveedorFake(li.LLMProvider):
    def __init__(self, respuesta=None, error=None):
        self.respuesta, self.error = respuesta, error

    def chat(self, messages, tools=None, system=None):
        if self.error:
            raise RuntimeError(self.error)
        return self.respuesta


def test_quorum_con_dos_marca_quorum_true():
    r = ejecutar_en_quorum(
        lambda p: p.chat([]),
        [("deepseek", ProveedorFake({"content": "A"})),
         ("claude", ProveedorFake({"content": "B"}))],
    )
    assert r["quorum"] is True
    assert r["respuestas"]["deepseek"]["content"] == "A"
    assert r["respuestas"]["claude"]["content"] == "B"


def test_quorum_degrada_si_un_proveedor_falla():
    r = ejecutar_en_quorum(
        lambda p: p.chat([]),
        [("deepseek", ProveedorFake({"content": "A"})),
         ("claude", ProveedorFake(error="timeout"))],
    )
    assert r["quorum"] is False
    assert list(r["respuestas"]) == ["deepseek"]
    assert "timeout" in r["errores"]["claude"]


def test_quorum_con_uno_solo_ejecuta_version_simple():
    r = ejecutar_en_quorum(lambda p: p.chat([]),
                           [("deepseek", ProveedorFake({"content": "A"}))])
    assert r["quorum"] is False and r["respuestas"]["deepseek"]["content"] == "A"


def test_quorum_truena_solo_si_todos_fallan():
    with pytest.raises(RuntimeError):
        ejecutar_en_quorum(lambda p: p.chat([]),
                           [("deepseek", ProveedorFake(error="x")),
                            ("claude", ProveedorFake(error="y"))])
