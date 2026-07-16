import type { Datum } from "@/types/datum";
import type { Entidad, Producto, Relacion } from "@/types/autogenes";
import type { FuenteItem } from "@/store/qualia";
import type { EnlaceRed, NodoRed, RedSig } from "@/capacidades/signature";

/**
 * Source adapters for the SIGNATURE studio — project each concrete source
 * into the generic RedSig the topology engine consumes, and combine the
 * ones the operator turns on. Source-agnostic by design: Signature has
 * its own in-app ingesta (operator datos), can read the AUTOGENES graph
 * ONLY when the operator opts in (read-only; never mutated), and will
 * take connectors as further sources. Pure and deterministic.
 */

const CAMPO_MISMO = 1; // two labels sharing a campo
const VALOR_MISMO = 2; // two labels sharing a value (stronger co-reference)

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Undirected edge accumulator keyed by a JSON pair (any chars safe). */
function acumulador() {
  const pesos = new Map<string, EnlaceRed>();
  return {
    sumar(a: string, b: string, w: number): void {
      if (a === b) return;
      const [origen, destino] = a < b ? [a, b] : [b, a];
      const key = JSON.stringify([origen, destino]);
      const prev = pesos.get(key);
      if (prev) prev.peso += w;
      else pesos.set(key, { origen, destino, peso: w });
    },
    enlaces(): EnlaceRed[] {
      return [...pesos.values()].sort((a, b) =>
        a.origen === b.origen
          ? a.destino < b.destino
            ? -1
            : 1
          : a.origen < b.origen
            ? -1
            : 1,
      );
    },
  };
}

/** All unordered pairs of a label-id set get `w` added. */
function cliqueDe(acc: ReturnType<typeof acumulador>, ids: string[], w: number): void {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) acc.sumar(ids[i], ids[j], w);
  }
}

/**
 * Concept co-occurrence network from operator datos — Signature's own
 * ingesta. A node is a distinct etiqueta; two concepts link when they
 * live in the same campo, and more strongly when they share a value (a
 * real cross-reference appearing under both). Communities emerge around
 * campos, hubs are concepts used widely.
 */
export function redDesdeDatos(datos: Datum[]): RedSig {
  const etiquetaDe = new Map<string, string>();
  const peso = new Map<string, number>();
  for (const d of datos) {
    const id = norm(d.etiqueta);
    if (!id) continue;
    if (!etiquetaDe.has(id)) etiquetaDe.set(id, d.etiqueta.trim());
    peso.set(id, (peso.get(id) ?? 0) + 1);
  }

  const porCampo = new Map<string, Set<string>>();
  const porValor = new Map<string, Set<string>>();
  for (const d of datos) {
    const id = norm(d.etiqueta);
    if (!id) continue;
    const campoSet = porCampo.get(d.campo) ?? new Set<string>();
    campoSet.add(id);
    porCampo.set(d.campo, campoSet);
    const v = norm(d.valor);
    if (!v) continue;
    const valorSet = porValor.get(v) ?? new Set<string>();
    valorSet.add(id);
    porValor.set(v, valorSet);
  }

  const acc = acumulador();
  for (const set of porCampo.values()) cliqueDe(acc, [...set], CAMPO_MISMO);
  for (const set of porValor.values()) cliqueDe(acc, [...set], VALOR_MISMO);

  const nodos: NodoRed[] = [...etiquetaDe.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, etiqueta]) => ({
      id,
      etiqueta,
      tipo: "etiqueta",
      peso: peso.get(id) ?? 1,
    }));

  return { nodos, enlaces: acc.enlaces() };
}

/**
 * Core co-occurrence projector — a node per distinct etiqueta; concepts
 * link when they share a batch (lote) and, more strongly, when they share
 * a value. The category-agnostic backbone for every loaded source: Mis
 * fuentes, Conectores and Micro-aplicativos all reduce to batches.
 */
export function redDesdeLotes(lotes: { etiqueta: string; valor: string }[][]): RedSig {
  const etiquetaDe = new Map<string, string>();
  const peso = new Map<string, number>();
  const porValor = new Map<string, Set<string>>();
  const acc = acumulador();

  for (const lote of lotes) {
    const ids: string[] = [];
    for (const e of lote) {
      const id = norm(e.etiqueta);
      if (!id) continue;
      if (!etiquetaDe.has(id)) etiquetaDe.set(id, e.etiqueta.trim());
      peso.set(id, (peso.get(id) ?? 0) + 1);
      ids.push(id);
      const v = norm(e.valor);
      if (!v) continue;
      const set = porValor.get(v) ?? new Set<string>();
      set.add(id);
      porValor.set(v, set);
    }
    cliqueDe(acc, [...new Set(ids)], CAMPO_MISMO);
  }
  for (const set of porValor.values()) cliqueDe(acc, [...set], VALOR_MISMO);

  const nodos: NodoRed[] = [...etiquetaDe.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, etiqueta]) => ({ id, etiqueta, tipo: "fuente", peso: peso.get(id) ?? 1 }));

  return { nodos, enlaces: acc.enlaces() };
}

/** "Mis fuentes" network — group the store items by their batch, then project. */
export function redDesdeFuentes(items: FuenteItem[]): RedSig {
  const porLote = new Map<string, { etiqueta: string; valor: string }[]>();
  for (const it of items) {
    const lista = porLote.get(it.lote) ?? [];
    lista.push({ etiqueta: it.etiqueta, valor: it.valor });
    porLote.set(it.lote, lista);
  }
  return redDesdeLotes([...porLote.values()]);
}

/**
 * "Micro-aplicativos" network — each Producto (E3) becomes a batch of its
 * title, class, producing unit and the names of the entities it cites.
 * Products that cite the same entity, share a unit or a class fuse into
 * hubs, so the studio recombines what the units have already produced.
 * Read-only over the graph's productos; nothing is written back.
 */
export function entradasDeProductos(
  productos: Producto[],
  entidades: Entidad[],
): { etiqueta: string; valor: string }[][] {
  const nombre = new Map(entidades.map((e) => [e.id, e.nombre] as const));
  return productos
    .map((pr) => {
      const es: { etiqueta: string; valor: string }[] = [
        { etiqueta: pr.titulo, valor: pr.titulo },
        { etiqueta: pr.clase, valor: pr.clase },
        { etiqueta: pr.unidad, valor: pr.unidad },
      ];
      for (const id of pr.entidades) {
        const nm = nombre.get(id);
        if (nm) es.push({ etiqueta: nm, valor: nm });
      }
      return es;
    })
    .filter((l) => l.length > 0);
}

/**
 * Entity network from the AUTOGENES graph — read-only. Nodes are the
 * graph's entidades, edges its relaciones (weight is the stored 0..1
 * confidence, floored above zero). Only invoked when the operator turns
 * this source on; the substrate is never modified here.
 */
export function redDesdeAutogenes(
  entidades: Entidad[],
  relaciones: Relacion[],
): RedSig {
  const nodos: NodoRed[] = entidades.map((e) => ({
    id: e.id,
    etiqueta: e.nombre,
    tipo: "entidad",
    peso: 1,
  }));
  const existe = new Set(entidades.map((e) => e.id));
  const acc = acumulador();
  for (const r of relaciones) {
    if (!existe.has(r.desdeId) || !existe.has(r.hastaId)) continue;
    acc.sumar(r.desdeId, r.hastaId, Math.max(0.1, r.peso));
  }
  return { nodos, enlaces: acc.enlaces() };
}

/**
 * Combine the active sources into one network. Node ids are namespaced by
 * source key so distinct sources never collide; there is no cross-source
 * merge (a datos concept and a graph entity stay separate) until an
 * explicit resolver lands. Endpoints are carried in the value, so any id
 * is safe.
 */
export interface ParteFuente {
  clave: string;
  red: RedSig;
}

export function combinarRedes(partes: ParteFuente[]): RedSig {
  const nodos: NodoRed[] = [];
  const pesos = new Map<string, EnlaceRed>();
  const pref = (clave: string, id: string) => `${clave}::${id}`;
  for (const { clave, red } of partes) {
    for (const n of red.nodos) nodos.push({ ...n, id: pref(clave, n.id) });
    for (const e of red.enlaces) {
      const origen = pref(clave, e.origen);
      const destino = pref(clave, e.destino);
      const key = JSON.stringify([origen, destino]);
      const prev = pesos.get(key);
      if (prev) prev.peso += e.peso;
      else pesos.set(key, { origen, destino, peso: e.peso });
    }
  }
  return { nodos, enlaces: [...pesos.values()] };
}

export interface SerieConector {
  etiqueta: string;
  /** Numeric values in chronological order (oldest first). */
  valores: number[];
}

/**
 * Numeric series hidden in the connector sources (N2): repeated queries
 * of the same label (FIX, CETES, UDI…) accumulate as fuente items over
 * time. Group by label, parse the numeric values in chronological order
 * and keep the series long enough to say something (≥ 6 points) — these
 * feed the radar's FUENTES spoke. Pure.
 */
export function seriesDeConectores(items: FuenteItem[]): SerieConector[] {
  const grupos = new Map<string, { t: number; v: number }[]>();
  for (const f of items) {
    if (f.origen !== "conector") continue;
    const v = Number.parseFloat(f.valor.replace(/[^0-9eE+.-]/g, ""));
    if (!Number.isFinite(v)) continue;
    const lista = grupos.get(f.etiqueta) ?? [];
    lista.push({ t: f.createdAt, v });
    grupos.set(f.etiqueta, lista);
  }
  return [...grupos]
    .map(([etiqueta, puntos]) => ({
      etiqueta,
      valores: puntos.sort((a, b) => a.t - b.t).map((p) => p.v),
    }))
    .filter((s) => s.valores.length >= 6)
    .sort((a, b) => (a.etiqueta < b.etiqueta ? -1 : 1));
}

/**
 * Apply the operator's approved fusions (N3) at projection time: items
 * whose label was fused into a canonical one project under that label.
 * The stored fuentes are never rewritten — undoing a fusion is just
 * removing the mapping. One hop by construction (the store flattens
 * chains on write). Pure.
 */
export function aplicarFusiones(
  items: FuenteItem[],
  fusiones: Record<string, string>,
): FuenteItem[] {
  if (Object.keys(fusiones).length === 0) return items;
  return items.map((it) => {
    const destino = fusiones[it.etiqueta];
    return destino ? { ...it, etiqueta: destino } : it;
  });
}
