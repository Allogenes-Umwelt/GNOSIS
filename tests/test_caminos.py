"""Spec de Vínculos (F3): caminos citados, vecindario y hubs sobre la
lente NetworkX, y el dockeo del camino como Producto."""
import sqlite3

import pytest

from autogenes import red as red_mod
from autogenes.caminos import (
    camino_mas_corto,
    cuerpo_camino_guardado,
    mas_conectadas,
    vecindario,
)
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def caso():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    s = Sustrato(c, 1)
    art = s.crear_artefacto("pdf", "contrato.pdf")
    fr = s.agregar_fragmentos(art.id, [(1, "a"), (2, "b")])
    agencia = s.upsert_entidad("Agencia", "organizacion", "synesis", evidencia=[fr[0].id])
    puerto = s.upsert_entidad("Puerto", "lugar", "operador", evidencia=[fr[1].id])
    fianza = s.upsert_entidad("Fianza", "documento", "synesis", evidencia=[fr[0].id])
    s.agregar_relacion(agencia.id, puerto.id, "opera en", 0.9, [fr[1].id])
    s.agregar_relacion(fianza.id, agencia.id, "garantiza a", 0.7, [fr[0].id])
    red_mod.invalidar()
    return c, s, {"agencia": agencia, "puerto": puerto, "fianza": fianza, "frags": fr}


def test_camino_con_citas_por_salto(caso):
    c, _, d = caso
    cam = camino_mas_corto(c, 1, d["fianza"].id, d["puerto"].id)
    assert cam["largo"] == 2
    tipos = [s["arista"]["tipo"] for s in cam["saltos"]]
    assert tipos == ["garantiza a", "opera en"]
    # cada salto de relación carga SU evidencia; el camino une todas
    assert cam["saltos"][0]["evidencia"] == [d["frags"][0].id]
    assert cam["saltos"][1]["evidencia"] == [d["frags"][1].id]
    assert set(cam["evidencia"]) == {d["frags"][0].id, d["frags"][1].id}


def test_camino_atraviesa_estructura_y_prefiere_relacion(caso):
    c, _, d = caso
    # entidad -> artefacto (cita) -> entidad: el camino estructural existe
    cam = camino_mas_corto(c, 1, d["agencia"].id, d["fianza"].id)
    assert cam is not None and cam["largo"] >= 1
    # la arista elegida entre fianza-agencia es la relación tipada, no la cita
    directo = camino_mas_corto(c, 1, d["fianza"].id, d["agencia"].id)
    assert directo["saltos"][0]["arista"]["kind"] == "relacion"


def test_camino_inexistente_y_nodos_desconocidos(caso):
    c, s, d = caso
    isla = s.upsert_entidad("Isla", "concepto", "operador")  # sin aristas
    red_mod.invalidar()
    assert camino_mas_corto(c, 1, d["agencia"].id, isla.id) is None
    assert camino_mas_corto(c, 1, "no-existe", d["agencia"].id) is None


def test_vecindario_por_grados(caso):
    c, _, d = caso
    v = vecindario(c, 1, d["agencia"].id, grados=1)
    etiquetas = {n["etiqueta"] for a in v["anillos"] for n in a["nodos"]}
    assert {"Puerto", "Fianza", "contrato.pdf"} <= etiquetas
    v2 = vecindario(c, 1, d["agencia"].id, grados=2)
    assert v2["total"] > v["total"]  # a 2 grados entran los fragmentos


def test_hubs_excluyen_ruido_y_ordenan_por_grado(caso):
    c, _, _ = caso
    hubs = mas_conectadas(c, 1, top=5)
    assert hubs[0]["grado"] >= hubs[-1]["grado"]
    assert all(h["kind"] not in ("vehiculo", "fragmento") for h in hubs)


def test_dockeo_del_camino_como_producto(caso):
    c, s, d = caso
    cam = camino_mas_corto(c, 1, d["fianza"].id, d["puerto"].id)
    cuerpo = cuerpo_camino_guardado(cam)
    p = s.dockear_producto(
        "camino", f"Camino: {cuerpo['desde']} → {cuerpo['hasta']}", "vinculos",
        cuerpo, entidades=[d["fianza"].id, d["puerto"].id], evidencia=cam["evidencia"],
    )
    assert p.clase == "camino" and p.cuerpo["largo"] == 2
    assert set(p.evidencia) == set(cam["evidencia"])
    g = s.leer_grafo()
    assert any(x["id"] == p.id for x in g["productos"])
