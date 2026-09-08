"""Audit trail for the agent's tool calls (llm-engineering §5.6).

Without a record of what the agent did, "least privilege" is a claim
nobody can check after the fact. These tests hold the two properties that
make the record worth keeping: every call appears, and no call carries the
identifiers the obfuscation layer exists to hold back.
"""
import logging

import pytest

from jarvis.ofuscation import ObfuscationLayer
from jarvis.tool_executor import ToolExecutor, TOOL_FUNCTIONS


@pytest.fixture()
def ex():
    return ToolExecutor(ObfuscationLayer())


def test_una_llamada_correcta_queda_registrada(ex, caplog, monkeypatch):
    monkeypatch.setitem(TOOL_FUNCTIONS, "contar_por_marca",
                        lambda: [{"marca": "VW", "n": 3}])
    with caplog.at_level(logging.INFO, logger="jarvis.audit"):
        ex.execute("contar_por_marca", {})
    registro = [r for r in caplog.records if r.name == "jarvis.audit"]
    assert len(registro) == 1
    assert "tool=contar_por_marca" in registro[0].getMessage()
    assert "rows=1" in registro[0].getMessage()


def test_una_llamada_que_revienta_tambien_queda(ex, caplog, monkeypatch):
    def explota():
        raise RuntimeError("boom")

    monkeypatch.setitem(TOOL_FUNCTIONS, "contar_por_marca", explota)
    with caplog.at_level(logging.INFO, logger="jarvis.audit"):
        ex.execute("contar_por_marca", {})
    mensajes = [r.getMessage() for r in caplog.records if r.name == "jarvis.audit"]
    assert any("outcome=raised" in m for m in mensajes)


def test_una_tool_inexistente_queda(ex, caplog):
    with caplog.at_level(logging.INFO, logger="jarvis.audit"):
        ex.execute("no_existe", {"x": 1})
    mensajes = [r.getMessage() for r in caplog.records if r.name == "jarvis.audit"]
    assert any("unknown" in m for m in mensajes)


def test_el_registro_no_copia_los_identificadores(ex, caplog, monkeypatch):
    """The obfuscation layer masks VINs on the way to the model. A log that
    wrote them out would be the same leak through another door."""
    monkeypatch.setitem(TOOL_FUNCTIONS, "buscar_por_vin",
                        lambda vin: [{"chasis": "WVWZZZ1JZXW000001", "marca": "VW"}])
    with caplog.at_level(logging.INFO, logger="jarvis.audit"):
        ex.execute("buscar_por_vin", {"vin": "WVWZZZ1JZXW000001"})
    mensajes = " ".join(r.getMessage() for r in caplog.records if r.name == "jarvis.audit")
    # The argument is the model's own words and is kept; the result is not.
    assert mensajes.count("WVWZZZ1JZXW000001") == 1
    assert "rows=1" in mensajes
    assert "marca" not in mensajes
