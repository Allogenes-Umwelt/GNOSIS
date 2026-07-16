import { z } from "zod";
import { ResultadoUniversalSchema } from "@/types/resultado";

/**
 * Operation — the atomic record of the Frame. Everything the system or
 * the operator does docks here as an auditable document. Real data only;
 * provenance is always declared.
 */

export const OperationKindSchema = z.enum([
  "nota", // operator-registered intention/note
  "dato", // ingested personal datum
  "consulta", // SYNESIS answered from the operator's record
  "ejecucion", // microapp run (future)
  "instrumento", // a universal-dashboard instrument docked to the canvas
]);
export type OperationKind = z.infer<typeof OperationKindSchema>;

export const OperationSourceSchema = z.enum(["operador", "sistema", "synesis"]);
export type OperationSource = z.infer<typeof OperationSourceSchema>;

export const OperationSchema = z.object({
  id: z.string().min(1),
  /** Spec-sheet code, e.g. "UMW-OP-0007". */
  code: z.string().regex(/^UMW-OP-\d{4}$/),
  kind: OperationKindSchema,
  title: z.string().min(1),
  detail: z.string().optional(),
  /** Universal instrument payload (kind "instrumento" only). */
  resultado: ResultadoUniversalSchema.optional(),
  source: OperationSourceSchema,
  createdAt: z.number().int().positive(),
});
export type Operation = z.infer<typeof OperationSchema>;

export function formatOperationCode(seq: number): string {
  return `UMW-OP-${String(seq).padStart(4, "0")}`;
}
