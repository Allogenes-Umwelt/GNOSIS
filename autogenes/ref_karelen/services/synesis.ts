import { z } from "zod";
import { getConector } from "@/conectores/registry";
import { CAMPOS_INFO } from "@/lib/campos";
import { proyectarMemoria } from "@/lib/ontologia";
import { construirCorpus, recuperar } from "@/lib/recuperacion";
import { microapps } from "@/microapps/registry";
import { migrarMemoriaAlGrafo, recordarEnGrafo } from "@/services/autogenes";
import { proponerPlan } from "@/services/planes";
import { useAutogenesStore } from "@/store/autogenes";
import { nivelDe, useAutonomiaStore } from "@/store/autonomia";
import { useCanvasStore } from "@/store/canvas";
import { useDatosStore } from "@/store/datos";
import { usePreferenciasStore, type Provider } from "@/store/preferencias";
import { TIPOS_ENTIDAD } from "@/types/autogenes";
import { ResultadoConectorSchema } from "@/types/conector";
import { CAMPOS } from "@/types/microapp";
import { ResultadoUniversalSchema } from "@/types/resultado";
import type { SynesisContexto } from "@/lib/synesis-prompt";

/**
 * SYNESIS client — the device side of the kernel. The model proposes
 * tool calls; THIS module executes them locally against the operator's
 * stores, so raw data never leaves the device unrequested. Read-only v1.
 */

const TextBlockSchema = z.object({ type: z.literal("text"), text: z.string() });
const ToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});
const BlockSchema = z.union([
  TextBlockSchema,
  ToolUseBlockSchema,
  z.object({ type: z.string() }).passthrough(),
]);
const StepResponseSchema = z.object({
  stopReason: z.string().nullable(),
  content: z.array(BlockSchema),
});

const ErrorResponseSchema = z.object({ error: z.string() });

export interface WireMessage {
  role: "user" | "assistant";
  content: unknown;
}

export interface SynesisResult {
  ok: boolean;
  text: string;
  messages: WireMessage[];
}

const MAX_STEPS = 6;

export interface ProviderStatus {
  env: boolean;
  model: string;
}

export async function getProviderStatuses(): Promise<
  Partial<Record<Provider, ProviderStatus>>
> {
  try {
    const res = await fetch("/api/synesis");
    if (!res.ok) return {};
    const data = (await res.json()) as {
      providers?: Partial<Record<Provider, ProviderStatus>>;
    };
    return data.providers ?? {};
  } catch {
    return {};
  }
}

/** Link is up if the active provider has an env key or a device key. */
export async function getSynesisStatus(): Promise<{
  enlace: boolean;
  provider: Provider;
}> {
  const { provider, claves } = usePreferenciasStore.getState();
  if (claves[provider]) return { enlace: true, provider };
  const statuses = await getProviderStatuses();
  return { enlace: Boolean(statuses[provider]?.env), provider };
}

function buildContexto(): SynesisContexto {
  const datos = useDatosStore.getState().datos;
  const operations = useCanvasStore.getState().operations;
  const niveles = useAutonomiaStore.getState().niveles;
  const camposConDatos = CAMPOS_INFO.filter((c) =>
    datos.some((d) => d.campo === c.slug),
  ).map((c) => c.slug);
  return {
    totalDatos: datos.length,
    totalOperaciones: operations.length,
    camposConDatos,
    niveles: Object.fromEntries(
      CAMPOS_INFO.map((c) => [c.slug, nivelDe(niveles, c.slug)]),
    ),
  };
}

const ConsultarDatosInput = z.object({
  campo: z.string().optional(),
  busqueda: z.string().optional(),
});
const ConsultarOperacionesInput = z.object({
  limite: z.number().int().positive().optional(),
});

const ConsultarServicioInput = z.object({
  conector: z.string(),
  consulta: z.string(),
  parametros: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

/** Executes consultar_servicio against the allowlisted gateway route. */
async function ejecutarServicio(input: unknown): Promise<unknown> {
  const parsed = ConsultarServicioInput.safeParse(input);
  if (!parsed.success) {
    return { error: "Entrada inválida para consultar_servicio." };
  }
  const token =
    usePreferenciasStore.getState().clavesServicio[parsed.data.conector];
  try {
    const res = await fetch("/api/conector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed.data, token: token || undefined }),
    });
    const json: unknown = await res.json();
    if (!res.ok) {
      const err = ErrorResponseSchema.safeParse(json);
      return {
        error: err.success ? err.data.error : "El conector no respondió.",
      };
    }
    // A wave: the connector's own presentador docks its instruments to
    // the canvas, so the dashboard loads where the operator asked.
    const envoltura = ResultadoConectorSchema.safeParse(json);
    if (envoltura.success) {
      const conector = getConector(envoltura.data.conector);
      const vistas =
        conector?.presentar?.(envoltura.data.datos, {
          conector: envoltura.data.conector,
          consulta: envoltura.data.consulta,
          obtenido: envoltura.data.obtenido,
        }) ?? [];
      for (const v of vistas.slice(0, 2)) {
        useCanvasStore
          .getState()
          .registerInstrumento(`${envoltura.data.conector} · ${envoltura.data.consulta}`, v);
      }
      if (vistas.length > 0) {
        return {
          ...envoltura.data,
          nota: "Instrumento cargado en el canvas; dile al operador que ya lo tiene ahí.",
        };
      }
    }
    return json;
  } catch {
    return { error: "Sin enlace con el gateway de conectores. Reintenta." };
  }
}

async function executeTool(name: string, input: unknown): Promise<unknown> {
  if (name === "consultar_servicio") {
    return ejecutarServicio(input);
  }
  if (name === "presentar_resultado") {
    const envoltura = z.object({ resultado: z.unknown() }).safeParse(input);
    const parsed = ResultadoUniversalSchema.safeParse(
      envoltura.success ? envoltura.data.resultado : input,
    );
    if (!parsed.success) {
      return {
        error: `Resultado inválido: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")} — ${i.message}`)
          .join("; ")}`,
      };
    }
    useCanvasStore
      .getState()
      .registerInstrumento(parsed.data.titulo, parsed.data);
    return {
      ok: true,
      canvas: "/",
      nota: "Instrumento dockeado al canvas. Dile al operador que está ahí.",
    };
  }
  if (name === "consultar_datos") {
    const parsed = ConsultarDatosInput.safeParse(input);
    const { campo, busqueda } = parsed.success ? parsed.data : {};
    const q = busqueda?.toLowerCase();
    return useDatosStore
      .getState()
      .datos.filter((d) => (campo ? d.campo === campo : true))
      .filter((d) =>
        q
          ? d.etiqueta.toLowerCase().includes(q) ||
            d.valor.toLowerCase().includes(q)
          : true,
      )
      .slice(0, 20)
      .map((d) => ({
        etiqueta: d.etiqueta,
        valor: d.valor,
        campo: d.campo,
        registrado: new Date(d.createdAt).toISOString(),
      }));
  }
  if (name === "consultar_operaciones") {
    const parsed = ConsultarOperacionesInput.safeParse(input);
    const limite = parsed.success ? (parsed.data.limite ?? 10) : 10;
    return useCanvasStore
      .getState()
      .operations.slice(0, Math.min(limite, 30))
      .map((op) => ({
        code: op.code,
        kind: op.kind,
        title: op.title,
        fuente: op.source,
        registrado: new Date(op.createdAt).toISOString(),
      }));
  }
  if (name === "estado_del_sistema") {
    migrarMemoriaAlGrafo();
    return {
      ...buildContexto(),
      unidadesDesplegadas: microapps.length,
      objetosEnMemoria: useAutogenesStore.getState().entidades.length,
    };
  }
  if (name === "consultar_umwelt") {
    // Grounded retrieval: BM25 over the operator's whole graph, ON
    // device — the raw corpus never leaves; only the top passages the
    // model asked for do, each with its citation.
    migrarMemoriaAlGrafo();
    const parsed = z
      .object({ consulta: z.string().min(1) })
      .safeParse(input);
    if (!parsed.success) {
      return { error: "Entrada inválida para consultar_umwelt." };
    }
    const { artefactos, fragmentos, entidades, relaciones, eventos } =
      useAutogenesStore.getState();
    const corpus = construirCorpus(
      useDatosStore.getState().datos,
      artefactos,
      fragmentos,
      entidades,
      eventos,
    );
    const hits = recuperar(parsed.data.consulta, corpus, 8);
    if (hits.length === 0) {
      return {
        resultados: [],
        nota: "Sin pasajes relevantes en el grafo del operador para esa consulta.",
      };
    }
    const nombreDe = new Map(entidades.map((e) => [e.id, e.nombre] as const));
    return {
      resultados: hits.map((h) => ({
        clase: h.clase,
        titulo: h.titulo,
        pasaje: h.extracto.slice(0, 400),
        cita: h.cita,
        // Entities also expose their graph neighborhood for context.
        relaciones:
          h.clase === "entidad"
            ? relaciones
                .filter((r) => r.desdeId === h.id || r.hastaId === h.id)
                .slice(0, 5)
                .map((r) =>
                  r.desdeId === h.id
                    ? `${r.tipo} → ${nombreDe.get(r.hastaId) ?? "?"}`
                    : `← ${r.tipo} ${nombreDe.get(r.desdeId) ?? "?"}`,
                )
            : undefined,
      })),
    };
  }
  if (name === "proponer_plan") {
    // Governance happens ON device: the dimmer decides, never the model.
    return proponerPlan(input);
  }
  if (name === "consultar_memoria") {
    migrarMemoriaAlGrafo();
    const parsed = z
      .object({ busqueda: z.string().optional() })
      .safeParse(input);
    const q = parsed.success ? parsed.data.busqueda?.toLowerCase() : undefined;
    const { entidades, relaciones } = useAutogenesStore.getState();
    return proyectarMemoria(entidades, relaciones)
      .filter((o) =>
        q
          ? o.nombre.toLowerCase().includes(q) ||
            o.resumen.toLowerCase().includes(q)
          : true,
      )
      .slice(0, 30)
      .map((o) => ({
        nombre: o.nombre,
        tipo: o.tipo,
        resumen: o.resumen,
        relaciones: o.relaciones,
        origen: o.origen,
      }));
  }
  if (name === "recordar_objeto") {
    migrarMemoriaAlGrafo();
    const parsed = z
      .object({
        nombre: z.string().min(1),
        tipo: z.enum(TIPOS_ENTIDAD),
        resumen: z.string().min(1),
        campo: z.enum(CAMPOS).optional(),
        relaciones: z
          .array(z.object({ con: z.string().min(1), tipo: z.string().min(1) }))
          .optional(),
      })
      .safeParse(input);
    if (!parsed.success) {
      return { error: "Entrada inválida para recordar_objeto." };
    }
    const entidad = recordarEnGrafo({ ...parsed.data, origen: "synesis" });
    return { ok: true, nombre: entidad.nombre, tipo: entidad.tipo };
  }
  return { error: `Tool desconocida: ${name}` };
}

async function step(
  messages: WireMessage[],
  contexto: SynesisContexto,
): Promise<z.infer<typeof StepResponseSchema>> {
  const { provider, claves } = usePreferenciasStore.getState();
  const res = await fetch("/api/synesis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      clave: claves[provider] || undefined,
      messages,
      contexto,
    }),
  });
  const json: unknown = await res.json();
  if (!res.ok) {
    const err = ErrorResponseSchema.safeParse(json);
    throw new Error(err.success ? err.data.error : "SYNESIS no responde.");
  }
  return StepResponseSchema.parse(json);
}

export async function runIntent(
  intent: string,
  history: WireMessage[],
  opts: { maxSteps?: number; onTool?: (nombre: string) => void } = {},
): Promise<SynesisResult> {
  const contexto = buildContexto();
  const pasosMax = opts.maxSteps ?? MAX_STEPS;
  let messages: WireMessage[] = [
    ...history,
    { role: "user", content: intent },
  ];

  for (let i = 0; i < pasosMax; i++) {
    const { stopReason, content } = await step(messages, contexto);
    messages = [...messages, { role: "assistant", content }];

    if (stopReason === "tool_use") {
      const results = await Promise.all(
        content
          .filter(
            (b): b is z.infer<typeof ToolUseBlockSchema> =>
              b.type === "tool_use",
          )
          .map(async (b) => {
            opts.onTool?.(b.name);
            return {
              type: "tool_result" as const,
              tool_use_id: b.id,
              content: JSON.stringify(await executeTool(b.name, b.input)),
            };
          }),
      );
      messages = [...messages, { role: "user", content: results }];
      continue;
    }

    const text = content
      .filter((b): b is z.infer<typeof TextBlockSchema> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { ok: true, text, messages };
  }

  return {
    ok: false,
    text: "SYNESIS excedió el límite de pasos. Reformula la consulta.",
    messages,
  };
}

export interface MisionResult {
  ok: boolean;
  parte: string;
  herramientas: string[];
  planPendiente: boolean;
}

const PASOS_MISION = 10;

/**
 * A1 — bounded mission: one objective, a hard tool budget, everything
 * through the SAME gates (reads on device, writes only via
 * proponer_plan under the dimmer — a pending plan IS the checkpoint).
 * The final parte plus the tool trail dock to the canvas as the record.
 */
export async function ejecutarMision(objetivo: string): Promise<MisionResult> {
  const herramientas: string[] = [];
  const sobre =
    `MISIÓN (una sola pasada, máximo ${PASOS_MISION} pasos de herramientas): ${objetivo}\n` +
    "Ejecuta las consultas necesarias con tus herramientas, cita cada dato por su fuente, " +
    "y entrega un PARTE final: hallazgos primero, luego pendientes. " +
    "Si conviene escribir al grafo, usa proponer_plan y dilo — quedará en revisión del operador. " +
    "Nunca inventes datos: lo no consultado se reporta como no consultado.";
  const r = await runIntent(sobre, [], {
    maxSteps: PASOS_MISION,
    onTool: (n) => herramientas.push(n),
  });
  const planPendiente = herramientas.includes("proponer_plan");
  useCanvasStore
    .getState()
    .registerConsulta(
      `Misión: ${objetivo}`.slice(0, 140),
      `${r.text}\n\n— herramientas usadas: ${herramientas.length === 0 ? "ninguna" : herramientas.join(", ")}${planPendiente ? " · plan en revisión en C2" : ""}`,
    );
  return { ok: r.ok, parte: r.text, herramientas, planPendiente };
}
