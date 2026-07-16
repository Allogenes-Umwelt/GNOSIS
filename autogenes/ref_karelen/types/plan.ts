import { z } from "zod";
import { TIPOS_ENTIDAD } from "@/types/autogenes";
import { CAMPOS, NivelAutonomiaSchema } from "@/types/microapp";

/**
 * D6 — agentic plans. SYNESIS proposes a SEQUENCE of typed, ADDITIVE
 * graph operations; the operator's autonomy dimmer governs whether it
 * runs at once or waits for approval. The vocabulary is a closed
 * allowlist: nothing here can delete, fetch or leave the device — the
 * kernel plans, the substrate executes, the operator governs.
 */

export const PasoPlanSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("crear_caso"),
    nombre: z.string().min(1).max(80),
    objetivo: z.string().max(200).optional(),
  }),
  z.object({
    op: z.literal("anexar_caso"),
    caso: z.string().min(1).max(80),
    entidades: z.array(z.string().min(1)).max(20).default([]),
    artefactos: z.array(z.string().min(1)).max(20).default([]),
  }),
  z.object({
    op: z.literal("recordar"),
    nombre: z.string().min(1).max(80),
    tipo: z.enum(TIPOS_ENTIDAD),
    resumen: z.string().min(1).max(200),
    campo: z.enum(CAMPOS).optional(),
  }),
  z.object({
    op: z.literal("enlazar"),
    desde: z.string().min(1).max(80),
    hasta: z.string().min(1).max(80),
    tipo: z.string().min(1).max(60),
  }),
  z.object({
    op: z.literal("nota"),
    caso: z.string().min(1).max(80),
    texto: z.string().min(1).max(300),
  }),
]);
export type PasoPlan = z.infer<typeof PasoPlanSchema>;

/** What the model sends through proponer_plan. */
export const PropuestaPlanSchema = z.object({
  objetivo: z.string().min(1).max(200),
  campo: z.enum(CAMPOS).optional(),
  pasos: z.array(PasoPlanSchema).min(1).max(12),
});
export type PropuestaPlan = z.infer<typeof PropuestaPlanSchema>;

export const ResultadoPasoSchema = z.object({
  paso: z.number().int().nonnegative(),
  ok: z.boolean(),
  detalle: z.string(),
});
export type ResultadoPaso = z.infer<typeof ResultadoPasoSchema>;

export const ESTADOS_PLAN = ["pendiente", "ejecutado", "descartado"] as const;

export const PlanSchema = z.object({
  id: z.string().min(1),
  objetivo: z.string().min(1),
  campo: z.enum(CAMPOS).optional(),
  pasos: z.array(PasoPlanSchema).min(1),
  /** Autonomy level that governed this plan, captured at proposal time. */
  nivel: NivelAutonomiaSchema,
  estado: z.enum(ESTADOS_PLAN),
  resultados: z.array(ResultadoPasoSchema).default([]),
  createdAt: z.number().int().positive(),
  resueltoEn: z.number().int().positive().optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

/** Operator-words rendering of one step, for review UIs. */
export function describirPaso(p: PasoPlan): string {
  switch (p.op) {
    case "crear_caso":
      return `Crear caso «${p.nombre}»${p.objetivo ? ` — ${p.objetivo}` : ""}`;
    case "anexar_caso": {
      const partes = [
        p.entidades.length > 0
          ? `${p.entidades.length} ${p.entidades.length === 1 ? "entidad" : "entidades"}`
          : null,
        p.artefactos.length > 0
          ? `${p.artefactos.length} ${p.artefactos.length === 1 ? "fuente" : "fuentes"}`
          : null,
      ].filter(Boolean);
      return `Anexar al caso «${p.caso}»: ${partes.join(" y ") || "nada"}`;
    }
    case "recordar":
      return `Recordar ${p.nombre} (${p.tipo})`;
    case "enlazar":
      return `Enlazar ${p.desde} —${p.tipo}→ ${p.hasta}`;
    case "nota":
      return `Nota en «${p.caso}»: ${p.texto}`;
  }
}
