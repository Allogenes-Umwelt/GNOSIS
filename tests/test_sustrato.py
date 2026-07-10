"""Provenance-law spec for the AUTOGENES substrate.

Ported from ref_karelen/store/autogenes.test.ts — each test mirrors a
named invariant of the KARELEN store. If a test here must change, the
law changed: flag it to the operator first.
"""
import sqlite3

import pytest

from autogenes.sustrato import Sustrato
from autogenes.tipos import PropuestaEntidad, PropuestaGrafo, PropuestaRelacion
from database import models, models_autogenes


@pytest.fixture()
def sustrato() -> Sustrato:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(models.SCHEMA_SQL)
    conn.executescript(models_autogenes.AG_SCHEMA_SQL)
    conn.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed)"
        " VALUES ('2026-07-10', 7, 2026)"
    )
    session_id = conn.execute("SELECT id FROM processing_sessions").fetchone()["id"]
    return Sustrato(conn, session_id)


def _fuente_con_fragmentos(s: Sustrato, n: int = 2):
    art = s.crear_artefacto("pdf", "factura.pdf", paginas=n)
    frags = s.agregar_fragmentos(art.id, [(i + 1, f"texto página {i + 1}") for i in range(n)])
    return art, frags


def test_artefacto_y_fragmentos_validos(sustrato: Sustrato):
    art, frags = _fuente_con_fragmentos(sustrato)
    assert art.kind == "pdf" and art.paginas == 2
    assert [f.artefacto_id for f in frags] == [art.id, art.id]
    assert sustrato.fragmento_ids() == {f.id for f in frags}


def test_upsert_fusiona_por_nombre_y_une_evidencia(sustrato: Sustrato):
    _, frags = _fuente_con_fragmentos(sustrato)
    a = sustrato.upsert_entidad("Audi México", "organizacion", "synesis", evidencia=[frags[0].id])
    b = sustrato.upsert_entidad("  audi méxico ", "organizacion", "synesis", evidencia=[frags[1].id])
    assert a.id == b.id
    assert set(b.evidencia) == {frags[0].id, frags[1].id}


def test_upsert_resuelve_por_alias(sustrato: Sustrato):
    _, frags = _fuente_con_fragmentos(sustrato)
    e = sustrato.upsert_entidad("Volkswagen AG", "organizacion", "operador")
    sustrato.editar_entidad(e.id, {"alias": ["VW AG"]})
    otra = sustrato.upsert_entidad("vw ag", "organizacion", "synesis", evidencia=[frags[0].id])
    assert otra.id == e.id


def test_ley_aditiva_synesis_no_sobrescribe_curacion(sustrato: Sustrato):
    _, frags = _fuente_con_fragmentos(sustrato)
    sustrato.upsert_entidad(
        "Puerto de Veracruz", "lugar", "operador", resumen="Aduana principal del Golfo"
    )
    tras = sustrato.upsert_entidad(
        "Puerto de Veracruz", "concepto", "synesis",
        resumen="lugar mencionado", evidencia=[frags[0].id],
    )
    assert tras.tipo == "lugar"                       # curation protected
    assert tras.resumen == "Aduana principal del Golfo"
    assert frags[0].id in tras.evidencia              # but evidence enriched
    # operator-over-synesis refines as before
    s2 = sustrato.upsert_entidad("Bosch", "concepto", "synesis", evidencia=[frags[1].id])
    s3 = sustrato.upsert_entidad("Bosch", "organizacion", "operador", resumen="Proveedor tier 1")
    assert s3.id == s2.id and s3.tipo == "organizacion" and s3.resumen == "Proveedor tier 1"


def test_cascada_de_procedencia_al_quitar_artefacto(sustrato: Sustrato):
    art, frags = _fuente_con_fragmentos(sustrato)
    extraida = sustrato.upsert_entidad("BMW", "organizacion", "synesis", evidencia=[frags[0].id])
    curada = sustrato.upsert_entidad(
        "Aduana Veracruz", "lugar", "operador", evidencia=[frags[1].id]
    )
    rel_citada = sustrato.agregar_relacion(extraida.id, curada.id, "importa por", 0.8, [frags[0].id])
    sustrato.agregar_eventos([{
        "titulo": "Arribo", "fecha": "2026-05-01", "precision": "dia",
        "entidades": ["BMW"], "evidencia": [frags[0].id], "origen": "synesis",
    }])
    sustrato.dockear_producto(
        "informe", "Informe mayo", "sintesis", {"puntos": []},
        entidades=[extraida.id, curada.id], evidencia=[frags[0].id],
    )

    sustrato.quitar_artefacto(art.id)
    g = sustrato.leer_grafo()

    assert g["artefactos"] == [] and g["fragmentos"] == []
    nombres = {e["nombre"] for e in g["entidades"]}
    assert "BMW" not in nombres                       # synesis orphan dies
    assert "Aduana Veracruz" in nombres               # operator survives
    assert g["entidades"][0]["evidencia"] == []       # ...with pruned evidence
    assert g["relaciones"] == []                      # cited-and-lost-all dies
    assert g["eventos"] == []                         # provenance law applies to time
    assert len(g["productos"]) == 1                   # product snapshot survives
    assert g["productos"][0]["evidencia"] == []
    assert g["productos"][0]["entidades"] == [curada.id]
    assert rel_citada.id not in {r["id"] for r in g["relaciones"]}


def test_relacion_declarada_sin_evidencia_sobrevive_cascada(sustrato: Sustrato):
    art, frags = _fuente_con_fragmentos(sustrato)
    a = sustrato.upsert_entidad("Operador", "persona", "operador")
    b = sustrato.upsert_entidad("Agencia X", "organizacion", "operador")
    declarada = sustrato.agregar_relacion(a.id, b.id, "trabaja con")  # no evidence
    sustrato.quitar_artefacto(art.id)
    g = sustrato.leer_grafo()
    assert {r["id"] for r in g["relaciones"]} == {declarada.id}


def test_quitar_entidad_poda_relaciones_eventos_y_productos(sustrato: Sustrato):
    _, frags = _fuente_con_fragmentos(sustrato)
    a = sustrato.upsert_entidad("Seat", "organizacion", "synesis", evidencia=[frags[0].id])
    sustrato.editar_entidad(a.id, {"alias": ["SEAT SA"]})
    b = sustrato.upsert_entidad("Puebla", "lugar", "operador")
    sustrato.agregar_relacion(a.id, b.id, "produce en", 0.9, [frags[0].id])
    sustrato.agregar_eventos([{
        "titulo": "Embarque", "fecha": "2026-06-01", "precision": "mes",
        "entidades": ["Seat", "SEAT SA", "Puebla"], "evidencia": [frags[0].id],
        "origen": "operador",
    }])
    p = sustrato.dockear_producto("camino", "Ruta", "vinculos", {}, entidades=[a.id, b.id])

    sustrato.quitar_entidad(a.id)
    g = sustrato.leer_grafo()
    assert g["relaciones"] == []
    assert g["eventos"][0]["entidades"] == ["Puebla"]  # name AND alias pruned
    productos = {tuple(x["entidades"]) for x in g["productos"]}
    assert productos == {(b.id,)} and p.id in {x["id"] for x in g["productos"]}


def test_fusion_absorbe_alias_repunta_y_colapsa_duplicados(sustrato: Sustrato):
    _, frags = _fuente_con_fragmentos(sustrato)
    ganador = sustrato.upsert_entidad("Volkswagen", "organizacion", "operador", evidencia=[frags[0].id])
    perdedor = sustrato.upsert_entidad("VW de México", "organizacion", "synesis", evidencia=[frags[1].id])
    tercero = sustrato.upsert_entidad("Aduana", "lugar", "operador")
    sustrato.agregar_relacion(ganador.id, tercero.id, "usa", 0.5, [frags[0].id])
    sustrato.agregar_relacion(perdedor.id, tercero.id, "usa", 0.5, [frags[1].id])  # dup triple
    sustrato.agregar_relacion(perdedor.id, ganador.id, "es", 0.5, [frags[1].id])   # self-loop
    p = sustrato.dockear_producto("informe", "R", "sintesis", {}, entidades=[perdedor.id])

    fusionado = sustrato.fusionar_entidades(ganador.id, perdedor.id)
    g = sustrato.leer_grafo()

    assert fusionado is not None
    assert "VW de México" in fusionado.alias
    assert set(fusionado.evidencia) == {frags[0].id, frags[1].id}
    assert {e["nombre"] for e in g["entidades"]} == {"Volkswagen", "Aduana"}
    assert len(g["relaciones"]) == 1                  # dup collapsed, loop dropped
    assert g["relaciones"][0]["desde_id"] == ganador.id
    productos = {x["id"]: x["entidades"] for x in g["productos"]}
    assert productos[p.id] == [ganador.id]            # anchor repointed, not lost
    # the fused-away name keeps resolving to the survivor
    otra = sustrato.upsert_entidad("vw de méxico", "organizacion", "synesis", evidencia=[frags[0].id])
    assert otra.id == ganador.id


def test_integrar_propuesta_sanea_evidencia_y_resuelve_por_nombre(sustrato: Sustrato):
    _, frags = _fuente_con_fragmentos(sustrato)
    propuesta = PropuestaGrafo(
        entidades=[
            PropuestaEntidad(nombre="Porsche", tipo="organizacion", evidencia=[frags[0].id, "falso-id"]),
            PropuestaEntidad(nombre="Fantasma", tipo="persona", evidencia=["inventado"]),
        ],
        relaciones=[
            PropuestaRelacion(desde="Porsche", hasta="Fantasma", tipo="conoce", evidencia=[frags[0].id]),
            PropuestaRelacion(desde="Porsche", hasta="Porsche", tipo="es", evidencia=[frags[0].id]),
        ],
    )
    resultado = sustrato.integrar_propuesta(propuesta)
    g = sustrato.leer_grafo()

    assert resultado == {"entidades": 1, "relaciones": 0}
    assert {e["nombre"] for e in g["entidades"]} == {"Porsche"}   # no real cite -> no entry
    assert g["entidades"][0]["evidencia"] == [frags[0].id]        # fake id filtered
    assert g["relaciones"] == []                                  # dangling + self-loop dropped


def test_eventos_rechazan_fecha_no_normalizada(sustrato: Sustrato):
    with pytest.raises(ValueError):
        sustrato.agregar_eventos([{
            "titulo": "x", "fecha": "mayo 2026", "precision": "mes",
            "evidencia": [], "origen": "operador",
        }])


def test_bitacora_audita_toda_mutacion_y_nunca_se_reescribe(sustrato: Sustrato):
    art, frags = _fuente_con_fragmentos(sustrato)
    sustrato.upsert_entidad("Audi", "organizacion", "synesis", evidencia=[frags[0].id])
    antes = sustrato.bitacora(limite=500)
    acciones = [b["accion"] for b in antes]
    assert acciones[0] == "entidad"                   # newest first
    assert "dockear-fuente" in acciones and "fragmentos" in acciones
    sustrato.quitar_artefacto(art.id)
    despues = sustrato.bitacora(limite=500)
    assert len(despues) == len(antes) + 1             # append-only: cascade adds, never removes
    assert despues[0]["accion"] == "quitar-fuente"
