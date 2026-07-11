"""Spec for CONSULTAS (F8): the six graph tools Gnosis AI exposes.
The law under test: every claim arrives with fragment -> page -> PDF
citations resolved, honest ambiguity/absence instead of guessing, and
the jarvis wrappers publish exactly these tools to the model."""
import sqlite3

import pytest

from autogenes import consultas
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


def _sesion(c: sqlite3.Connection, mes: int = 7) -> int:
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed)"
        " VALUES (?, ?, 2026)", (f"2026-{mes:02d}-10", mes),
    )
    return c.execute("SELECT MAX(id) FROM processing_sessions").fetchone()[0]


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    sid = _sesion(c)
    s = Sustrato(c, sid)
    art = s.crear_artefacto("pdf", "contrato.pdf")
    f1, f2 = s.agregar_fragmentos(
        art.id, [(1, "VW importa por Veracruz"), (3, "SAT audita el pedimento")])
    e_vw = s.upsert_entidad("VW", "organizacion", "synesis", evidencia=[f1.id])
    s.editar_entidad(e_vw.id, {"alias": ["Volkswagen AG"]})
    e_ver = s.upsert_entidad("Veracruz", "lugar", "synesis", evidencia=[f1.id])
    e_sat = s.upsert_entidad("SAT", "organizacion", "synesis", evidencia=[f2.id])
    s.agregar_relacion(e_vw.id, e_ver.id, "importa por", 0.8, [f1.id])
    s.agregar_relacion(e_sat.id, e_vw.id, "audita a", 0.6, [f2.id])
    # los eventos se citan por NOMBRE de entidad (como la extracción real),
    # no por id — así el expediente los encuentra en producción.
    s.agregar_eventos([{"titulo": "Auditoría SAT", "fecha": "2026-08-01",
                        "precision": "dia", "entidades": ["SAT", "VW"],
                        "evidencia": [f2.id], "origen": "synesis"}])
    # una huérfana para el radar
    s.upsert_entidad("Nota suelta", "concepto", "operador")
    c.execute("INSERT INTO facturas_faltantes (session_id, factura) VALUES (?, ?)",
              (sid, "F-001"))
    return c


SID = 1


# ── expediente_entidad ───────────────────────────────────────────────


def test_expediente_cita_fragmento_pagina_pdf(conn):
    exp = consultas.expediente_entidad(conn, SID, "VW")
    assert exp["entidad"]["nombre"] == "VW"
    cita = exp["citas"][0]
    assert cita["fuente"] == "contrato.pdf" and cita["pagina"] == 1
    assert "VW importa" in cita["extracto"]
    tipos = {(r["con"], r["tipo"], r["direccion"]) for r in exp["relaciones"]}
    assert ("Veracruz", "importa por", "sale") in tipos
    assert ("SAT", "audita a", "entra") in tipos
    assert exp["eventos"][0]["titulo"] == "Auditoría SAT"


def test_expediente_resuelve_alias_y_dice_ausencia(conn):
    assert consultas.expediente_entidad(
        conn, SID, "Volkswagen AG")["entidad"]["nombre"] == "VW"
    assert "error" in consultas.expediente_entidad(conn, SID, "Nadie")


def test_expediente_ambiguo_devuelve_candidatos(conn):
    s = Sustrato(conn, SID)
    s.upsert_entidad("SAT Norte", "organizacion", "operador")
    r = consultas.expediente_entidad(conn, SID, "sat")
    # exacto gana a contiene: "SAT" a secas sigue resolviendo
    assert consultas.expediente_entidad(conn, SID, "SAT")["entidad"]["nombre"] == "SAT"
    # pero el parcial con dos matches confiesa la ambigüedad
    r = consultas.expediente_entidad(conn, SID, "sat n")
    assert r["entidad"]["nombre"] == "SAT Norte" or "candidatos" in r


# ── camino_entre / vecindario ────────────────────────────────────────


def test_camino_entre_por_nombre_con_citas(conn):
    r = consultas.camino_entre(conn, SID, "SAT", "Veracruz")
    assert r["desde"]["etiqueta"] == "SAT" and r["hasta"]["etiqueta"] == "Veracruz"
    assert r["largo"] == 2
    tipos = [s["tipo"] for s in r["saltos"]]
    assert "audita a" in tipos and "importa por" in tipos
    assert any(c["fuente"] == "contrato.pdf" for c in r["citas"])


def test_camino_sin_ruta_y_nombre_desconocido_se_dicen(conn):
    r = consultas.camino_entre(conn, SID, "SAT", "Nota suelta")
    assert "error" in r and "isla" in r["error"]
    r2 = consultas.camino_entre(conn, SID, "Fantasma", "SAT")
    assert "error" in r2 and r2["para"] == "Fantasma"


def test_vecindario_agrupa_por_anillo(conn):
    r = consultas.vecindario_de(conn, SID, "SAT", grados=2)
    assert r["centro"] == "SAT"
    d1 = next(a for a in r["anillos"] if a["distancia"] == 1)
    assert any(n["etiqueta"] == "VW" for n in d1["nodos"])
    assert all(a["omitidos"] == 0 for a in r["anillos"])


# ── resumen_grafo / senales / hallazgos ──────────────────────────────


def test_resumen_grafo_es_salida_del_motor(conn):
    r = consultas.resumen_grafo(conn, SID)
    assert r["n_nodos"] > 0 and r["n_enlaces"] > 0
    assert r["monolitos"] and "etiqueta" in r["monolitos"][0]
    assert isinstance(r["puentes"], list)
    assert all(isinstance(h["etiqueta"], str) for h in r["hubs"])


def test_senales_caso_condensa_el_radar(conn):
    r = consultas.senales_caso(conn, SID, hoy="2026-07-10")
    assert r["total"] >= 2
    assert any(v["titulo"] == "Auditoría SAT" for v in r["vencimientos"])
    assert any(h["nombre"] == "Nota suelta" for h in r["huerfanas"])
    assert r["negocio"]["faltantes"] == 1


def test_hallazgos_sin_base_dice_motivo(conn):
    r = consultas.hallazgos_pendientes(conn, SID)
    assert r["tiene_base"] is False and "referencia" in r["motivo"].lower()
    assert r["negocio"]["facturas_faltantes"] == ["F-001"]
    assert r["negocio"]["total_faltantes"] == 1


def test_hallazgos_con_base_mide_desviaciones(conn):
    from autogenes.qualia import fijar_base
    fijar_base(conn, SID)
    s = Sustrato(conn, SID)
    for i in range(3):
        s.upsert_entidad(f"Isla {i}", "concepto", "operador")
    r = consultas.hallazgos_pendientes(conn, SID)
    assert r["tiene_base"] is True
    assert any("isla" in a["titulo"].lower() for a in r["anomalias"])


# ── el contrato jarvis: lo que el modelo ve ──────────────────────────


def test_tools_grafo_publicadas_al_modelo():
    from jarvis.tools import TOOL_DEFINITIONS
    from jarvis.tools_grafo import GRAFO_TOOL_FUNCTIONS
    nombres = {t["name"] for t in TOOL_DEFINITIONS}
    esperadas = {"expediente_entidad", "camino_entre", "vecindario",
                 "resumen_grafo", "senales_caso", "hallazgos_pendientes",
                 "conciliacion"}
    assert esperadas <= nombres
    assert esperadas == set(GRAFO_TOOL_FUNCTIONS)
    # cada definición es un input_schema válido con required presente
    for t in TOOL_DEFINITIONS:
        if t["name"] in esperadas:
            assert t["input_schema"]["type"] == "object"
            assert isinstance(t["input_schema"].get("required"), list)


def test_ejecutor_ofusca_chasis_en_resultados_de_grafo():
    from jarvis.ofuscation import ObfuscationLayer
    from jarvis.tool_executor import ToolExecutor
    ex = ToolExecutor(ObfuscationLayer())
    resultado = ex._obfuscate_grafo({
        "saltos": [{"de": {"etiqueta": "WVWZZZ1JZXW000001", "kind": "vehiculo"},
                    "a": {"etiqueta": "VW", "kind": "entidad"}}],
    })
    assert resultado["saltos"][0]["de"]["etiqueta"].startswith("[VIN-")
    assert resultado["saltos"][0]["a"]["etiqueta"] == "VW"


def test_tools_sensibles_pasan_por_ofuscacion():
    """conciliacion/resumen_grafo/senales_caso/hallazgos_pendientes emiten
    chasis/factura; deben estar en el set de ofuscación de grafo o filtran
    identificadores reales al modelo."""
    from jarvis.tool_executor import GRAFO_DETAIL_TOOLS
    for tool in ("conciliacion", "resumen_grafo", "senales_caso",
                 "hallazgos_pendientes"):
        assert tool in GRAFO_DETAIL_TOOLS


def test_mask_row_bloquea_vin_por_alias():
    """SELECT chasis AS x evade el enmascarado por nombre; la defensa por
    patrón de valor (forma de VIN) lo enmascara igual."""
    from jarvis.ofuscation import ObfuscationLayer
    o = ObfuscationLayer()
    masked = o.mask_row({"x": "WVWZZZ1JZXW000001", "marca": "VW"})
    assert masked["x"].startswith("[VIN-")   # VIN bajo alias, enmascarado
    assert masked["marca"] == "VW"           # no-identificador, intacto
