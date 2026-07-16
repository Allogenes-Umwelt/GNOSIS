import { z } from "zod";
import { CampoSchema } from "@/types/microapp";

/**
 * AUTOGENES — the evidence-graph substrate and the system's unified
 * ontology. Artefactos (sources) hold Fragmentos (the unit of
 * provenance: a page's text, later a region); Entidades and Relaciones
 * form the live knowledge layer. Provenance law: anything SYNESIS
 * extracts from documents MUST cite fragmentos; entities declared by
 * the operator or remembered from conversation carry their origen as
 * provenance instead. One substrate — SIGNATURE, Ingesta, SYNESIS
 * memory and every future module sit on it.
 */

export const KINDS_ARTEFACTO = ["pdf", "imagen", "nota", "estructurado"] as const;
export const KindArtefactoSchema = z.enum(KINDS_ARTEFACTO);
export type KindArtefacto = z.infer<typeof KindArtefactoSchema>;

export const TIPOS_ENTIDAD = [
  "concepto",
  "persona",
  "organizacion",
  "lugar",
  "evento",
  "termino",
  "servicio",
  "documento",
  "otro",
] as const;
export const TipoEntidadSchema = z.enum(TIPOS_ENTIDAD);
export type TipoEntidad = z.infer<typeof TipoEntidadSchema>;

/** A source document/image/note. Binary lives in the blob store by key. */
export const ArtefactoSchema = z.object({
  id: z.string().min(1),
  kind: KindArtefactoSchema,
  nombre: z.string().min(1),
  paginas: z.number().int().nonnegative().optional(),
  blobKey: z.string().optional(),
  createdAt: z.number().int().positive(),
});
export type Artefacto = z.infer<typeof ArtefactoSchema>;

/** The unit of provenance: text of a page (later, a highlighted region). */
export const FragmentoSchema = z.object({
  id: z.string().min(1),
  artefactoId: z.string().min(1),
  pagina: z.number().int().positive().optional(),
  texto: z.string(),
  createdAt: z.number().int().positive(),
});
export type Fragmento = z.infer<typeof FragmentoSchema>;

/* ── Operator ontology (D2): the operator defines TYPES with
      structured properties over the base enum — "Póliza" (documento)
      with vigencia:fecha and prima:numero. Values are validated on
      write (src/lib/tipado.ts); the base enum keeps every existing
      consumer working. ─────────────────────────────────────────────── */

export const TIPOS_PROPIEDAD = ["texto", "numero", "fecha"] as const;
export const TipoPropiedadSchema = z.enum(TIPOS_PROPIEDAD);
export type TipoPropiedad = z.infer<typeof TipoPropiedadSchema>;

export const PropiedadDefSchema = z.object({
  clave: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  etiqueta: z.string().min(1).max(40),
  tipo: TipoPropiedadSchema,
  requerida: z.boolean().default(false),
});
export type PropiedadDef = z.infer<typeof PropiedadDefSchema>;

export const TipoOperadorSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1).max(40),
  /** Base entity type this specializes — keeps the whole system working. */
  base: TipoEntidadSchema,
  propiedades: z.array(PropiedadDefSchema).max(12),
  createdAt: z.number().int().positive(),
});
export type TipoOperador = z.infer<typeof TipoOperadorSchema>;

/**
 * D2b — operator relation types. A catalog entry declares which entity
 * types a named edge may join ("asegura a": organización → persona);
 * operator-declared links against the catalog validate on link. Extraction
 * keeps free-string types — the catalog governs the operator's hand, not
 * the model's proposals (those pass HITL review anyway).
 */
export const TipoRelacionSchema = z.object({
  id: z.string().min(1),
  /** Verb-first, operator words: "asegura a", "renta a", "trabaja en". */
  nombre: z.string().min(1).max(40),
  desde: TipoEntidadSchema,
  hasta: TipoEntidadSchema,
  createdAt: z.number().int().positive(),
});
export type TipoRelacion = z.infer<typeof TipoRelacionSchema>;

/** A geocode fix — where an entity of the world actually sits. */
export const GeoPuntoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type GeoPunto = z.infer<typeof GeoPuntoSchema>;

/** A node in the graph. Origin declared; extraction cites fragmentos. */
export const EntidadSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  tipo: TipoEntidadSchema,
  resumen: z.string().optional(),
  /** Semantic field of the operator's life this entity belongs to. */
  campo: CampoSchema.optional(),
  /** Names this entity also answers to — absorbed on fusion. */
  alias: z.array(z.string()).optional(),
  /** Coordinates fixed by the operator (geocoded, HITL-confirmed). */
  geo: GeoPuntoSchema.optional(),
  /** Operator type (TipoOperador id) this entity is typed as (D2). */
  subtipo: z.string().optional(),
  /** Structured property values, validated against the subtipo's defs. */
  propiedades: z.record(z.string(), z.string()).optional(),
  origen: z.enum(["operador", "synesis"]),
  /** Fragmentos this entity was drawn from — its provenance. */
  evidencia: z.array(z.string()),
  createdAt: z.number().int().positive(),
});
export type Entidad = z.infer<typeof EntidadSchema>;

/** A typed edge. Evidence is mandatory: which fragmentos support it. */
export const RelacionSchema = z.object({
  id: z.string().min(1),
  desdeId: z.string().min(1),
  hastaId: z.string().min(1),
  tipo: z.string().min(1),
  peso: z.number().min(0).max(1).default(0.5),
  evidencia: z.array(z.string()),
  createdAt: z.number().int().positive(),
});
export type Relacion = z.infer<typeof RelacionSchema>;

/* ── Time (B3): dated events, the third primitive. Every event cites
      the fragmentos that date it — no citation, no history. ─────────── */

export const PRECISIONES_FECHA = ["dia", "mes", "anio"] as const;
export const PrecisionFechaSchema = z.enum(PRECISIONES_FECHA);
export type PrecisionFecha = z.infer<typeof PrecisionFechaSchema>;

export const EventoSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  /** Normalized ISO date; month/year precision pads with 01. */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  precision: PrecisionFechaSchema,
  /** Entity names this event involves, as extracted. */
  entidades: z.array(z.string()).default([]),
  evidencia: z.array(z.string()),
  origen: z.enum(["operador", "synesis"]),
  createdAt: z.number().int().positive(),
});
export type Evento = z.infer<typeof EventoSchema>;

/** What the model proposes; fecha arrives free-form, normalized later. */
export const PropuestaEventoSchema = z.object({
  titulo: z
    .string()
    .min(1)
    .transform((s) => s.trim().slice(0, 160)),
  fecha: z.string().min(4),
  entidades: z
    .array(z.string().transform((s) => s.trim().slice(0, 80)))
    .default([]),
  evidencia: z.array(z.string()).default([]),
});
export type PropuestaEvento = z.infer<typeof PropuestaEventoSchema>;

/* ── Extraction proposal (A1): what SYNESIS proposes and the operator
      reviews. Names, not ids, link relations — resolved on integrate. ── */

export const PropuestaEntidadSchema = z.object({
  nombre: z
    .string()
    .min(1)
    .transform((s) => s.trim().slice(0, 80)),
  tipo: TipoEntidadSchema.catch("otro"),
  resumen: z
    .string()
    .transform((s) => s.slice(0, 200))
    .optional(),
  // Leniency here; the sanitizer enforces non-empty REAL evidence.
  evidencia: z.array(z.string()).default([]),
});
export type PropuestaEntidad = z.infer<typeof PropuestaEntidadSchema>;

export const PropuestaRelacionSchema = z.object({
  desde: z.string().min(1),
  hasta: z.string().min(1),
  tipo: z
    .string()
    .min(1)
    .transform((s) => s.slice(0, 60)),
  peso: z.number().catch(0.5).default(0.5),
  evidencia: z.array(z.string()).default([]),
});
export type PropuestaRelacion = z.infer<typeof PropuestaRelacionSchema>;

export interface PropuestaGrafo {
  entidades: PropuestaEntidad[];
  relaciones: PropuestaRelacion[];
}

/* ── Study modules (A4): everything SYNESIS proposes for studying keeps
      the provenance law — no question or claim without fragment ids. ── */

export const PreguntaQuizSchema = z.object({
  pregunta: z
    .string()
    .min(1)
    .transform((s) => s.trim().slice(0, 240)),
  opciones: z
    .array(
      z
        .string()
        .min(1)
        .transform((s) => s.trim().slice(0, 140)),
    )
    .min(3)
    .max(4),
  correcta: z.number().int().min(0),
  // Leniency here; the sanitizer enforces non-empty REAL evidence.
  evidencia: z.array(z.string()).default([]),
});
export type PreguntaQuiz = z.infer<typeof PreguntaQuizSchema>;

export const PuntoResumenSchema = z.object({
  texto: z
    .string()
    .min(1)
    .transform((s) => s.trim().slice(0, 320)),
  evidencia: z.array(z.string()).default([]),
});
export type PuntoResumen = z.infer<typeof PuntoResumenSchema>;

/* ── Intelligence products (E3): what the units deliver, docked back
      into the ontology. A product is a snapshot with provenance —
      composable by any unit THROUGH the substrate, never app-to-app. ── */

export const CLASES_PRODUCTO = ["informe", "camino"] as const;
export const ClaseProductoSchema = z.enum(CLASES_PRODUCTO);
export type ClaseProducto = z.infer<typeof ClaseProductoSchema>;

export const ProductoSchema = z.object({
  id: z.string().min(1),
  clase: ClaseProductoSchema,
  titulo: z.string().min(1),
  /** Unit (microapp id) that produced it. */
  unidad: z.string().min(1),
  /** Product body; each clase validates it with its own schema on read. */
  cuerpo: z.unknown(),
  /** Entity ids involved — the product's anchor in the graph. */
  entidades: z.array(z.string()).default([]),
  /** Fragment ids cited; pruned on cascade like all evidence. */
  evidencia: z.array(z.string()).default([]),
  createdAt: z.number().int().positive(),
});
export type Producto = z.infer<typeof ProductoSchema>;

/* ── Cases (D3): the investigation file — Gotham's core UX at personal
      scale. A caso groups entities, sources, products and operator
      notes under one objective, with a state. It only ANCHORS by id;
      everything it shows derives live from the graph. ─────────────── */

export const ESTADOS_CASO = ["abierto", "cerrado"] as const;
export const EstadoCasoSchema = z.enum(ESTADOS_CASO);
export type EstadoCaso = z.infer<typeof EstadoCasoSchema>;

export const NotaCasoSchema = z.object({
  id: z.string().min(1),
  texto: z.string().min(1),
  createdAt: z.number().int().positive(),
});
export type NotaCaso = z.infer<typeof NotaCasoSchema>;

export const CasoSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  /** The question driving the investigation, in operator words. */
  objetivo: z.string().optional(),
  estado: EstadoCasoSchema.default("abierto"),
  entidades: z.array(z.string()).default([]),
  artefactos: z.array(z.string()).default([]),
  productos: z.array(z.string()).default([]),
  notas: z.array(NotaCasoSchema).default([]),
  createdAt: z.number().int().positive(),
  cerradoEn: z.number().int().positive().optional(),
});
export type Caso = z.infer<typeof CasoSchema>;

/* ── Saved views (D5): a named filter over the entity layer. The view
      stores the QUESTION; results and metrics always derive live. ──── */

export const FiltroVistaSchema = z.object({
  texto: z.string().optional(),
  tipo: TipoEntidadSchema.optional(),
  campo: CampoSchema.optional(),
  /** TipoOperador id (D2). */
  subtipo: z.string().optional(),
});
export type FiltroVista = z.infer<typeof FiltroVistaSchema>;

export const VistaGuardadaSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1).max(60),
  filtro: FiltroVistaSchema,
  createdAt: z.number().int().positive(),
});
export type VistaGuardada = z.infer<typeof VistaGuardadaSchema>;

export const GrafoSchema = z.object({
  artefactos: z.array(ArtefactoSchema),
  fragmentos: z.array(FragmentoSchema),
  entidades: z.array(EntidadSchema),
  relaciones: z.array(RelacionSchema),
  // defaults keep pre-B3/pre-E3/pre-D3 v2 bundles importable
  eventos: z.array(EventoSchema).default([]),
  productos: z.array(ProductoSchema).default([]),
  casos: z.array(CasoSchema).default([]),
  tiposOperador: z.array(TipoOperadorSchema).default([]),
  tiposRelacion: z.array(TipoRelacionSchema).default([]),
  vistas: z.array(VistaGuardadaSchema).default([]),
});
export type Grafo = z.infer<typeof GrafoSchema>;
