import type { Fragmento, PreguntaQuiz, PuntoResumen } from "@/types/autogenes";
import type { FragmentoPrompt } from "@/lib/extraccion";

/**
 * Study-module helpers (A4) — pure. Quiz questions and summary points
 * come from the model; these enforce the provenance law before the
 * operator sees anything: evidence must point at real fragmentos, a
 * question with an out-of-range answer dies, duplicates collapse.
 */

const MAX_CHARS_FRAGMENTO = 1600;

/**
 * Study runs are single-pass: sample fragments EVENLY across the source
 * so a long document contributes its whole arc, not just its opening.
 * Honest limit — beyond the budget, coverage is sampled, not total.
 */
export function muestrearFragmentos(
  fragmentos: Fragmento[],
  maxFragmentos = 24,
  maxChars = 12_000,
): FragmentoPrompt[] {
  const utiles = fragmentos
    .filter((f) => f.texto.trim().length > 0)
    .map((f) => ({
      id: f.id,
      pagina: f.pagina,
      texto: f.texto.slice(0, MAX_CHARS_FRAGMENTO),
    }));
  let muestra = utiles;
  if (utiles.length > maxFragmentos) {
    const paso = utiles.length / maxFragmentos;
    const indices = new Set<number>();
    for (let i = 0; i < maxFragmentos; i++) {
      indices.add(Math.min(utiles.length - 1, Math.floor(i * paso)));
    }
    muestra = [...indices].sort((a, b) => a - b).map((i) => utiles[i]);
  }
  const salida: FragmentoPrompt[] = [];
  let chars = 0;
  for (const f of muestra) {
    if (salida.length > 0 && chars + f.texto.length > maxChars) break;
    salida.push(f);
    chars += f.texto.length;
  }
  return salida;
}

/**
 * Provenance + shape law for quiz questions:
 * - evidence filtered to real fragment ids; empty evidence → drop
 * - `correcta` must index into `opciones`
 * - options must be distinct; duplicate questions collapse
 */
export function sanearQuiz(
  preguntas: PreguntaQuiz[],
  fragmentoIds: ReadonlySet<string>,
  max = 10,
): PreguntaQuiz[] {
  const salida: PreguntaQuiz[] = [];
  const vistas = new Set<string>();
  for (const p of preguntas) {
    const evidencia = [
      ...new Set(p.evidencia.filter((id) => fragmentoIds.has(id))),
    ];
    const clave = p.pregunta.toLowerCase();
    const opcionesUnicas = new Set(p.opciones.map((o) => o.toLowerCase()));
    if (
      evidencia.length === 0 ||
      vistas.has(clave) ||
      opcionesUnicas.size !== p.opciones.length ||
      p.correcta >= p.opciones.length
    ) {
      continue;
    }
    vistas.add(clave);
    salida.push({ ...p, evidencia });
    if (salida.length >= max) break;
  }
  return salida;
}

/** Provenance law for summary points; duplicate texts collapse. */
export function sanearResumen(
  puntos: PuntoResumen[],
  fragmentoIds: ReadonlySet<string>,
  max = 12,
): PuntoResumen[] {
  const salida: PuntoResumen[] = [];
  const vistos = new Set<string>();
  for (const p of puntos) {
    const evidencia = [
      ...new Set(p.evidencia.filter((id) => fragmentoIds.has(id))),
    ];
    const clave = p.texto.toLowerCase();
    if (evidencia.length === 0 || vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ ...p, evidencia });
    if (salida.length >= max) break;
  }
  return salida;
}
