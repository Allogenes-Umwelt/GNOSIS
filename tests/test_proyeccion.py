"""Spec for the read-time projection (F2): the session ontology derives
from aduanal tables + ag_* substrate WITHOUT writing anything, and the
NetworkX lens caches per session version."""
import sqlite3

import pytest

from autogenes import red as red_mod
from autogenes.proyeccion import arbol_ontologia, construir_grafo
from autogenes.red import construir_red, red_de_sesion, version_de_sesion
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed)"
        " VALUES ('2026-07-10', 7, 2026)"
    )
    sid = c.execute("SELECT id FROM processing_sessions").fetchone()["id"]

    audi = c.execute("SELECT id FROM marcas WHERE nombre = 'AUDI'").fetchone()["id"]
    seat = c.execute("SELECT id FROM marcas WHERE nombre = 'SEAT'").fetchone()["id"]
    c.execute(
        "INSERT INTO catalogo_vehiculos (session_id, auto_code, tipo, marca_id)"
        " VALUES (?, 'AAA111', 'A3', ?), (?, 'SSS222', 'Ibiza', ?)",
        (sid, audi, sid, seat),
    )
    cat_audi, cat_seat = [
        r["id"] for r in c.execute("SELECT id FROM catalogo_vehiculos ORDER BY id")
    ]
    c.execute(
        "INSERT INTO pedimentos (session_id, numero_pedimento, patente, aduana)"
        " VALUES (?, 'PED-001', '3842', 'Veracruz'), (?, 'PED-002', '3842', 'Veracruz')",
        (sid, sid),
    )
    ped1, ped2 = [r["id"] for r in c.execute("SELECT id FROM pedimentos ORDER BY id")]
    filas = [
        # matched to a PDF (chasis + first-8 of factura)
        (sid, ped1, cat_audi, 'VIN00000000000001', 'FAC12345-A', 'DEU', 500000, 'AAA111'),
        # same pedimento, no PDF match
        (sid, ped1, cat_audi, 'VIN00000000000002', 'FAC99999-B', 'DEU', 520000, 'AAA111'),
        # second pedimento, other brand/country
        (sid, ped2, cat_seat, 'VIN00000000000003', 'FAC55555-C', 'ESP', 300000, 'SSS222'),
    ]
    for f in filas:
        c.execute(
            "INSERT INTO importaciones (session_id, pedimento_id, catalogo_id, chasis,"
            " factura, pais_code, precio, auto_code) VALUES (?,?,?,?,?,?,?,?)", f,
        )
    c.execute(
        "INSERT INTO extraccion_facturas (session_id, factura, chasis, filename, pais_code)"
        " VALUES (?, 'FAC12345', 'VIN00000000000001', 'lote_alemania.pdf', 'DEU'),"
        "        (?, 'FACSUELTA', 'VIN_NO_VENDIDO_9', 'huerfana.pdf', 'ESP')",
        (sid, sid),
    )
    c.commit()
    red_mod.invalidar()
    return c


SID = 1


def _conteos(c: sqlite3.Connection) -> dict:
    tablas = [
        "importaciones", "extraccion_facturas", "pedimentos", "catalogo_vehiculos",
        "ag_artefactos", "ag_fragmentos", "ag_entidades", "ag_relaciones",
        "ag_productos", "ag_bitacora",
    ]
    return {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in tablas}


def test_proyeccion_es_solo_lectura(conn):
    antes = _conteos(conn)
    construir_grafo(conn, SID)
    arbol_ontologia(conn, SID)
    red_de_sesion(conn, SID)
    assert _conteos(conn) == antes


def test_grafo_proyecta_la_estructura_aduanal(conn):
    g = construir_grafo(conn, SID)
    por_id = {n["id"]: n for n in g["nodos"]}
    kinds = {}
    for n in g["nodos"]:
        kinds[n["kind"]] = kinds.get(n["kind"], 0) + 1

    assert kinds["nucleo"] == 1 and por_id["nucleo-sesion-1"]["etiqueta"] == "Sesión 07/2026"
    assert kinds["pedimento"] == 2 and kinds["vehiculo"] == 3
    assert kinds["marca"] == 2 and kinds["pais"] == 2
    assert kinds["artefacto"] == 2  # matched + orphan virtual PDFs

    enlaces = {(e["source"], e["target"]) for e in g["enlaces"]}
    assert ("ped:1", "veh:1") in enlaces and ("ped:2", "veh:3") in enlaces
    # tri-source match: the sold vehicle cites the PDF it arrived under
    assert ("veh:1", "art:pdf:lote_alemania.pdf") in enlaces
    # the orphan PDF exists but tethers to the nucleus (CONCILIA raw material)
    assert ("nucleo-sesion-1", "art:pdf:huerfana.pdf") in enlaces
    assert por_id["art:pdf:huerfana.pdf"]["extra"]["virtual"] is True
    # degrees drive mass: the nucleus sees pedimentos + orphan PDF
    assert por_id["nucleo-sesion-1"]["grado"] >= 3
    assert all(n["grado"] > 0 for n in g["nodos"])


def test_sustrato_cabalga_sobre_la_proyeccion(conn):
    s = Sustrato(conn, SID)
    art = s.crear_artefacto("pdf", "contrato.pdf")
    frags = s.agregar_fragmentos(art.id, [(1, "página uno"), (2, "página dos")])
    e1 = s.upsert_entidad("Agente 3842", "organizacion", "synesis",
                          evidencia=[frags[0].id, frags[1].id])
    e2 = s.upsert_entidad("Veracruz", "lugar", "operador")
    s.agregar_relacion(e1.id, e2.id, "opera en", 0.8, [frags[0].id])
    s.dockear_producto("informe", "R", "sintesis", {}, entidades=[e1.id],
                       evidencia=[frags[0].id])

    g = construir_grafo(conn, SID)
    enlaces = [(e["source"], e["target"], e["kind"]) for e in g["enlaces"]]
    # evidence-derived cita edge, weighted by count (2 fragmentos -> 0.7)
    cita = next(e for e in g["enlaces"] if e["source"] == e1.id and e["target"] == art.id)
    assert cita["kind"] == "cita" and cita["peso"] == pytest.approx(0.7)
    assert (e1.id, e2.id, "relacion") in enlaces
    productos = [n for n in g["nodos"] if n["kind"] == "producto"]
    assert len(productos) == 1
    assert (productos[0]["id"], e1.id, "cita") in enlaces
    assert (productos[0]["id"], art.id, "cita") in enlaces


def test_arbol_para_el_dendrograma(conn):
    arbol = arbol_ontologia(conn, SID)
    assert arbol["kind"] == "nucleo" and arbol["tamano"] == 3
    marcas = {r["etiqueta"]: r for r in arbol["hijos"]}
    assert set(marcas) == {"AUDI", "SEAT"}
    assert marcas["AUDI"]["tamano"] == 2  # two vehicles under PED-001
    ped = marcas["AUDI"]["hijos"][0]
    assert ped["etiqueta"] == "PED-001" and len(ped["hijos"]) == 2
    # substrate branch appears once there are sources
    s = Sustrato(conn, SID)
    a = s.crear_artefacto("pdf", "contrato.pdf")
    s.agregar_fragmentos(a.id, [(1, "x")])
    s.upsert_entidad("Agente", "organizacion", "operador")
    arbol2 = arbol_ontologia(conn, SID)
    fuentes = next(r for r in arbol2["hijos"] if r["id"] == "fuentes")
    assert {h["etiqueta"] for h in fuentes["hijos"]} == {"contrato.pdf", "entidades"}


def test_red_networkx_y_cache_por_version(conn):
    red1 = red_de_sesion(conn, SID)
    g = construir_grafo(conn, SID)
    assert red1.number_of_nodes() == len(g["nodos"])
    assert red1.number_of_edges() == len(g["enlaces"])
    assert red1.nodes["veh:1"]["kind"] == "vehiculo"

    # cache hit: same object while nothing mutates
    assert red_de_sesion(conn, SID) is red1

    # any substrate mutation moves the version -> rebuild
    v1 = version_de_sesion(conn, SID)
    Sustrato(conn, SID).upsert_entidad("Nueva", "concepto", "operador")
    assert version_de_sesion(conn, SID) != v1
    red2 = red_de_sesion(conn, SID)
    assert red2 is not red1
    assert red2.number_of_nodes() == red1.number_of_nodes() + 1

    # aduanal writes also move the version (row-count component)
    conn.execute(
        "INSERT INTO pedimentos (session_id, numero_pedimento) VALUES (?, 'PED-003')",
        (SID,),
    )
    conn.commit()
    assert red_de_sesion(conn, SID) is not red2


def test_limite_de_vehiculos_no_rompe_grados(conn):
    g = construir_grafo(conn, SID, limite_vehiculos=1)
    kinds = [n["kind"] for n in g["nodos"]]
    assert kinds.count("vehiculo") == 1
    red = construir_red(conn, SID, limite_vehiculos=1)
    assert red.number_of_nodes() == len(g["nodos"])
