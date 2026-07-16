"""Spec de F6 · SÍNTESIS — digesto, saneador y dockeo del informe.

Port de ref_karelen/capacidades/informe.test.ts + el camino de dockeo
(ley de procedencia sobre Producto{clase:"informe"}).
"""
import sqlite3

import pytest

from autogenes.informe import (
    Informe,
    construir_digesto,
    dockear_informe,
    formatear_fecha_es,
    redactar_informe,
    sanear_informe,
)
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed,"
        " status) VALUES ('2026-07-10', 7, 2026, 'completed')"
    )
    c.commit()
    return c


# ── construir_digesto ─────────────────────────────────────────────────


def _art(id_, nombre):
    return {"id": id_, "kind": "pdf", "nombre": nombre, "created_at": "t"}


def _frag(id_, artefacto_id, texto=None):
    return {"id": id_, "artefacto_id": artefacto_id,
            "texto": texto if texto is not None else f"texto {id_}",
            "pagina": None, "created_at": "t"}


def test_digesto_muestrea_round_robin_saltando_vacios():
    artefactos = [_art("a1", "contrato.pdf"), _art("a2", "poliza.pdf")]
    fragmentos = [_frag(f"c{i}", "a1") for i in range(20)]
    fragmentos += [_frag("vacio", "a2", "   "), _frag("p0", "a2"), _frag("p1", "a2")]
    d = construir_digesto(artefactos, fragmentos, [], [], [])
    assert len(d["fragmentos"]) == 18
    # ambas fuentes representadas — ningún documento acapara el digesto
    assert any(f["fuente"] == "poliza.pdf" for f in d["fragmentos"])
    assert not any(f["id"] == "vacio" for f in d["fragmentos"])


def test_digesto_relaciones_por_nombre_y_eventos_formateados():
    entidades = [
        {"id": "e1", "nombre": "ACME", "tipo": "organizacion", "resumen": None, "campo": None},
        {"id": "e2", "nombre": "JULIO", "tipo": "persona", "resumen": None, "campo": None},
    ]
    relaciones = [
        {"id": "r1", "desde_id": "e1", "hasta_id": "e2", "tipo": "emplea"},
        {"id": "r2", "desde_id": "e1", "hasta_id": "muerta", "tipo": "x"},
    ]
    eventos = [{"id": "ev1", "titulo": "Firma", "fecha": "2024-03-12", "precision": "dia"}]
    d = construir_digesto([], [], entidades, relaciones, eventos)
    assert d["relaciones"] == ["ACME —emplea→ JULIO"]
    assert d["eventos"] == [{"titulo": "Firma", "fecha": "12 MAR 2024"}]


def test_formatear_fecha_por_precision():
    assert formatear_fecha_es("2024-03-12", "dia") == "12 MAR 2024"
    assert formatear_fecha_es("2024-03-12", "mes") == "MAR 2024"
    assert formatear_fecha_es("2024-03-12", "anio") == "2024"


# ── sanear_informe ────────────────────────────────────────────────────


def _informe_sucio() -> Informe:
    return Informe.model_validate({
        "titulo": "Situación",
        "secciones": [
            {"encabezado": "Actores", "puntos": [
                {"texto": "Punto citado", "evidencia": ["f1", "inventado"], "entidades": []},
                {"texto": "Punto del grafo", "evidencia": [], "entidades": ["ACME", "FALSA"]},
                {"texto": "Punto huérfano", "evidencia": ["nada"], "entidades": ["NADIE"]},
            ]},
            {"encabezado": "Vacía tras poda", "puntos": [
                {"texto": "Sin nada", "evidencia": [], "entidades": []},
            ]},
        ],
    })


def test_sanear_poda_ids_falsos_y_mata_puntos_y_secciones_vacias():
    s = sanear_informe(_informe_sucio(), {"f1"}, {"ACME"})
    assert len(s.secciones) == 1
    assert len(s.secciones[0].puntos) == 2
    assert s.secciones[0].puntos[0].evidencia == ["f1"]
    assert s.secciones[0].puntos[1].entidades == ["ACME"]


def test_sanear_recorta_texto_largo():
    inf = Informe.model_validate({
        "titulo": "T", "secciones": [{"encabezado": "H", "puntos": [
            {"texto": "x" * 500, "evidencia": ["f1"], "entidades": []}]}]})
    assert len(inf.secciones[0].puntos[0].texto) == 320


# ── redactar_informe (proveedor con guión) ────────────────────────────


class _ProveedorGuion:
    def __init__(self, payload: str):
        self.payload = payload

    def chat(self, messages, tools=None, system=None):
        return {"content": self.payload, "tool_calls": [], "stop_reason": "end_turn",
                "tokens_input": 0, "tokens_output": 0}


def _sembrar_grafo(conn) -> tuple[str, str]:
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("pdf", "contrato.pdf")
    frag = s.agregar_fragmentos(art.id, [(1, "Audi garantiza la unidad")])[0]
    ent = s.upsert_entidad("Audi", "organizacion", "synesis", evidencia=[frag.id])
    return frag.id, ent.nombre


def test_redactar_sanea_en_servidor(conn, monkeypatch):
    frag_id, _ = _sembrar_grafo(conn)
    payload = (
        '{"titulo":"Informe","secciones":[{"encabezado":"Hechos","puntos":['
        f'{{"texto":"Audi figura en el contrato","evidencia":["{frag_id}"],"entidades":["Audi"]}},'
        '{"texto":"Cita fabricada","evidencia":["ID_FALSO"],"entidades":["NADIE"]}'
        ']}]}'
    )
    monkeypatch.setattr("jarvis.llm_interface.seleccionar_proveedor",
                        lambda config=None: ("guion", _ProveedorGuion(payload)))
    r = redactar_informe(conn, 1)
    puntos = r["informe"]["secciones"][0]["puntos"]
    assert len(puntos) == 1  # el punto de cita fabricada murió
    assert puntos[0]["evidencia"] == [frag_id]
    assert r["fragmentos"] == 1 and r["entidades"] == 1


def test_redactar_sin_grafo_reporta_error(conn):
    assert "error" in redactar_informe(conn, 1)


# ── dockear_informe (procedencia sobre el Producto) ───────────────────


def test_dockear_ancla_evidencia_y_entidades(conn):
    frag_id, nombre = _sembrar_grafo(conn)
    ent = Sustrato(conn, 1).entidad_por_id(
        next(e["id"] for e in Sustrato(conn, 1).leer_grafo()["entidades"]))
    crudo = {"titulo": "Informe", "secciones": [{"encabezado": "Hechos", "puntos": [
        {"texto": "Audi figura", "evidencia": [frag_id, "FALSO"], "entidades": [nombre, "X"]}]}]}
    r = dockear_informe(conn, 1, crudo)
    prod = r["producto"]
    assert prod["clase"] == "informe"
    assert prod["evidencia"] == [frag_id]
    assert prod["entidades"] == [ent.id]
    # quedó dockeado y se lee en el grafo
    productos = Sustrato(conn, 1).leer_grafo()["productos"]
    assert len(productos) == 1 and productos[0]["clase"] == "informe"


def test_dockear_informe_sin_citas_reales_no_dockea(conn):
    _sembrar_grafo(conn)
    crudo = {"titulo": "T", "secciones": [{"encabezado": "H", "puntos": [
        {"texto": "nada real", "evidencia": ["FALSO"], "entidades": ["NADIE"]}]}]}
    r = dockear_informe(conn, 1, crudo)
    assert "error" in r
    assert Sustrato(conn, 1).leer_grafo()["productos"] == []


def test_formatear_fecha_mes_invalido_no_se_disfraza():
    """Mes 00 no debe renderizar 'DIC' (indexado -1): queda literal."""
    assert formatear_fecha_es("2024-00-12", "mes") == "00 2024"
    assert formatear_fecha_es("2024-13-12", "mes") == "13 2024"


# ── S3: HITL con grano — editar/descartar por punto ───────────────────

def test_dockear_marca_editado_y_reverifica_la_ley(conn):
    """El texto EDITADO por el operador también pasa la ley de fidelidad: si
    mete una cifra que su evidencia no sostiene, queda verificado=False."""
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("pdf", "f.pdf")
    frag = s.agregar_fragmentos(art.id, [(1, "La unidad ampara 60 unidades.")])[0]
    crudo = {"titulo": "T", "secciones": [{"encabezado": "H", "puntos": [
        {"texto": "El amparo cubre 90 unidades.", "evidencia": [frag.id],
         "entidades": [], "editado_por_operador": True}]}]}
    r = dockear_informe(conn, 1, crudo)
    p = r["producto"]["cuerpo"]["secciones"][0]["puntos"][0]
    assert p["editado_por_operador"] is True
    assert p["verificado"] is False and "90" in p["tokens_huerfanos"]


def test_dockear_informe_todo_descartado_no_dockea(conn):
    """Si el operador descartó todos los puntos, el informe llega sin puntos
    y no se dockea (error honesto, sin producto)."""
    _sembrar_grafo(conn)
    r = dockear_informe(conn, 1, {"titulo": "T", "secciones": []})
    assert "error" in r
    assert Sustrato(conn, 1).leer_grafo()["productos"] == []
