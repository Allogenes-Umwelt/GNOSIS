import { NextResponse } from "next/server";
import { z } from "zod";
import { extraerJson } from "@/lib/extraccion";
import { completar, PROVIDER_CONFIG } from "@/lib/providers";
import { NarrativaSchema, sanearNarrativa } from "@/microapps/signature/narrativa";

/**
 * QUALIA narrative model pass — the studio's OWN route. One shot, no tools,
 * never writes. A network digest (metrics + top concentrators, already
 * computed) in, a qualitative reading out. The model INTERPRETS the
 * structure; it never recomputes it. The provenance law is enforced HERE:
 * any reading citing a clave we did not send is dropped.
 */

export const runtime = "nodejs";

const SolicitudSchema = z.object({
  provider: z.enum(["anthropic", "gemini", "deepseek", "openrouter"]),
  clave: z.string().optional(),
  digesto: z.object({
    metricas: z
      .array(
        z.object({
          clave: z.string().min(1).max(60),
          etiqueta: z.string().min(1).max(80),
          valor: z.string().min(1).max(60),
        }),
      )
      .max(12),
    conceptos: z
      .array(
        z.object({
          clave: z.string().min(1).max(200),
          etiqueta: z.string().min(1).max(80),
          grado: z.number(),
        }),
      )
      .max(20),
  }),
});

const PROMPT_NARRATIVA = `Eres el intérprete de QUALIA, un estudio que teje los datos y fuentes del operador en una RED de conceptos y la lee con topología. Recibes un digesto YA CALCULADO: métricas de la red (clave, etiqueta, valor) y los concentradores principales (clave, etiqueta, grado). Esa es tu única fuente: NO calcules nada nuevo, NO inventes conceptos ni cifras, NO uses conocimiento externo. Tu trabajo es INTERPRETAR qué revela la ESTRUCTURA: los hubs, las comunidades, la densidad, las islas.

Devuelve SOLO un objeto JSON válido, sin markdown ni comentarios, con esta forma exacta:
{"panorama":"...","lecturas":[{"concepto":"clave_exacta","lectura":"..."}],"observaciones":["..."]}

REGLAS:
- "panorama": un párrafo (máximo 600 caracteres) que resume qué forma tiene la red y qué significa, en español claro y directo.
- "lecturas": entre 2 y 6, cada una interpreta UN concepto o UNA métrica. "concepto" DEBE ser una clave EXACTA del digesto (de conceptos o de métricas), jamás una inventada. "lectura" (máximo 280 caracteres) es interpretación cualitativa: por qué ese concentrador ata al resto, qué implica su grado, qué revela una comunidad o una densidad. Puedes citar el valor tal cual, jamás inventes ni recalcules números.
- "observaciones": hasta 4 notas sobre lo que la estructura sugiere revisar o recombinar, verbo primero cuando sea acción.
- Un concentrador de grado alto es un puente que ata muchos conceptos; muchas comunidades es fragmentación temática; densidad alta es un corpus muy entrelazado; islas sin puente es material que aún no conversa.
- Di "operador", nunca "usuario". Sin emojis, sin signos de exclamación. Registro claro, honesto, sin adjetivos vacíos.
- Si el digesto casi no trae conceptos, devuelve un panorama honesto y pocas lecturas.`;

export async function POST(request: Request) {
  let crudo: unknown;
  try {
    crudo = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const parsed = SolicitudSchema.safeParse(crudo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const { provider, clave, digesto } = parsed.data;
  const apiKey = clave || process.env[PROVIDER_CONFIG[provider].envKey];
  if (!apiKey) {
    return NextResponse.json(
      { error: `Sin enlace con ${provider}. Configura la llave en el panel C2.` },
      { status: 503 },
    );
  }

  try {
    const respuesta = await completar(
      provider,
      apiKey,
      PROMPT_NARRATIVA,
      `Digesto de la red del operador:\n${JSON.stringify(digesto)}`,
    );
    const json = extraerJson(respuesta);
    if (!json) {
      return NextResponse.json(
        { error: "El modelo no devolvió una lectura legible. Reintenta." },
        { status: 502 },
      );
    }
    let objeto: unknown;
    try {
      objeto = JSON.parse(json);
    } catch {
      return NextResponse.json(
        { error: "La narrativa llegó malformada. Reintenta." },
        { status: 502 },
      );
    }
    const narrativa = NarrativaSchema.safeParse(objeto);
    if (!narrativa.success) {
      return NextResponse.json(
        { error: "La narrativa no cumple el contrato. Reintenta." },
        { status: 502 },
      );
    }
    const clavesValidas = new Set([
      ...digesto.metricas.map((m) => m.clave),
      ...digesto.conceptos.map((c) => c.clave),
    ]);
    return NextResponse.json({ narrativa: sanearNarrativa(narrativa.data, clavesValidas) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "La narrativa falló. Reintenta." },
      { status: 502 },
    );
  }
}
