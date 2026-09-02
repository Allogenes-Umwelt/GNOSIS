"""Spec del EVENT LOG y del tiempo — hallazgos G7, G3 y D1 del v02.

**G7.** `_registrar(accion, detalle)` guardaba prosa libre («Entidad X
(synesis)»), así que la bitácora WORM respondía «cuántas cosas pasaron» y no
«qué cambió». El evento estructurado la convierte en un log auditable — y
entra en el SELLO, porque dato fuera del sello es dato editable.

**D1.** `ag_eventos.entidades` guardaba nombres en JSON y se buscaban con
`LIKE '%"nombre"%'`: renombrar una entidad desligaba sus eventos y un nombre
contenido en otro casaba de más.

**G3.** Sin validez temporal, «¿quién era el agente aduanal en julio?» era
una lectura de la bitácora en vez de una consulta.
"""
import json
import sqlite3

import pytest

from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def s(tmp_path):
    c = sqlite3.connect(tmp_path / "b.db")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.commit()
    return Sustrato(c, 1)


def _base(s):
    a = s.crear_artefacto("pdf", "contrato.pdf")
    fr = s.agregar_fragmentos(a.id, [(1, "VW opera con la agencia Norte.")])
    return a, fr[0]


# ── G7 · la bitácora como event log ──────────────────────────────────

def test_cada_mutacion_deja_un_evento_estructurado(s):
    """«Qué cambió», no «cuántas cosas había»."""
    a, fr = _base(s)
    e = s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])

    filas = {r["accion"]: r for r in s.conn.execute(
        "SELECT accion, datos FROM ag_bitacora WHERE session_id = 1")}
    creada = json.loads(filas["entidad"]["datos"])
    assert creada["op"] == "crear" and creada["tabla"] == "ag_entidades"
    assert creada["id"] == e.id and creada["nombre"] == "VW"

    fuente = json.loads(filas["dockear-fuente"]["datos"])
    assert fuente == {"op": "crear", "tabla": "ag_artefactos", "id": a.id,
                      "kind": "pdf", "nombre": "contrato.pdf"}


def test_una_actualizacion_declara_el_antes_y_el_despues(s):
    _, fr = _base(s)
    s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])
    s.upsert_entidad("VW", "organizacion", "synesis", evidencia=[fr.id])

    fila = s.conn.execute(
        "SELECT datos FROM ag_bitacora WHERE accion = 'entidad'"
        " ORDER BY id DESC LIMIT 1").fetchone()
    datos = json.loads(fila["datos"])
    assert datos["op"] == "actualizar"
    assert "antes" in datos and "despues" in datos


def test_el_evento_estructurado_entra_en_el_sello(s):
    """Dato fuera del sello es dato editable: si `datos` no se sellara, se
    podría reescribir la historia sin romper la cadena."""
    _, fr = _base(s)
    s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])
    assert s.verificar_bitacora()["valido"]

    fila = s.conn.execute(
        "SELECT id, datos FROM ag_bitacora WHERE datos IS NOT NULL"
        " ORDER BY id LIMIT 1").fetchone()
    manipulado = json.loads(fila["datos"])
    manipulado["nombre"] = "Otro nombre"
    s.conn.execute("UPDATE ag_bitacora SET datos = ? WHERE id = ?",
                   (json.dumps(manipulado, sort_keys=True, separators=(",", ":")),
                    fila["id"]))

    veredicto = s.verificar_bitacora()
    assert not veredicto["valido"]
    assert veredicto["roto_en"] == fila["id"] and veredicto["motivo"] == "hash"


def test_vaciar_el_evento_estructurado_tambien_se_ve(s):
    """La regla es total en los dos sentidos: una fila con `datos` se sella
    con `datos`, así que quitárselo la deja verificando con la fórmula corta
    contra un sello calculado con la larga."""
    _, fr = _base(s)
    s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])
    fila = s.conn.execute(
        "SELECT id FROM ag_bitacora WHERE datos IS NOT NULL ORDER BY id LIMIT 1"
    ).fetchone()
    s.conn.execute("UPDATE ag_bitacora SET datos = NULL WHERE id = ?", (fila["id"],))
    assert not s.verificar_bitacora()["valido"]


def test_la_cadena_verifica_con_filas_de_las_dos_formas(s):
    """Las filas sin evento estructurado —la historia anterior, y las
    mutaciones que aún no lo emiten— se siguen sellando con la fórmula que las
    selló. No hay que re-sellar nada, cosa que además una bitácora WORM no
    debería permitir: la regla las cubre sin necesidad de versionarla."""
    _, fr = _base(s)
    s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])
    # `agregar_eventos` registra prosa sin evento estructurado: fila con
    # `datos` NULL, sellada con la fórmula corta, en medio de la cadena
    s.agregar_eventos([{"titulo": "Vence", "fecha": "2026-07-20",
                        "precision": "dia", "entidades": [], "evidencia": [fr.id],
                        "origen": "operador"}])
    s.upsert_entidad("Agencia Norte", "organizacion", "operador", evidencia=[fr.id])

    con_datos, sin_datos = s.conn.execute(
        "SELECT SUM(datos IS NOT NULL), SUM(datos IS NULL) FROM ag_bitacora"
    ).fetchone()
    assert con_datos and sin_datos, "la cadena no mezcla las dos formas"
    assert s.verificar_bitacora()["valido"]


# ── D1 · el evento liga por id ───────────────────────────────────────

def test_renombrar_una_entidad_NO_la_desliga_de_sus_eventos(s):
    """El defecto exacto de D1: el vínculo era por nombre."""
    from autogenes import consultas

    _, fr = _base(s)
    vw = s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])
    s.agregar_eventos([{"titulo": "Vence la fianza", "fecha": "2026-07-20",
                        "precision": "dia", "entidades": ["VW"],
                        "evidencia": [fr.id], "origen": "operador"}])
    s.conn.commit()

    s.editar_entidad(vw.id, {"nombre": "Volkswagen de México"})
    s.conn.commit()

    exp = consultas.expediente_entidad(s.conn, 1, "Volkswagen de México")
    assert [e["titulo"] for e in exp["eventos"]] == ["Vence la fianza"]


def test_un_nombre_contenido_en_otro_ya_no_casa_de_mas(s):
    """`LIKE '%\"VW\"%'` casaba «VW» dentro de «VW Servicios»."""
    from autogenes import consultas

    _, fr = _base(s)
    s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])
    s.upsert_entidad("VW Servicios", "organizacion", "operador", evidencia=[fr.id])
    s.agregar_eventos([{"titulo": "Solo de Servicios", "fecha": "2026-07-20",
                        "precision": "dia", "entidades": ["VW Servicios"],
                        "evidencia": [fr.id], "origen": "operador"}])
    s.conn.commit()

    assert consultas.expediente_entidad(s.conn, 1, "VW")["eventos"] == []
    assert len(consultas.expediente_entidad(s.conn, 1, "VW Servicios")["eventos"]) == 1


# ── G3 · la validez temporal ─────────────────────────────────────────

def test_una_relacion_puede_declarar_desde_cuando_vale(s):
    from autogenes import consultas

    _, fr = _base(s)
    vw = s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])
    ag = s.upsert_entidad("Agencia Norte", "organizacion", "operador",
                          evidencia=[fr.id])
    s.agregar_relacion(vw.id, ag.id, "representa", 0.5, [fr.id],
                       origen="operador", valido_desde="2026-07-01",
                       valido_hasta="2026-07-31")
    s.conn.commit()

    rel = consultas.expediente_entidad(s.conn, 1, "VW")["relaciones"][0]
    assert rel["vigencia"] == {"desde": "2026-07-01", "hasta": "2026-07-31"}


def test_sin_fechas_se_dice_que_NO_CONSTA_no_que_valga_siempre(s):
    from autogenes import consultas

    _, fr = _base(s)
    vw = s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])
    ag = s.upsert_entidad("Agencia Norte", "organizacion", "operador",
                          evidencia=[fr.id])
    s.agregar_relacion(vw.id, ag.id, "representa", 0.5, [fr.id])
    s.conn.commit()

    assert consultas.expediente_entidad(s.conn, 1, "VW")["relaciones"][0]["vigencia"] is None


def test_una_fecha_imposible_no_se_guarda(s):
    """Envenenaría toda lectura temporal de la sesión. «No consta» es una
    respuesta honesta; «2026-13-45» no es ninguna respuesta."""
    _, fr = _base(s)
    vw = s.upsert_entidad("VW", "organizacion", "operador", evidencia=[fr.id])
    ag = s.upsert_entidad("Agencia Norte", "organizacion", "operador",
                          evidencia=[fr.id])
    r = s.agregar_relacion(vw.id, ag.id, "representa", 0.5, [fr.id],
                           valido_desde="2026-13-45", valido_hasta="ayer")
    fila = s.conn.execute(
        "SELECT valido_desde, valido_hasta FROM ag_relaciones WHERE id = ?",
        (r.id,)).fetchone()
    assert fila["valido_desde"] is None and fila["valido_hasta"] is None
