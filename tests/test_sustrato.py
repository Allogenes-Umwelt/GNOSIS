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


def test_eventos_rechazan_fecha_imposible(sustrato: Sustrato):
    """2026-07-32 pasa el regex pero envenenaría toda lectura por fecha."""
    _, frags = _fuente_con_fragmentos(sustrato)
    for fecha in ("2026-07-32", "2026-13-01", "2026-02-30"):
        with pytest.raises(ValueError, match="imposible"):
            sustrato.agregar_eventos([
                {"titulo": "x", "fecha": fecha, "precision": "dia",
                 "evidencia": [frags[0].id], "origen": "synesis"}
            ])


def test_mutaciones_no_cruzan_la_frontera_de_sesion(sustrato: Sustrato):
    """Un Sustrato de la sesión A jamás borra material de la sesión B,
    ni siquiera con el id correcto en la mano."""
    conn = sustrato.conn
    conn.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed)"
        " VALUES ('2026-08-10', 8, 2026)"
    )
    sid_b = conn.execute("SELECT MAX(id) AS m FROM processing_sessions").fetchone()["m"]
    otro = Sustrato(conn, sid_b)
    art_b, frags_b = _fuente_con_fragmentos(otro)
    ent_b = otro.upsert_entidad("Entidad B", "organizacion", "synesis",
                                evidencia=[frags_b[0].id])
    rel_b = otro.agregar_relacion(ent_b.id, ent_b.id, "self", 0.5, [])
    ev_b = otro.agregar_eventos([
        {"titulo": "evento B", "fecha": "2026-08-15", "precision": "dia",
         "evidencia": [frags_b[0].id], "origen": "synesis"}
    ])[0]

    # la sesión 1 intenta mutar material de la sesión B: no pasa nada
    sustrato.quitar_artefacto(art_b.id)
    sustrato.cortar_relacion(rel_b.id)
    sustrato.quitar_evento(ev_b.id)
    assert conn.execute("SELECT COUNT(*) FROM ag_artefactos WHERE id = ?",
                        (art_b.id,)).fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM ag_relaciones WHERE id = ?",
                        (rel_b.id,)).fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM ag_eventos WHERE id = ?",
                        (ev_b.id,)).fetchone()[0] == 1
    # la entidad de B sigue citando fragmentos vivos (sin cascada cruzada)
    assert otro.entidad_por_id(ent_b.id).evidencia == [frags_b[0].id]


def test_reintegrar_propuesta_no_duplica_relaciones(sustrato: Sustrato):
    """Integrar dos veces la misma propuesta enriquece evidencia, no
    duplica aristas — los grados y el digesto no se inflan."""
    _, frags = _fuente_con_fragmentos(sustrato)
    propuesta = PropuestaGrafo(
        entidades=[
            PropuestaEntidad(nombre="Audi AG", tipo="organizacion",
                             evidencia=[frags[0].id]),
            PropuestaEntidad(nombre="VW México", tipo="organizacion",
                             evidencia=[frags[1].id]),
        ],
        relaciones=[
            PropuestaRelacion(desde="Audi AG", hasta="VW México", tipo="grupo",
                              evidencia=[frags[0].id]),
        ],
    )
    sustrato.integrar_propuesta(propuesta)
    propuesta2 = PropuestaGrafo(
        entidades=propuesta.entidades,
        relaciones=[
            PropuestaRelacion(desde="Audi AG", hasta="VW México", tipo="grupo",
                              evidencia=[frags[1].id]),
        ],
    )
    resultado = sustrato.integrar_propuesta(propuesta2)
    assert resultado["relaciones"] == 0
    filas = sustrato.conn.execute(
        "SELECT evidencia FROM ag_relaciones WHERE session_id = ?",
        (sustrato.session_id,),
    ).fetchall()
    assert len(filas) == 1
    import json as _json
    assert set(_json.loads(filas[0]["evidencia"])) == {frags[0].id, frags[1].id}


def test_propuesta_con_nombre_en_blanco_se_rechaza():
    """'  ' no puede colarse como entidad sin nombre: strip antes de validar."""
    with pytest.raises(Exception):
        PropuestaEntidad(nombre="   ")


def test_fusion_une_evidencia_de_triples_duplicados(sustrato: Sustrato):
    """Al fusionar, la evidencia del triple colapsado sobrevive en el kept."""
    _, frags = _fuente_con_fragmentos(sustrato)
    a = sustrato.upsert_entidad("A", "organizacion", "operador")
    b1 = sustrato.upsert_entidad("B uno", "organizacion", "operador")
    b2 = sustrato.upsert_entidad("B dos", "organizacion", "operador")
    sustrato.agregar_relacion(a.id, b1.id, "contrata", 0.5, [frags[0].id])
    sustrato.agregar_relacion(a.id, b2.id, "contrata", 0.5, [frags[1].id])
    sustrato.fusionar_entidades(b1.id, b2.id)
    filas = sustrato.conn.execute(
        "SELECT evidencia FROM ag_relaciones WHERE session_id = ?",
        (sustrato.session_id,),
    ).fetchall()
    assert len(filas) == 1
    import json as _json
    assert set(_json.loads(filas[0]["evidencia"])) == {frags[0].id, frags[1].id}


def test_bitacora_sello_encadenado_verifica(sustrato: Sustrato):
    # cada mutación sella su fila de bitácora encadenando el sello previo;
    # verificar_bitacora re-deriva la cadena completa
    _fuente_con_fragmentos(sustrato)
    sustrato.upsert_entidad("VW", "organizacion", "operador")
    v = sustrato.verificar_bitacora()
    assert v["valido"] is True and v["roto_en"] is None
    assert v["sellados"] == v["filas"] >= 3          # todas selladas


def test_bitacora_edicion_fuera_de_la_puerta_se_detecta(sustrato: Sustrato):
    _fuente_con_fragmentos(sustrato)
    sustrato.upsert_entidad("VW", "organizacion", "operador")
    # reescribir el detalle de una fila SIN pasar por Sustrato rompe el sello
    fid = sustrato.conn.execute(
        "SELECT id FROM ag_bitacora ORDER BY id LIMIT 1").fetchone()[0]
    sustrato.conn.execute(
        "UPDATE ag_bitacora SET detalle = 'HISTORIA REESCRITA' WHERE id = ?",
        (fid,))
    v = sustrato.verificar_bitacora()
    assert v["valido"] is False and v["roto_en"] == fid and v["motivo"] == "hash"


def test_bitacora_borrado_fuera_de_la_puerta_se_detecta(sustrato: Sustrato):
    _fuente_con_fragmentos(sustrato)
    sustrato.upsert_entidad("VW", "organizacion", "operador")
    # borrar una fila intermedia rompe el enlace prev_hash de la siguiente
    ids = [r[0] for r in sustrato.conn.execute(
        "SELECT id FROM ag_bitacora ORDER BY id")]
    sustrato.conn.execute("DELETE FROM ag_bitacora WHERE id = ?", (ids[1],))
    v = sustrato.verificar_bitacora()
    assert v["valido"] is False and v["motivo"] == "cadena"


def test_bitacora_migracion_desde_esquema_sin_sello():
    # una base ya creada SIN las columnas de sello recibe la migración 3 y
    # queda operable; las filas previas al sello se declaran sin sellar, no rotas
    from database.migrations import apply_migrations
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(models.SCHEMA_SQL)             # processing_sessions
    # esquema VIEJO de ag_bitacora (sin prev_hash/hash)
    conn.execute("""CREATE TABLE ag_bitacora (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        ts TEXT DEFAULT (datetime('now')),
        accion TEXT NOT NULL,
        detalle TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES processing_sessions(id))""")
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed) VALUES ('2026-07-10', 7, 2026)")
    conn.execute("INSERT INTO ag_bitacora (session_id, accion, detalle)"
                 " VALUES (1, 'op', 'previo al sello')")
    # migraciones 1 y 2 tocan otras tablas ausentes en este mínimo: márcalas
    # aplicadas para aislar la 3 (el add-column real que probamos)
    conn.execute("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY,"
                 " name TEXT NOT NULL, applied_at TEXT DEFAULT (datetime('now')))")
    conn.executemany("INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                     [(1, "n1"), (2, "n2")])
    apply_migrations(conn)                            # corre solo la migración 3
    cols = {r[1] for r in conn.execute("PRAGMA table_info(ag_bitacora)")}
    assert {"prev_hash", "hash"} <= cols
    Sustrato(conn, 1)._registrar("op", "ya sellada")  # ya puede sellar
    v = Sustrato(conn, 1).verificar_bitacora()
    assert v["valido"] is True                        # legado sin sellar no rompe
    assert v["sellados"] >= 1 and v["filas"] == 2
