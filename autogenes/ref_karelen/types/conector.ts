import { z } from "zod";
import { CampoSchema } from "@/types/microapp";
import type { Fuente, ResultadoUniversal } from "@/types/resultado";

/**
 * Conector contract — every external open service enters UMWELT through
 * this single shape. A connector declares WHAT it answers (manifest with
 * typed consultas) and HOW (a server-side invoke). SYNESIS reaches all
 * of them through one generic tool; the shell never changes when a
 * connector is added.
 */

/** How the service is reached. */
export const ACCESOS = [
  "abierta", // open API, no credentials
  "token", // free API that requires a personal token
  "dataset", // static versioned dataset shipped with the app
] as const;
export const AccesoSchema = z.enum(ACCESOS);
export type Acceso = z.infer<typeof AccesoSchema>;

export const ParametroSchema = z.object({
  nombre: z.string().regex(/^[a-z0-9_]+$/),
  descripcion: z.string().min(1),
  requerido: z.boolean(),
  ejemplo: z.string().min(1),
});
export type Parametro = z.infer<typeof ParametroSchema>;

export const ConsultaDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  descripcion: z.string().min(1),
  parametros: z.array(ParametroSchema),
});
export type ConsultaDef = z.infer<typeof ConsultaDefSchema>;

export const ConectorManifestSchema = z.object({
  /** Stable identifier, kebab-case (e.g. "open-meteo"). */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  nombre: z.string().min(1),
  campo: CampoSchema,
  acceso: AccesoSchema,
  /** Human-readable home of the service, for citation. */
  fuente: z.string().url(),
  descripcion: z.string().min(1),
  /** Server env var that may hold the token (acceso "token" only). */
  envToken: z.string().optional(),
  consultas: z.array(ConsultaDefSchema).min(1),
});
export type ConectorManifest = z.infer<typeof ConectorManifestSchema>;

/** What the /api/conector route returns on success. */
export const ResultadoConectorSchema = z.object({
  conector: z.string(),
  consulta: z.string(),
  fuente: z.string(),
  obtenido: z.string(), // ISO timestamp of retrieval
  datos: z.unknown(),
});
export type ResultadoConector = z.infer<typeof ResultadoConectorSchema>;

/** Execution context handed to invoke by the server route. */
export interface ConectorContext {
  token?: string;
}

export interface Conector {
  manifest: ConectorManifest;
  /**
   * Server-side only: performs the outbound request and returns the
   * mapped payload (`datos`). Throws Error with an operator-facing
   * Spanish message on failure.
   */
  invoke: (
    consulta: string,
    parametros: Record<string, string>,
    ctx: ConectorContext,
  ) => Promise<unknown>;
  /**
   * Optional client-side adapter: fill the universal dashboard from this
   * connector's raw `datos` — the template rendered per connector "a
   * conveniencia". Pure; returns [] when it cannot present the shape, and
   * the caller falls back to the raw payload. Provenance (`fuente`) is
   * threaded in so every produced instrument stays cited.
   */
  presentar?: (datos: unknown, fuente: Fuente) => ResultadoUniversal[];
}
