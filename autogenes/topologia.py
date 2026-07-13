"""QUALIA topology engine (F7a) — pure, deterministic, source-agnostic.

Python port of ref_karelen/capacidades/signature.ts; the behaviour spec
is tests/test_topologia.py (1:1 with signature.test.ts). It takes a
generic weighted network — whatever an adapter projects into a RedSig
dict — and derives its structure: communities, a community-respecting
order, the adjacency matrix, the renormalization ladder, articulation
bridges, the degree law, H0 persistence, the Fiedler embedding and
eigenvector centrality. Independent of the AUTOGENES substrate: it
knows nothing about artefactos, fragmentos or sessions — only nodes,
weighted edges and the maths over them.

Deliberately dependency-free (no NetworkX/numpy here): the substrate's
NetworkX lens serves session queries; THIS engine must be exactly
deterministic across runs and platforms because its numbers feed the
narrative digest, whose citation law demands reproducible facts.

Contract (JSON-ready dicts, like proyeccion.py):
  nodo   = {"id": str, "etiqueta": str, "tipo"?: str, "peso"?: float}
  enlace = {"origen": str, "destino": str, "peso": float > 0}
  red    = {"nodos": [nodo], "enlaces": [enlace]}
"""
import json
import math
from collections import deque
from typing import Any, Optional

Red = dict[str, list]


def _clave_par(a: str, b: str) -> tuple[str, str, str]:
    """Canonical undirected-pair key. JSON-encoded so a node id may
    contain ANY character without the key colliding; the endpoints also
    travel in the value — nothing is ever recovered by splitting."""
    origen, destino = (a, b) if a < b else (b, a)
    return json.dumps([origen, destino]), origen, destino


def grado_ponderado(red: Red) -> dict[str, float]:
    """Weighted degree per node id (isolated nodes included at 0)."""
    grado: dict[str, float] = {n["id"]: 0.0 for n in red["nodos"]}
    for e in red["enlaces"]:
        if e["origen"] in grado:
            grado[e["origen"]] += e["peso"]
        if e["destino"] in grado:
            grado[e["destino"]] += e["peso"]
    return grado


def _adyacencia(red: Red) -> dict[str, list[tuple[str, float]]]:
    """Adjacency as weighted neighbour lists (undirected, no self-loops)."""
    ady: dict[str, list[tuple[str, float]]] = {n["id"]: [] for n in red["nodos"]}
    for e in red["enlaces"]:
        if e["origen"] == e["destino"]:
            continue
        if e["origen"] in ady and e["destino"] in ady:
            ady[e["origen"]].append((e["destino"], e["peso"]))
            ady[e["destino"]].append((e["origen"], e["peso"]))
    return ady


def detectar_comunidades(red: Red, max_iter: int = 24) -> dict[str, int]:
    """Community detection by label propagation. Deterministic: nodes are
    visited in sorted-id order, each adopts the highest weighted-label
    among its neighbours, ties broken by the lexicographically smallest
    label. Async (in-place) updates converge fast; a hard iteration cap
    guarantees termination even on oscillating topologies. Returns a
    dense community index per node id (0..k-1, by first appearance)."""
    ids = sorted(n["id"] for n in red["nodos"])
    ady = _adyacencia(red)
    etiqueta = {i: i for i in ids}

    for _ in range(max_iter):
        cambio = False
        for nid in ids:
            vecinos = ady.get(nid)
            if not vecinos:
                continue
            tally: dict[str, float] = {}
            for nb, peso in vecinos:
                lab = etiqueta[nb]
                tally[lab] = tally.get(lab, 0.0) + peso
            mejor = etiqueta[nid]
            mejor_peso = -1.0
            for lab, peso in tally.items():
                if peso > mejor_peso or (peso == mejor_peso and lab < mejor):
                    mejor, mejor_peso = lab, peso
            if mejor != etiqueta[nid]:
                etiqueta[nid] = mejor
                cambio = True
        if not cambio:
            break

    indice: dict[str, int] = {}
    comunidad: dict[str, int] = {}
    for nid in ids:
        lab = etiqueta[nid]
        if lab not in indice:
            indice[lab] = len(indice)
        comunidad[nid] = indice[lab]
    return comunidad


def ordenar_por_comunidad(red: Red, comunidad: dict[str, int]) -> list[str]:
    """Node id order that groups communities together — the shared
    backbone for the chord (sector order) and the matrix (row/col
    order). Larger communities first; within one, higher weighted
    degree first; ties by id."""
    grado = grado_ponderado(red)
    tamano: dict[int, int] = {}
    for c in comunidad.values():
        tamano[c] = tamano.get(c, 0) + 1
    return sorted(
        (n["id"] for n in red["nodos"]),
        key=lambda nid: (
            -tamano.get(comunidad.get(nid, 0), 0),
            comunidad.get(nid, 0),
            -grado.get(nid, 0.0),
            nid,
        ),
    )


def matriz_adyacencia(red: Red, orden: list[str]) -> list[list[float]]:
    """Symmetric weighted adjacency matrix in the given node order."""
    pos = {nid: i for i, nid in enumerate(orden)}
    n = len(orden)
    m = [[0.0] * n for _ in range(n)]
    for e in red["enlaces"]:
        i, j = pos.get(e["origen"]), pos.get(e["destino"])
        if i is None or j is None or i == j:
            continue
        m[i][j] += e["peso"]
        m[j][i] += e["peso"]
    return m


def contar_componentes(red: Red) -> int:
    """Connected-component count over the undirected edges (union-find)."""
    parent = {n["id"]: n["id"] for n in red["nodos"]}

    def find(x: str) -> str:
        r = x
        while parent[r] != r:
            r = parent[r]
        while parent[x] != r:
            parent[x], x = r, parent[x]
        return r

    for e in red["enlaces"]:
        if e["origen"] in parent and e["destino"] in parent:
            parent[find(e["origen"])] = find(e["destino"])
    return len({find(n["id"]) for n in red["nodos"]})


def renormalizar(red: Red, comunidad: Optional[dict[str, int]] = None) -> Red:
    """One renormalization step: collapse each community into a
    supernode. Intra-community edges vanish (the supernode's internal
    mass); inter-community edges aggregate by summed weight. The result
    is a coarser network of the SAME kind, so the operation composes
    into a ladder. Supernode peso = summed member peso."""
    if comunidad is None:
        comunidad = detectar_comunidades(red)
    grado = grado_ponderado(red)
    miembros: dict[int, list[dict]] = {}
    for n in red["nodos"]:
        miembros.setdefault(comunidad.get(n["id"], 0), []).append(n)

    nodos: list[dict] = []
    for c in sorted(miembros):
        lista = miembros[c]
        dominante = max(lista, key=lambda n: (grado.get(n["id"], 0.0), n["id"]))
        restantes = len(lista) - 1
        nodos.append({
            "id": f"c{c}",
            "etiqueta": (f"{dominante['etiqueta']} +{restantes}"
                         if restantes > 0 else dominante["etiqueta"]),
            "tipo": "comunidad",
            "peso": sum(n.get("peso") or 1 for n in lista),
        })

    agregados: dict[str, dict] = {}
    for e in red["enlaces"]:
        ca, cb = comunidad.get(e["origen"]), comunidad.get(e["destino"])
        if ca is None or cb is None or ca == cb:
            continue
        clave, origen, destino = _clave_par(f"c{ca}", f"c{cb}")
        previo = agregados.get(clave)
        if previo:
            previo["peso"] += e["peso"]
        else:
            agregados[clave] = {"origen": origen, "destino": destino, "peso": e["peso"]}

    return {"nodos": nodos, "enlaces": list(agregados.values())}


def escalera_renorm(red: Red, max_niveles: int = 4) -> list[Red]:
    """The renormalization ladder: [red, renorm¹, renorm², …]. Stops when
    a step no longer coarsens (single community or no shrink) or the
    level cap is reached. The scale dial indexes into this list."""
    niveles: list[Red] = [red]
    actual = red
    while len(niveles) <= max_niveles:
        com = detectar_comunidades(actual)
        siguiente = renormalizar(actual, com)
        if (len(siguiente["nodos"]) <= 1
                or len(siguiente["nodos"]) >= len(actual["nodos"])):
            break
        niveles.append(siguiente)
        actual = siguiente
    return niveles


def puentes_articulacion(red: Red) -> list[str]:
    """Articulation points (Tarjan, iterative DFS) — the network's true
    bridges: remove one and its component falls apart. Deterministic;
    O(V+E). These are the concepts holding the structure together,
    which degree alone does not reveal."""
    ady: dict[str, list[str]] = {n["id"]: [] for n in red["nodos"]}
    for e in red["enlaces"]:
        if e["origen"] in ady and e["destino"] in ady:
            ady[e["origen"]].append(e["destino"])
            ady[e["destino"]].append(e["origen"])

    disc: dict[str, int] = {}
    low: dict[str, int] = {}
    padre: dict[str, Optional[str]] = {}
    puntos: set[str] = set()
    reloj = 0

    for raiz in red["nodos"]:
        rid = raiz["id"]
        if rid in disc:
            continue
        padre[rid] = None
        hijos_raiz = 0
        pila: list[list] = [[rid, 0]]
        disc[rid] = low[rid] = reloj
        reloj += 1
        while pila:
            marco = pila[-1]
            vecinos = ady.get(marco[0], [])
            if marco[1] < len(vecinos):
                v = vecinos[marco[1]]
                marco[1] += 1
                if v not in disc:
                    padre[v] = marco[0]
                    if marco[0] == rid:
                        hijos_raiz += 1
                    disc[v] = low[v] = reloj
                    reloj += 1
                    pila.append([v, 0])
                elif v != padre.get(marco[0]):
                    low[marco[0]] = min(low[marco[0]], disc[v])
            else:
                pila.pop()
                p = padre.get(marco[0])
                if p is not None:
                    low[p] = min(low[p], low[marco[0]])
                    if p != rid and low[marco[0]] >= disc[p]:
                        puntos.add(p)
        if hijos_raiz > 1:
            puntos.add(rid)
    return sorted(puntos)


# ── Family II · statistical physics — the degree law ─────────────────


def grado_nodo(red: Red) -> dict[str, int]:
    """Unweighted degree — distinct neighbours per node (isolated at 0)."""
    nb: dict[str, set[str]] = {n["id"]: set() for n in red["nodos"]}
    for e in red["enlaces"]:
        if e["origen"] == e["destino"]:
            continue
        if e["origen"] in nb and e["destino"] in nb:
            nb[e["origen"]].add(e["destino"])
            nb[e["destino"]].add(e["origen"])
    return {nid: len(s) for nid, s in nb.items()}


def _pendiente_log_log(puntos: list[tuple[float, float]]) -> float:
    n = len(puntos)
    sx = sum(p[0] for p in puntos)
    sy = sum(p[1] for p in puntos)
    sxx = sum(p[0] * p[0] for p in puntos)
    sxy = sum(p[0] * p[1] for p in puntos)
    den = n * sxx - sx * sx
    return 0.0 if den == 0 else (n * sxy - sx * sy) / den


def distribucion_grado(red: Red) -> dict[str, Any]:
    """Rank-size degree distribution — the scale signature. A straight
    fall in log-log is scale-free (few hubs, many leaves); a flat one is
    even. The fitted Zipf exponent quantifies it. Ties broken by id."""
    g = grado_nodo(red)
    orden = sorted(
        ({"id": n["id"], "etiqueta": n["etiqueta"], "grado": g.get(n["id"], 0)}
         for n in red["nodos"]),
        key=lambda e: (-e["grado"], e["id"]),
    )
    rank_size = [{"rango": i + 1, **e} for i, e in enumerate(orden)]
    puntos = [(math.log(p["rango"]), math.log(p["grado"]))
              for p in rank_size if p["grado"] > 0]
    exponente = -_pendiente_log_log(puntos) if len(puntos) >= 2 else None
    return {
        "rank_size": rank_size,
        "exponente": exponente,
        "grado_max": rank_size[0]["grado"] if rank_size else 0,
    }


# ── Family III · TDA — H0 persistence over an edge-weight filtration ──


def persistencia_h0(red: Red) -> dict[str, Any]:
    """0-dimensional persistence: sweep edges strongest-first; components
    are born together at 1 and die when a stronger tie merges them
    (elder rule: the smaller/younger dies). Components that never merge
    live to 0 — one per connected component. Long bars are robustly
    separated clusters."""
    max_w = max([1.0, *(e["peso"] for e in red["enlaces"])])
    parent = {n["id"]: n["id"] for n in red["nodos"]}
    size = {n["id"]: 1 for n in red["nodos"]}

    def find(x: str) -> str:
        r = x
        while parent[r] != r:
            r = parent[r]
        while parent[x] != r:
            parent[x], x = r, parent[x]
        return r

    barras: list[dict] = []
    edges = sorted(
        (e for e in red["enlaces"] if e["origen"] != e["destino"]),
        key=lambda e: (-e["peso"], e["origen"]),
    )
    for e in edges:
        ru, rv = find(e["origen"]), find(e["destino"])
        if ru == rv:
            continue
        su, sv = size[ru], size[rv]
        muere = ru if (su < sv or (su == sv and ru < rv)) else rv
        vive = rv if muere == ru else ru
        barras.append({"nacimiento": 1.0, "muerte": e["peso"] / max_w})
        parent[muere] = vive
        size[vive] = su + sv
    raices = {find(n["id"]) for n in red["nodos"]}
    barras.extend({"nacimiento": 1.0, "muerte": 0.0} for _ in raices)
    barras.sort(key=lambda b: b["muerte"])
    return {"barras": barras, "n_componentes": len(raices)}


# ── Family V · spectral graph theory — Fiedler embedding ─────────────


def embedding_espectral(red: Red) -> dict[str, dict[str, float]]:
    """2D spectral embedding from the two lowest non-trivial eigenvectors
    of the graph Laplacian (Fiedler + next), by power iteration on
    c·I − L with the constant vector deflated. Deterministic init and
    orthogonalization; connected structure lays out as a manifold where
    topological neighbours sit close. Trivial graphs fall back to a
    line."""
    ids = [n["id"] for n in red["nodos"]]
    n = len(ids)
    if n == 0:
        return {}
    if n <= 2:
        return {nid: {"x": 0.0 if n == 1 else i - 0.5, "y": 0.0}
                for i, nid in enumerate(ids)}

    idx = {nid: i for i, nid in enumerate(ids)}
    ady: list[list[tuple[int, float]]] = [[] for _ in range(n)]
    deg = [0.0] * n
    for e in red["enlaces"]:
        a, b = idx.get(e["origen"]), idx.get(e["destino"])
        if a is None or b is None or a == b:
            continue
        ady[a].append((b, e["peso"]))
        ady[b].append((a, e["peso"]))
        deg[a] += e["peso"]
        deg[b] += e["peso"]
    c = 2 * max(1.0, *deg) + 1

    def normalizar(v: list[float]) -> list[float]:
        k = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / k for x in v]

    def orto(v: list[float], base: list[list[float]]) -> None:
        for b in base:
            d = sum(v[i] * b[i] for i in range(n))
            for i in range(n):
                v[i] -= d * b[i]

    def aplicar_m(v: list[float]) -> list[float]:
        out = [0.0] * n
        for i in range(n):
            s = sum(w * v[j] for j, w in ady[i])
            out[i] = c * v[i] - (deg[i] * v[i] - s)
        return out

    def iterar(base: list[list[float]], semilla: float) -> list[float]:
        v = [math.sin((i + 1) * semilla) + math.cos((i + 1) * 0.7) for i in range(n)]
        orto(v, base)
        v = normalizar(v)
        for _ in range(140):
            w = aplicar_m(v)
            orto(w, base)
            v = normalizar(w)
        return v

    ones = [1 / math.sqrt(n)] * n
    f1 = iterar([ones], 1.1)
    f2 = iterar([ones, f1], 2.3)
    return {nid: {"x": f1[i], "y": f2[i]} for i, nid in enumerate(ids)}


# ── Family M · eigenvector centrality — the Orbe's mass ──────────────


def centralidad_vector_propio(red: Red, iteraciones: int = 100) -> dict[str, float]:
    """Eigenvector centrality: how much a node connects to what connects.
    Power iteration on A + I (the spectral shift breaks the ±λ
    oscillation of bipartite stars), normalized so the heaviest node
    is 1. Deterministic: uniform start, fixed iterations."""
    ids = [n["id"] for n in red["nodos"]]
    n = len(ids)
    if n == 0:
        return {}
    idx = {nid: i for i, nid in enumerate(ids)}
    ady: list[list[tuple[int, float]]] = [[] for _ in range(n)]
    for e in red["enlaces"]:
        a, b = idx.get(e["origen"]), idx.get(e["destino"])
        if a is None or b is None or a == b:
            continue
        ady[a].append((b, e["peso"]))
        ady[b].append((a, e["peso"]))
    v = [1 / math.sqrt(n)] * n
    for _ in range(iteraciones):
        nv = [v[i] + sum(w * v[j] for j, w in ady[i]) for i in range(n)]
        norma = math.sqrt(sum(x * x for x in nv))
        if norma == 0:
            break  # no edges — everyone weighs the same
        v = [x / norma for x in nv]
    mx = max([*v, 0.0])
    return {nid: (v[i] / mx if mx > 0 else 0.0) for i, nid in enumerate(ids)}


def contribuciones_centralidad(red: Red, nodo_id: str, top: int = 3) -> list[dict]:
    """Why a node weighs — the tap-to-explain. Eigenvector centrality is
    literally the weighted sum of the neighbours' masses, so the honest
    explanation IS that sum: the top contributing neighbours, each with
    edge weight × mass. Pure and deterministic; ties broken by id."""
    masas = centralidad_vector_propio(red)
    etiqueta_por_id = {n["id"]: n["etiqueta"] for n in red["nodos"]}
    acumulado: dict[str, float] = {}
    for e in red["enlaces"]:
        otro = (e["destino"] if e["origen"] == nodo_id
                else e["origen"] if e["destino"] == nodo_id else None)
        if otro is None or otro == nodo_id:
            continue
        acumulado[otro] = acumulado.get(otro, 0.0) + e["peso"] * masas.get(otro, 0.0)
    orden = sorted(acumulado.items(), key=lambda kv: (-kv[1], kv[0]))[:top]
    return [
        {"id": nid, "etiqueta": etiqueta_por_id.get(nid, nid),
         "masa": masas.get(nid, 0.0), "aporte": aporte}
        for nid, aporte in orden
    ]


# ── Family VI · flow & brokerage — brokers y cortes críticos ─────────


def intermediacion(red: Red) -> dict[str, float]:
    """Betweenness centrality (Brandes, unweighted shortest paths) — the
    broker score: how often a node sits on the shortest path between other
    pairs. In a país–aduana–marca flow network the aduanas are the only
    país↔marca bridges, so this surfaces the customs points that broker the
    flow. Deterministic: sources and neighbours are visited in sorted-id
    order. Normalized so the top broker is 1 (like the other centralities);
    all-zero when nothing brokers anything (a star's leaves, a clique)."""
    ids = sorted(n["id"] for n in red["nodos"])
    ady: dict[str, list[str]] = {i: [] for i in ids}
    vistos: set[tuple] = set()
    for e in red["enlaces"]:
        a, b = e["origen"], e["destino"]
        if a == b or a not in ady or b not in ady:
            continue
        clave = (a, b) if a < b else (b, a)
        if clave in vistos:
            continue          # una sola arista por par (grafo simple, no ponderado)
        vistos.add(clave)
        ady[a].append(b)
        ady[b].append(a)
    for i in ids:
        ady[i].sort()

    cb: dict[str, float] = {i: 0.0 for i in ids}
    for s in ids:
        pila: list[str] = []
        pred: dict[str, list[str]] = {i: [] for i in ids}
        sigma: dict[str, float] = {i: 0.0 for i in ids}
        sigma[s] = 1.0
        dist: dict[str, int] = {i: -1 for i in ids}
        dist[s] = 0
        cola = deque([s])
        while cola:
            v = cola.popleft()
            pila.append(v)
            for w in ady[v]:
                if dist[w] < 0:
                    dist[w] = dist[v] + 1
                    cola.append(w)
                if dist[w] == dist[v] + 1:
                    sigma[w] += sigma[v]
                    pred[w].append(v)
        delta: dict[str, float] = {i: 0.0 for i in ids}
        while pila:
            w = pila.pop()
            for v in pred[w]:
                if sigma[w] > 0:
                    delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w])
            if w != s:
                cb[w] += delta[w]
    for i in ids:
        cb[i] /= 2.0                       # no dirigido: cada par se cuenta dos veces
    mx = max([*cb.values(), 0.0])
    return {i: (cb[i] / mx if mx > 0 else 0.0) for i in ids}


def min_corte(red: Red, fuente: str, sumidero: str,
              capacidad_unitaria: bool = False) -> dict[str, Any]:
    """Max-flow / min-cut (Edmonds–Karp) between fuente and sumidero over the
    undirected weighted network. Capacity = summed edge peso, or 1 per edge
    when capacidad_unitaria (then the flow value is the number of
    edge-disjoint routes — the supply redundancy). Returns the flow value,
    the source-side partition, and the cut edges: the minimal set whose
    removal disconnects sumidero from fuente. Deterministic: BFS visits
    neighbours in sorted order. Describes THIS network's MEASURED flow — never
    a prediction."""
    idset = {n["id"] for n in red["nodos"]}
    if fuente not in idset or sumidero not in idset or fuente == sumidero:
        return {"valor": 0.0, "particion_fuente": [], "corte": []}
    res: dict[str, dict[str, float]] = {i: {} for i in idset}
    for e in red["enlaces"]:
        a, b = e["origen"], e["destino"]
        if a == b or a not in idset or b not in idset:
            continue
        w = 1.0 if capacidad_unitaria else float(e["peso"])
        res[a][b] = res[a].get(b, 0.0) + w
        res[b][a] = res[b].get(a, 0.0) + w

    flujo = 0.0
    while True:
        padre: dict[str, str] = {fuente: fuente}
        cola = deque([fuente])
        while cola:
            u = cola.popleft()
            if u == sumidero:
                break
            for v in sorted(res[u]):
                if v not in padre and res[u][v] > 1e-12:
                    padre[v] = u
                    cola.append(v)
        if sumidero not in padre:
            break
        cuello = math.inf
        v = sumidero
        while v != fuente:
            u = padre[v]
            cuello = min(cuello, res[u][v])
            v = u
        v = sumidero
        while v != fuente:
            u = padre[v]
            res[u][v] -= cuello
            res[v][u] = res[v].get(u, 0.0) + cuello
            v = u
        flujo += cuello

    alcanz: set[str] = {fuente}
    cola = deque([fuente])
    while cola:
        u = cola.popleft()
        for v in sorted(res[u]):
            if v not in alcanz and res[u][v] > 1e-12:
                alcanz.add(v)
                cola.append(v)

    etq = {n["id"]: n["etiqueta"] for n in red["nodos"]}
    corte: list[dict] = []
    vistos_corte: set[tuple] = set()
    for e in red["enlaces"]:
        a, b = e["origen"], e["destino"]
        if a == b or a not in idset or b not in idset:
            continue
        if (a in alcanz) == (b in alcanz):
            continue                       # no cruza el corte
        clave = (a, b) if a < b else (b, a)
        if clave in vistos_corte:
            continue
        vistos_corte.add(clave)
        corte.append({"origen": a, "destino": b,
                      "etiqueta_origen": etq.get(a, a),
                      "etiqueta_destino": etq.get(b, b),
                      "peso": e["peso"]})
    corte.sort(key=lambda c: (c["origen"], c["destino"]))
    return {"valor": round(flujo, 6), "particion_fuente": sorted(alcanz), "corte": corte}


# ── the verifiable summary — what a reading must cite ────────────────


def resumen_red(red: Red, top_hubs: int = 5) -> dict[str, Any]:
    """Structural summary — the verifiable facts a narrative must cite:
    counts, density, communities, components, hubs, the degree-law
    exponent and the labelled articulation bridges."""
    n = len(red["nodos"])
    e = len(red["enlaces"])
    densidad = 0.0 if n < 2 else (2 * e) / (n * (n - 1))
    comunidad = detectar_comunidades(red)
    tamano: dict[int, int] = {}
    for c in comunidad.values():
        tamano[c] = tamano.get(c, 0) + 1
    grado = grado_ponderado(red)
    etiqueta_por_id = {nd["id"]: nd["etiqueta"] for nd in red["nodos"]}
    hubs = [
        {"id": nid, "etiqueta": etiqueta_por_id.get(nid, nid), "grado": g}
        for nid, g in sorted(grado.items(), key=lambda kv: (-kv[1], kv[0]))[:top_hubs]
        if g > 0
    ]
    puentes = sorted(
        ({"id": nid, "etiqueta": etiqueta_por_id.get(nid, nid),
          "grado": grado.get(nid, 0.0)} for nid in puentes_articulacion(red)),
        key=lambda p: (-p["grado"], p["id"]),
    )[:3]
    return {
        "n_nodos": n,
        "n_enlaces": e,
        "densidad": densidad,
        "n_comunidades": len(tamano),
        "n_componentes": contar_componentes(red),
        "comunidad_mayor": max(tamano.values()) if tamano else 0,
        "hubs": hubs,
        "exponente": distribucion_grado(red)["exponente"],
        "puentes": puentes,
    }
