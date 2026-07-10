"""Metabolismo del caso — la vía de producción de conocimiento del
sustrato vista como una red metabólica con análisis de balance (FBA).

La vía real, no metafórica:

    Fuente → Fragmento → Entidad → Relación → Producto

Cada unión es una reacción con dos estados (el pre/post de un FBA):
- **potencial** (pre): el sustrato que ENTRÓ al pool (capacidad de metabolizar).
- **realizado** (post): el que efectivamente FLUYÓ a la etapa siguiente.
- **fuga** = potencial − realizado: el sustrato sin metabolizar, que es
  exactamente una señal accionable del negocio:
    · Extracción (Fragmento→Entidad): fuga = fuentes frías (documentos
      cargados que nadie convirtió en conocimiento).
    · Vinculación (Entidad→Relación): fuga = entidades huérfanas.
    · Síntesis (Entidad→Producto): fuga = conocimiento sin destilar.

`salud` = flujo realizado / potencial, promediado sobre las uniones con
sustrato — el rendimiento metabólico del caso (0–100).

Las alertas temporales/de negocio (vencimientos, faltantes, errores) NO
viven en esta vía: se devuelven aparte, para el riel de urgencia lateral.
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
        {"clave": "fragmentacion", "nombre": "Fragmentación",
         "de": "fuente", "a": "fragmento",
         "potencial": fragmentos, "realizado": fragmentos, "fuga": 0, "items": []},
        {"clave": "extraccion", "nombre": "Extracción",
         "de": "fragmento", "a": "entidad",
         "potencial": fragmentos, "realizado": len(frag_citados),
         "fuga": fragmentos - len(frag_citados),
         "items": sen["fuentes_frias"], "senal": "fuentes frías",
         "accion": "/autogenes/ingesta"},
        {"clave": "vinculacion", "nombre": "Vinculación",
         "de": "entidad", "a": "relacion",
         "potencial": entidades, "realizado": len(ent_conectadas),
         "fuga": entidades - len(ent_conectadas),
         "items": sen["huerfanas"], "senal": "huérfanas",
         "accion": "/autogenes/vinculos"},
        {"clave": "sintesis", "nombre": "Síntesis",
         "de": "entidad", "a": "producto",
         "potencial": entidades, "realizado": len(ent_en_producto),
         "fuga": entidades - len(ent_en_producto),
         "items": [], "senal": "sin destilar",
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
    for v in sen["vencimientos"]:
        urgencias.append({"tipo": "vencimiento", "titulo": v["titulo"],
                          "sub": v["fecha"] + " · en " + str(v["dias"]) + " días",
                          "critico": v["dias"] <= 7, "accion": None})
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

    return {
        "session_id": session_id,
        "hoy": sen["hoy"],
        "salud": salud,
        "pools": pools,
        "reacciones": reacciones,
        "urgencias": urgencias,
        "total_fugas": sum(r["fuga"] for r in reacciones),
    }
