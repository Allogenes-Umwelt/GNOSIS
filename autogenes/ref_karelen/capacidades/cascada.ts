import {
  contarComponentes,
  gradoPonderado,
  type RedSig,
} from "@/capacidades/signature";

/**
 * Simulated cascade (M0) — DECIDIR's honest core. The what-if never
 * predicts the world: it simulates the operator's OWN network under its
 * own connectivity laws, entirely in memory. Two directions of Boyd:
 * destructive deduction (what falls apart if X falls) and creative
 * induction (what comes together if A links B). The wavefront steps feed
 * the light-pulse animation — the visual IS the computation. Pure.
 */

/** BFS wavefront from an origin: node ids reached at each step. */
export function ondaDesde(
  red: RedSig,
  origenId: string,
  maxPasos = 6,
): string[][] {
  const ady = new Map<string, string[]>();
  for (const n of red.nodos) ady.set(n.id, []);
  for (const e of red.enlaces) {
    if (e.origen === e.destino) continue;
    ady.get(e.origen)?.push(e.destino);
    ady.get(e.destino)?.push(e.origen);
  }
  if (!ady.has(origenId)) return [];
  const visitado = new Set<string>([origenId]);
  const pasos: string[][] = [[origenId]];
  let frente = [origenId];
  for (let k = 0; k < maxPasos && frente.length > 0; k++) {
    const siguiente: string[] = [];
    for (const id of frente) {
      for (const nb of ady.get(id) ?? []) {
        if (visitado.has(nb)) continue;
        visitado.add(nb);
        siguiente.push(nb);
      }
    }
    if (siguiente.length > 0) pasos.push(siguiente.sort());
    frente = siguiente;
  }
  return pasos;
}

export interface ImpactoCaida {
  /** Wavefront of the connectivity loss, for the pulse animation. */
  ondas: string[][];
  /** Edges that die with the node. */
  relacionesCaidas: number;
  /** Nodes left disconnected from every former neighbor's component. */
  desconectados: { id: string; etiqueta: string }[];
  islasAntes: number;
  islasDespues: number;
  /** Share of the network's weighted degree that the node carried. */
  pesoEstructural: number;
}

/**
 * Destructive deduction: remove the node IN MEMORY and measure what its
 * absence does to connectivity — dead edges, orphaned nodes, islands
 * before/after, and the share of structure it carried. Nothing writes.
 */
export function simularCaida(red: RedSig, id: string): ImpactoCaida {
  const existe = red.nodos.some((n) => n.id === id);
  if (!existe) {
    return {
      ondas: [],
      relacionesCaidas: 0,
      desconectados: [],
      islasAntes: contarComponentes(red),
      islasDespues: contarComponentes(red),
      pesoEstructural: 0,
    };
  }
  const ondas = ondaDesde(red, id);
  const islasAntes = contarComponentes(red);

  const sinNodo: RedSig = {
    nodos: red.nodos.filter((n) => n.id !== id),
    enlaces: red.enlaces.filter((e) => e.origen !== id && e.destino !== id),
  };
  const relacionesCaidas = red.enlaces.length - sinNodo.enlaces.length;
  const islasDespues = contarComponentes(sinNodo);

  // Orphans: former neighbors whose degree drops to zero without the node.
  const gradoDespues = gradoPonderado(sinNodo);
  const vecinos = new Set<string>();
  for (const e of red.enlaces) {
    if (e.origen === id) vecinos.add(e.destino);
    if (e.destino === id) vecinos.add(e.origen);
  }
  const etiquetaDe = new Map(red.nodos.map((n) => [n.id, n.etiqueta] as const));
  const desconectados = [...vecinos]
    .filter((v) => (gradoDespues.get(v) ?? 0) === 0)
    .sort()
    .map((v) => ({ id: v, etiqueta: etiquetaDe.get(v) ?? v }));

  const grado = gradoPonderado(red);
  const total = [...grado.values()].reduce((s, x) => s + x, 0);
  const pesoEstructural = total > 0 ? (grado.get(id) ?? 0) / total : 0;

  return {
    ondas,
    relacionesCaidas,
    desconectados,
    islasAntes,
    islasDespues,
    pesoEstructural,
  };
}

export interface ImpactoEnlace {
  /** True when the link fuses two formerly separate islands. */
  fusionaIslas: boolean;
  islasAntes: number;
  islasDespues: number;
  /** Hop distance A→B before the link (null = unreachable). After is 1. */
  saltosAntes: number | null;
  /** Nodes that move from unreachable-or-far (>3 hops) to ≤2 hops of A. */
  acercados: number;
}

/**
 * Creative induction: add the link A—B IN MEMORY and measure what comes
 * together — islands fusing, the path that collapses to one hop, and how
 * many nodes suddenly sit near. Nothing writes; making it real goes
 * through the additive-plan gate.
 */
export function simularEnlace(
  red: RedSig,
  aId: string,
  bId: string,
): ImpactoEnlace {
  const islasAntes = contarComponentes(red);
  const pasosA = ondaDesde(red, aId, 32);
  let saltosAntes: number | null = null;
  for (let k = 0; k < pasosA.length; k++) {
    if (pasosA[k].includes(bId)) {
      saltosAntes = k;
      break;
    }
  }

  const conEnlace: RedSig = {
    nodos: red.nodos,
    enlaces: [...red.enlaces, { origen: aId, destino: bId, peso: 1 }],
  };
  const islasDespues = contarComponentes(conEnlace);

  const cercaAntes = new Set(pasosA.slice(0, 3).flat());
  const pasosDespues = ondaDesde(conEnlace, aId, 32);
  const cercaDespues = new Set(pasosDespues.slice(0, 3).flat());
  let acercados = 0;
  for (const id of cercaDespues) {
    if (cercaAntes.has(id)) continue;
    // Was it far (>3 hops) or unreachable before?
    let antes: number | null = null;
    for (let k = 0; k < pasosA.length; k++) {
      if (pasosA[k].includes(id)) {
        antes = k;
        break;
      }
    }
    if (antes === null || antes > 3) acercados++;
  }

  return {
    fusionaIslas: islasDespues < islasAntes,
    islasAntes,
    islasDespues,
    saltosAntes,
    acercados,
  };
}
