import { z } from "zod";

/**
 * Microapp contract — every funnel in the fleet declares itself here.
 * The canvas discovers units through the registry; the shell never
 * changes when a new microapp docks.
 */

export const CAMPOS = [
  "legal",
  "fiscal",
  "empleo",
  "freelance",
  "salud",
  "hogar",
  "gobierno",
  "patrimonio",
  "automotriz",
  "educacion",
  "consumo",
  "banca",
  "vacaciones",
] as const;

export const CampoSchema = z.enum(CAMPOS);
export type Campo = z.infer<typeof CampoSchema>;

/** Progressive autonomy (concept paper §02.2). */
export const NivelAutonomiaSchema = z.union([
  z.literal(1), // automatic — no approval
  z.literal(2), // quick — one tap
  z.literal(3), // explicit — verify + confirm
]);
export type NivelAutonomia = z.infer<typeof NivelAutonomiaSchema>;

/**
 * Unit category: "dominio" units solve one question of one campo;
 * "inteligencia" units are graph-native capabilities (attention,
 * profiling, paths, reports) that cut across every campo.
 */
export const CATEGORIAS_MICROAPP = ["dominio", "inteligencia"] as const;
export const CategoriaMicroappSchema = z.enum(CATEGORIAS_MICROAPP);
export type CategoriaMicroapp = z.infer<typeof CategoriaMicroappSchema>;

export const MicroappManifestSchema = z
  .object({
    /** Stable identifier, kebab-case (e.g. "cuanto-me-toca"). */
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    /** The question already in the operator's head — the naming rule. */
    nombre: z.string().min(1),
    categoria: CategoriaMicroappSchema.default("dominio"),
    /** Required for dominio units; inteligencia units are cross-campo. */
    campo: CampoSchema.optional(),
    nivelAutonomia: NivelAutonomiaSchema,
    descripcion: z.string().min(1),
  })
  .refine((m) => m.categoria === "inteligencia" || m.campo !== undefined, {
    message: "Las unidades de dominio declaran su campo.",
    path: ["campo"],
  });
export type MicroappManifest = z.infer<typeof MicroappManifestSchema>;
