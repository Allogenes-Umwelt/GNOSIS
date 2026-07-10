import { coseno } from "@/lib/coseno";

/**
 * Near-duplicate detection (N3) — QUALIA's semantic fusion engine. Given
 * labels and their embedding vectors (computed on device; nothing leaves),
 * find the pairs similar enough to PROPOSE as one concept. Proposals
 * only: the operator approves every fusion. Pure and deterministic for
 * fixed vectors.
 */

export interface ParSimilar {
  a: string;
  b: string;
  similitud: number;
}

export function paresSimilares(
  etiquetas: string[],
  vectores: number[][],
  umbral = 0.85,
  max = 6,
): ParSimilar[] {
  const n = Math.min(etiquetas.length, vectores.length);
  const pares: ParSimilar[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (etiquetas[i] === etiquetas[j]) continue;
      const s = coseno(vectores[i], vectores[j]);
      if (s >= umbral) {
        // Deterministic orientation: shorter label proposes to fuse into
        // the longer (more specific) one; ties break alphabetically.
        const [a, b] =
          etiquetas[i].length < etiquetas[j].length ||
          (etiquetas[i].length === etiquetas[j].length &&
            etiquetas[i] < etiquetas[j])
            ? [etiquetas[i], etiquetas[j]]
            : [etiquetas[j], etiquetas[i]];
        pares.push({ a, b, similitud: s });
      }
    }
  }
  return pares
    .sort((x, y) => y.similitud - x.similitud || (x.a < y.a ? -1 : 1))
    .slice(0, max);
}

/** Stable dismissal key for a proposed pair. */
export function clavePar(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
