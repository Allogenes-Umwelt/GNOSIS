"""Spec de F4 (ingesta + extracción citada con quórum) y F5 (Radar)."""
import sqlite3

import pytest

from autogenes.extraccion import extraer_de_artefacto, extraer_json, sanear_propuesta
from autogenes.ingesta import ingestar_texto, listar_artefactos, partir_texto
from autogenes.senales import senales_de_sesion
from autogenes.sustrato import Sustrato
from database import models, models_autogenes
from jarvis.llm_interface import LLMProvider


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    return c


# ── F4: ingesta ──────────────────────────────────────────────────────

def test_partir_texto_respeta_parrafos():
    bloques = partir_texto("uno\n\ndos\n\n" + "x" * 4000, max_bloque=100)
    assert bloques[0] == "uno\n\ndos"
    assert all(len(b) <= 100 for b in bloques)


def test_ingestar_texto_crea_artefacto_y_fragmentos(conn):
    r = ingestar_texto(conn, 1, "acta.txt", "Primer párrafo.\n\nSegundo párrafo.")
    assert r["fragmentos"] == 1
    lista = listar_artefactos(conn, 1)
    assert lista[0]["nombre"] == "acta.txt" and lista[0]["fragmentos"] == 1
    assert lista[0]["entidades"] == 0
    assert ingestar_texto(conn, 1, "vacio.txt", "   ")["error"]


# ── F4: extracción citada ────────────────────────────────────────────

def test_extraer_json_tolera_prosa_y_markdown():
    assert extraer_json('Claro: ```json\n{"entidades": []}\n``` listo.') == {"entidades": []}
    assert extraer_json("sin json aquí") is None


def test_sanear_propuesta_filtra_evidencia_falsa():
    cruda = {
        "entidades": [
            {"nombre": "Agencia", "tipo": "organizacion", "evidencia": ["f1", "falso"]},
            {"nombre": "Fantasma", "tipo": "persona", "evidencia": ["inventado"]},
        ],
        "relaciones": [
            {"desde": "Agencia", "hasta": "Fantasma", "tipo": "conoce", "evidencia": ["f1"]},
            {"desde": "Agencia", "hasta": "Agencia", "tipo": "es", "evidencia": ["f1"]},
        ],
    }
    p = sanear_propuesta(cruda, {"f1"})
    assert [e.nombre for e in p.entidades] == ["Agencia"]
    assert p.entidades[0].evidencia == ["f1"]
    assert p.relaciones == []          # colgante y auto-lazo mueren
    assert sanear_propuesta({"entidades": "basura"}, {"f1"}).entidades == []


class ProveedorGuionado(LLMProvider):
    def __init__(self, contenido):
        self.contenido = contenido

    def chat(self, messages, tools=None, system=None):
        return {"content": self.contenido, "tool_calls": [],
                "stop_reason": "end_turn", "tokens_input": 1, "tokens_output": 1}


def test_extraccion_de_artefacto_sanea_y_propone(conn, monkeypatch):
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("pdf", "contrato.pdf")
    fr = s.agregar_fragmentos(art.id, [(1, "La Agencia 3842 opera en Veracruz.")])
    fid = fr[0].id
    guion = ('{"entidades": [{"nombre": "Agencia 3842", "tipo": "organizacion",'
             f' "evidencia": ["{fid}", "falso"]}},'
             '{"nombre": "Nadie", "tipo": "persona", "evidencia": ["otro"]}],'
             '"relaciones": []}')
    import jarvis.llm_interface as li
    monkeypatch.setattr(li, "seleccionar_proveedor",
                        lambda cfg=None: ("fake", ProveedorGuionado(guion)))
    r = extraer_de_artefacto(conn, 1, art.id)
    assert r["quorum"] is False and r["fragmentos_leidos"] == 1
    assert [e["nombre"] for e in r["entidades"]] == ["Agencia 3842"]
    assert r["entidades"][0]["evidencia"] == [fid]
    assert r["entidades"][0]["acuerdo"] is None


def test_extraccion_con_quorum_marca_acuerdo(conn, monkeypatch):
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("pdf", "c.pdf")
    fid = s.agregar_fragmentos(art.id, [(1, "texto")])[0].id
    g1 = ('{"entidades": [{"nombre": "Agencia", "tipo": "organizacion",'
          f' "evidencia": ["{fid}"]}},'
          f'{{"nombre": "Solo-A", "tipo": "concepto", "evidencia": ["{fid}"]}}],'
          '"relaciones": []}')
    g2 = ('{"entidades": [{"nombre": "agencia", "tipo": "organizacion",'
          f' "evidencia": ["{fid}"]}},'
          f'{{"nombre": "Solo-B", "tipo": "concepto", "evidencia": ["{fid}"]}}],'
          '"relaciones": []}')
    import jarvis.llm_interface as li
    monkeypatch.setattr(li, "proveedores_para_quorum",
                        lambda cfg=None, maximo=2: [("a", ProveedorGuionado(g1)),
                                                    ("b", ProveedorGuionado(g2))])
    r = extraer_de_artefacto(conn, 1, art.id, con_quorum=True)
    assert r["quorum"] is True
    por_nombre = {e["nombre"].lower(): e["acuerdo"] for e in r["entidades"]}
    assert por_nombre["agencia"] is True          # ambos la vieron
    assert por_nombre["solo-a"] is False          # solo un modelo
    assert por_nombre["solo-b"] is False


# ── F5: Radar ────────────────────────────────────────────────────────

def test_senales_del_radar(conn):
    s = Sustrato(conn, 1)
    fria = s.crear_artefacto("pdf", "fria.pdf")
    s.agregar_fragmentos(fria.id, [(1, "nadie me lee")])
    caliente = s.crear_artefacto("pdf", "caliente.pdf")
    fr = s.agregar_fragmentos(caliente.id, [(1, "x")])
    e1 = s.upsert_entidad("Agencia", "organizacion", "synesis", evidencia=[fr[0].id])
    s.upsert_entidad("Isla", "concepto", "operador")          # huérfana
    e3 = s.upsert_entidad("Puerto", "lugar", "operador")
    s.agregar_relacion(e1.id, e3.id, "opera en", 0.8, [fr[0].id])
    s.agregar_eventos([
        {"titulo": "Vence fianza", "fecha": "2026-07-20", "precision": "dia",
         "evidencia": [fr[0].id], "origen": "synesis"},
        {"titulo": "Muy lejano", "fecha": "2026-12-01", "precision": "dia",
         "evidencia": [fr[0].id], "origen": "synesis"},
    ])
    conn.execute("INSERT INTO facturas_faltantes (session_id, factura) VALUES (1, 'F')")
    conn.commit()

    r = senales_de_sesion(conn, 1, hoy="2026-07-10")
    assert [v["titulo"] for v in r["vencimientos"]] == ["Vence fianza"]
    assert r["vencimientos"][0]["dias"] == 10
    assert [f["nombre"] for f in r["fuentes_frias"]] == ["fria.pdf"]
    assert [h["nombre"] for h in r["huerfanas"]] == ["Isla"]
    assert r["negocio"]["faltantes"] == 1 and r["negocio"]["errores"] == 0
    assert r["total"] == 1 + 1 + 1 + 1     # vencimiento + fría + huérfana + faltantes

    from autogenes.estado import estado_de_sesion
    assert estado_de_sesion(conn, 1)["senales"] == r["total"]
