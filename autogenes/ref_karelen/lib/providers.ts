import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { catalogoParaTools, conectores } from "@/conectores/registry";
import { TIPOS_ENTIDAD } from "@/types/autogenes";
import { CAMPOS } from "@/types/microapp";

/**
 * Provider layer — one native Anthropic path plus ONE generic
 * OpenAI-compatible adapter (covers DeepSeek, Gemini's compat endpoint,
 * and future providers). The wire format the client sees is always
 * Anthropic-shaped; adapters translate both directions.
 */

export type ProviderId = "anthropic" | "gemini" | "deepseek" | "openrouter";

export const PROVIDER_CONFIG: Record<
  ProviderId,
  { envKey: string; defaultModel: string; envModel: string; baseUrl?: string }
> = {
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    envModel: "SYNESIS_MODEL",
    defaultModel: "claude-sonnet-5",
  },
  gemini: {
    envKey: "GEMINI_API_KEY",
    envModel: "SYNESIS_MODEL_GEMINI",
    defaultModel: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  deepseek: {
    envKey: "DEEPSEEK_API_KEY",
    envModel: "SYNESIS_MODEL_DEEPSEEK",
    // `deepseek-chat` is the stable, always-valid id for DeepSeek's
    // flagship non-reasoning model — it returns content directly (a
    // reasoning model spends the token budget on reasoning_content and
    // hands back empty content, which broke extraction). Override via
    // SYNESIS_MODEL_DEEPSEEK for a specific model.
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
  },
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    envModel: "SYNESIS_MODEL_OPENROUTER",
    // A stable free-tier route; free model ids rotate over time, so the
    // operator can pin any other via SYNESIS_MODEL_OPENROUTER.
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    baseUrl: "https://openrouter.ai/api/v1",
  },
};

export function modelFor(provider: ProviderId): string {
  const cfg = PROVIDER_CONFIG[provider];
  return process.env[cfg.envModel] ?? cfg.defaultModel;
}

/* ── Toolset (Anthropic shape is the canonical one) ─────────────── */

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "consultar_datos",
    description:
      "Consulta los datos personales del operador almacenados en su dispositivo. Filtra por campo semántico y/o texto de búsqueda en etiqueta o valor.",
    input_schema: {
      type: "object",
      properties: {
        campo: { type: "string", enum: [...CAMPOS] },
        busqueda: { type: "string" },
      },
    },
  },
  {
    name: "consultar_operaciones",
    description:
      "Consulta el archivo de operaciones documentadas del operador (más recientes primero).",
    input_schema: {
      type: "object",
      properties: { limite: { type: "number" } },
    },
  },
  {
    name: "estado_del_sistema",
    description:
      "Devuelve el estado del sistema: conteos, campos con datos, niveles de autonomía del dimmer y unidades desplegadas.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "consultar_umwelt",
    description:
      "Recupera del grafo de conocimiento del operador (AUTOGENES) los pasajes más relevantes para una consulta: fragmentos de sus documentos, entidades, eventos fechados y datos. Cada resultado llega con su cita de procedencia. Úsala SIEMPRE antes de responder preguntas sobre el mundo, los documentos o la situación del operador, y cita cada pasaje usado con su cita exacta.",
    input_schema: {
      type: "object",
      properties: {
        consulta: {
          type: "string",
          description:
            "Qué buscar, en lenguaje natural (ej. 'renta del contrato de arrendamiento').",
        },
      },
      required: ["consulta"],
    },
  },
  {
    name: "consultar_memoria",
    description:
      "Consulta la memoria curada de SYNESIS: objetos tipados y sus relaciones, acumulados de conversaciones previas.",
    input_schema: {
      type: "object",
      properties: { busqueda: { type: "string" } },
    },
  },
  {
    name: "recordar_objeto",
    description:
      "Guarda o refina UNA entidad en el grafo de conocimiento del operador (su memoria unificada). Úsalo solo para hechos confirmados por el operador o presentes en sus datos — nunca para suposiciones. Las relaciones enlazan con otras entidades por nombre. Cuando el hecho pertenece claramente a un campo de la vida del operador, etiquétalo con `campo`.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        tipo: { type: "string", enum: [...TIPOS_ENTIDAD] },
        resumen: { type: "string" },
        campo: { type: "string", enum: [...CAMPOS] },
        relaciones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              con: { type: "string" },
              tipo: { type: "string" },
            },
            required: ["con", "tipo"],
          },
        },
      },
      required: ["nombre", "tipo", "resumen"],
    },
  },
  {
    name: "proponer_plan",
    description: `Propone un PLAN: una secuencia de operaciones ADITIVAS sobre el grafo del operador, para trabajo multi-paso (abrir un caso con sus miembros, registrar hallazgos confirmados y enlazarlos). El dimmer de autonomía del operador gobierna: el plan puede ejecutarse al instante o quedar pendiente de su aprobación en el panel C2 — reporta el estado tal cual te llegue. Operaciones permitidas en pasos (campo op):
- crear_caso {nombre, objetivo?} — abre un expediente de investigación.
- anexar_caso {caso, entidades?:[nombres], artefactos?:[nombres de fuente]} — ancla miembros existentes al caso.
- recordar {nombre, tipo, resumen, campo?} — entidad confirmada al grafo.
- enlazar {desde, hasta, tipo} — relación entre entidades que EXISTEN o que este plan recuerda antes.
- nota {caso, texto} — hallazgo o decisión en el expediente.
Jamás propongas borrar nada: eso es exclusivo del operador. Declara campo cuando el plan pertenezca a un campo de su vida.`,
    input_schema: {
      type: "object",
      properties: {
        objetivo: { type: "string" },
        campo: { type: "string", enum: [...CAMPOS] },
        pasos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: ["crear_caso", "anexar_caso", "recordar", "enlazar", "nota"],
              },
            },
            required: ["op"],
          },
        },
      },
      required: ["objetivo", "pasos"],
    },
  },
  {
    name: "presentar_resultado",
    description: `Presenta un resultado como instrumento visual persistente en el Panel de Instrumentos del operador (/panel). Úsalo cuando un hallazgo merezca instrumento: una métrica con historia, una comparación de opciones, un dictamen con evidencia, o una constelación de relaciones. El campo resultado debe cumplir el contrato ResultadoUniversal según su funcion:
- metrica: {funcion:"metrica", titulo, unidad, valor:number, decimales?:0-6, delta?:{pct:number,periodo}, serie:[{t:epoch_ms,v:number}], referencia?:{etiqueta,v}, laterales?:[{etiqueta,valor,unidad?}], fuente}
- comparacion: {funcion:"comparacion", titulo, unidad, decimales?:0-6, pares:[{etiqueta,valor:number,detalle?}], sujeto?:etiqueta, fuente}
- dictamen: {funcion:"dictamen", titulo, veredicto:"favorable"|"atencion"|"insuficiente", enunciado, evidencia:[{dato,cita}], nivel?:{valor:0-1,zonas:[z1,z2,z3]}, siguienteAccion?:{etiqueta,href}, fuente}
- constelacion: {funcion:"constelacion", titulo, nucleo:{etiqueta}, nodos:[{id,etiqueta,anillo:1|2,vivo?:bool,detalle?}], fuente}
fuente es OBLIGATORIA: {conector, consulta, obtenido:ISO-8601} — el conector real del que salió el dato (o "sistema" para derivaciones locales). Jamás presentes valores que no vengan de tools.`,
    input_schema: {
      type: "object",
      properties: { resultado: { type: "object" } },
      required: ["resultado"],
    },
  },
  {
    name: "consultar_servicio",
    description: `Consulta un servicio externo abierto mediante un conector registrado. Es tu única fuente válida para datos del mundo (tipo de cambio, tasas, clima, festivos, lugares, rutas, entidades). Cita cada dato como [conector · consulta] con su fecha. Encadena conectores cuando haga falta (ej. osm buscar_lugar → open-meteo pronostico). Catálogo (parámetros con ? son opcionales):\n${catalogoParaTools()}`,
    input_schema: {
      type: "object",
      properties: {
        conector: {
          type: "string",
          enum: conectores.map((c) => c.manifest.id),
        },
        consulta: { type: "string" },
        parametros: { type: "object" },
      },
      required: ["conector", "consulta"],
    },
  },
];

/* ── Wire schema (Anthropic-shaped, validated) ──────────────────── */

const TextBlock = z.object({ type: z.literal("text"), text: z.string() });
const ToolUseBlock = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});
const ToolResultBlock = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.string(),
});

export const WireMessageSchema = z.union([
  z.object({ role: z.literal("user"), content: z.string() }),
  z.object({ role: z.literal("user"), content: z.array(ToolResultBlock) }),
  z.object({
    role: z.literal("assistant"),
    content: z.array(z.union([TextBlock, ToolUseBlock])),
  }),
]);
export type WireMessage = z.infer<typeof WireMessageSchema>;

export interface KernelResult {
  stopReason: "tool_use" | "end_turn";
  content: (z.infer<typeof TextBlock> | z.infer<typeof ToolUseBlock>)[];
}

/* ── Anthropic native ───────────────────────────────────────────── */

export async function callAnthropic(
  apiKey: string,
  system: string,
  messages: WireMessage[],
): Promise<KernelResult> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: modelFor("anthropic"),
    max_tokens: 2048,
    // No `temperature`: Sonnet 5 / Opus 4.8+ reject sampling params with a 400.
    // Thinking disabled keeps the kernel snappy and avoids having to replay
    // thinking blocks across the on-device tool loop.
    thinking: { type: "disabled" },
    system,
    tools: TOOLS,
    messages: messages as Anthropic.MessageParam[],
  });
  const content = response.content.filter(
    (b): b is Anthropic.TextBlock | Anthropic.ToolUseBlock =>
      b.type === "text" || b.type === "tool_use",
  );
  return {
    stopReason: response.stop_reason === "tool_use" ? "tool_use" : "end_turn",
    content: content.map((b) =>
      b.type === "text"
        ? { type: "text", text: b.text }
        : { type: "tool_use", id: b.id, name: b.name, input: b.input },
    ),
  };
}

/* ── Single-shot completion (no tools) — for structured passes like
      AUTOGENES extraction. Same two paths as the kernel. ───────────── */

export async function completar(
  provider: ProviderId,
  apiKey: string,
  system: string,
  user: string,
  maxTokens = 4096,
): Promise<string> {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: modelFor("anthropic"),
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
      system,
      messages: [{ role: "user", content: user }],
    });
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
  const cfg = PROVIDER_CONFIG[provider];
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelFor(provider),
      max_tokens: maxTokens,
      // Every completar caller wants a JSON object; forcing json_object
      // stops the model from returning prose or an empty completion
      // (DeepSeek and Gemini's OpenAI-compat both support it, and the
      // prompts already say "JSON").
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${provider} respondió ${res.status}${body ? `: ${body.slice(0, 220)}` : ""}`,
    );
  }
  const parsed = OAIResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`${provider} devolvió una forma inesperada.`);
  }
  const msg = parsed.data.choices[0].message;
  // Reasoning models leave the answer in reasoning_content when content
  // is empty; accept either. Surface finish_reason if truly empty.
  const texto = msg.content || msg.reasoning_content || "";
  if (!texto.trim()) {
    const razon = parsed.data.choices[0].finish_reason;
    throw new Error(
      `${provider} devolvió una respuesta vacía${razon ? ` (${razon}; sube max_tokens o usa un modelo no-razonador)` : ""}.`,
    );
  }
  return texto;
}

/* ── Single-shot vision completion (no tools) — for the OCR router's
      opt-in route. Image travels as base64, both provider shapes. ──── */

export type MimeImagen = "image/jpeg" | "image/png" | "image/webp";

export async function completarVision(
  provider: ProviderId,
  apiKey: string,
  system: string,
  user: string,
  imagen: { base64: string; mime: MimeImagen },
  maxTokens = 4096,
): Promise<string> {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: modelFor("anthropic"),
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imagen.mime,
                data: imagen.base64,
              },
            },
            { type: "text", text: user },
          ],
        },
      ],
    });
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
  const cfg = PROVIDER_CONFIG[provider];
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelFor(provider),
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${imagen.mime};base64,${imagen.base64}`,
              },
            },
            { type: "text", text: user },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${provider} respondió ${res.status}${body ? `: ${body.slice(0, 220)}` : ""}`,
    );
  }
  const parsed = OAIResponseSchema.safeParse(await res.json());
  if (!parsed.success || !parsed.data.choices[0].message.content) {
    throw new Error(`${provider} devolvió una respuesta vacía.`);
  }
  return parsed.data.choices[0].message.content;
}

/* ── OpenAI-compatible adapter (DeepSeek, Gemini compat, …) ─────── */

interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

function toOpenAI(system: string, messages: WireMessage[]): OAIMessage[] {
  const out: OAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") {
        out.push({ role: "user", content: m.content });
      } else if (Array.isArray(m.content)) {
        for (const r of m.content) {
          out.push({
            role: "tool",
            tool_call_id: r.tool_use_id,
            content: r.content,
          });
        }
      }
    } else {
      const text = m.content
        .filter((b): b is z.infer<typeof TextBlock> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const calls = m.content
        .filter((b): b is z.infer<typeof ToolUseBlock> => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function" as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      out.push({
        role: "assistant",
        content: text.length > 0 ? text : null,
        ...(calls.length > 0 ? { tool_calls: calls } : {}),
      });
    }
  }
  return out;
}

/**
 * Gemini's OpenAI-compatible function validator rejects an object-typed
 * parameter that has no `properties` key (Anthropic tolerates it). Ensure
 * every object schema carries `properties`, recursively, before sending.
 */
export function sanitizeForOpenAI(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  const s = { ...(schema as Record<string, unknown>) };
  if (s.type === "object" && typeof s.properties !== "object") {
    s.properties = {};
  }
  if (s.properties && typeof s.properties === "object") {
    s.properties = Object.fromEntries(
      Object.entries(s.properties as Record<string, unknown>).map(([k, v]) => [
        k,
        sanitizeForOpenAI(v),
      ]),
    );
  }
  if (s.items) s.items = sanitizeForOpenAI(s.items);
  return s;
}

const OAIResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          reasoning_content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({
                  name: z.string(),
                  arguments: z.string(),
                }),
              }),
            )
            .nullable()
            .optional(),
        }),
      }),
    )
    .min(1),
});

export async function callOpenAICompat(
  provider: ProviderId,
  apiKey: string,
  system: string,
  messages: WireMessage[],
): Promise<KernelResult> {
  const cfg = PROVIDER_CONFIG[provider];
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelFor(provider),
      temperature: 0.3,
      // 1024 truncated multi-step plan tool calls mid-JSON; keep parity
      // with the Anthropic path.
      max_tokens: 2048,
      messages: toOpenAI(system, messages),
      tools: TOOLS.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: sanitizeForOpenAI(t.input_schema),
        },
      })),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${provider} respondió ${res.status}${body ? `: ${body.slice(0, 220)}` : ""}`,
    );
  }
  const raw: unknown = await res.json();
  const result = OAIResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `${provider} devolvió una forma inesperada: ${JSON.stringify(raw).slice(0, 220)}`,
    );
  }
  const parsed = result.data;
  const eleccion = parsed.choices[0];
  const msg = eleccion.message;
  const content: KernelResult["content"] = [];
  if (msg.content) content.push({ type: "text", text: msg.content });
  for (const call of msg.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = JSON.parse(call.function.arguments);
    } catch {
      // Truncated/malformed tool arguments must FAIL LOUD — a silent {}
      // turns a cut-off plan into a confusing "Plan inválido".
      throw new Error(
        eleccion.finish_reason === "length"
          ? `${provider} cortó la respuesta a media llamada de tool (límite de tokens). Reintenta con una intención más corta.`
          : `${provider} devolvió argumentos ilegibles para ${call.function.name}. Reintenta.`,
      );
    }
    content.push({
      type: "tool_use",
      id: call.id,
      name: call.function.name,
      input,
    });
  }
  return {
    stopReason:
      (msg.tool_calls ?? []).length > 0 ? "tool_use" : "end_turn",
    content,
  };
}
