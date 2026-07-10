import { NextResponse } from "next/server";
import { z } from "zod";
import { conectores, getConector } from "@/conectores/registry";
import type { ResultadoConector } from "@/types/conector";

/**
 * Connector gateway — the ONLY door to external services. Strict
 * allowlist (registry), server-side fetch (keeps CSP self-only),
 * operator-gated by the proxy. Tokens arrive per-request from the
 * device or fall back to server env; they are never persisted here.
 */

export function GET() {
  return NextResponse.json({
    conectores: conectores.map((c) => ({
      id: c.manifest.id,
      nombre: c.manifest.nombre,
      campo: c.manifest.campo,
      acceso: c.manifest.acceso,
      fuente: c.manifest.fuente,
      descripcion: c.manifest.descripcion,
      env: Boolean(c.manifest.envToken && process.env[c.manifest.envToken]),
      consultas: c.manifest.consultas,
    })),
  });
}

const BodySchema = z.object({
  conector: z.string(),
  consulta: z.string(),
  parametros: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  token: z.string().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Solicitud inválida. Revisa conector, consulta y parámetros." },
      { status: 400 },
    );
  }

  const conector = getConector(body.conector);
  if (!conector) {
    return NextResponse.json(
      { error: `Conector no registrado: ${body.conector}.` },
      { status: 404 },
    );
  }
  const consulta = conector.manifest.consultas.find(
    (q) => q.id === body.consulta,
  );
  if (!consulta) {
    return NextResponse.json(
      {
        error: `El conector ${body.conector} no ofrece la consulta ${body.consulta}.`,
      },
      { status: 404 },
    );
  }

  const parametros = Object.fromEntries(
    Object.entries(body.parametros ?? {}).map(([k, v]) => [k, String(v)]),
  );
  const faltantes = consulta.parametros
    .filter((p) => p.requerido && !(parametros[p.nombre] ?? "").trim())
    .map((p) => p.nombre);
  if (faltantes.length > 0) {
    return NextResponse.json(
      { error: `Faltan parámetros requeridos: ${faltantes.join(", ")}.` },
      { status: 400 },
    );
  }

  const token =
    body.token ??
    (conector.manifest.envToken
      ? process.env[conector.manifest.envToken]
      : undefined);

  try {
    const datos = await conector.invoke(body.consulta, parametros, { token });
    const resultado: ResultadoConector = {
      conector: conector.manifest.id,
      consulta: body.consulta,
      fuente: conector.manifest.fuente,
      obtenido: new Date().toISOString(),
      datos,
    };
    return NextResponse.json(resultado);
  } catch (e) {
    const msg =
      e instanceof Error && e.message.length > 0
        ? e.message
        : "El conector falló sin detalle. Reintenta.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
