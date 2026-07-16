import { NextResponse } from "next/server";
import { z } from "zod";
import {
  callAnthropic,
  callOpenAICompat,
  modelFor,
  PROVIDER_CONFIG,
  WireMessageSchema,
  type ProviderId,
} from "@/lib/providers";
import { buildSystemPrompt } from "@/lib/synesis-prompt";

/**
 * SYNESIS kernel — the only network gateway of the prototype. The model
 * lives behind it; the operator's data does NOT: tools execute on the
 * device. Provider is switchable per request; the key can come from the
 * environment or from the operator's device (never persisted here).
 */

export const runtime = "nodejs";

const ContextoSchema = z.object({
  totalDatos: z.number().int().nonnegative(),
  totalOperaciones: z.number().int().nonnegative(),
  camposConDatos: z.array(z.string()),
  niveles: z.record(z.string(), z.number()),
});

const BodySchema = z.object({
  provider: z.enum(["anthropic", "gemini", "deepseek", "openrouter"]),
  clave: z.string().optional(),
  messages: z.array(WireMessageSchema),
  contexto: ContextoSchema,
});

export function GET() {
  const providers = Object.fromEntries(
    (Object.keys(PROVIDER_CONFIG) as ProviderId[]).map((p) => [
      p,
      {
        env: Boolean(process.env[PROVIDER_CONFIG[p].envKey]),
        model: modelFor(p),
      },
    ]),
  );
  return NextResponse.json({ providers });
}

export async function POST(request: Request) {
  let crudo: unknown;
  try {
    crudo = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(crudo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const { provider, clave, messages, contexto } = parsed.data;

  const apiKey = clave || process.env[PROVIDER_CONFIG[provider].envKey];
  if (!apiKey) {
    return NextResponse.json(
      {
        error: `SYNESIS sin enlace con ${provider}. Configura la llave en el panel C2.`,
      },
      { status: 503 },
    );
  }

  const system = buildSystemPrompt(contexto, modelFor(provider));

  try {
    const result =
      provider === "anthropic"
        ? await callAnthropic(apiKey, system, messages)
        : await callOpenAICompat(provider, apiKey, system, messages);
    return NextResponse.json({
      stopReason: result.stopReason,
      content: result.content,
      model: modelFor(provider),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "error desconocido";
    return NextResponse.json(
      { error: `SYNESIS no responde (${detail}). Intenta de nuevo.` },
      { status: 502 },
    );
  }
}
