"""Spec for the QUALIA reading + narrative (F7c) — ported 1:1 from
lectura.test.ts and narrativa.test.ts, plus the server-side narrative
orchestration over the real schema with a scripted provider."""
import json
import sqlite3

import pytest

from autogenes.qualia_narrativa import (
    Narrativa,
    claves_digesto,
    construir_digesto_maquina,
    construir_digesto_red,
    construir_lectura,
    redactar_narrativa,
    sanear_narrativa,
)

BASE = {
    "n_nodos": 6, "n_enlaces": 7, "densidad": 0.46, "n_comunidades": 2,
    "n_componentes": 1, "comunidad_mayor": 3, "exponente": None,
    "puentes": [], "hubs": [{"id": "rfc", "etiqueta": "RFC", "grado": 12}],
}


# ── construir_lectura ────────────────────────────────────────────────

def test_lectura_enuncia_conteos_hub_densidad_y_procedencia():
    lineas = construir_lectura(BASE, 20)
    assert "6 conceptos" in lineas[0]
    assert any("«RFC»" in ln for ln in lineas)
    assert any("densa" in ln for ln in lineas)
    assert "20 registros" in lineas[-1]
    assert "fuentes" in lineas[-1]


def test_lectura_marca_islas_solo_cuando_existen():
    con_islas = construir_lectura({**BASE, "n_componentes": 3}, 20)
    assert any("islas" in ln for ln in con_islas)
    sin_islas = construir_lectura(BASE, 20)
    assert not any("islas" in ln for ln in sin_islas)


def test_lectura_vacia_para_red_vacia():
    assert construir_lectura({**BASE, "n_nodos": 0}, 0) == []


def test_lectura_usa_singular_para_un_registro():
    lineas = construir_lectura({**BASE, "n_comunidades": 1}, 1)
    assert "1 comunidad." in lineas[0]
    assert "1 registro " in lineas[-1]


# ── digesto + saneador ───────────────────────────────────────────────

RESUMEN = {
    **BASE,
    "hubs": [{"id": "fuentes::rfc", "etiqueta": "RFC", "grado": 12},
             {"id": "fuentes::regimen", "etiqueta": "Régimen", "grado": 6}],
}


def test_digesto_lleva_metricas_y_conceptos_con_claves_exactas():
    d = construir_digesto_red(RESUMEN)
    assert next(m for m in d["metricas"] if m["clave"] == "nodos")["valor"] == "6"
    assert "46" in next(m for m in d["metricas"] if m["clave"] == "densidad")["valor"]
    assert [c["clave"] for c in d["conceptos"]] == ["fuentes::rfc", "fuentes::regimen"]


def test_saneador_poda_lecturas_con_clave_inventada():
    claves = claves_digesto(construir_digesto_red(RESUMEN))
    narrativa = Narrativa.model_validate({
        "panorama": "La red se centra en un concentrador.",
        "lecturas": [
            {"concepto": "fuentes::rfc", "lectura": "Ata a casi todo."},
            {"concepto": "inventado", "lectura": "No existe en el digesto."},
            {"concepto": "densidad", "lectura": "Estructura moderada."},
        ],
        "observaciones": ["Revisa el concentrador principal."],
    })
    saneada = sanear_narrativa(narrativa, claves)
    assert [ln.concepto for ln in saneada.lecturas] == ["fuentes::rfc", "densidad"]
    assert len(saneada.observaciones) == 1


def test_digesto_maquina_agrega_ventanas_dentro_de_los_topes():
    d = construir_digesto_maquina(
        RESUMEN,
        anomalias=[{"clave": "anom-rafaga", "titulo": "Ráfaga de actividad",
                    "severidad": 0.8}],
        monolitos=[{"id": "fuentes::rfc", "etiqueta": "RFC", "masa": 1},
                   {"id": "fuentes::otro", "etiqueta": "Otro", "masa": 0.4}],
        n_referencias=3,
        delta={"nodos": 2, "enlaces": -1},
    )
    metricas = {m["clave"]: m["valor"] for m in d["metricas"]}
    assert metricas["anomalias"] == "1"
    assert metricas["monolito"] == "RFC"
    assert "+2" in metricas["telemetria"]
    claves = [c["clave"] for c in d["conceptos"]]
    assert claves.count("fuentes::rfc") == 1        # dedupe con hubs
    assert "fuentes::otro" in claves
    assert "anom-rafaga" in claves
    assert len(d["metricas"]) <= 12
    assert len(d["conceptos"]) <= 20
    assert all(len(m["valor"]) <= 60 for m in d["metricas"])


# ── orquestación en servidor con proveedor guionado ──────────────────

@pytest.fixture()
def conn() -> sqlite3.Connection:
    from autogenes.sustrato import Sustrato
    from database import models, models_autogenes
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed)"
        " VALUES ('2026-07-10', 7, 2026)"
    )
    s = Sustrato(c, 1)
    art = s.crear_artefacto("pdf", "contrato.pdf")
    frag = s.agregar_fragmentos(art.id, [(1, "texto")])[0]
    e1 = s.upsert_entidad("VW", "organizacion", "synesis", evidencia=[frag.id])
    e2 = s.upsert_entidad("Veracruz", "lugar", "synesis", evidencia=[frag.id])
    s.agregar_relacion(e1.id, e2.id, "importa por", 0.8, [frag.id])
    return c


class _ProveedorGuion:
    def __init__(self, contenido):
        self.contenido = contenido

    def chat(self, messages, tools=None, system=None):
        return {"content": self.contenido}


def test_redactar_narrativa_sanea_en_servidor(conn, monkeypatch):
    import jarvis.llm_interface as li
    respuesta = json.dumps({
        "panorama": "Una red pequeña con un centro claro.",
        "lecturas": [
            {"concepto": "nodos", "lectura": "El caso es compacto."},
            {"concepto": "clave-fabricada", "lectura": "Debe morir en el saneador."},
        ],
        "observaciones": ["Revisa el concentrador principal."],
    })
    monkeypatch.setattr(li, "seleccionar_proveedor",
                        lambda cfg=None: ("guion", _ProveedorGuion(respuesta)))
    r = redactar_narrativa(conn, 1)
    assert "error" not in r
    conceptos = [ln["concepto"] for ln in r["narrativa"]["lecturas"]]
    assert conceptos == ["nodos"]                  # la fabricada murió
    assert claves_digesto(r["digesto"]) >= {"nodos", "vinculos"}


def test_redactar_narrativa_reporta_modelo_ilegible(conn, monkeypatch):
    import jarvis.llm_interface as li
    monkeypatch.setattr(li, "seleccionar_proveedor",
                        lambda cfg=None: ("guion", _ProveedorGuion("no soy json")))
    r = redactar_narrativa(conn, 1)
    assert "error" in r
