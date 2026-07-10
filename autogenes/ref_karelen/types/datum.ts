import { z } from "zod";
import { GrafoSchema } from "@/types/autogenes";
import { CampoSchema } from "@/types/microapp";
import { OperationSchema } from "@/types/operation";

/**
 * Datum — a real piece of the operator's world, ingested by the operator.
 * Freeform label/value on purpose: the prototype documents reality first;
 * structure per campo arrives with the microapps.
 */
export const DatumSchema = z.object({
  id: z.string().min(1),
  campo: CampoSchema,
  etiqueta: z.string().min(1),
  valor: z.string().min(1),
  createdAt: z.number().int().positive(),
});
export type Datum = z.infer<typeof DatumSchema>;

/**
 * Portable snapshot of everything the operator owns. v2 adds the
 * AUTOGENES graph (text and metadata only — source binaries stay in the
 * device's blob vault). v1 bundles still import.
 */
export const ExportBundleSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.number().int().positive(),
  datos: z.array(DatumSchema),
  operations: z.array(OperationSchema),
  grafo: GrafoSchema.optional(),
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;
