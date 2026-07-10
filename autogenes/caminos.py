"""Caminos sobre el grafo del caso — port de capacidades/caminos.ts
sobre la lente NetworkX (autogenes/red.py).

Tres primitivas puras de lectura:
- camino_mas_corto: la ruta entre dos nodos, cada salto con su arista
  tipada, dirección y las citas (fragmentos) que la sostienen.
- vecindario: los nodos a <= N grados de una semilla, agrupados por
  distancia.
- mas_conectadas: los hubs del caso por grado (excluye el ruido de
  vehículos/fragmentos por defecto).

El dockeo del camino como Producto pasa por Sustrato (la única puerta
de escritura); aquí solo se construye el cuerpo CaminoGuardado.
"""
import json
import sqlite3
from typing import Any, Optional

import networkx as nx

from autogenes.red import red_de_sesion


def _evidencias_de_relaciones(conn: sqlite3.Connection, ids: list[str]) -> dict[str, list[str]]:
    if not ids:
        return {}
    marcadores = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT id, evidencia FROM ag_relaciones WHERE id IN ({marcadores})", ids  # noqa: S608
    ).fetchall()
    return {r["id"]: json.loads(r["evidencia"] or "[]") for r in rows}


def _mejor_arista(red: nx.MultiDiGraph, a: str, b: str) -> Optional[dict[str, Any]]:
    """La arista más informativa entre dos nodos, sin importar dirección:
    relación tipada antes que cita estructural; mayor peso gana."""
    candidatas = []
    for (u, v) in ((a, b), (b, a)):
        datos = red.get_edge_data(u, v) or {}
        for clave, attrs in datos.items():
            candidatas.append({
                "id": clave,
                "kind": attrs.get("kind"),
                "tipo": attrs.get("tipo"),
                "peso": attrs.get("peso", 0.5),
                "desde": u,
                "hasta": v,
            })
    if not candidatas:
        return None
    candidatas.sort(key=lambda c: (c["kind"] == "relacion", c["peso"]), reverse=True)
    return candidatas[0]


def _nodo(red: nx.MultiDiGraph, nid: str) -> dict[str, Any]:
    n = red.nodes[nid]
    return {"id": nid, "etiqueta": n.get("etiqueta"), "kind": n.get("kind"),
            "tipo": n.get("tipo")}


def camino_mas_corto(conn: sqlite3.Connection, session_id: int,
                     desde_id: str, hasta_id: str) -> Optional[dict[str, Any]]:
    red = red_de_sesion(conn, session_id)
    if desde_id not in red or hasta_id not in red:
        return None
    plano = red.to_undirected(as_view=True)

    # Las relaciones tipadas pesan menos que las citas estructurales: a
    # igual largo, el camino narrativo (quién-garantiza-a-quién) gana.
    # OJO: en un MultiGraph, networkx entrega {clave: atributos} de TODAS
    # las aristas paralelas — el costo es el mínimo entre ellas.
    def costo(_u, _v, multi):
        return min(
            (1.0 if a.get("kind") == "relacion" else 1.6 for a in multi.values()),
            default=1.6,
        )

    try:
        ruta = nx.shortest_path(plano, desde_id, hasta_id, weight=costo)
    except nx.NetworkXNoPath:
        return None

    saltos = []
    ids_relacion = []
    for a, b in zip(ruta, ruta[1:]):
        arista = _mejor_arista(red, a, b) or {}
        if arista.get("kind") == "relacion":
            ids_relacion.append(arista["id"])
        saltos.append({"de": _nodo(red, a), "a": _nodo(red, b), "arista": arista})

    evidencias = _evidencias_de_relaciones(conn, ids_relacion)
    for s in saltos:
        s["evidencia"] = evidencias.get(s["arista"].get("id"), [])

    return {
        "desde": _nodo(red, desde_id),
        "hasta": _nodo(red, hasta_id),
        "largo": len(saltos),
        "saltos": saltos,
        "evidencia": sorted({e for s in saltos for e in s["evidencia"]}),
    }


def vecindario(conn: sqlite3.Connection, session_id: int,
               nodo_id: str, grados: int = 2) -> Optional[dict[str, Any]]:
    red = red_de_sesion(conn, session_id)
    if nodo_id not in red:
        return None
    plano = red.to_undirected(as_view=True)
    distancias = nx.single_source_shortest_path_length(plano, nodo_id, cutoff=grados)
    anillos: dict[int, list[dict]] = {}
    for nid, d in distancias.items():
        if nid == nodo_id:
            continue
        anillos.setdefault(d, []).append(_nodo(red, nid))
    for d in anillos:
        anillos[d].sort(key=lambda n: (n["kind"], n["etiqueta"] or ""))
    return {
        "centro": _nodo(red, nodo_id),
        "grados": grados,
        "anillos": [{"distancia": d, "nodos": anillos[d]} for d in sorted(anillos)],
        "total": sum(len(v) for v in anillos.values()),
    }


KINDS_RUIDO = {"vehiculo", "fragmento"}


def mas_conectadas(conn: sqlite3.Connection, session_id: int, top: int = 10,
                   incluir_ruido: bool = False) -> list[dict[str, Any]]:
    red = red_de_sesion(conn, session_id)
    plano = red.to_undirected(as_view=True)
    hubs = []
    for nid, grado in plano.degree():
        n = red.nodes[nid]
        if not incluir_ruido and n.get("kind") in KINDS_RUIDO:
            continue
        hubs.append({**_nodo(red, nid), "grado": grado})
    hubs.sort(key=lambda h: h["grado"], reverse=True)
    return hubs[:top]


def cuerpo_camino_guardado(camino: dict[str, Any]) -> dict[str, Any]:
    """El Producto{clase:'camino'}: snapshot citado, componible por
    cualquier unidad A TRAVÉS del sustrato (ley E3)."""
    return {
        "desde": camino["desde"]["etiqueta"],
        "hasta": camino["hasta"]["etiqueta"],
        "largo": camino["largo"],
        "saltos": [
            {
                "de": s["de"]["etiqueta"],
                "a": s["a"]["etiqueta"],
                "tipo": s["arista"].get("tipo") or s["arista"].get("kind"),
                "evidencia": s["evidencia"],
            }
            for s in camino["saltos"]
        ],
    }
