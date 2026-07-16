/**
 * Numeric time-series analysis for QUALIA's phase & dynamics lens — pure,
 * deterministic. Delay embedding (Takens), an autocorrelation-chosen delay,
 * and a recurrence matrix. A real series (a price history, a measurement
 * log) reveals its dynamics as geometry; noise looks like noise — honestly.
 */

/** Parse a pasted blob into an ordered numeric series. */
export function parsearSerie(texto: string): number[] {
  return texto
    .split(/[\s,;]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

export interface EstadisticaSerie {
  n: number;
  min: number;
  max: number;
  media: number;
  desv: number;
}

export function estadisticaSerie(serie: number[]): EstadisticaSerie {
  const n = serie.length;
  if (n === 0) return { n: 0, min: 0, max: 0, media: 0, desv: 0 };
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const media = serie.reduce((s, x) => s + x, 0) / n;
  const varr = serie.reduce((s, x) => s + (x - media) ** 2, 0) / n;
  return { n, min, max, media, desv: Math.sqrt(varr) };
}

/** Normalized autocorrelation at a lag (mean-centred). */
export function autocorrelacion(serie: number[], lag: number): number {
  const n = serie.length;
  if (lag <= 0 || lag >= n) return 0;
  const media = serie.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) den += (serie[i] - media) ** 2;
  for (let i = 0; i < n - lag; i++) num += (serie[i] - media) * (serie[i + lag] - media);
  return den === 0 ? 0 : num / den;
}

/**
 * Embedding delay τ — the first lag where autocorrelation falls below 1/e
 * (decorrelation), else the first local minimum, else 1. Bounds the search
 * to a quarter of the series.
 */
export function retardoOptimo(serie: number[]): number {
  const maxLag = Math.max(1, Math.min(50, Math.floor(serie.length / 4)));
  let previa = autocorrelacion(serie, 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    const ac = autocorrelacion(serie, lag);
    if (ac < 1 / Math.E) return lag;
    if (lag > 1 && ac > previa) return lag - 1; // passed a local minimum
    previa = ac;
  }
  return 1;
}

/** Takens delay-embedding vectors of the given dimension. */
export function embeddingRetardo(serie: number[], tau: number, dim: number): number[][] {
  const t = Math.max(1, tau);
  const salida: number[][] = [];
  for (let i = 0; i + (dim - 1) * t < serie.length; i++) {
    const v: number[] = [];
    for (let d = 0; d < dim; d++) v.push(serie[i + d * t]);
    salida.push(v);
  }
  return salida;
}

export interface Recurrencia {
  /** Square matrix (possibly downsampled) — true where states recur. */
  matriz: boolean[][];
  n: number;
}

/**
 * Recurrence matrix over the 2-D delay embedding: cell (i,j) is set when the
 * embedded states i and j are within a threshold (a low percentile of all
 * pairwise distances, so ~10% of the plane recurs). Downsampled above a cap
 * to keep it O(n²)-bounded and legible.
 */
export function recurrencia(serie: number[], tau: number, umbralFrac = 0.12): Recurrencia {
  const emb = embeddingRetardo(serie, tau, 2);
  const tope = 200;
  const paso = Math.max(1, Math.ceil(emb.length / tope));
  const pts = emb.filter((_, i) => i % paso === 0);
  const n = pts.length;
  if (n === 0) return { matriz: [], n: 0 };
  const dist: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      dist.push(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
    }
  }
  const ordenadas = [...dist].sort((a, b) => a - b);
  const umbral =
    ordenadas.length === 0
      ? 0
      : ordenadas[Math.min(ordenadas.length - 1, Math.floor(ordenadas.length * umbralFrac))];
  const matriz: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matriz[i][j] = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) <= umbral;
    }
  }
  return { matriz, n };
}
