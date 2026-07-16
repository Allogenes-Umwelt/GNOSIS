import { z } from "zod";

/**
 * ResultadoUniversal — the single contract every universal dashboard
 * consumes. Data producers (connectors, local stores, SYNESIS) build one
 * of these; the instruments only render. Provenance is mandatory: an
 * instrument without a source is decoration, and we do not decorate.
 */

export const FuenteSchema = z.object({
  /** Connector id, or "sistema" for device-local derivations. */
  conector: z.string().min(1),
  consulta: z.string().min(1),
  /** ISO timestamp of retrieval/derivation. */
  obtenido: z.string().min(1),
});
export type Fuente = z.infer<typeof FuenteSchema>;

export const PuntoSchema = z.object({
  t: z.number(), // epoch ms
  v: z.number(),
});
export type Punto = z.infer<typeof PuntoSchema>;

/** PANEL·MÉTRICA — one value that matters now, plus its history. */
export const MetricaSchema = z.object({
  funcion: z.literal("metrica"),
  titulo: z.string().min(1),
  unidad: z.string(),
  valor: z.number(),
  /** Burn the hero value coral (live money) instead of frame ink. */
  acento: z.boolean().optional(),
  decimales: z.number().int().min(0).max(6).default(2),
  delta: z
    .object({ pct: z.number(), periodo: z.string().min(1) })
    .optional(),
  serie: z.array(PuntoSchema),
  referencia: z.object({ etiqueta: z.string(), v: z.number() }).optional(),
  laterales: z
    .array(
      z.object({
        etiqueta: z.string().min(1),
        valor: z.string().min(1),
        unidad: z.string().optional(),
      }),
    )
    .default([]),
  fuente: FuenteSchema,
});
export type Metrica = z.infer<typeof MetricaSchema>;

/** COMPARADOR — N options face to face; the subject wears coral. */
export const ComparacionSchema = z.object({
  funcion: z.literal("comparacion"),
  titulo: z.string().min(1),
  unidad: z.string(),
  decimales: z.number().int().min(0).max(6).default(2),
  pares: z
    .array(
      z.object({
        etiqueta: z.string().min(1),
        valor: z.number(),
        detalle: z.string().optional(),
      }),
    )
    .min(1),
  /** etiqueta of the subject/winner pair (coral emphasis). */
  sujeto: z.string().optional(),
  fuente: FuenteSchema,
});
export type Comparacion = z.infer<typeof ComparacionSchema>;

export const VEREDICTOS = ["favorable", "atencion", "insuficiente"] as const;
export const VeredictoSchema = z.enum(VEREDICTOS);
export type Veredicto = z.infer<typeof VeredictoSchema>;

/** DICTAMEN — a verdict with its exposed spine of evidence. */
export const DictamenSchema = z.object({
  funcion: z.literal("dictamen"),
  titulo: z.string().min(1),
  veredicto: VeredictoSchema,
  enunciado: z.string().min(1),
  evidencia: z
    .array(z.object({ dato: z.string().min(1), cita: z.string().min(1) }))
    .min(1),
  nivel: z
    .object({
      /** 0..1 position on the threshold scale. */
      valor: z.number().min(0).max(1),
      zonas: z.tuple([z.string(), z.string(), z.string()]),
    })
    .optional(),
  siguienteAccion: z
    .object({ etiqueta: z.string().min(1), href: z.string().min(1) })
    .optional(),
  fuente: FuenteSchema,
});
export type Dictamen = z.infer<typeof DictamenSchema>;

/** CONSTELACIÓN — relations and territory, radial-city layout. */
export const NodoSchema = z.object({
  id: z.string().min(1),
  etiqueta: z.string().min(1),
  anillo: z.union([z.literal(1), z.literal(2)]),
  vivo: z.boolean().default(false),
  detalle: z.string().optional(),
});
export type Nodo = z.infer<typeof NodoSchema>;

export const ConstelacionSchema = z.object({
  funcion: z.literal("constelacion"),
  titulo: z.string().min(1),
  nucleo: z.object({ etiqueta: z.string().min(1) }),
  nodos: z.array(NodoSchema),
  fuente: FuenteSchema,
});
export type Constelacion = z.infer<typeof ConstelacionSchema>;

/** CATÁLOGO — an identification readout: records grounded by a stable id. */
export const RegistroItemSchema = z.object({
  /** Stable identifier (e.g. a Wikidata Q-number) — the catalog number. */
  id: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  url: z.string().optional(),
});
export type RegistroItem = z.infer<typeof RegistroItemSchema>;

export const CatalogoSchema = z.object({
  funcion: z.literal("catalogo"),
  titulo: z.string().min(1),
  /** First record is the primary match; the rest are candidates. */
  registros: z.array(RegistroItemSchema).min(1),
  fuente: FuenteSchema,
});
export type Catalogo = z.infer<typeof CatalogoSchema>;

/** GEO — a recon scatter: points placed by their coordinates on a plane. */
export const GeoPuntoSchema = z.object({
  etiqueta: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  /** The primary hit — burns coral. */
  principal: z.boolean().optional(),
  detalle: z.string().optional(),
});
export type GeoPunto = z.infer<typeof GeoPuntoSchema>;

export const GeoSchema = z.object({
  funcion: z.literal("geo"),
  titulo: z.string().min(1),
  puntos: z.array(GeoPuntoSchema).min(1),
  fuente: FuenteSchema,
});
export type Geo = z.infer<typeof GeoSchema>;

export const ResultadoUniversalSchema = z.discriminatedUnion("funcion", [
  MetricaSchema,
  ComparacionSchema,
  DictamenSchema,
  ConstelacionSchema,
  CatalogoSchema,
  GeoSchema,
]);
export type ResultadoUniversal = z.infer<typeof ResultadoUniversalSchema>;
