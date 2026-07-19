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
    # 3 vehículos conciliados (importaciones) + 1 de factura sin venta
    # (VIN_NO_VENDIDO_9): el grafo proyecta el contenido de la factura
    # aunque aún no haya conciliación DWH.
    assert kinds["pedimento"] == 2 and kinds["vehiculo"] == 4
    assert kinds["marca"] == 2 and kinds["pais"] == 2
    assert kinds["artefacto"] == 2  # matched + orphan virtual PDFs

    enlaces = {(e["source"], e["target"]) for e in g["enlaces"]}
    assert ("ped:1", "veh:1") in enlaces and ("ped:2", "veh:3") in enlaces
    # tri-source match: the sold vehicle cites the PDF it arrived under
    assert ("veh:1", "art:pdf:lote_alemania.pdf") in enlaces
    # el vehículo de factura sin conciliar cita su PDF huérfano
    assert "vehfac:VIN_NO_VENDIDO_9" in por_id
    assert ("vehfac:VIN_NO_VENDIDO_9", "art:pdf:huerfana.pdf") in enlaces
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


def test_glifos_por_kind(conn):
    # entidades de los tres subtipos griegos (Ψ persona, Ω organización, ε resto)
    s = Sustrato(conn, SID)
    s.upsert_entidad("Ana López", "persona", "operador")
    s.upsert_entidad("Aduanal SA", "organizacion", "operador")
    s.upsert_entidad("flete marítimo", "concepto", "operador")

    g = construir_grafo(conn, SID)
    por_id = {n["id"]: n for n in g["nodos"]}
    glifo_de_kind = {n["kind"]: n["glifo"] for n in g["nodos"]}
    assert glifo_de_kind["nucleo"] == "α"
    assert glifo_de_kind["pedimento"] == "Π"
    assert glifo_de_kind["vehiculo"] == "ν"
    assert glifo_de_kind["marca"] == "μ"
    assert glifo_de_kind["pais"] == "⊕"
    assert glifo_de_kind["artefacto"] == "Σ"

    ents = {n["etiqueta"]: n["glifo"] for n in g["nodos"] if n["kind"] == "entidad"}
    assert ents["Ana López"] == "Ψ"
    assert ents["Aduanal SA"] == "Ω"
    assert ents["flete marítimo"] == "ε"
    # todo nodo lleva glifo, ninguno queda sin clasificar
    assert all(n.get("glifo") and n["glifo"] != "·" for n in g["nodos"])
    assert por_id["nucleo-sesion-1"]["glifo"] == "α"


def test_analitica_topologica_es_determinista(conn):
    g1 = construir_grafo(conn, SID)
    g2 = construir_grafo(conn, SID)
    # cada nodo trae comunidad, puente y centralidad
    for n in g1["nodos"]:
        assert "comunidad" in n and isinstance(n["comunidad"], int)
        assert "puente" in n and isinstance(n["puente"], bool)
        assert "centralidad" in n and 0.0 <= n["centralidad"] <= 1.0
    # la centralidad viene normalizada: el nodo más pesado del caso es 1.0
    assert max(n["centralidad"] for n in g1["nodos"]) == pytest.approx(1.0)
    # mismo grafo -> misma analítica, bit a bit (ley de determinismo)
    def campos(g):
        return [(n["id"], n["comunidad"], n["puente"], n["centralidad"])
                for n in g["nodos"]]
    assert campos(g1) == campos(g2)
    assert g1["meta"]["comunidades"] >= 1


def test_con_analitica_false_omite_el_costo(conn):
    g = construir_grafo(conn, SID, con_analitica=False)
    assert g["meta"]["comunidades"] == 0
    assert all("comunidad" not in n for n in g["nodos"])
    # la estructura y los glifos siguen intactos sin la analítica
    assert all("glifo" in n for n in g["nodos"])


def test_anomalias_delta_desde_concilia(conn):
    g = construir_grafo(conn, SID)
    anomalias = [n for n in g["nodos"] if n["kind"] == "anomalia"]
    # el fixture tiene 2 vendidas sin factura (VIN...02, VIN...03) y 1
    # llegada sin venta (VIN_NO_VENDIDO_9 / huerfana.pdf)
    clases = {n["tipo"] for n in anomalias}
    assert "vendido_sin_llegada" in clases and "llegado_sin_venta" in clases
    assert g["meta"]["anomalias"] == len(anomalias)

    # cada Δ lleva glifo, severidad, motor y regla_id (procedencia del hallazgo)
    for n in anomalias:
        assert n["glifo"] == "Δ"
        assert n["severidad"] in ("warn", "danger")
        assert n["extra"]["motor"] in ("concilia", "validacion", "nomos")
        assert n["extra"]["regla_id"]

    enlaces = {(e["source"], e["target"]) for e in g["enlaces"]}
    vendido = next(n for n in anomalias if n["tipo"] == "vendido_sin_llegada")
    assert vendido["extra"]["motor"] == "concilia"
    assert vendido["severidad"] == "danger"
    # cita a los vehículos huérfanos que la protagonizan y ancla al núcleo
    assert (vendido["id"], "veh:2") in enlaces
    assert (vendido["id"], "veh:3") in enlaces
    assert ("nucleo-sesion-1", vendido["id"]) in enlaces

    llegado = next(n for n in anomalias if n["tipo"] == "llegado_sin_venta")
    assert llegado["severidad"] == "warn"
    # resuelve por chasis (vehfac) y por archivo (PDF huérfano)
    assert (llegado["id"], "vehfac:VIN_NO_VENDIDO_9") in enlaces
    assert (llegado["id"], "art:pdf:huerfana.pdf") in enlaces


def test_anomalias_validacion_y_nomos(conn):
    # las filas DWH del fixture no declaran j_y_n -> VALIDACION dispara la
    # regla de obligatorio; y una regla NOMOS del operador exige j_y_n=N para
    # DEU, que ninguna de esas filas cumple -> violación proyectada como Δ.
    Sustrato(conn, SID).crear_regla(
        "DEU obliga N", [{"campo": "pais_code", "valor": "DEU"}],
        {"campo": "j_y_n", "valor": "N"})

    g = construir_grafo(conn, SID)
    anomalias = [n for n in g["nodos"] if n["kind"] == "anomalia"]
    motores = {n["extra"]["motor"] for n in anomalias}
    assert {"concilia", "validacion", "nomos"} <= motores

    val = next(n for n in anomalias if n["extra"]["motor"] == "validacion")
    assert val["glifo"] == "Δ" and val["severidad"] in ("warn", "danger")
    nom = next(n for n in anomalias if n["extra"]["motor"] == "nomos")
    assert "incumplida" in nom["etiqueta"] and nom["severidad"] == "warn"
    # el conteo meta cubre los tres motores
    assert g["meta"]["anomalias"] == len(anomalias)


def test_con_anomalias_false_no_proyecta_delta(conn):
    g = construir_grafo(conn, SID, con_anomalias=False)
    assert not any(n["kind"] == "anomalia" for n in g["nodos"])
    assert g["meta"]["anomalias"] == 0


def test_anomalias_no_escriben_nada(conn):
    antes = _conteos(conn)
    construir_grafo(conn, SID)  # CONCILIA corre dentro: debe ser lectura pura
    assert _conteos(conn) == antes


def test_anomalia_vin_duplicado_cita_todos_los_duplicados(conn):
    # dos filas DWH con el MISMO chasis: el hallazgo de VIN duplicado debe
    # implicar AMBOS nodos vehículo, no solo el último (last-wins los perdía)
    conn.execute("INSERT INTO importaciones (session_id, pedimento_id, catalogo_id,"
                 " chasis, factura, pais_code, precio, auto_code) VALUES"
                 " (1, 1, 1, 'VIN00000000000001', 'FACDUP-Z', 'DEU', 500000, 'AAA111')")
    conn.commit()
    red_mod.invalidar()
    g = construir_grafo(conn, SID)
    anom = next(n for n in g["nodos"] if n["id"] == "anom:conc-vin-dup-dwh")
    objetivos = {e["target"] for e in g["enlaces"] if e["source"] == anom["id"]}
    dup = {n["id"] for n in g["nodos"]
           if n["kind"] == "vehiculo" and n["etiqueta"] == "VIN00000000000001"}
    assert len(dup) == 2
    assert dup <= objetivos                       # AMBOS duplicados citados


def test_vehiculo_con_pedimento_cross_sesion_se_ancla_al_nucleo(conn):
    # un pedimento de OTRA sesión (deriva referencial: la FK no obliga misma
    # sesión) no se proyecta aquí; el vehículo cuelga del núcleo, sin arista a
    # un nodo pedimento ausente (que rompería el invariante de conteo y crashea)
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed) VALUES ('2026-06-10', 6, 2026)")
    conn.execute("INSERT INTO pedimentos (session_id, numero_pedimento)"
                 " VALUES (2, 'PED-OTRA')")
    ped_otra = conn.execute("SELECT MAX(id) FROM pedimentos").fetchone()[0]
    conn.execute("INSERT INTO importaciones (session_id, pedimento_id, catalogo_id,"
                 " chasis, factura, pais_code, precio, auto_code) VALUES"
                 " (1, ?, 1, 'VINCROSS000000001', 'FACX-1', 'DEU', 100000, 'AAA111')",
                 (ped_otra,))
    conn.commit()
    red_mod.invalidar()
    g = construir_grafo(conn, SID)
    ids = {n["id"] for n in g["nodos"]}
    for e in g["enlaces"]:                         # ninguna arista a un nodo ausente
        assert e["source"] in ids and e["target"] in ids
    assert f"ped:{ped_otra}" not in ids
    veh = next(n["id"] for n in g["nodos"]
               if n["kind"] == "vehiculo" and n["etiqueta"] == "VINCROSS000000001")
    pares = {(e["source"], e["target"]) for e in g["enlaces"]}
    assert ("nucleo-sesion-1", veh) in pares       # anclado al núcleo


def test_cap_no_reproyecta_conciliado_como_sin_conciliar():
    # un chasis conciliado (en importaciones) fuera del cap NO debe reaparecer
    # como vehfac (sin conciliar): la misma unidad con tipo contradictorio
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    # 3 filas conciliadas; la 3ª (fuera del cap=2 por id) ordena 1ª por chasis
    # en extraccion — el escenario exacto que doble-proyectaba
    vins = ["MMM00000000000001", "MMM00000000000002", "AAA00000000000003"]
    for i, vin in enumerate(vins):
        c.execute("INSERT INTO importaciones (session_id, chasis, factura, pais_code,"
                  " precio) VALUES (1, ?, ?, 'DEU', 100000)", (vin, f"F{i}0000-X"))
        c.execute("INSERT INTO extraccion_facturas (session_id, factura, chasis,"
                  " filename, pais_code) VALUES (1, ?, ?, ?, 'DEU')",
                  (f"F{i}0000", vin, f"c{i}.pdf"))
    c.commit()
    red_mod.invalidar()
    g = construir_grafo(c, 1, limite_vehiculos=2, con_analitica=False,
                        con_anomalias=False)
    conciliados = set(vins)
    vehfac = {n["etiqueta"] for n in g["nodos"] if n["id"].startswith("vehfac:")}
    assert not (vehfac & conciliados)             # ningún conciliado como vehfac


def test_pdf_ingerido_no_se_duplica_como_virtual(conn):
    # tras F4, un PDF que existe como ag_artefacto NO debe aparecer también
    # como artefacto virtual: un documento, un nodo, evidencia no partida
    art = Sustrato(conn, SID).crear_artefacto("pdf", "lote_alemania.pdf")
    red_mod.invalidar()
    g = construir_grafo(conn, SID)
    homonimos = [n for n in g["nodos"] if n["etiqueta"] == "lote_alemania.pdf"]
    assert len(homonimos) == 1                    # un solo nodo para el documento
    assert homonimos[0]["id"] == art.id           # el real, no el virtual
    assert "art:pdf:lote_alemania.pdf" not in {n["id"] for n in g["nodos"]}
    pares = {(e["source"], e["target"]) for e in g["enlaces"]}
    assert ("veh:1", art.id) in pares             # el vehículo cita el nodo REAL
