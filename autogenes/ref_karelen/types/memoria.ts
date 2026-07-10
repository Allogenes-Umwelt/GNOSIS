import { z } from "zod";

/**
 * LEGACY — SYNESIS memory now lives in the AUTOGENES graph (B1). This
 * schema and its store survive only so existing devices can migrate
 * (`migrarMemoriaAlGrafo`); nothing writes here anymore.
 */

export const TIPOS_OBJETO = [
  "persona",
  "organizacion",
  "servicio",
  "documento",
  "evento",
  "concepto",
] as const;

export const RelacionSchema = z.object({
  con: z.string().min(1), // target object name
  tipo: z.string().min(1), // relation label, e.g. "paga", "vence", "pertenece a"
});
export type Relacion = z.infer<typeof RelacionSchema>;

export const ObjetoMemoriaSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  tipo: z.enum(TIPOS_OBJETO),
  resumen: z.string().min(1),
  relaciones: z.array(RelacionSchema),
  origen: z.enum(["synesis", "operador"]),
  createdAt: z.number().int().positive(),
});
export type ObjetoMemoria = z.infer<typeof ObjetoMemoriaSchema>;
