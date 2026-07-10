import { NextResponse } from "next/server";
import { z } from "zod";
import { extraerJson } from "@/lib/extraccion";
import { completar, PROVIDER_CONFIG } from "@/lib/providers";
import { DictamenSchema, sanearDictamen } from "@/microapps/cobranza/dictamen";

/**
 * COBRANZA dictamen model pass — the microapp's OWN route. One shot, no
 * tools, never writes. Pre-computed metrics in, a qualitative reading out.
 * The model INTERPRETS; every number is the engine's. The provenance law is
 * enforced HERE: any reading citing a metric key we did not send is dropped.
 */

export const runtime = "nodejs";

const SolicitudSchema = z.object({
  provider: z.enum(["anthropic", "gemini", "deepseek", "openrouter"]),
  clave: z.string().optional(),
  digesto: z.object({
    periodo: z.string().max(40),
    operadorRfc: z.string().max(20).nullable(),
    metricas: z
      .array(
        z.object({
          clave: z.string().min(1).max(60),
          etiqueta: z.string().min(1).max(80),
          valor: z.string().min(1).max(60),
        }),
      )
      .max(30),
    notas: z.array(z.string().max(240)).max(12),
  }),
});

const PROMPT_DICTAMEN = `Eres el analista financiero de COBRANZA, un tablero de facturas CFDI del operador. Recibes un digesto con métricas YA CALCULADAS (clave, etiqueta, valor) y notas de contexto. Esa es tu única fuente: NO calcules nada nuevo, NO inventes cifras, NO uses conocimiento externo. Tu trabajo es INTERPRETAR lo que las métricas significan para el negocio.

Devuelve SOLO un objeto JSON válido, sin markdown ni comentarios, con esta forma exacta:
{"panorama":"...","lecturas":[{"metrica":"clave_exacta","severidad":"critico|atencion|sano","lectura":"..."}],"prioridades":["..."]}

REGLAS:
- "panorama": un párrafo (máximo 500 caracteres) que resume la situación financiera en español claro y directo.
- "lecturas": entre 2 y 6, cada una interpreta UNA métrica. "metrica" DEBE ser una clave EXACTA de las métricas del digesto, jamás una inventada. "severidad" según el riesgo que leas. "lectura" (máximo 280 caracteres) es interpretación cualitativa: qué significa y por qué importa. Puedes citar el valor de la métrica tal cual viene, pero jamás inventes ni recalcules números.
- "prioridades": hasta 4 acciones concretas y accionables, verbo primero.
- Concentración alta (HHI cerca de 1) es dependencia de pocos; mediana de cobro alta es lentitud de cobro; cartera vencida +90d es riesgo; IVA a cargo y retenciones a enterar son obligaciones fiscales próximas.
- Di "operador", nunca "usuario". Sin emojis, sin signos de exclamación. Registro claro, honesto, sin adjetivos vacíos.
- Si el digesto casi no trae métricas, devuelve un panorama honesto y pocas lecturas.`;

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
      PROMPT_DICTAMEN,
      `Digesto financiero del operador:\n${JSON.stringify(digesto)}`,
    );
    const json = extraerJson(respuesta);
    if (!json) {
      return NextResponse.json(
        { error: "El modelo no devolvió un dictamen legible. Reintenta." },
        { status: 502 },
      );
    }
    let objeto: unknown;
    try {
      objeto = JSON.parse(json);
    } catch {
      return NextResponse.json(
        { error: "El dictamen llegó malformado. Reintenta." },
        { status: 502 },
      );
    }
    const dictamen = DictamenSchema.safeParse(objeto);
    if (!dictamen.success) {
      return NextResponse.json(
        { error: "El dictamen no cumple el contrato. Reintenta." },
        { status: 502 },
      );
    }
    const saneado = sanearDictamen(
      dictamen.data,
      new Set(digesto.metricas.map((m) => m.clave)),
    );
    return NextResponse.json({ dictamen: saneado });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "El dictamen falló. Reintenta." },
      { status: 502 },
    );
  }
}
