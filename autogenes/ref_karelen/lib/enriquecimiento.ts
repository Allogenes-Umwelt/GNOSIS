import { z } from "zod";
import type { Entidad } from "@/types/autogenes";

/**
 * C4 — connector-driven enrichment, adjudicated by the operator. The
 * system only DETECTS gaps (entities without a ficha) and parses what
 * the open connectors return; nothing is written without an explicit
 * "Aplicar". Geo gaps stay in Territorio (B4); this covers the ficha.
 */

/** Omission key persisted in paresDescartados — never re-proposed. */
export function claveOmision(entidadId: string): string {
  return `enr:${entidadId}`;
}

const MAX_OPORTUNIDADES = 8;

/** Entities lacking a summary — the ficha gap, oldest first. */
export function oportunidadesFicha(
  entidades: Entidad[],
  omitidas: Set<string>,
): Entidad[] {
  return entidades
    .filter(
      (e) =>
        (e.resumen ?? "").trim().length === 0 &&
        !omitidas.has(claveOmision(e.id)),
    )
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, MAX_OPORTUNIDADES);
}

const CandidatoFichaSchema = z.object({
  id: z.string(),
  nombre: z.string().optional(),
  descripcion: z.string().optional(),
  url: z.string().optional(),
});
export type CandidatoFicha = z.infer<typeof CandidatoFichaSchema>;

const EnvolturaSchema = z.object({
  obtenido: z.string().optional(),
  datos: z.array(CandidatoFichaSchema),
});

/** Parse the /api/conector envelope; candidates without a description
 *  carry nothing applicable and are dropped. Invalid shape → empty. */
export function parsearCandidatosFicha(json: unknown): CandidatoFicha[] {
  const parsed = EnvolturaSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.datos.filter(
    (c) => (c.descripcion ?? "").trim().length > 0,
  );
}

/* ── N3: batch enrichment, still adjudicated by the operator ──────── */

/**
 * Entity types worth linking against a PUBLIC knowledge graph. Personas
 * are excluded BY DESIGN: private people are not in Wikidata, and their
 * names should not travel out looking for a match.
 */
export const TIPOS_ENLAZABLES = new Set([
  "concepto",
  "organizacion",
  "lugar",
  "termino",
  "servicio",
]);

const MAX_LOTE = 6;

/** Ficha gaps eligible for the batch pass: linkable types only. */
export function candidatosLote(
  entidades: Entidad[],
  omitidas: Set<string>,
): Entidad[] {
  return entidades
    .filter(
      (e) =>
        TIPOS_ENLAZABLES.has(e.tipo) &&
        (e.resumen ?? "").trim().length === 0 &&
        !omitidas.has(claveOmision(e.id)),
    )
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, MAX_LOTE);
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Deterministic, explainable match confidence in [0,1]: exact label
 * match carries most of it, a real description adds, and a partial
 * containment adds a little. No model opinion anywhere.
 */
export function confianzaFicha(
  nombreEntidad: string,
  ficha: CandidatoFicha,
): number {
  const a = normalizar(nombreEntidad);
  const b = normalizar(ficha.nombre ?? "");
  let puntaje = 0;
  if (a.length > 0 && a === b) puntaje += 0.6;
  else if (b.length >= 3 && (a.includes(b) || b.includes(a))) puntaje += 0.3;
  if ((ficha.descripcion ?? "").trim().length > 0) puntaje += 0.2;
  if ((ficha.url ?? "").length > 0) puntaje += 0.1;
  return Math.min(1, puntaje);
}
