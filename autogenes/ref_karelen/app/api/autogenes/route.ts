import { NextResponse } from "next/server";
import { z } from "zod";
import { sanearQuiz, sanearResumen } from "@/lib/estudio";
import { extraerJson, sanearPropuesta } from "@/lib/extraccion";
import { sanearCronologia } from "@/lib/fechas";
import { completar, completarVision, PROVIDER_CONFIG } from "@/lib/providers";
import {
  PreguntaQuizSchema,
  PropuestaEntidadSchema,
  PropuestaEventoSchema,
  PropuestaRelacionSchema,
  PuntoResumenSchema,
} from "@/types/autogenes";

/**
 * AUTOGENES model passes — one shot, no tools, never writes.
 * - extraccion (default): citable fragments in → validated proposal out
 *   (entities + relations, every one carrying fragment ids as evidence).
 * - transcripcion: the OCR router's vision route. An image the operator
 *   explicitly opted to send is transcribed to plain text; the client
 *   turns it into a fragmento.
 * - quiz / resumen: study modules. Questions and summary points obey the
 *   same provenance law — nothing without fragment ids.
 */

export const runtime = "nodejs";

const FragmentosSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      pagina: z.number().int().positive().optional(),
      texto: z.string().min(1),
    }),
  )
  .min(1)
  .max(24);

const ExtraccionSchema = z.object({
  modo: z.literal("extraccion").default("extraccion"),
  provider: z.enum(["anthropic", "gemini", "deepseek", "openrouter"]),
  clave: z.string().optional(),
  artefacto: z.string().min(1),
  fragmentos: FragmentosSchema,
  existentes: z.array(z.string()).max(200).default([]),
});

const EstudioSchema = z.object({
  modo: z.enum(["quiz", "resumen", "cronologia"]),
  provider: z.enum(["anthropic", "gemini", "deepseek", "openrouter"]),
  clave: z.string().optional(),
  artefacto: z.string().min(1),
  fragmentos: FragmentosSchema,
});

const TranscripcionSchema = z.object({
  modo: z.literal("transcripcion"),
  provider: z.enum(["anthropic", "gemini", "deepseek", "openrouter"]),
  clave: z.string().optional(),
  nombre: z.string().min(1),
  // ~4.5MB of image after the client-side downscale to 1568px JPEG.
  imagen: z.string().min(1).max(6_000_000),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const PerfilEntidadSchema = z.object({
  nombre: z.string().min(1).max(120),
  tipo: z.string().min(1).max(40),
  resumen: z.string().max(400).optional(),
  contextos: z.array(z.string().max(400)).max(3).default([]),
});

const AdjudicacionSchema = z.object({
  modo: z.literal("adjudicacion"),
  provider: z.enum(["anthropic", "gemini", "deepseek", "openrouter"]),
  clave: z.string().optional(),
  a: PerfilEntidadSchema,
  b: PerfilEntidadSchema,
});

const PROMPT_ADJUDICACION = `Eres el adjudicador de resolución de entidades del sustrato AUTOGENES de UMWELT. Recibes dos perfiles de entidad del grafo de conocimiento del operador. Decide si nombran LA MISMA cosa del mundo real (misma persona, organización, concepto, documento) o cosas distintas.

Devuelve SOLO un objeto JSON válido, sin markdown ni comentarios:
{"mismo":true,"confianza":0.9,"razon":"..."}

REGLAS:
- "mismo": true solo si la identidad es la misma; variantes de nombre, siglas y errores de dedo cuentan como la misma cosa. Entidades del mismo rubro pero distintas (dos bancos, dos leyes) NO son la misma.
- "confianza": 0.0-1.0 según qué tan concluyente es la evidencia disponible.
- "razon": máximo 180 caracteres, en español, citando la señal decisiva.
- Usa únicamente los perfiles y contextos dados; cero conocimiento inventado sobre el operador.`;

const PROMPT_QUIZ = `Eres el tutor del sustrato AUTOGENES de UMWELT. Recibes fragmentos citables de un documento del operador (cada uno con su id). Tu única fuente de verdad son esos fragmentos: cero conocimiento externo, cero invención.

Genera un quiz de estudio. Devuelve SOLO un objeto JSON válido, sin markdown ni comentarios, con esta forma exacta:
{"preguntas":[{"pregunta":"...","opciones":["...","...","...","..."],"correcta":0,"evidencia":["id-fragmento"]}]}

REGLAS:
- Entre 4 y 8 preguntas sobre lo esencial de los fragmentos: definiciones, causas, relaciones, datos concretos. Menos si el texto no da.
- Cada pregunta lleva EXACTAMENTE 4 opciones distintas. Una sola es correcta según los fragmentos; "correcta" es su índice (0-3). Varía la posición de la correcta.
- Los distractores deben ser plausibles pero claramente incorrectos según el texto; jamás dos opciones verdaderas.
- "evidencia" lleva los ids EXACTOS de los fragmentos que responden la pregunta. Jamás inventes ids.
- Pregunta y opciones en español, registro claro y directo. Máximo 200 caracteres por pregunta, 120 por opción.
- Si los fragmentos no dan para un quiz, devuelve {"preguntas":[]}.`;

const PROMPT_RESUMEN = `Eres el sintetizador del sustrato AUTOGENES de UMWELT. Recibes fragmentos citables de un documento del operador (cada uno con su id). Tu única fuente de verdad son esos fragmentos: cero conocimiento externo, cero invención.

Devuelve SOLO un objeto JSON válido, sin markdown ni comentarios, con esta forma exacta:
{"puntos":[{"texto":"...","evidencia":["id-fragmento"]}]}

REGLAS:
- Entre 5 y 9 puntos que capturen el arco completo del texto: tesis, conceptos clave, datos duros, conclusiones. Menos si el texto no da.
- Cada punto es UNA afirmación autónoma en español, máximo 280 caracteres, fiel a lo que dicen los fragmentos.
- "evidencia" lleva los ids EXACTOS de los fragmentos que respaldan el punto. Jamás inventes ids. Sin evidencia el punto no vale.
- Orden: sigue el orden del documento.
- Si los fragmentos no contienen nada sustantivo, devuelve {"puntos":[]}.`;

const PROMPT_CRONOLOGIA = `Eres el cronólogo del sustrato AUTOGENES de UMWELT. Recibes fragmentos citables de un documento del operador (cada uno con su id). Tu única fuente de verdad son esos fragmentos: cero conocimiento externo, cero invención.

Extrae los eventos FECHADOS del texto. Devuelve SOLO un objeto JSON válido, sin markdown ni comentarios, con esta forma exacta:
{"eventos":[{"titulo":"...","fecha":"2024-03-12","entidades":["nombre"],"evidencia":["id-fragmento"]}]}

REGLAS:
- Solo eventos con fecha EXPLÍCITA en los fragmentos: firmas, vencimientos, publicaciones, hechos históricos, plazos. Jamás deduzcas fechas que el texto no da.
- "fecha": ISO. Si el texto da día exacto usa AAAA-MM-DD; si solo mes, AAAA-MM; si solo año, AAAA.
- "titulo": qué pasó, máximo 120 caracteres, español directo, sin la fecha repetida.
- "entidades": nombres de personas/organizaciones/conceptos involucrados (0 a 4), tal como aparecen.
- "evidencia" lleva los ids EXACTOS de los fragmentos que fechan el evento. Jamás inventes ids.
- Entre 0 y 14 eventos. Si el texto no fecha nada, devuelve {"eventos":[]}.`;

const PROMPT_TRANSCRIPCION = `Eres el transcriptor del sustrato AUTOGENES de UMWELT. Recibes una imagen (captura de pantalla, foto de documento o apunte) del operador.

Transcribe TODO el texto legible de la imagen, fielmente:
- Solo texto plano, sin markdown, sin comentarios, sin describir la imagen.
- Respeta el orden de lectura (columnas de izquierda a derecha, arriba a abajo) y los saltos de línea significativos.
- Conserva números, unidades, fechas y símbolos EXACTOS; no corrijas ortografía.
- Marca lo ilegible como [ilegible]; jamás inventes texto que no esté en la imagen.
- Si la imagen no contiene texto, responde exactamente: [sin texto]`;

function buildPrompt(existentes: string[]): string {
  return `Eres el extractor del sustrato AUTOGENES de UMWELT. Recibes fragmentos citables de un documento del operador (cada uno con su id). Tu única fuente de verdad son esos fragmentos: cero conocimiento externo, cero invención.

Devuelve SOLO un objeto JSON válido, sin markdown ni comentarios, con esta forma exacta:
{"entidades":[{"nombre":"...","tipo":"concepto|persona|organizacion|lugar|evento|termino|otro","resumen":"...","evidencia":["id-fragmento"]}],"relaciones":[{"desde":"nombre entidad","hasta":"nombre entidad","tipo":"verbo corto en minúsculas","peso":0.5,"evidencia":["id-fragmento"]}]}

REGLAS:
- Extrae solo entidades realmente presentes en los fragmentos: los conceptos, personas, organizaciones, lugares, eventos y términos técnicos que estructuran el texto. Entre 3 y 14 por pase; menos si el texto no da.
- "evidencia" lleva los ids EXACTOS de los fragmentos donde la entidad aparece. Jamás inventes ids.
- "resumen": máximo 140 caracteres, en español, basado únicamente en lo que dicen los fragmentos.
- "relaciones": solo entre entidades de tu lista o de las ya existentes; tipo verbal corto ("define", "critica", "pertenece a", "causa"); peso 0.3–1.0 según qué tan explícita es en el texto; evidencia obligatoria.
- Si los fragmentos no contienen nada extraíble, devuelve {"entidades":[],"relaciones":[]}.
${existentes.length > 0 ? `\nEntidades ya existentes en el grafo (si aparecen en el texto, reúsalas con el nombre EXACTO en vez de duplicarlas): ${existentes.join(", ")}` : ""}`;
}

export async function POST(request: Request) {
  let crudoBody: unknown;
  try {
    crudoBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const modoCrudo =
    typeof crudoBody === "object" && crudoBody !== null
      ? (crudoBody as { modo?: unknown }).modo
      : undefined;

  if (
    modoCrudo === "quiz" ||
    modoCrudo === "resumen" ||
    modoCrudo === "cronologia"
  ) {
    const parsed = EstudioSchema.safeParse(crudoBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Solicitud inválida." },
        { status: 400 },
      );
    }
    const { modo, provider, clave, artefacto, fragmentos } = parsed.data;
    const apiKey = clave || process.env[PROVIDER_CONFIG[provider].envKey];
    if (!apiKey) {
      return NextResponse.json(
        {
          error: `Sin enlace con ${provider}. Configura la llave en el panel C2.`,
        },
        { status: 503 },
      );
    }
    const user = `Documento: ${artefacto}\nFragmentos:\n${JSON.stringify(fragmentos)}`;
    try {
      const crudo = await completar(
        provider,
        apiKey,
        modo === "quiz"
          ? PROMPT_QUIZ
          : modo === "cronologia"
            ? PROMPT_CRONOLOGIA
            : PROMPT_RESUMEN,
        user,
      );
      const json = extraerJson(crudo);
      if (!json) {
        return NextResponse.json(
          { error: "El modelo no devolvió material legible. Reintenta." },
          { status: 502 },
        );
      }
      let objeto: unknown;
      try {
        objeto = JSON.parse(json);
      } catch {
        return NextResponse.json(
          { error: "El material llegó malformado. Reintenta." },
          { status: 502 },
        );
      }
      const idsReales = new Set(fragmentos.map((f) => f.id));
      if (modo === "cronologia") {
        const envoltura = z
          .object({ eventos: z.array(z.unknown()).default([]) })
          .safeParse(objeto);
        if (!envoltura.success) {
          return NextResponse.json(
            { error: "La cronología no cumple el contrato. Reintenta." },
            { status: 502 },
          );
        }
        const eventos = sanearCronologia(
          envoltura.data.eventos
            .map((e) => PropuestaEventoSchema.safeParse(e))
            .filter((r) => r.success)
            .map((r) => r.data),
          idsReales,
        );
        return NextResponse.json({ eventos });
      }
      if (modo === "quiz") {
        const envoltura = z
          .object({ preguntas: z.array(z.unknown()).default([]) })
          .safeParse(objeto);
        if (!envoltura.success) {
          return NextResponse.json(
            { error: "El quiz no cumple el contrato. Reintenta." },
            { status: 502 },
          );
        }
        const preguntas = sanearQuiz(
          envoltura.data.preguntas
            .map((p) => PreguntaQuizSchema.safeParse(p))
            .filter((r) => r.success)
            .map((r) => r.data),
          idsReales,
        );
        return NextResponse.json({ preguntas });
      }
      const envoltura = z
        .object({ puntos: z.array(z.unknown()).default([]) })
        .safeParse(objeto);
      if (!envoltura.success) {
        return NextResponse.json(
          { error: "El resumen no cumple el contrato. Reintenta." },
          { status: 502 },
        );
      }
      const puntos = sanearResumen(
        envoltura.data.puntos
          .map((p) => PuntoResumenSchema.safeParse(p))
          .filter((r) => r.success)
          .map((r) => r.data),
        idsReales,
      );
      return NextResponse.json({ puntos });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "error desconocido";
      return NextResponse.json(
        { error: `Estudio sin respuesta (${detail}).` },
        { status: 502 },
      );
    }
  }

  if (modoCrudo === "adjudicacion") {
    const parsed = AdjudicacionSchema.safeParse(crudoBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Solicitud inválida." },
        { status: 400 },
      );
    }
    const { provider, clave, a, b } = parsed.data;
    const apiKey = clave || process.env[PROVIDER_CONFIG[provider].envKey];
    if (!apiKey) {
      return NextResponse.json(
        {
          error: `Sin enlace con ${provider}. Configura la llave en el panel C2.`,
        },
        { status: 503 },
      );
    }
    try {
      const crudo = await completar(
        provider,
        apiKey,
        PROMPT_ADJUDICACION,
        `Perfil A:\n${JSON.stringify(a)}\n\nPerfil B:\n${JSON.stringify(b)}`,
        1024,
      );
      const json = extraerJson(crudo);
      let objeto: unknown = null;
      try {
        objeto = json ? JSON.parse(json) : null;
      } catch {
        objeto = null;
      }
      const veredicto =
        objeto !== null
          ? z
              .object({
                mismo: z.boolean(),
                confianza: z.number().min(0).max(1).catch(0.5),
                razon: z
                  .string()
                  .transform((s) => s.slice(0, 200))
                  .catch(""),
              })
              .safeParse(objeto)
          : null;
      if (!veredicto || !veredicto.success) {
        return NextResponse.json(
          { error: "El adjudicador no devolvió un veredicto legible." },
          { status: 502 },
        );
      }
      return NextResponse.json({ veredicto: veredicto.data });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "error desconocido";
      return NextResponse.json(
        { error: `Adjudicación sin respuesta (${detail}).` },
        { status: 502 },
      );
    }
  }

  if (modoCrudo === "transcripcion") {
    const parsed = TranscripcionSchema.safeParse(crudoBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Solicitud inválida." },
        { status: 400 },
      );
    }
    const { provider, clave, nombre, imagen, mime } = parsed.data;
    const apiKey = clave || process.env[PROVIDER_CONFIG[provider].envKey];
    if (!apiKey) {
      return NextResponse.json(
        {
          error: `Sin enlace con ${provider}. Configura la llave en el panel C2.`,
        },
        { status: 503 },
      );
    }
    try {
      const texto = await completarVision(
        provider,
        apiKey,
        PROMPT_TRANSCRIPCION,
        `Imagen: ${nombre}. Transcribe su texto.`,
        { base64: imagen, mime },
      );
      const limpio = texto.trim();
      if (!limpio || limpio === "[sin texto]") {
        return NextResponse.json(
          { error: "El modelo no encontró texto legible en la imagen." },
          { status: 422 },
        );
      }
      return NextResponse.json({ texto: limpio });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "error desconocido";
      return NextResponse.json(
        { error: `Transcripción sin respuesta (${detail}).` },
        { status: 502 },
      );
    }
  }

  const parsed = ExtraccionSchema.safeParse(crudoBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const { provider, clave, artefacto, fragmentos, existentes } = parsed.data;

  const apiKey = clave || process.env[PROVIDER_CONFIG[provider].envKey];
  if (!apiKey) {
    return NextResponse.json(
      {
        error: `Sin enlace con ${provider}. Configura la llave en el panel C2.`,
      },
      { status: 503 },
    );
  }

  const user = `Documento: ${artefacto}\nFragmentos:\n${JSON.stringify(
    fragmentos,
  )}`;

  try {
    const crudo = await completar(
      provider,
      apiKey,
      buildPrompt(existentes),
      user,
    );
    const json = extraerJson(crudo);
    if (!json) {
      return NextResponse.json(
        { error: "El modelo no devolvió una propuesta legible. Reintenta." },
        { status: 502 },
      );
    }
    let objeto: unknown;
    try {
      objeto = JSON.parse(json);
    } catch {
      return NextResponse.json(
        { error: "La propuesta llegó malformada. Reintenta." },
        { status: 502 },
      );
    }
    // Lenient envelope + per-item validation: one bad item never kills
    // the pass. Then the provenance law, enforced against the REAL ids.
    const envoltura = z
      .object({
        entidades: z.array(z.unknown()).default([]),
        relaciones: z.array(z.unknown()).default([]),
      })
      .safeParse(objeto);
    if (!envoltura.success) {
      return NextResponse.json(
        { error: "La propuesta no cumple el contrato. Reintenta." },
        { status: 502 },
      );
    }
    const cruda = {
      entidades: envoltura.data.entidades
        .map((e) => PropuestaEntidadSchema.safeParse(e))
        .filter((r) => r.success)
        .map((r) => r.data),
      relaciones: envoltura.data.relaciones
        .map((r) => PropuestaRelacionSchema.safeParse(r))
        .filter((r) => r.success)
        .map((r) => r.data),
    };
    const propuesta = sanearPropuesta(
      cruda,
      new Set(fragmentos.map((f) => f.id)),
      existentes,
    );
    return NextResponse.json({ propuesta });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "error desconocido";
    return NextResponse.json(
      { error: `Extracción sin respuesta (${detail}).` },
      { status: 502 },
    );
  }
}
