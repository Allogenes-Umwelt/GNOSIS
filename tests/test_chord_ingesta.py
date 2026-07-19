"""Spec del chord de ingesta (F4): la vía documental fuente->entidad como
chord bipartito, determinista y read-only. Sin nodos aduanales."""
import sqlite3

import pytest

from autogenes.chord_ingesta import (
    MAX_ARCOS_ENTIDAD,
    chord_ingesta,
    detalle_ingesta,
)
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    return c


def _sembrar(conn):
    s = Sustrato(conn, 1)
    caliente = s.crear_artefacto("pdf", "caliente.pdf")
    fc = s.agregar_fragmentos(caliente.id, [(1, "a"), (2, "b")])
    fria = s.crear_artefacto("pdf", "fria.pdf")
    s.agregar_fragmentos(fria.id, [(1, "nadie me lee")])
    # Agencia cita 2 fragmentos del mismo artefacto -> cinta peso 2
    s.upsert_entidad("Agencia", "organizacion", "synesis",
                     evidencia=[fc[0].id, fc[1].id])
    s.upsert_entidad("Puerto", "lugar", "operador", evidencia=[fc[1].id])
    s.upsert_entidad("Isla", "concepto", "operador")     # huerfana, sin citas
    return s


def test_chord_bipartito_con_fria_y_cintas(conn):
    _sembrar(conn)
    ch = chord_ingesta(conn, 1)

    # dos fuentes, una fria (fria.pdf no la cita nadie)
    assert ch["resumen"]["fuentes"] == 2
    assert ch["resumen"]["frias"] == 1
    frias = {a["nombre"] for a in ch["artefactos"] if a.get("fria")}
    assert frias == {"fria.pdf"}

    # tres entidades; Isla no cita nada (0 citas)
    assert ch["resumen"]["entidades"] == 3
    isla = next(e for e in ch["entidades"] if e["nombre"] == "Isla")
    assert isla["citas"] == 0 and isla["fuentes"] == 0

    # cobertura: 2 de 3 fragmentos citados
    assert ch["resumen"]["fragmentos"] == 3
    assert ch["resumen"]["citados"] == 2
    assert ch["resumen"]["cobertura"] == 67

    # la cinta Agencia<-caliente pesa 2 (dos fragmentos citados)
    agencia = next(e for e in ch["entidades"] if e["nombre"] == "Agencia")
    caliente = next(a for a in ch["artefactos"] if a["nombre"] == "caliente.pdf")
    cinta = next(c for c in ch["cintas"]
                 if c["entidad_id"] == agencia["id"]
                 and c["artefacto_id"] == caliente["id"])
    assert cinta["peso"] == 2
    assert agencia["citas"] == 2 and agencia["fuentes"] == 1

    # una fuente fria no tiene ninguna cinta entrante
    fria_id = next(a["id"] for a in ch["artefactos"] if a["nombre"] == "fria.pdf")
    assert not any(c["artefacto_id"] == fria_id for c in ch["cintas"])


def test_sin_nodos_aduanales(conn):
    # aun con vehiculos aduanales en la sesion, el chord no los proyecta
    audi = conn.execute("SELECT id FROM marcas WHERE nombre='AUDI'").fetchone()["id"]
    conn.execute("INSERT INTO catalogo_vehiculos (session_id, auto_code, tipo, marca_id)"
                 " VALUES (1, 'A1', 'A3', ?)", (audi,))
    cat = conn.execute("SELECT id FROM catalogo_vehiculos").fetchone()["id"]
    conn.execute("INSERT INTO importaciones (session_id, catalogo_id, chasis, factura,"
                 " pais_code, precio, auto_code) VALUES (1, ?, 'VIN1', 'F1', 'DEU', 1, 'A1')",
                 (cat,))
    conn.commit()
    _sembrar(conn)
    ch = chord_ingesta(conn, 1)
    ids = {a["id"] for a in ch["artefactos"]} | {e["id"] for e in ch["entidades"]}
    assert not any("veh" in i or "marca" in i or "pais" in i for i in ids)


def test_determinista_doble_corrida(conn):
    _sembrar(conn)
    assert chord_ingesta(conn, 1) == chord_ingesta(conn, 1)


def test_rollup_declara_el_exceso(conn):
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("pdf", "masivo.pdf")
    frags = s.agregar_fragmentos(art.id, [(i + 1, f"f{i}") for i in range(5)])
    # muchas mas entidades que el maximo -> rollup activo
    for i in range(MAX_ARCOS_ENTIDAD + 30):
        s.upsert_entidad(f"Ent{i:03d}", "concepto", "operador",
                         evidencia=[frags[i % 5].id])
    ch = chord_ingesta(conn, 1)
    agg = [e for e in ch["entidades"] if e.get("agregado")]
    assert agg, "el exceso debe colapsar en un agregado declarado"
    # el conteo real se conserva: visibles no-agregados + suma de agregados
    n_reales = sum(1 for e in ch["entidades"] if not e.get("agregado"))
    n_en_agg = sum(e["n"] for e in agg)
    assert n_reales + n_en_agg == MAX_ARCOS_ENTIDAD + 30
    # ninguna entidad supera el maximo de arcos visibles + agregados
    assert len(ch["entidades"]) <= MAX_ARCOS_ENTIDAD + len(agg)


def test_sesion_vacia_no_truena(conn):
    ch = chord_ingesta(conn, 1)
    assert ch["artefactos"] == [] and ch["entidades"] == [] and ch["cintas"] == []
    assert ch["resumen"]["cobertura"] == 0


def test_detalle_dossier_artefacto_y_entidad(conn):
    _sembrar(conn)
    ch = chord_ingesta(conn, 1)
    caliente_id = next(a["id"] for a in ch["artefactos"] if a["nombre"] == "caliente.pdf")
    fria_id = next(a["id"] for a in ch["artefactos"] if a["nombre"] == "fria.pdf")
    agencia_id = next(e["id"] for e in ch["entidades"] if e["nombre"] == "Agencia")

    da = detalle_ingesta(conn, 1, caliente_id)
    assert da["tipo"] == "artefacto" and len(da["fragmentos"]) == 2
    assert not da["fria"]
    assert "Agencia" in {c["nombre"] for c in da["citantes"]}

    df = detalle_ingesta(conn, 1, fria_id)
    assert df["fria"] and df["citantes"] == []

    de = detalle_ingesta(conn, 1, agencia_id)
    assert de["tipo"] == "entidad"
    assert "caliente.pdf" in {f["nombre"] for f in de["fuentes"]}


def test_detalle_nodo_ajeno_es_error(conn):
    _sembrar(conn)
    assert "error" in detalle_ingesta(conn, 1, "no-existe")


def test_evidencia_duplicada_no_infla_peso_de_cinta(conn):
    # un frag_id repetido en evidencia NO debe pesar la cinta 2 veces
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("pdf", "doc.pdf")
    fr = s.agregar_fragmentos(art.id, [(1, "x")])
    s.upsert_entidad("Dup", "concepto", "operador",
                     evidencia=[fr[0].id, fr[0].id, fr[0].id])
    ch = chord_ingesta(conn, 1)
    cinta = next(c for c in ch["cintas"] if c["artefacto_id"] == art.id)
    assert cinta["peso"] == 1                     # 1 fragmento distinto, no 3


def _muchas_frias(conn, n):
    s = Sustrato(conn, 1)
    for i in range(n):
        a = s.crear_artefacto("pdf", f"f{i:03d}.pdf")
        s.agregar_fragmentos(a.id, [(1, "x")])
    return s


def test_rollup_agregado_sin_peso_con_miembros_y_frias(conn):
    _muchas_frias(conn, 52)                        # > MAX_ARCOS_ARTEFACTO (48)
    ch = chord_ingesta(conn, 1)
    agg = next(a for a in ch["artefactos"] if a.get("agregado"))
    assert "_peso" not in agg                      # R2: no viaja al payload
    assert agg["_miembros"]                        # DI3: miembros sí (para el dossier)
    assert agg["frias"] > 0 and agg["frias"] == agg["n"]   # R13: conserva señal fría


def test_dossier_de_arco_agregado_lista_miembros(conn):
    _muchas_frias(conn, 52)
    ch = chord_ingesta(conn, 1)
    agg = next(a for a in ch["artefactos"] if a.get("agregado"))
    d = detalle_ingesta(conn, 1, agg["id"])
    assert d["tipo"] == "agregado" and d["n"] == agg["n"]
    assert len(d["miembros"]) == agg["n"]
    assert all("nombre" in m and "kind" in m for m in d["miembros"])
