import { esAcronimo, normalizar, similitudNombres, tokensDe } from "@/lib/similitud";
import type { Entidad, Relacion } from "@/types/autogenes";

/**
 * Entity resolution — deterministic core, fully explainable. No learned
 * weights, no black box: every proposed fusion carries the signals that
 * produced its score (name similarity, type compatibility, shared
 * evidence, shared neighbors). The operator is the judge; SYNESIS can
 * adjudicate the ambiguous middle on request.
 */

export interface SenalesFusion {
  nombre: number;
  tipoCompatible: boolean;
  evidenciaCompartida: number;
  vecinosCompartidos: number;
}

export interface PropuestaFusion {
  aId: string;
  bId: string;
  score: number;
  senales: SenalesFusion;
}

export const UMBRAL_PROPUESTA = 0.72;

export function clavePar(aId: string, bId: string): string {
  return [aId, bId].sort().join("|");
}

/** Cheap pre-filter before the expensive metrics run on a pair. */
function pasaBloqueo(a: Entidad, b: Entidad): boolean {
  const ta = tokensDe(a.nombre);
  const tb = new Set(tokensDe(b.nombre));
  if (ta.some((t) => tb.has(t))) return true;
  const na = normalizar(a.nombre).replace(/\s/g, "");
  const nb = normalizar(b.nombre).replace(/\s/g, "");
  if (na.slice(0, 4) === nb.slice(0, 4)) return true;
  return esAcronimo(a.nombre, b.nombre) || esAcronimo(b.nombre, a.nombre);
}

function puntuar(
  a: Entidad,
  b: Entidad,
  vecinos: Map<string, Set<string>>,
): PropuestaFusion {
  const nombre = Math.max(
    similitudNombres(a.nombre, b.nombre),
    ...(a.alias ?? []).map((x) => similitudNombres(x, b.nombre)),
    ...(b.alias ?? []).map((x) => similitudNombres(a.nombre, x)),
  );
  const tipoCompatible =
    a.tipo === b.tipo || a.tipo === "otro" || b.tipo === "otro";
  const evA = new Set(a.evidencia);
  const evidenciaCompartida = b.evidencia.filter((x) => evA.has(x)).length;
  const va = vecinos.get(a.id) ?? new Set<string>();
  const vb = vecinos.get(b.id) ?? new Set<string>();
  let vecinosCompartidos = 0;
  for (const v of va) if (vb.has(v) && v !== a.id && v !== b.id) vecinosCompartidos++;

  // Explainable composite: name dominates; structure corroborates.
  let score = nombre * 0.72;
  score += tipoCompatible ? 0.08 : -0.12;
  score += Math.min(2, evidenciaCompartida) * 0.06;
  score += Math.min(2, vecinosCompartidos) * 0.04;

  return {
    aId: a.id,
    bId: b.id,
    score: Math.max(0, Math.min(1, score)),
    senales: { nombre, tipoCompatible, evidenciaCompartida, vecinosCompartidos },
  };
}

/**
 * Propose fusions across the whole entity layer. Pairs the operator
 * already ruled out (descartados) never come back.
 */
export function proponerFusiones(
  entidades: Entidad[],
  relaciones: Relacion[],
  descartados: ReadonlySet<string> = new Set(),
  max = 8,
): PropuestaFusion[] {
  const vecinos = new Map<string, Set<string>>();
  for (const r of relaciones) {
    if (!vecinos.has(r.desdeId)) vecinos.set(r.desdeId, new Set());
    if (!vecinos.has(r.hastaId)) vecinos.set(r.hastaId, new Set());
    vecinos.get(r.desdeId)!.add(r.hastaId);
    vecinos.get(r.hastaId)!.add(r.desdeId);
  }

  const propuestas: PropuestaFusion[] = [];
  for (let i = 0; i < entidades.length; i++) {
    for (let j = i + 1; j < entidades.length; j++) {
      const a = entidades[i];
      const b = entidades[j];
      if (descartados.has(clavePar(a.id, b.id))) continue;
      if (!pasaBloqueo(a, b)) continue;
      const p = puntuar(a, b, vecinos);
      if (p.score >= UMBRAL_PROPUESTA) propuestas.push(p);
    }
  }
  return propuestas.sort((x, y) => y.score - x.score).slice(0, max);
}
