import type { Entidad, Relacion } from "@/types/autogenes";

/**
 * Constelaciones — community detection over the entity graph, computed
 * entirely on device (no model, no network). Deterministic label
 * propagation: same graph in, same clusters out. Edges combine declared
 * relations (strong) with co-citation — two entities drawn from the same
 * fragmento study together.
 */

export interface Constelacion {
  id: string;
  /** Name of the best-connected member — the cluster's banner. */
  etiqueta: string;
  miembros: string[];
}

const RONDAS_MAX = 16;

export function construirConstelaciones(
  entidades: Entidad[],
  relaciones: Relacion[],
): Constelacion[] {
  if (entidades.length < 2) return [];
  const ids = entidades.map((e) => e.id).sort();
  const idSet = new Set(ids);

  // Weighted adjacency: relations dominate, co-citations bind the rest.
  const peso = new Map<string, Map<string, number>>();
  const suma = (a: string, b: string, w: number) => {
    if (a === b || !idSet.has(a) || !idSet.has(b)) return;
    if (!peso.has(a)) peso.set(a, new Map());
    if (!peso.has(b)) peso.set(b, new Map());
    peso.get(a)!.set(b, (peso.get(a)!.get(b) ?? 0) + w);
    peso.get(b)!.set(a, (peso.get(b)!.get(a) ?? 0) + w);
  };
  for (const r of relaciones) {
    suma(r.desdeId, r.hastaId, 0.6 + r.peso * 0.4);
  }
  const porFragmento = new Map<string, string[]>();
  for (const e of entidades) {
    for (const fragId of e.evidencia) {
      const lista = porFragmento.get(fragId) ?? [];
      lista.push(e.id);
      porFragmento.set(fragId, lista);
    }
  }
  for (const compartidos of porFragmento.values()) {
    for (let i = 0; i < compartidos.length; i++) {
      for (let j = i + 1; j < compartidos.length; j++) {
        suma(compartidos[i], compartidos[j], 0.25);
      }
    }
  }

  // Async label propagation in sorted-id order; ties break to the
  // lexicographically smallest label. Fully deterministic.
  const etiqueta = new Map<string, string>(ids.map((id) => [id, id]));
  for (let ronda = 0; ronda < RONDAS_MAX; ronda++) {
    let cambio = false;
    for (const id of ids) {
      const vecinos = peso.get(id);
      if (!vecinos || vecinos.size === 0) continue;
      const votos = new Map<string, number>();
      for (const [vecino, w] of vecinos) {
        const l = etiqueta.get(vecino)!;
        votos.set(l, (votos.get(l) ?? 0) + w);
      }
      let mejor = etiqueta.get(id)!;
      let mejorVoto = -Infinity;
      for (const [l, v] of [...votos.entries()].sort((a, b) =>
        a[0] < b[0] ? -1 : 1,
      )) {
        if (v > mejorVoto) {
          mejorVoto = v;
          mejor = l;
        }
      }
      if (mejor !== etiqueta.get(id)) {
        etiqueta.set(id, mejor);
        cambio = true;
      }
    }
    if (!cambio) break;
  }

  const grupos = new Map<string, string[]>();
  for (const id of ids) {
    const l = etiqueta.get(id)!;
    const lista = grupos.get(l) ?? [];
    lista.push(id);
    grupos.set(l, lista);
  }

  const grado = new Map<string, number>();
  for (const [a, vecinos] of peso) {
    let g = 0;
    for (const w of vecinos.values()) g += w;
    grado.set(a, g);
  }
  const nombreDe = new Map(entidades.map((e) => [e.id, e.nombre] as const));

  return [...grupos.entries()]
    .filter(([, miembros]) => miembros.length >= 2)
    .map(([id, miembros]) => {
      const lider = [...miembros].sort(
        (a, b) => (grado.get(b) ?? 0) - (grado.get(a) ?? 0),
      )[0];
      return { id, etiqueta: nombreDe.get(lider) ?? "constelación", miembros };
    })
    .sort((a, b) => b.miembros.length - a.miembros.length)
    .slice(0, 12);
}
