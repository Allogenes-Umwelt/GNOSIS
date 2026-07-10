import type {
  Fragmento,
  PropuestaEntidad,
  PropuestaGrafo,
  PropuestaRelacion,
} from "@/types/autogenes";

/**
 * Extraction pipeline helpers — pure. The model proposes; these enforce
 * the provenance law before anything reaches the operator: evidence must
 * point at real fragmentos, relations must resolve to known entity
 * names, and nothing survives without a citation.
 */

export interface FragmentoPrompt {
  id: string;
  pagina?: number;
  texto: string;
}

const MAX_CHARS_FRAGMENTO = 1600;
/** Hard cap the API route enforces per pass — must never be exceeded
 *  here, or a many-short-pages PDF 400s and extraction "randomly"
 *  fails. Keep in sync with FragmentosSchema.max() in /api/autogenes. */
export const MAX_FRAGMENTOS_POR_PASE = 24;

/** Chunk fragments into passes bounded by chars AND fragment count. */
export function partirFragmentos(
  fragmentos: Fragmento[],
  maxCharsPorPase = 12_000,
): FragmentoPrompt[][] {
  const utiles = fragmentos
    .filter((f) => f.texto.trim().length > 0)
    .map((f) => ({
      id: f.id,
      pagina: f.pagina,
      texto: f.texto.slice(0, MAX_CHARS_FRAGMENTO),
    }));
  const pases: FragmentoPrompt[][] = [];
  let actual: FragmentoPrompt[] = [];
  let chars = 0;
  for (const f of utiles) {
    if (
      actual.length > 0 &&
      (chars + f.texto.length > maxCharsPorPase ||
        actual.length >= MAX_FRAGMENTOS_POR_PASE)
    ) {
      pases.push(actual);
      actual = [];
      chars = 0;
    }
    actual.push(f);
    chars += f.texto.length;
  }
  if (actual.length > 0) pases.push(actual);
  return pases;
}

/**
 * Sanitize a model proposal against the provenance law:
 * - evidence filtered to ids that actually exist; empty evidence → drop
 * - relations must connect proposed or already-known entity names
 * - self-relations and duplicates collapse
 */
export function sanearPropuesta(
  propuesta: PropuestaGrafo,
  fragmentoIds: ReadonlySet<string>,
  nombresExistentes: readonly string[] = [],
): PropuestaGrafo {
  const entidades: PropuestaEntidad[] = [];
  const vistos = new Set<string>();
  for (const e of propuesta.entidades) {
    const evidencia = [...new Set(e.evidencia.filter((id) => fragmentoIds.has(id)))];
    const clave = e.nombre.trim().toLowerCase();
    if (evidencia.length === 0 || clave.length === 0 || vistos.has(clave)) {
      continue;
    }
    vistos.add(clave);
    entidades.push({ ...e, nombre: e.nombre.trim(), evidencia });
  }

  const conocidos = new Set([
    ...entidades.map((e) => e.nombre.toLowerCase()),
    ...nombresExistentes.map((n) => n.trim().toLowerCase()),
  ]);
  const relaciones: PropuestaRelacion[] = [];
  const parVisto = new Set<string>();
  for (const r of propuesta.relaciones) {
    const desde = r.desde.trim();
    const hasta = r.hasta.trim();
    const evidencia = [...new Set(r.evidencia.filter((id) => fragmentoIds.has(id)))];
    const par = `${desde.toLowerCase()}→${hasta.toLowerCase()}·${r.tipo.toLowerCase()}`;
    if (
      evidencia.length === 0 ||
      desde.toLowerCase() === hasta.toLowerCase() ||
      !conocidos.has(desde.toLowerCase()) ||
      !conocidos.has(hasta.toLowerCase()) ||
      parVisto.has(par)
    ) {
      continue;
    }
    parVisto.add(par);
    relaciones.push({
      ...r,
      desde,
      hasta,
      peso: Math.min(1, Math.max(0, r.peso)),
      evidencia,
    });
  }
  return { entidades, relaciones };
}

/** Merge multi-pass proposals: union evidence, dedupe by name/pair. */
export function fusionarPropuestas(
  a: PropuestaGrafo,
  b: PropuestaGrafo,
): PropuestaGrafo {
  const entidades = [...a.entidades];
  const porNombre = new Map(
    entidades.map((e) => [e.nombre.toLowerCase(), e] as const),
  );
  for (const e of b.entidades) {
    const previa = porNombre.get(e.nombre.toLowerCase());
    if (previa) {
      previa.evidencia = [...new Set([...previa.evidencia, ...e.evidencia])];
      previa.resumen = previa.resumen ?? e.resumen;
    } else {
      const copia = { ...e };
      entidades.push(copia);
      porNombre.set(copia.nombre.toLowerCase(), copia);
    }
  }
  const relaciones = [...a.relaciones];
  const pares = new Set(
    relaciones.map(
      (r) => `${r.desde.toLowerCase()}→${r.hasta.toLowerCase()}·${r.tipo.toLowerCase()}`,
    ),
  );
  for (const r of b.relaciones) {
    const par = `${r.desde.toLowerCase()}→${r.hasta.toLowerCase()}·${r.tipo.toLowerCase()}`;
    if (!pares.has(par)) {
      pares.add(par);
      relaciones.push(r);
    }
  }
  return { entidades, relaciones };
}

/** Pull the first JSON object out of a model reply (fences, prose). */
export function extraerJson(texto: string): string | null {
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio === -1 || fin <= inicio) return null;
  return texto.slice(inicio, fin + 1);
}
