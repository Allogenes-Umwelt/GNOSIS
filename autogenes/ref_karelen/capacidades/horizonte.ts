import type { SnapshotQualia } from "@/capacidades/anomalias";

/**
 * Event horizon (M4) — ACTUAR's honest core. The oscilloscope's waves are
 * the operator's OWN sampled telemetry (the qualia snapshots); the
 * vertical lines are the operator's interventions from the D1 audit log;
 * the delta around each line is measured between the nearest samples
 * before and after — never interpolated, never invented. Pure.
 */

export interface PuntoHorizonte {
  ts: number;
  nNodos: number;
  nEnlaces: number;
  densidad: number;
}

export interface Intervencion {
  ts: number;
  accion: string;
  detalle: string;
}

export interface LineaIntervencion extends Intervencion {
  /** Metric delta between the samples flanking the intervention;
   * null while no later sample exists to measure against. */
  delta: { nodos: number; enlaces: number } | null;
}

export interface Horizonte {
  /** Samples oldest → newest. */
  puntos: PuntoHorizonte[];
  /** Interventions inside the sampled window, oldest → newest, capped. */
  lineas: LineaIntervencion[];
  t0: number;
  t1: number;
  maxNodos: number;
  maxEnlaces: number;
}

export function construirHorizonte(
  snapshots: SnapshotQualia[],
  intervenciones: Intervencion[],
  maxLineas = 12,
): Horizonte | null {
  if (snapshots.length === 0) return null;
  const puntos: PuntoHorizonte[] = [...snapshots]
    .sort((a, b) => a.ts - b.ts)
    .map((s) => ({
      ts: s.ts,
      nNodos: s.nNodos,
      nEnlaces: s.nEnlaces,
      densidad: s.densidad,
    }));
  const t0 = puntos[0].ts;
  const t1 = puntos[puntos.length - 1].ts;

  const lineas: LineaIntervencion[] = intervenciones
    .filter((i) => i.ts >= t0 && i.ts <= t1)
    .sort((a, b) => a.ts - b.ts)
    .slice(-maxLineas)
    .map((i) => {
      let antes: PuntoHorizonte | null = null;
      let despues: PuntoHorizonte | null = null;
      for (const p of puntos) {
        if (p.ts <= i.ts) antes = p;
        if (p.ts >= i.ts && despues === null) despues = p;
      }
      const delta =
        antes !== null && despues !== null && despues.ts > antes.ts
          ? {
              nodos: despues.nNodos - antes.nNodos,
              enlaces: despues.nEnlaces - antes.nEnlaces,
            }
          : null;
      return { ...i, delta };
    });

  return {
    puntos,
    lineas,
    t0,
    t1,
    maxNodos: Math.max(...puntos.map((p) => p.nNodos), 1),
    maxEnlaces: Math.max(...puntos.map((p) => p.nEnlaces), 1),
  };
}
