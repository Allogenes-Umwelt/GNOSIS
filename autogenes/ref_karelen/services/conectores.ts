import { z } from "zod";
import { ResultadoConectorSchema } from "@/types/conector";

/**
 * Connector catalog client — reads the gateway's GET so C2 can show
 * which services are linked and which need a device-local token.
 */

const ConectorInfoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  campo: z.string(),
  acceso: z.enum(["abierta", "token", "dataset"]),
  fuente: z.string(),
  descripcion: z.string(),
  env: z.boolean(),
  consultas: z
    .array(
      z.object({
        id: z.string(),
        descripcion: z.string(),
        parametros: z.array(
          z.object({
            nombre: z.string(),
            descripcion: z.string(),
            requerido: z.boolean(),
            ejemplo: z.string(),
          }),
        ),
      }),
    )
    .default([]),
});
export type ConectorInfo = z.infer<typeof ConectorInfoSchema>;

const CatalogoSchema = z.object({ conectores: z.array(ConectorInfoSchema) });

export async function getConectores(): Promise<ConectorInfo[]> {
  try {
    const res = await fetch("/api/conector");
    if (!res.ok) return [];
    return CatalogoSchema.parse(await res.json()).conectores;
  } catch {
    return [];
  }
}

const ErrorSchema = z.object({ error: z.string() });

/** Run one connector query through the gateway; raw data back, errors verbatim. */
export async function consultarConector(
  conector: string,
  consulta: string,
  parametros: Record<string, string>,
  token?: string,
): Promise<{ datos: unknown; obtenido: string; fuente: string }> {
  let res: Response;
  try {
    res = await fetch("/api/conector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conector, consulta, parametros, token }),
    });
  } catch {
    throw new Error("Sin enlace con el gateway de conectores. Reintenta.");
  }
  const json: unknown = await res.json();
  if (!res.ok) {
    const err = ErrorSchema.safeParse(json);
    throw new Error(err.success ? err.data.error : "El conector no respondió.");
  }
  const parsed = ResultadoConectorSchema.parse(json);
  return { datos: parsed.datos, obtenido: parsed.obtenido, fuente: parsed.fuente };
}
