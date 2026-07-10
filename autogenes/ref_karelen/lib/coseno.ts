/**
 * Cosine similarity and brute-force top-k over a small vector set. Pure and
 * deterministic — at personal scale (a few thousand fragments) brute force
 * is plenty, and it keeps the semantic lane as explainable as BM25. The
 * embedder normalizes vectors, so cosine reduces to a dot product.
 */

export interface VectorDoc {
  id: string;
  vector: number[];
}

export function coseno(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export interface PuntajeSemantico {
  id: string;
  score: number;
}

/** Rank docs by cosine to the query vector; ties broken by input order. */
export function topKcoseno(
  consulta: number[],
  docs: VectorDoc[],
  k: number,
): PuntajeSemantico[] {
  return docs
    .map((d) => ({ id: d.id, score: coseno(consulta, d.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
