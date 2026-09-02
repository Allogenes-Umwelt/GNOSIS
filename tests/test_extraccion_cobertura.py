"""Spec de COBERTURA de la extracción — hallazgo S6 del diagnóstico v02.

`_bloque_fragmentos` corta a `MAX_FRAGMENTOS` (24) y el resultado no decía
nada: un contrato de 60 páginas se extraía de sus primeras 24 y la propuesta
llegaba como si cubriera el documento. Es justo lo que ZERO SNAKE OIL
prohíbe — y contrasta con el OCR, que sí declara su truncación.
"""
import sqlite3

import pytest

from autogenes.sustrato import Sustrato
from database import models, models_autogenes
from jarvis.llm_interface import LLMProvider


class Guionado(LLMProvider):
    """Devuelve una entidad por cada fragmento que se le pase, citándolo."""

    def __init__(self):
        self.bloques = []

    def chat(self, messages, tools=None, system=None):
        import re
        bloque = str(messages[-1].get("content", ""))
        self.bloques.append(bloque)
        ids = re.findall(r"\[([0-9a-f-]{36})\]", bloque)
        ents = ", ".join(
            f'{{"nombre": "Ent {i}", "tipo": "concepto", "evidencia": ["{fid}"]}}'
            for i, fid in enumerate(ids))
        return {"content": '{"entidades": [' + ents + '], "relaciones": []}',
                "tool_calls": [], "stop_reason": "end_turn",
                "tokens_input": 1, "tokens_output": 1}


@pytest.fixture()
def base(tmp_path):
    c = sqlite3.connect(tmp_path / "e.db")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.commit()
    return c


def _artefacto_de(conn, paginas: int) -> str:
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("pdf", "contrato.pdf", paginas=paginas)
    s.agregar_fragmentos(art.id, [(i + 1, f"Página {i + 1} del contrato.")
                                  for i in range(paginas)])
    return art.id


def test_la_extraccion_declara_su_cobertura(base, monkeypatch):
    """Un documento que cabe entero también declara que cupo."""
    import jarvis.llm_interface as li
    from autogenes.extraccion import extraer_de_artefacto

    monkeypatch.setattr(li, "seleccionar_proveedor", lambda cfg=None: ("g", Guionado()))
    aid = _artefacto_de(base, 5)
    r = extraer_de_artefacto(base, 1, aid)
    assert r["cobertura"] == {"fragmentos_leidos": 5, "fragmentos_total": 5}
    assert "aviso" not in r


def test_un_documento_largo_declara_lo_que_NO_leyo(base, monkeypatch):
    """El hallazgo: 60 páginas, 24 leídas, y nada lo decía."""
    import jarvis.llm_interface as li
    from autogenes.extraccion import MAX_FRAGMENTOS, extraer_de_artefacto

    monkeypatch.setattr(li, "seleccionar_proveedor", lambda cfg=None: ("g", Guionado()))
    aid = _artefacto_de(base, 60)
    r = extraer_de_artefacto(base, 1, aid)
    assert r["cobertura"]["fragmentos_leidos"] == MAX_FRAGMENTOS
    assert r["cobertura"]["fragmentos_total"] == 60
    assert "aviso" in r, "recortó 36 fragmentos sin declararlo"
    assert "36" in r["aviso"]


def test_por_ventanas_el_documento_se_lee_entero(base, monkeypatch):
    """La opción del operador: pagar más llamadas y cubrir el documento."""
    import jarvis.llm_interface as li
    from autogenes.extraccion import extraer_de_artefacto

    prov = Guionado()
    monkeypatch.setattr(li, "seleccionar_proveedor", lambda cfg=None: ("g", prov))
    aid = _artefacto_de(base, 60)
    r = extraer_de_artefacto(base, 1, aid, ventanas=True)
    assert r["cobertura"]["fragmentos_leidos"] == 60
    assert r["cobertura"]["fragmentos_total"] == 60
    assert "aviso" not in r
    assert len(prov.bloques) >= 3, "no partió el documento en ventanas"


def test_las_ventanas_no_duplican_entidades(base, monkeypatch):
    """Las ventanas se solapan a propósito (una entidad a caballo entre dos
    no debe perderse); la fusión no puede devolverla dos veces."""
    import jarvis.llm_interface as li
    from autogenes.extraccion import extraer_de_artefacto

    class Fijo(LLMProvider):
        def chat(self, messages, tools=None, system=None):
            import re
            fid = re.findall(r"\[([0-9a-f-]{36})\]", str(messages[-1]["content"]))[0]
            return {"content": '{"entidades": [{"nombre": "Volkswagen",'
                               f' "tipo": "organizacion", "evidencia": ["{fid}"]}}],'
                               ' "relaciones": []}',
                    "tool_calls": [], "stop_reason": "end_turn",
                    "tokens_input": 1, "tokens_output": 1}

    monkeypatch.setattr(li, "seleccionar_proveedor", lambda cfg=None: ("f", Fijo()))
    aid = _artefacto_de(base, 60)
    r = extraer_de_artefacto(base, 1, aid, ventanas=True)
    nombres = [e["nombre"] for e in r["entidades"]]
    assert nombres.count("Volkswagen") == 1, f"entidad duplicada por ventana: {nombres}"
    # y conserva la evidencia de TODAS las ventanas donde apareció
    assert len(r["entidades"][0]["evidencia"]) >= 3
