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
    # desempate por tipo: sin él, entre aristas paralelas de igual kind/peso
    # ganaría el orden de iteración de networkx (dependiente de inserción)
    candidatas.sort(
        key=lambda c: (c["kind"] == "relacion", c["peso"], str(c.get("tipo") or "")),
        reverse=True)
    return candidatas[0]


def _nodo(red: nx.MultiDiGraph, nid: str) -> dict[str, Any]:
    n = red.nodes[nid]
    return {"id": nid, "etiqueta": n.get("etiqueta"), "kind": n.get("kind"),
            "tipo": n.get("tipo")}


# Las relaciones tipadas pesan menos que las citas estructurales: a igual
# largo, el camino narrativo (quién-garantiza-a-quién) gana. OJO: en un
# MultiGraph, networkx entrega {clave: atributos} de TODAS las aristas
# paralelas — el costo es el mínimo entre ellas.
def _costo(_u, _v, multi):
    return min(
        (1.0 if a.get("kind") == "relacion" else 1.6 for a in multi.values()),
        default=1.6,
    )


def _camino_de_ruta(conn: sqlite3.Connection, red: nx.MultiDiGraph,
                    ruta: list[str], metodo: Optional[str] = None) -> dict[str, Any]:
    """Construye el camino citado a partir de una secuencia de nodos: cada
    salto con su mejor arista tipada y las citas que la sostienen."""
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
    camino = {
        "desde": _nodo(red, ruta[0]),
        "hasta": _nodo(red, ruta[-1]),
        "largo": len(saltos),
        "saltos": saltos,
        "evidencia": sorted({e for s in saltos for e in s["evidencia"]}),
    }
    if metodo:
        camino["metodo"] = metodo
    return camino


def camino_mas_corto(conn: sqlite3.Connection, session_id: int,
                     desde_id: str, hasta_id: str) -> Optional[dict[str, Any]]:
    red = red_de_sesion(conn, session_id)
    if desde_id not in red or hasta_id not in red:
        return None
    plano = red.to_undirected(as_view=True)
    try:
        ruta = nx.shortest_path(plano, desde_id, hasta_id, weight=_costo)
    except nx.NetworkXNoPath:
        return None
    return _camino_de_ruta(conn, red, ruta)


def caminos(conn: sqlite3.Connection, session_id: int, desde_id: str,
            hasta_id: str, k: int = 3, evitar: Optional[str] = None,
            via: Optional[str] = None) -> list[dict[str, Any]]:
    """Hasta K caminos ALTERNATIVOS entre dos nodos, cada uno con su método
    declarado. Son alternativas TOPOLÓGICAS (por costo de aristas), no por
    volumen: la red de evidencia no lleva volumen medido — ese vive en la red
    de flujo (analisis_vw), así que aquí sería inventarlo. Opciones:
    - `evitar`: recomputa quitando un nodo (¿sobrevive el vínculo si cae?).
    - `via`: fuerza el paso por un nodo (concatena dos caminos más cortos).
    Devuelve [] si no hay camino."""
    import itertools

    red = red_de_sesion(conn, session_id)
    if desde_id not in red or hasta_id not in red:
        return []
    # shortest_simple_paths NO admite MultiGraph: se colapsa a un grafo simple
    # con el costo MÍNIMO entre aristas paralelas (misma regla que _costo).
    simple = nx.Graph()
    simple.add_nodes_from(red.nodes())
    for u, v, data in red.to_undirected(as_view=True).edges(data=True):
        w = 1.0 if data.get("kind") == "relacion" else 1.6
        if simple.has_edge(u, v):
            simple[u][v]["w"] = min(simple[u][v]["w"], w)
        else:
            simple.add_edge(u, v, w=w)
    # el método declarado debe reflejar lo que REALMENTE pasó: un evitar que no
    # está en el grafo (o que es un extremo) no quita nada, y etiquetarlo
    # "evitando un nodo" sería mentir sobre el cómputo
    quito_nodo = bool(evitar) and evitar in simple and evitar not in (desde_id, hasta_id)
    if quito_nodo:
        simple = simple.subgraph([n for n in simple if n != evitar])

    if via and via in simple and via not in (desde_id, hasta_id):
        try:
            r1 = nx.shortest_path(simple, desde_id, via, weight="w")
            r2 = nx.shortest_path(simple, via, hasta_id, weight="w")
        except nx.NetworkXNoPath:
            return []
        etq = (red.nodes[via].get("etiqueta") or via)
        return [_camino_de_ruta(conn, red, r1 + r2[1:], f"forzado por {etq}")]

    try:
        gen = nx.shortest_simple_paths(simple, desde_id, hasta_id, weight="w")
        rutas = list(itertools.islice(gen, max(1, k)))
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return []
    base = "evitando un nodo" if quito_nodo else "topológico"
    salida = []
    for i, ruta in enumerate(rutas):
        metodo = (f"más corto ({base})" if i == 0
                  else f"alternativa {i + 1} ({base})")
        salida.append(_camino_de_ruta(conn, red, ruta, metodo))
    return salida


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
    # -grado, luego id: sin el desempate por id, hubs de igual grado dependían
    # del orden de inserción de nodos en networkx para sobrevivir el [:top]
    hubs.sort(key=lambda h: (-h["grado"], h["id"]))
    return hubs[:top]


def comparar_caminos(lista: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Anota cada camino con su lectura comparativa contra el más corto (el
    primero): saltos, citas totales, y el SOLAPE de aristas (Jaccard) — 1.0 es
    la misma ruta, 0.0 es disjunta (una vía verdaderamente independiente). Puro
    y determinista; no mide volumen (la red de evidencia no lo lleva)."""
    if not lista:
        return lista

    def aristas(cam: dict) -> set:
        return {s["arista"].get("id") for s in cam["saltos"] if s["arista"].get("id")}

    ref = aristas(lista[0])
    for cam in lista:
        e = aristas(cam)
        union = ref | e
        cam["comparacion"] = {
            "saltos": cam["largo"],
            "citas": len(cam["evidencia"]),
            "solape_con_mas_corto": round(len(ref & e) / len(union), 3) if union else 1.0,
        }
    return lista


def anotar_volumen_extremos(lista: list[dict[str, Any]],
                            volumenes: dict[str, dict]) -> list[dict[str, Any]]:
    """Anota los extremos país/marca de cada camino con su volumen MEDIDO en la
    sesión (filas de flujo) como CONTEXTO citado — jamás como costo de la ruta.
    La red de evidencia no lleva volumen; esto solo dice cuánto mueve ese nodo
    y de dónde sale el dato. Un extremo que no es país/marca no se anota."""
    por_pais = volumenes.get("pais", {})
    por_marca = volumenes.get("marca", {})
    for cam in lista:
        for extremo in ("desde", "hasta"):
            n = cam.get(extremo)
            if not n:
                continue
            vol = None
            if n.get("kind") == "pais":
                vol = por_pais.get(n.get("etiqueta"))
            elif n.get("kind") == "marca":
                vol = por_marca.get(n.get("etiqueta"))
            if vol is not None:
                n["volumen"] = {"unidades": vol,
                                "fuente": "filas de flujo medidas de la sesión"}
    return lista


def cuerpo_camino_guardado(camino: dict[str, Any]) -> dict[str, Any]:
    """El Producto{clase:'camino'}: snapshot citado, componible por
    cualquier unidad A TRAVÉS del sustrato (ley E3)."""
    return {
        "desde": camino["desde"]["etiqueta"],
        "hasta": camino["hasta"]["etiqueta"],
        "largo": camino["largo"],
        "saltos": [_salto_orientado(s) for s in camino["saltos"]],
    }


def _salto_orientado(s: dict[str, Any]) -> dict[str, Any]:
    """Aplana un salto respetando la orientación REAL de una relación tipada.
    El recorrido es no-dirigido (alcanzabilidad), pero un verbo dirigido
    ('opera en') debe leerse en el sentido de la arista (desde→hasta), no en
    el de la marcha: aplanarlo al orden de marcha afirmaría la relación
    invertida en un Producto citado y bitacorado (WORM)."""
    de, a = s["de"], s["a"]
    arista = s["arista"]
    if (arista.get("kind") == "relacion" and arista.get("desde")
            and arista["desde"] != de["id"]):
        de, a = a, de
    return {
        "de": de["etiqueta"],
        "a": a["etiqueta"],
        "tipo": arista.get("tipo") or arista.get("kind"),
        "evidencia": s["evidencia"],
    }
