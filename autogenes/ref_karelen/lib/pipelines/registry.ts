import { pipelineCfdi } from "@/lib/pipelines/cfdi";
import { pipelineCsv } from "@/lib/pipelines/csv";
import { pipelineIcs } from "@/lib/pipelines/ics";
import type { Pipeline } from "@/types/pipeline";

/**
 * Pipeline registry (D4) — the allowlist of structured-source parsers.
 * Order matters: first match wins (CFDI before generic XML sniffs).
 * Adding a pipeline = one line here; nothing else changes.
 */
export const pipelines: readonly Pipeline[] = [
  pipelineCfdi,
  pipelineCsv,
  pipelineIcs,
];

export function detectarPipeline(
  nombre: string,
  contenido: string,
): Pipeline | undefined {
  return pipelines.find((p) => p.detecta(nombre, contenido));
}

/** File extensions the intake routes to the pipeline path. */
export const EXTENSIONES_ESTRUCTURADAS = /\.(csv|xml|ics)$/i;
