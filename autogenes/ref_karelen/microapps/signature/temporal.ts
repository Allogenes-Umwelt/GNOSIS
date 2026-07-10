/**
 * Temporal activity — the honest time signal QUALIA actually has: when each
 * concept entered, by source. Bins timestamped events into buckets and
 * counts per group, for a stacked stream over time. Pure and deterministic.
 * (Dense numeric time-series — for phase space or wavelets — need a series
 * source; this is the ingesta signal, labelled as such.)
 */

export interface EventoTemporal {
  t: number;
  grupo: string;
}

export interface Cubeta {
  idx: number;
  cuenta: Map<string, number>;
  total: number;
}

export interface SerieTemporal {
  t0: number;
  t1: number;
  grupos: string[];
  cubetas: Cubeta[];
  maxTotal: number;
}

export function serieTemporal(eventos: EventoTemporal[], nCubetas = 28): SerieTemporal {
  if (eventos.length === 0) {
    return { t0: 0, t1: 0, grupos: [], cubetas: [], maxTotal: 0 };
  }
  const ts = eventos.map((e) => e.t);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const span = Math.max(1, t1 - t0);
  const cubetas: Cubeta[] = Array.from({ length: nCubetas }, (_, i) => ({
    idx: i,
    cuenta: new Map<string, number>(),
    total: 0,
  }));
  const grupos = new Set<string>();
  for (const e of eventos) {
    grupos.add(e.grupo);
    let b = Math.floor(((e.t - t0) / span) * nCubetas);
    if (b >= nCubetas) b = nCubetas - 1;
    if (b < 0) b = 0;
    const bk = cubetas[b];
    bk.cuenta.set(e.grupo, (bk.cuenta.get(e.grupo) ?? 0) + 1);
    bk.total += 1;
  }
  const maxTotal = Math.max(0, ...cubetas.map((c) => c.total));
  return { t0, t1, grupos: [...grupos].sort(), cubetas, maxTotal };
}
