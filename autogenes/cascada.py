"""QUALIA simulated cascade (F7c) — DECIDIR's honest core.

Python port of ref_karelen/capacidades/cascada.ts; spec is
tests/test_cascada.py (1:1 with cascada.test.ts).

The what-if never predicts the world: it simulates the operator's OWN
network under its own connectivity laws, entirely in memory. Two
directions of Boyd: destructive deduction (what falls apart if X falls)
and creative induction (what comes together if A links B). The
wavefront steps feed the light-pulse animation — the visual IS the
computation. Pure; nothing writes.
"""
from typing import Any, Optional

from autogenes.topologia import Red, contar_componentes, grado_ponderado


def onda_desde(red: Red, origen_id: str, max_pasos: int = 6) -> list[list[str]]:
    """BFS wavefront from an origin: node ids reached at each step."""
    ady: dict[str, list[str]] = {n["id"]: [] for n in red["nodos"]}
    for e in red["enlaces"]:
        if e["origen"] == e["destino"]:
            continue
        if e["origen"] in ady and e["destino"] in ady:
            ady[e["origen"]].append(e["destino"])
            ady[e["destino"]].append(e["origen"])
    if origen_id not in ady:
        return []
    visitado = {origen_id}
    pasos = [[origen_id]]
    frente = [origen_id]
    for _ in range(max_pasos):
        if not frente:
            break
        siguiente: list[str] = []
        for nid in frente:
            for nb in ady.get(nid, []):
                if nb in visitado:
                    continue
                visitado.add(nb)
                siguiente.append(nb)
        if siguiente:
            pasos.append(sorted(siguiente))
        frente = siguiente
    return pasos


def simular_caida(red: Red, nodo_id: str) -> dict[str, Any]:
    """Destructive deduction: remove the node IN MEMORY and measure what
    its absence does to connectivity — dead edges, orphaned neighbours,
    islands before/after, and the share of structure it carried."""
    existe = any(n["id"] == nodo_id for n in red["nodos"])
    if not existe:
        islas = contar_componentes(red)
        return {"ondas": [], "relaciones_caidas": 0, "desconectados": [],
                "islas_antes": islas, "islas_despues": islas,
                "peso_estructural": 0.0}
    ondas = onda_desde(red, nodo_id)
    islas_antes = contar_componentes(red)

    sin_nodo: Red = {
        "nodos": [n for n in red["nodos"] if n["id"] != nodo_id],
        "enlaces": [e for e in red["enlaces"]
                    if e["origen"] != nodo_id and e["destino"] != nodo_id],
    }
    relaciones_caidas = len(red["enlaces"]) - len(sin_nodo["enlaces"])
    islas_despues = contar_componentes(sin_nodo)

    # Orphans: former neighbours whose degree drops to zero without it.
    grado_despues = grado_ponderado(sin_nodo)
    vecinos: set[str] = set()
    for e in red["enlaces"]:
        if e["origen"] == nodo_id:
            vecinos.add(e["destino"])
        if e["destino"] == nodo_id:
            vecinos.add(e["origen"])
    etiqueta_de = {n["id"]: n["etiqueta"] for n in red["nodos"]}
    desconectados = [
        {"id": v, "etiqueta": etiqueta_de.get(v, v)}
        for v in sorted(vecinos) if grado_despues.get(v, 0) == 0
    ]

    grado = grado_ponderado(red)
    total = sum(grado.values())
    peso = (grado.get(nodo_id, 0.0) / total) if total > 0 else 0.0

    return {"ondas": ondas, "relaciones_caidas": relaciones_caidas,
            "desconectados": desconectados, "islas_antes": islas_antes,
            "islas_despues": islas_despues, "peso_estructural": peso}


def simular_enlace(red: Red, a_id: str, b_id: str) -> dict[str, Any]:
    """Creative induction: add the link A—B IN MEMORY and measure what
    comes together — islands fusing, the path collapsing to one hop, and
    how many nodes suddenly sit near. Making it real goes through the
    additive-plan gate; this only simulates."""
    islas_antes = contar_componentes(red)
    pasos_a = onda_desde(red, a_id, 32)
    saltos_antes: Optional[int] = None
    for k, paso in enumerate(pasos_a):
        if b_id in paso:
            saltos_antes = k
            break

    con_enlace: Red = {
        "nodos": red["nodos"],
        "enlaces": [*red["enlaces"], {"origen": a_id, "destino": b_id, "peso": 1}],
    }
    islas_despues = contar_componentes(con_enlace)

    cerca_antes = {nid for paso in pasos_a[:3] for nid in paso}
    pasos_despues = onda_desde(con_enlace, a_id, 32)
    cerca_despues = {nid for paso in pasos_despues[:3] for nid in paso}
    acercados = 0
    for nid in cerca_despues:
        if nid in cerca_antes:
            continue
        antes: Optional[int] = None
        for k, paso in enumerate(pasos_a):
            if nid in paso:
                antes = k
                break
        if antes is None or antes > 3:
            acercados += 1

    return {"fusiona_islas": islas_despues < islas_antes,
            "islas_antes": islas_antes, "islas_despues": islas_despues,
            "saltos_antes": saltos_antes, "acercados": acercados}
