/**
 * SIGNATURE topology engine — pure, deterministic, source-agnostic.
 *
 * The recombination studio's Redes & Topología lens. It takes a generic
 * weighted network (whatever a source adapter projects into RedSig) and
 * derives its structure: communities, a community-respecting order, the
 * adjacency matrix, and the renormalization ladder (coarse-grain each
 * community into a supernode, repeatedly). Independent of the AUTOGENES
 * substrate: it knows nothing about artefactos, fragmentos or the graph
 * store — only nodes, weighted edges and the maths over them.
 */

export interface NodoRed {
  id: string;
  etiqueta: string;
  /** Provenance of the node kind (e.g. "etiqueta", "comunidad"). */
  tipo?: string;
  /** Structural mass — member count after coarse-graining, else 1. */
  peso?: number;
}

export interface EnlaceRed {
  origen: string;
  destino: string;
  /** Strictly positive tie strength. */
  peso: number;
}

export interface RedSig {
  nodos: NodoRed[];
  enlaces: EnlaceRed[];
}

/**
 * Canonical undirected-pair key. JSON-encoded so a node id may contain
 * ANY character (labels like "fecha de pago") without the key colliding
 * or corrupting endpoints — the endpoints are also carried in the value,
 * so nothing is ever recovered by splitting the key.
 */
function clavePar(a: string, b: string): { key: string; origen: string; destino: string } {
  const [origen, destino] = a < b ? [a, b] : [b, a];
  return { key: JSON.stringify([origen, destino]), origen, destino };
}

/** Weighted degree per node id (isolated nodes included at 0). */
export function gradoPonderado(red: RedSig): Map<string, number> {
  const grado = new Map<string, number>();
  for (const n of red.nodos) grado.set(n.id, 0);
  for (const e of red.enlaces) {
    grado.set(e.origen, (grado.get(e.origen) ?? 0) + e.peso);
    grado.set(e.destino, (grado.get(e.destino) ?? 0) + e.peso);
  }
  return grado;
}

/** Adjacency as weighted neighbour lists (undirected). */
function adyacencia(red: RedSig): Map<string, { nb: string; peso: number }[]> {
  const ady = new Map<string, { nb: string; peso: number }[]>();
  for (const n of red.nodos) ady.set(n.id, []);
  for (const e of red.enlaces) {
    if (e.origen === e.destino) continue;
    ady.get(e.origen)?.push({ nb: e.destino, peso: e.peso });
    ady.get(e.destino)?.push({ nb: e.origen, peso: e.peso });
  }
  return ady;
}

/**
 * Community detection by label propagation. Deterministic: nodes are
 * visited in sorted-id order, each adopts the highest weighted-label
 * among its neighbours, ties broken by the lexicographically smallest
 * label. Async (in-place) updates converge fast; a hard iteration cap
 * guarantees termination even on oscillating topologies. Returns a
 * dense community index per node id (0..k-1, by first appearance).
 */
export function detectarComunidades(red: RedSig, maxIter = 24): Map<string, number> {
  const ids = red.nodos.map((n) => n.id).sort();
  const ady = adyacencia(red);
  const etiqueta = new Map<string, string>(ids.map((id) => [id, id]));

  for (let iter = 0; iter < maxIter; iter++) {
    let cambio = false;
    for (const id of ids) {
      const vecinos = ady.get(id);
      if (!vecinos || vecinos.length === 0) continue;
      const tally = new Map<string, number>();
      for (const { nb, peso } of vecinos) {
        const lab = etiqueta.get(nb) as string;
        tally.set(lab, (tally.get(lab) ?? 0) + peso);
      }
      let mejor = etiqueta.get(id) as string;
      let mejorPeso = -1;
      for (const [lab, peso] of tally) {
        if (peso > mejorPeso || (peso === mejorPeso && lab < mejor)) {
          mejor = lab;
          mejorPeso = peso;
        }
      }
      if (mejor !== etiqueta.get(id)) {
        etiqueta.set(id, mejor);
        cambio = true;
      }
    }
    if (!cambio) break;
  }

  // Densify labels to 0..k-1 by first appearance in sorted-id order.
  const indice = new Map<string, number>();
  const comunidad = new Map<string, number>();
  for (const id of ids) {
    const lab = etiqueta.get(id) as string;
    if (!indice.has(lab)) indice.set(lab, indice.size);
    comunidad.set(id, indice.get(lab) as number);
  }
  return comunidad;
}

/**
 * Node id order that groups communities together — the shared backbone
 * for the chord (sector order) and the matrix (row/col order). Larger
 * communities first; within a community, higher weighted degree first.
 */
export function ordenarPorComunidad(
  red: RedSig,
  comunidad: Map<string, number>,
): string[] {
  const grado = gradoPonderado(red);
  const tamano = new Map<number, number>();
  for (const c of comunidad.values()) tamano.set(c, (tamano.get(c) ?? 0) + 1);
  return red.nodos
    .map((n) => n.id)
    .sort((a, b) => {
      const ca = comunidad.get(a) ?? 0;
      const cb = comunidad.get(b) ?? 0;
      if (ca !== cb) {
        const ta = tamano.get(ca) ?? 0;
        const tb = tamano.get(cb) ?? 0;
        if (ta !== tb) return tb - ta;
        return ca - cb;
      }
      const ga = grado.get(a) ?? 0;
      const gb = grado.get(b) ?? 0;
      if (ga !== gb) return gb - ga;
      return a < b ? -1 : 1;
    });
}

/** Symmetric weighted adjacency matrix in the given node order. */
export function matrizAdyacencia(red: RedSig, orden: string[]): number[][] {
  const pos = new Map(orden.map((id, i) => [id, i] as const));
  const n = orden.length;
  const m = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const e of red.enlaces) {
    const i = pos.get(e.origen);
    const j = pos.get(e.destino);
    if (i === undefined || j === undefined || i === j) continue;
    m[i][j] += e.peso;
    m[j][i] += e.peso;
  }
  return m;
}

/** Connected-component count over the undirected edges (union-find). */
export function contarComponentes(red: RedSig): number {
  const parent = new Map<string, string>(red.nodos.map((n) => [n.id, n.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    while (parent.get(x) !== r) {
      const next = parent.get(x) as string;
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  for (const e of red.enlaces) {
    if (!parent.has(e.origen) || !parent.has(e.destino)) continue;
    parent.set(find(e.origen), find(e.destino));
  }
  const raices = new Set<string>();
  for (const n of red.nodos) raices.add(find(n.id));
  return raices.size;
}

/**
 * One renormalization step: collapse each community into a supernode.
 * Intra-community edges vanish (they become the supernode's internal
 * mass); inter-community edges aggregate by summed weight. The result
 * is a coarser network of the SAME kind — so the operation composes
 * into a ladder. Supernode peso = summed member peso.
 */
export function renormalizar(
  red: RedSig,
  comunidad = detectarComunidades(red),
): RedSig {
  const grado = gradoPonderado(red);
  const miembros = new Map<number, NodoRed[]>();
  for (const n of red.nodos) {
    const c = comunidad.get(n.id) ?? 0;
    const lista = miembros.get(c);
    if (lista) lista.push(n);
    else miembros.set(c, [n]);
  }

  const nodos: NodoRed[] = [];
  for (const [c, lista] of [...miembros].sort((a, b) => a[0] - b[0])) {
    const dominante = [...lista].sort(
      (a, b) => (grado.get(b.id) ?? 0) - (grado.get(a.id) ?? 0),
    )[0];
    const restantes = lista.length - 1;
    nodos.push({
      id: `c${c}`,
      etiqueta:
        restantes > 0 ? `${dominante.etiqueta} +${restantes}` : dominante.etiqueta,
      tipo: "comunidad",
      peso: lista.reduce((s, n) => s + (n.peso ?? 1), 0),
    });
  }

  const agregados = new Map<string, EnlaceRed>();
  for (const e of red.enlaces) {
    const ca = comunidad.get(e.origen);
    const cb = comunidad.get(e.destino);
    if (ca === undefined || cb === undefined || ca === cb) continue;
    const { key, origen, destino } = clavePar(`c${ca}`, `c${cb}`);
    const prev = agregados.get(key);
    if (prev) prev.peso += e.peso;
    else agregados.set(key, { origen, destino, peso: e.peso });
  }

  return { nodos, enlaces: [...agregados.values()] };
}

/**
 * The renormalization ladder: [red, renorm¹, renorm², …]. Stops when a
 * step no longer coarsens (single community or no shrink) or the level
 * cap is reached. The studio's scale dial indexes into this array.
 */
export function escaleraRenorm(red: RedSig, maxNiveles = 4): RedSig[] {
  const niveles: RedSig[] = [red];
  let actual = red;
  while (niveles.length <= maxNiveles) {
    const com = detectarComunidades(actual);
    const siguiente = renormalizar(actual, com);
    if (siguiente.nodos.length <= 1 || siguiente.nodos.length >= actual.nodos.length) {
      break;
    }
    niveles.push(siguiente);
    actual = siguiente;
  }
  return niveles;
}

export interface Concentrador {
  id: string;
  etiqueta: string;
  grado: number;
}

export interface ResumenRed {
  nNodos: number;
  nEnlaces: number;
  /** Undirected edge density in [0,1]. */
  densidad: number;
  nComunidades: number;
  nComponentes: number;
  comunidadMayor: number;
  hubs: Concentrador[];
  /** Zipf exponent of the degree law, or null when too few points. */
  exponente: number | null;
  /** Articulation points: concepts whose removal splits their component. */
  puentes: Concentrador[];
}

/**
 * Articulation points (Tarjan, iterative DFS) — the network's true
 * bridges: remove one and its component falls apart. Deterministic;
 * O(V+E). These are the concepts holding the structure together, which
 * degree alone does not reveal.
 */
export function puentesArticulacion(red: RedSig): string[] {
  const ady = new Map<string, string[]>();
  for (const n of red.nodos) ady.set(n.id, []);
  for (const e of red.enlaces) {
    ady.get(e.origen)?.push(e.destino);
    ady.get(e.destino)?.push(e.origen);
  }
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const padre = new Map<string, string | null>();
  const puntos = new Set<string>();
  let reloj = 0;

  for (const raiz of red.nodos) {
    if (disc.has(raiz.id)) continue;
    padre.set(raiz.id, null);
    let hijosRaiz = 0;
    const pila: { id: string; i: number }[] = [{ id: raiz.id, i: 0 }];
    disc.set(raiz.id, reloj);
    low.set(raiz.id, reloj);
    reloj++;
    while (pila.length > 0) {
      const marco = pila[pila.length - 1];
      const vecinos = ady.get(marco.id) ?? [];
      if (marco.i < vecinos.length) {
        const v = vecinos[marco.i];
        marco.i++;
        if (!disc.has(v)) {
          padre.set(v, marco.id);
          if (marco.id === raiz.id) hijosRaiz++;
          disc.set(v, reloj);
          low.set(v, reloj);
          reloj++;
          pila.push({ id: v, i: 0 });
        } else if (v !== padre.get(marco.id)) {
          low.set(marco.id, Math.min(low.get(marco.id) ?? 0, disc.get(v) ?? 0));
        }
      } else {
        pila.pop();
        const p = padre.get(marco.id);
        if (p !== null && p !== undefined) {
          low.set(p, Math.min(low.get(p) ?? 0, low.get(marco.id) ?? 0));
          if (p !== raiz.id && (low.get(marco.id) ?? 0) >= (disc.get(p) ?? 0)) {
            puntos.add(p);
          }
        }
      }
    }
    if (hijosRaiz > 1) puntos.add(raiz.id);
  }
  return [...puntos].sort();
}

/* ── Family II · Statistical physics — degree distribution ─────────── */

/** Unweighted degree — distinct neighbours per node (isolated at 0). */
export function gradoNodo(red: RedSig): Map<string, number> {
  const nb = new Map<string, Set<string>>();
  for (const n of red.nodos) nb.set(n.id, new Set());
  for (const e of red.enlaces) {
    if (e.origen === e.destino) continue;
    nb.get(e.origen)?.add(e.destino);
    nb.get(e.destino)?.add(e.origen);
  }
  return new Map([...nb].map(([id, s]) => [id, s.size]));
}

export interface PuntoRango {
  rango: number;
  grado: number;
  id: string;
  etiqueta: string;
}

export interface Distribucion {
  rankSize: PuntoRango[];
  /** Zipf exponent s in grado ∝ rango^-s (least squares in log-log), or null. */
  exponente: number | null;
  gradoMax: number;
}

function pendienteLogLog(pts: { x: number; y: number }[]): number {
  const n = pts.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const den = n * sxx - sx * sx;
  return den === 0 ? 0 : (n * sxy - sx * sy) / den;
}

/**
 * Rank-size degree distribution — the scale signature. A straight fall in
 * log-log is scale-free (few hubs, many leaves); a flat one is even. The
 * fitted exponent quantifies it. Deterministic; ties broken by id.
 */
export function distribucionGrado(red: RedSig): Distribucion {
  const g = gradoNodo(red);
  const arr = red.nodos
    .map((n) => ({ id: n.id, etiqueta: n.etiqueta, grado: g.get(n.id) ?? 0 }))
    .sort((a, b) => b.grado - a.grado || (a.id < b.id ? -1 : 1));
  const rankSize: PuntoRango[] = arr.map((e, i) => ({
    rango: i + 1,
    grado: e.grado,
    id: e.id,
    etiqueta: e.etiqueta,
  }));
  const pts = rankSize
    .filter((p) => p.grado > 0)
    .map((p) => ({ x: Math.log(p.rango), y: Math.log(p.grado) }));
  const exponente = pts.length >= 2 ? -pendienteLogLog(pts) : null;
  return { rankSize, exponente, gradoMax: rankSize[0]?.grado ?? 0 };
}

/* ── Family III · TDA — H0 persistence over an edge-weight filtration ── */

export interface BarraPersistencia {
  /** Normalized filtration value (1 = strongest tie, 0 = weakest). */
  nacimiento: number;
  muerte: number;
}

export interface Persistencia {
  /** One bar per initial component; sorted most-persistent first. */
  barras: BarraPersistencia[];
  nComponentes: number;
}

/**
 * 0-dimensional persistence: sweep edges strongest-first; components are
 * born together at 1 and die when a stronger tie merges them (elder rule:
 * the smaller/younger dies). Components that never merge live to 0 — one
 * per connected component. Long bars are robustly separated clusters.
 */
export function persistenciaH0(red: RedSig): Persistencia {
  const maxW = Math.max(1, ...red.enlaces.map((e) => e.peso));
  const parent = new Map<string, string>(red.nodos.map((n) => [n.id, n.id]));
  const size = new Map<string, number>(red.nodos.map((n) => [n.id, 1]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    while (parent.get(x) !== r) {
      const nx = parent.get(x) as string;
      parent.set(x, r);
      x = nx;
    }
    return r;
  };
  const barras: BarraPersistencia[] = [];
  const edges = red.enlaces
    .filter((e) => e.origen !== e.destino)
    .sort((a, b) => b.peso - a.peso || (a.origen < b.origen ? -1 : 1));
  for (const e of edges) {
    const ru = find(e.origen);
    const rv = find(e.destino);
    if (ru === rv) continue;
    const su = size.get(ru) ?? 1;
    const sv = size.get(rv) ?? 1;
    const muere = su < sv || (su === sv && ru < rv) ? ru : rv;
    const vive = muere === ru ? rv : ru;
    barras.push({ nacimiento: 1, muerte: e.peso / maxW });
    parent.set(muere, vive);
    size.set(vive, su + sv);
  }
  const raices = new Set(red.nodos.map((n) => find(n.id)));
  for (let i = 0; i < raices.size; i++) barras.push({ nacimiento: 1, muerte: 0 });
  barras.sort((a, b) => a.muerte - b.muerte);
  return { barras, nComponentes: raices.size };
}

/* ── Family V · Spectral graph theory — Fiedler embedding ──────────── */

/**
 * 2D spectral embedding from the two lowest non-trivial eigenvectors of the
 * graph Laplacian (Fiedler + next), found by power iteration on c·I − L with
 * the constant vector deflated. Deterministic init and orthogonalization;
 * connected structure lays out as a manifold where topological neighbours
 * sit close. Trivial graphs fall back to a line.
 */
export function embeddingEspectral(red: RedSig): Map<string, { x: number; y: number }> {
  const ids = red.nodos.map((n) => n.id);
  const n = ids.length;
  const pos = new Map<string, { x: number; y: number }>();
  if (n === 0) return pos;
  if (n <= 2) {
    ids.forEach((id, i) => pos.set(id, { x: n === 1 ? 0 : i - 0.5, y: 0 }));
    return pos;
  }
  const idx = new Map(ids.map((id, i) => [id, i] as const));
  const adj: { j: number; w: number }[][] = Array.from({ length: n }, () => []);
  const deg = new Array<number>(n).fill(0);
  for (const e of red.enlaces) {
    const a = idx.get(e.origen);
    const b = idx.get(e.destino);
    if (a === undefined || b === undefined || a === b) continue;
    adj[a].push({ j: b, w: e.peso });
    adj[b].push({ j: a, w: e.peso });
    deg[a] += e.peso;
    deg[b] += e.peso;
  }
  const c = 2 * Math.max(1, ...deg) + 1;
  const norma = (v: number[]): number => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  const normalizar = (v: number[]): number[] => {
    const k = norma(v);
    return v.map((x) => x / k);
  };
  const orto = (v: number[], base: number[][]): void => {
    for (const b of base) {
      let d = 0;
      for (let i = 0; i < n; i++) d += v[i] * b[i];
      for (let i = 0; i < n; i++) v[i] -= d * b[i];
    }
  };
  const aplicarM = (v: number[]): number[] => {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const { j, w } of adj[i]) s += w * v[j];
      out[i] = c * v[i] - (deg[i] * v[i] - s);
    }
    return out;
  };
  const iterar = (base: number[][], semilla: number): number[] => {
    let v = ids.map((_, i) => Math.sin((i + 1) * semilla) + Math.cos((i + 1) * 0.7));
    orto(v, base);
    v = normalizar(v);
    for (let k = 0; k < 140; k++) {
      let w = aplicarM(v);
      orto(w, base);
      w = normalizar(w);
      v = w;
    }
    return v;
  };
  const ones = new Array<number>(n).fill(1 / Math.sqrt(n));
  const f1 = iterar([ones], 1.1);
  const f2 = iterar([ones, f1], 2.3);
  ids.forEach((id, i) => pos.set(id, { x: f1[i], y: f2[i] }));
  return pos;
}

/** Structural summary — the verifiable facts a reading must cite. */
export function resumenRed(red: RedSig, topHubs = 5): ResumenRed {
  const n = red.nodos.length;
  const e = red.enlaces.length;
  const densidad = n < 2 ? 0 : (2 * e) / (n * (n - 1));
  const comunidad = detectarComunidades(red);
  const tamano = new Map<number, number>();
  for (const c of comunidad.values()) tamano.set(c, (tamano.get(c) ?? 0) + 1);
  const comunidadMayor = tamano.size === 0 ? 0 : Math.max(...tamano.values());
  const grado = gradoPonderado(red);
  const etiquetaPorId = new Map(red.nodos.map((nd) => [nd.id, nd.etiqueta]));
  const hubs = [...grado]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, topHubs)
    .filter(([, g]) => g > 0)
    .map(([id, g]) => ({ id, etiqueta: etiquetaPorId.get(id) ?? id, grado: g }));
  // Stranded-engine outputs, surfaced: the degree-law exponent and the
  // articulation bridges now feed the reading and the narrative digest.
  const exponente = distribucionGrado(red).exponente;
  const puentes = puentesArticulacion(red)
    .map((id) => ({
      id,
      etiqueta: etiquetaPorId.get(id) ?? id,
      grado: grado.get(id) ?? 0,
    }))
    .sort((a, b) => b.grado - a.grado || (a.id < b.id ? -1 : 1))
    .slice(0, 3);
  return {
    nNodos: n,
    nEnlaces: e,
    densidad,
    nComunidades: tamano.size,
    nComponentes: contarComponentes(red),
    comunidadMayor,
    hubs,
    exponente,
    puentes,
  };
}

/**
 * Eigenvector centrality (M0) — the Orbe's mass: how much a node connects
 * to what connects. Power iteration on the weighted adjacency (same
 * numerical machinery as the Fiedler embedding), normalized so the
 * heaviest node is 1. Deterministic: uniform start, fixed iterations.
 */
export function centralidadVectorPropio(
  red: RedSig,
  iteraciones = 100,
): Map<string, number> {
  const ids = red.nodos.map((n) => n.id);
  const n = ids.length;
  const salida = new Map<string, number>();
  if (n === 0) return salida;
  const idx = new Map(ids.map((id, i) => [id, i] as const));
  const ady: { j: number; w: number }[][] = Array.from({ length: n }, () => []);
  for (const e of red.enlaces) {
    const a = idx.get(e.origen);
    const b = idx.get(e.destino);
    if (a === undefined || b === undefined || a === b) continue;
    ady[a].push({ j: b, w: e.peso });
    ady[b].push({ j: a, w: e.peso });
  }
  let v = new Array<number>(n).fill(1 / Math.sqrt(n));
  for (let k = 0; k < iteraciones; k++) {
    const nv = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      // Iterate on A + I: same dominant eigenvector, but the spectral
      // shift breaks the ±λ oscillation of bipartite graphs (stars).
      nv[i] += v[i];
      for (const { j, w } of ady[i]) nv[i] += w * v[j];
    }
    const norma = Math.sqrt(nv.reduce((s, x) => s + x * x, 0));
    if (norma === 0) break; // no edges — everyone weighs the same
    v = nv.map((x) => x / norma);
  }
  const max = Math.max(...v, 0);
  ids.forEach((id, i) => salida.set(id, max > 0 ? v[i] / max : 0));
  return salida;
}

export interface AporteCentralidad {
  id: string;
  etiqueta: string;
  /** Neighbour's own mass (normalized eigenvector centrality). */
  masa: number;
  /** Its contribution to the queried node: edge weight × neighbour mass. */
  aporte: number;
}

/**
 * Why a node weighs (M2) — the Orbe's tap-to-explain. Eigenvector
 * centrality is literally the weighted sum of the neighbours' masses, so
 * the honest explanation IS that sum: the top contributing neighbours,
 * each with its edge weight × mass. Pure and deterministic.
 */
export function contribucionesCentralidad(
  red: RedSig,
  id: string,
  top = 3,
): AporteCentralidad[] {
  const masas = centralidadVectorPropio(red);
  const etiquetaPorId = new Map(red.nodos.map((n) => [n.id, n.etiqueta]));
  const acumulado = new Map<string, number>();
  for (const e of red.enlaces) {
    const otro =
      e.origen === id ? e.destino : e.destino === id ? e.origen : null;
    if (otro === null || otro === id) continue;
    acumulado.set(
      otro,
      (acumulado.get(otro) ?? 0) + e.peso * (masas.get(otro) ?? 0),
    );
  }
  return [...acumulado]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, top)
    .map(([nid, aporte]) => ({
      id: nid,
      etiqueta: etiquetaPorId.get(nid) ?? nid,
      masa: masas.get(nid) ?? 0,
      aporte,
    }));
}
