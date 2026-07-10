/**
 * String similarity primitives for entity resolution — pure, on-device,
 * deterministic. Spanish-first: normalization strips accents and
 * articles before any metric runs, because "Administración" vs
 * "administracion" is not a difference, it's an accent.
 */

const ARTICULOS = new Set([
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "y",
  "e",
  "un",
  "una",
]);

/**
 * Lowercase, strip accents/punctuation, collapse whitespace. Note: NFD
 * folds ñ→n before the charset filter, so ñ never survives — consistent
 * on both sides of every comparison, which is all matching needs.
 */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized tokens with connective articles dropped. */
export function tokensDe(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((t) => t.length > 0 && !ARTICULOS.has(t));
}

/** Levenshtein distance → similarity in [0,1]. */
export function similitudLevenshtein(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) {
      fila.push(
        Math.min(
          prev[j] + 1,
          fila[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    }
    prev = fila;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** Jaro similarity in [0,1]. */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const rango = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const matchA = new Array<boolean>(la).fill(false);
  const matchB = new Array<boolean>(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const desde = Math.max(0, i - rango);
    const hasta = Math.min(lb - 1, i + rango);
    for (let j = desde; j <= hasta; j++) {
      if (!matchB[j] && a[i] === b[j]) {
        matchA[i] = true;
        matchB[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  let transposiciones = 0;
  for (let i = 0; i < la; i++) {
    if (!matchA[i]) continue;
    while (!matchB[k]) k++;
    if (a[i] !== b[k]) transposiciones++;
    k++;
  }
  const t = transposiciones / 2;
  return (matches / la + matches / lb + (matches - t) / matches) / 3;
}

/** Jaro-Winkler: Jaro boosted by common prefix (names, siglas). */
export function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  let prefijo = 0;
  const max = Math.min(4, a.length, b.length);
  while (prefijo < max && a[prefijo] === b[prefijo]) prefijo++;
  return j + prefijo * 0.1 * (1 - j);
}

/** Acronym signal: "sat" vs "servicio administracion tributaria". */
export function esAcronimo(corto: string, largo: string): boolean {
  const c = normalizar(corto).replace(/\s/g, "");
  const iniciales = tokensDe(largo)
    .map((t) => t[0])
    .join("");
  return c.length >= 2 && iniciales.length >= 2 && c === iniciales;
}

/** Jaccard over token sets, with containment credit for subset names. */
export function similitudTokens(a: string, b: string): number {
  const ta = new Set(tokensDe(a));
  const tb = new Set(tokensDe(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  const contencion = inter / Math.min(ta.size, tb.size);
  return Math.max(jaccard, contencion * 0.9);
}

/**
 * Name similarity for resolution: the max of character metrics over the
 * normalized full strings, token overlap, and the acronym signal.
 */
export function similitudNombres(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;
  if (esAcronimo(na, nb) || esAcronimo(nb, na)) return 0.92;
  return Math.max(
    jaroWinkler(na, nb),
    similitudLevenshtein(na, nb),
    similitudTokens(a, b),
  );
}
