import { NextResponse } from "next/server";
import { z } from "zod";
import { extraerJson } from "@/lib/extraccion";
import { completar, PROVIDER_CONFIG } from "@/lib/providers";
import { InformeSchema, sanearInforme } from "@/capacidades/informe";

/**
 * SÍNTESIS model pass — the microapp's OWN route (never inside
 * substrate routes). One shot, no tools, never writes: digest of the
 * operator's graph in, sanitized cited report out. The provenance law
 * is enforced HERE against the exact ids and names that came in.
 */

export const runtime = "nodejs";

const SolicitudSchema = z.object({
  provider: z.enum(["anthropic", "gemini", "deepseek", "openrouter"]),
  clave: z.string().optional(),
  digesto: z.object({
    entidades: z
      .array(
        z.object({
          nombre: z.string().min(1).max(120),
          tipo: z.string().max(40),
          resumen: z.string().max(400).optional(),
          campo: z.string().max(40).optional(),
        }),
      )
      .max(60),
    relaciones: z.array(z.string().max(300)).max(80),
    eventos: z
      .array(z.object({ titulo: z.string().max(200), fecha: z.string().max(40) }))
      .max(30),
    fragmentos: z
      .array(
        z.object({
          id: z.string().min(1),
          fuente: z.string().min(1).max(200),
          pagina: z.number().int().positive().optional(),
          texto: z.string().min(1).max(700),
        }),
      )
      .max(18),
  }),
});

const PROMPT_INFORME = `Eres el sintetizador ejecutivo del sustrato AUTOGENES de UMWELT. Recibes un digesto del grafo de conocimiento del operador: entidades, relaciones, eventos fechados y fragmentos citables de sus documentos (cada fragmento con su id). Tu única fuente de verdad es ese digesto: cero conocimiento externo, cero invención.

Redacta el informe ejecutivo de la situación del operador. Devuelve SOLO un objeto JSON válido, sin markdown ni comentarios, con esta forma exacta:
{"titulo":"...","secciones":[{"encabezado":"...","puntos":[{"texto":"...","evidencia":["id-fragmento"],"entidades":["nombre exacto"]}]}]}

REGLAS:
- Entre 2 y 5 secciones temáticas (situación, actores, plazos, riesgos u oportunidades — según lo que el digesto realmente contenga). Menos si no da.
- Cada punto es UNA afirmación autónoma en español, máximo 300 caracteres, registro claro y directo, sin adjetivos no verificables.
- Cada punto DEBE fundarse en el digesto: "evidencia" lleva ids EXACTOS de fragmentos que lo respaldan; "entidades" lleva nombres EXACTOS de entidades del digesto en que se apoya. Al menos uno de los dos, jamás ambos vacíos. Jamás inventes ids ni nombres.
- Los plazos y fechas solo si aparecen en los eventos o fragmentos del digesto, tal cual.
- Di "operador", nunca "usuario". Sin emojis, sin signos de exclamación.
- Si el digesto no da para un informe, devuelve {"titulo":"Sin material","secciones":[]}.`;

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
      PROMPT_INFORME,
      `Digesto del Umwelt del operador:\n${JSON.stringify(digesto)}`,
    );
    const json = extraerJson(respuesta);
    if (!json) {
      return NextResponse.json(
        { error: "El modelo no devolvió un informe legible. Reintenta." },
        { status: 502 },
      );
    }
    let objeto: unknown;
    try {
      objeto = JSON.parse(json);
    } catch {
      return NextResponse.json(
        { error: "El informe llegó malformado. Reintenta." },
        { status: 502 },
      );
    }
    const informe = InformeSchema.safeParse(objeto);
    if (!informe.success) {
      return NextResponse.json(
        { error: "El informe no cumple el contrato. Reintenta." },
        { status: 502 },
      );
    }
    const saneado = sanearInforme(
      informe.data,
      new Set(digesto.fragmentos.map((f) => f.id)),
      new Set(digesto.entidades.map((e) => e.nombre)),
    );
    return NextResponse.json({ informe: saneado });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "La síntesis falló. Reintenta.",
      },
      { status: 502 },
    );
  }
}
