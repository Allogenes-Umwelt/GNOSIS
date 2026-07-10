import type { PrecisionFecha, TipoEntidad } from "@/types/autogenes";

/**
 * D4 — structured-source pipelines. A pipeline is a PURE, deterministic
 * local parser for a recurring file format (CFDI, bank CSV, ICS…). It
 * never touches the network or a model; it emits fragmentos (the
 * provenance units), plus entities and dated events that cite them by
 * INDEX — the docking service resolves indices to real fragment ids,
 * so lineage is enforced by construction.
 */

export interface FragmentoPipeline {
  texto: string;
  pagina?: number;
}

export interface EntidadPipeline {
  nombre: string;
  tipo: TipoEntidad;
  resumen?: string;
  /** Indices into the emitted fragmentos this entity is drawn from. */
  fragmentos: number[];
}

export interface EventoPipeline {
  titulo: string;
  /** Normalized ISO date (AAAA-MM-DD). */
  fecha: string;
  precision: PrecisionFecha;
  entidades: string[];
  /** Indices into the emitted fragmentos that date this event. */
  fragmentos: number[];
}

export interface ResultadoPipeline {
  fragmentos: FragmentoPipeline[];
  entidades: EntidadPipeline[];
  eventos: EventoPipeline[];
}

export interface Pipeline {
  id: string;
  nombre: string;
  descripcion: string;
  /** Cheap sniff: filename + content head. No side effects. */
  detecta: (nombre: string, contenido: string) => boolean;
  /** Pure transform. Throws Error with an operator-words message. */
  procesar: (nombre: string, contenido: string) => ResultadoPipeline;
}
