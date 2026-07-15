"""Avance del caso — cuánto de lo que entra a cada etapa del
procesamiento se aprovecha y cuánto queda pendiente.

Las etapas, en orden:

    Fuente → Fragmento → Entidad → Relación → Producto

Cada etapa reporta:
- **recibido**: lo que entró a la etapa.
- **procesado**: lo que pasó a la etapa siguiente.
- **pendiente** = recibido − procesado: lo que falta por resolver, que
  es una tarea accionable:
    · Extracción (Fragmento→Entidad): documentos sin leer.
    · Vinculación (Entidad→Relación): entidades sin conectar.
    · Síntesis (Entidad→Producto): entidades sin informe.

`salud` = procesado / recibido, promediado sobre las etapas con trabajo
= el avance global del caso (0–100).

Las alertas de tiempo y de negocio (vencimientos, faltantes, errores) no
son parte del avance por etapas: se devuelven aparte, para el riel lateral.
"""
import json
import sqlite3
from typing import Any, Optional

from autogenes.senales import senales_de_sesion


def _ids_evidencia(conn: sqlite3.Connection, tabla: str, columna: str,
                   session_id: int) -> set[str]:
    ids: set[str] = set()
    for r in conn.execute(
        f"SELECT {columna} FROM {tabla} WHERE session_id = ?", (session_id,)  # noqa: S608
    ):
        ids.update(json.loads(r[columna] or "[]"))
    return ids


def _count(conn: sqlite3.Connection, tabla: str, session_id: int) -> int:
    return conn.execute(
        f"SELECT COUNT(*) FROM {tabla} WHERE session_id = ?", (session_id,)  # noqa: S608
    ).fetchone()[0]


def _salud_de_sesion(conn: sqlite3.Connection, session_id: int) -> Optional[int]:
    """Solo el avance (0-100) de una sesión — misma fórmula que abajo, para
    el benchmark. Media de procesado/potencial sobre las uniones de
    conocimiento con sustrato; None si no hay sustrato."""
    fragmentos = _count(conn, "ag_fragmentos", session_id)
    entidades = _count(conn, "ag_entidades", session_id)
    frag_reales = {r["id"] for r in conn.execute(
        "SELECT id FROM ag_fragmentos WHERE session_id = ?", (session_id,))}
    frag_citados = _ids_evidencia(conn, "ag_entidades", "evidencia", session_id) & frag_reales
    conectadas = {r[0] for r in conn.execute(
        "SELECT desde_id FROM ag_relaciones WHERE session_id = ?"
        " UNION SELECT hasta_id FROM ag_relaciones WHERE session_id = ?",
        (session_id, session_id))}
    ent_reales = {r["id"] for r in conn.execute(
        "SELECT id FROM ag_entidades WHERE session_id = ?", (session_id,))}
    ent_conectadas = conectadas & ent_reales
    ent_en_producto = _ids_evidencia(conn, "ag_productos", "entidades", session_id) & ent_reales
    partes = []
    if fragmentos:
        partes.append(len(frag_citados) / fragmentos)
    if entidades:
        partes.append(len(ent_conectadas) / entidades)
        partes.append(len(ent_en_producto) / entidades)
    return round(100 * sum(partes) / len(partes)) if partes else None


def metabolismo_de_sesion(conn: sqlite3.Connection, session_id: int,
                          hoy: Optional[str] = None) -> dict[str, Any]:
    artefactos = _count(conn, "ag_artefactos", session_id)
    fragmentos = _count(conn, "ag_fragmentos", session_id)
    entidades = _count(conn, "ag_entidades", session_id)
    relaciones = _count(conn, "ag_relaciones", session_id)
    productos = _count(conn, "ag_productos", session_id)

    frag_reales = {r["id"] for r in conn.execute(
        "SELECT id FROM ag_fragmentos WHERE session_id = ?", (session_id,))}
    frag_citados = _ids_evidencia(conn, "ag_entidades", "evidencia", session_id) & frag_reales

    conectadas = {r[0] for r in conn.execute(
        "SELECT desde_id FROM ag_relaciones WHERE session_id = ?"
        " UNION SELECT hasta_id FROM ag_relaciones WHERE session_id = ?",
        (session_id, session_id))}
    ent_reales = {r["id"] for r in conn.execute(
        "SELECT id FROM ag_entidades WHERE session_id = ?", (session_id,))}
    ent_conectadas = conectadas & ent_reales
    ent_en_producto = _ids_evidencia(conn, "ag_productos", "entidades", session_id) & ent_reales

    sen = senales_de_sesion(conn, session_id, hoy)

    pools = [
        {"kind": "fuente", "nombre": "FUENTES", "total": artefactos},
        {"kind": "fragmento", "nombre": "FRAGMENTOS", "total": fragmentos},
        {"kind": "entidad", "nombre": "ENTIDADES", "total": entidades},
        {"kind": "relacion", "nombre": "RELACIONES", "total": relaciones},
        {"kind": "producto", "nombre": "PRODUCTOS", "total": productos},
    ]

    # uniones (reacciones). Las mecánicas (ingesta, fragmentación) no fugan;
    # las de conocimiento sí, y su fuga ES la señal.
    reacciones = [
        {"clave": "fragmentacion", "nombre": "Lectura",
         "de": "fuente", "a": "fragmento",
         "potencial": fragmentos, "realizado": fragmentos, "fuga": 0, "items": []},
        {"clave": "extraccion", "nombre": "Extracción",
         "de": "fragmento", "a": "entidad",
         "potencial": fragmentos, "realizado": len(frag_citados),
         "fuga": fragmentos - len(frag_citados),
         "items": sen["fuentes_frias"], "senal": "sin leer",
         "accion": "/autogenes/ingesta"},
        {"clave": "vinculacion", "nombre": "Vinculación",
         "de": "entidad", "a": "relacion",
         "potencial": entidades, "realizado": len(ent_conectadas),
         "fuga": entidades - len(ent_conectadas),
         "items": sen["huerfanas"], "senal": "sin conectar",
         "accion": "/autogenes/vinculos"},
        {"clave": "sintesis", "nombre": "Síntesis",
         "de": "entidad", "a": "producto",
         "potencial": entidades, "realizado": len(ent_en_producto),
         "fuga": entidades - len(ent_en_producto),
         "items": [], "senal": "sin informe",
         "accion": "/autogenes/sintesis"},
    ]

    with_sustrato = [r for r in reacciones
                     if r["clave"] != "fragmentacion" and r["potencial"] > 0]
    if with_sustrato:
        salud = round(100 * sum(r["realizado"] / r["potencial"] for r in with_sustrato)
                      / len(with_sustrato))
    else:
        salud = None

    urgencias = []
    # anomalías Qualia primero: una desviación medida es lo más accionable
    for a in sen.get("anomalias", []):
        urgencias.append({"tipo": "anomalia", "titulo": a["titulo"],
                          "sub": "severidad " + str(round(a["severidad"] * 100)) + "%",
                          "critico": a["severidad"] >= 0.5,
                          "accion": "/autogenes/qualia/terreno"})
    # Deriva entre sesiones (Q5): el caso cambió respecto a la sesión previa.
    d = sen.get("deriva")
    if d and (d["n_hallazgos"] or abs(d["delta_conceptos"]) >= 5
              or d["cohesion"] != "estable"):
        detalle = ("+" if d["delta_conceptos"] >= 0 else "") + \
            str(d["delta_conceptos"]) + " conceptos · el caso se " + d["cohesion"]
        urgencias.append({"tipo": "deriva",
                          "titulo": "Derivó desde " + d["de"],
                          "sub": detalle,
                          "critico": d["cohesion"] == "fragmentó" or d["n_hallazgos"] >= 3,
                          "accion": "/autogenes/qualia/deriva"})
    for v in sen["vencimientos"]:
        urgencias.append({"tipo": "vencimiento", "titulo": v["titulo"],
                          "sub": v["fecha"] + " · en " + str(v["dias"]) + " días",
                          "critico": v["dias"] <= 7, "accion": None,
                          # el id del evento habilita "Resolver" inline (T2)
                          "id": v["id"]})
    if sen["negocio"]["faltantes"]:
        urgencias.append({"tipo": "negocio",
                          "titulo": str(sen["negocio"]["faltantes"]) + " facturas faltantes",
                          "sub": "sin conciliar", "critico": True,
                          "accion": "/autogenes/concilia"})
    if sen["negocio"]["errores"]:
        urgencias.append({"tipo": "negocio",
                          "titulo": str(sen["negocio"]["errores"]) + " registros con error",
                          "sub": "curación pendiente", "critico": True,
                          "accion": "/errores"})

    # VALIDACIÓN (F10) publica al Radar: filas contra la norma. Crítico
    # solo cuando hay preferencia contra la norma — eso es glosa segura.
    from autogenes.validacion import validar
    val = validar(conn, session_id)
    if val["total_violaciones"]:
        glosa = any(r["n"] and r["clave"].endswith("jn-norma")
                    for r in val["reglas"])
        urgencias.append({
            "tipo": "norma",
            "titulo": str(val["total_violaciones"]) + " violaciones de norma",
            "sub": ("preferencia contra la norma — glosa segura" if glosa
                    else "conformidad " + str(val["conformidad_pct"]) + "%"),
            "critico": glosa,
            "accion": "/autogenes/validacion",
        })

    # Benchmark honesto: el avance de la sesión previa (misma fórmula). Sin
    # sesión previa → None (se declara "sin base previa", no se inventa).
    benchmark = None
    prev = conn.execute(
        "SELECT id FROM processing_sessions WHERE id < ? ORDER BY id DESC LIMIT 1",
        (session_id,)).fetchone()
    if prev is not None and salud is not None:
        prev_salud = _salud_de_sesion(conn, prev["id"])
        if prev_salud is not None:
            benchmark = {"prev_id": prev["id"], "prev_salud": prev_salud,
                         "delta": salud - prev_salud}

    return {
        "session_id": session_id,
        "hoy": sen["hoy"],
        "salud": salud,
        "benchmark": benchmark,
        "pools": pools,
        "reacciones": reacciones,
        "urgencias": urgencias,
        "total_fugas": sum(r["fuga"] for r in reacciones),
    }
