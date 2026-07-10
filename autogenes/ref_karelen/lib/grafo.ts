import type {
  Artefacto,
  Entidad,
  Fragmento,
  Relacion,
} from "@/types/autogenes";

/**
 * Graph projection for the SIGNATURE canvas — pure, testable. Artefactos
 * are Frame (anchored documents); entidades are Coral (live intelligence).
 * Cita edges are derived from evidence: entidad → the artefactos its
 * fragmentos belong to. Relacion edges connect entidades directly.
 */

export interface NodoGrafo {
  id: string;
  /** Frame kinds (grey, anchored): artefacto, nucleo, campo, dato,
      fragmento, producto (docked deliverables — what is docked is
      document). Coral kind (live intelligence): entidad. */
  kind:
    | "artefacto"
    | "entidad"
    | "nucleo"
    | "campo"
    | "dato"
    | "fragmento"
    | "producto";
  etiqueta: string;
  tipo?: string;
  /** Connection count — drives size/mass. */
  grado: number;
  /** Deterministic orientation seed derived from the id (no randomness). */
  seed: number;
  // d3-force simulation fields
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface EnlaceGrafo {
  id: string;
  source: string;
  target: string;
  kind: "cita" | "relacion";
  peso: number;
  tipo?: string;
}

/** Stable small hash → [0, 2π) used for shard orientation. */
export function seedDe(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (h % 360) * (Math.PI / 180);
}

export function construirGrafo(
  artefactos: Artefacto[],
  fragmentos: Fragmento[],
  entidades: Entidad[],
  relaciones: Relacion[],
): { nodos: NodoGrafo[]; enlaces: EnlaceGrafo[] } {
  const fragAArtefacto = new Map(fragmentos.map((f) => [f.id, f.artefactoId]));
  const artefactoIds = new Set(artefactos.map((a) => a.id));
  const entidadIds = new Set(entidades.map((e) => e.id));

  const enlaces: EnlaceGrafo[] = [];

  // Cita edges: entidad → artefacto, deduped, weighted by evidence count.
  for (const e of entidades) {
    const conteo = new Map<string, number>();
    for (const fragId of e.evidencia) {
      const artId = fragAArtefacto.get(fragId);
      if (artId && artefactoIds.has(artId)) {
        conteo.set(artId, (conteo.get(artId) ?? 0) + 1);
      }
    }
    for (const [artId, n] of conteo) {
      enlaces.push({
        id: `cita-${e.id}-${artId}`,
        source: e.id,
        target: artId,
        kind: "cita",
        peso: Math.min(1, 0.3 + n * 0.2),
      });
    }
  }

  // Relacion edges: only when both endpoints exist.
  for (const r of relaciones) {
    if (entidadIds.has(r.desdeId) && entidadIds.has(r.hastaId)) {
      enlaces.push({
        id: r.id,
        source: r.desdeId,
        target: r.hastaId,
        kind: "relacion",
        peso: r.peso,
        tipo: r.tipo,
      });
    }
  }

  const grados = new Map<string, number>();
  for (const l of enlaces) {
    grados.set(l.source, (grados.get(l.source) ?? 0) + 1);
    grados.set(l.target, (grados.get(l.target) ?? 0) + 1);
  }

  const nodos: NodoGrafo[] = [
    ...artefactos.map((a) => ({
      id: a.id,
      kind: "artefacto" as const,
      etiqueta: a.nombre,
      grado: grados.get(a.id) ?? 0,
      seed: seedDe(a.id),
    })),
    ...entidades.map((e) => ({
      id: e.id,
      kind: "entidad" as const,
      etiqueta: e.nombre,
      tipo: e.tipo,
      grado: grados.get(e.id) ?? 0,
      seed: seedDe(e.id),
    })),
  ];

  return { nodos, enlaces };
}
