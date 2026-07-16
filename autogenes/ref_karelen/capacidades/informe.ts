import { z } from "zod";
import { formatearFechaEs } from "@/lib/fechas";
import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
  Relacion,
} from "@/types/autogenes";

/**
 * SÍNTESIS contract — the digest the graph sends to the model and the
 * report that comes back. Provenance law for reports: a claim survives
 * only if it cites real fragments or real graph entities; everything
 * else is dropped by the sanitizer, never patched up.
 */

/* ── digest: graph → model ────────────────────────────────────────── */

const MAX_ENTIDADES = 60;
const MAX_RELACIONES = 80;
const MAX_EVENTOS = 30;
const MAX_FRAGMENTOS = 18;
const MAX_TEXTO_FRAGMENTO = 600;

export interface DigestoUmwelt {
  entidades: { nombre: string; tipo: string; resumen?: string; campo?: string }[];
  relaciones: string[];
  eventos: { titulo: string; fecha: string }[];
  fragmentos: { id: string; fuente: string; pagina?: number; texto: string }[];
}

/** Compact, capped projection of the whole graph. Fragment sampling is
 *  round-robin across sources so no single document hogs the digest. */
export function construirDigesto(
  artefactos: Artefacto[],
  fragmentos: Fragmento[],
  entidades: Entidad[],
  relaciones: Relacion[],
  eventos: Evento[],
): DigestoUmwelt {
  const nombreDe = new Map(entidades.map((e) => [e.id, e.nombre] as const));
  const artefactoPorId = new Map(artefactos.map((a) => [a.id, a] as const));

  const porFuente = new Map<string, Fragmento[]>();
  for (const f of fragmentos) {
    if (f.texto.trim().length === 0) continue;
    const lista = porFuente.get(f.artefactoId);
    if (lista) lista.push(f);
    else porFuente.set(f.artefactoId, [f]);
  }
  const muestra: Fragmento[] = [];
  const rondas = [...porFuente.values()];
  for (let i = 0; muestra.length < MAX_FRAGMENTOS; i++) {
    let agrego = false;
    for (const lista of rondas) {
      if (i < lista.length && muestra.length < MAX_FRAGMENTOS) {
        muestra.push(lista[i]);
        agrego = true;
      }
    }
    if (!agrego) break;
  }

  return {
    entidades: entidades.slice(0, MAX_ENTIDADES).map((e) => ({
      nombre: e.nombre,
      tipo: e.tipo,
      resumen: e.resumen,
      campo: e.campo,
    })),
    relaciones: relaciones
      .slice(0, MAX_RELACIONES)
      .flatMap((r) => {
        const desde = nombreDe.get(r.desdeId);
        const hasta = nombreDe.get(r.hastaId);
        return desde && hasta ? [`${desde} —${r.tipo}→ ${hasta}`] : [];
      }),
    eventos: eventos.slice(0, MAX_EVENTOS).map((ev) => ({
      titulo: ev.titulo,
      fecha: formatearFechaEs(ev.fecha, ev.precision),
    })),
    fragmentos: muestra.map((f) => ({
      id: f.id,
      fuente: artefactoPorId.get(f.artefactoId)?.nombre ?? "fuente",
      pagina: f.pagina,
      texto: f.texto.trim().slice(0, MAX_TEXTO_FRAGMENTO),
    })),
  };
}

/* ── report: model → operator ─────────────────────────────────────── */

export const PuntoInformeSchema = z.object({
  texto: z
    .string()
    .min(1)
    .transform((s) => s.trim().slice(0, 320)),
  evidencia: z.array(z.string()).default([]),
  entidades: z.array(z.string()).default([]),
});
export type PuntoInforme = z.infer<typeof PuntoInformeSchema>;

export const SeccionInformeSchema = z.object({
  encabezado: z
    .string()
    .min(1)
    .transform((s) => s.trim().slice(0, 80)),
  puntos: z.array(PuntoInformeSchema).max(8),
});

export const InformeSchema = z.object({
  titulo: z
    .string()
    .min(1)
    .transform((s) => s.trim().slice(0, 120)),
  secciones: z.array(SeccionInformeSchema).max(6),
});
export type Informe = z.infer<typeof InformeSchema>;

/**
 * Enforce the provenance law: prune fabricated fragment ids and entity
 * names; a point with nothing left to cite dies, and so does an empty
 * section. Never invents a citation.
 */
export function sanearInforme(
  informe: Informe,
  fragmentoIds: ReadonlySet<string>,
  nombresEntidad: ReadonlySet<string>,
): Informe {
  return {
    titulo: informe.titulo,
    secciones: informe.secciones
      .map((s) => ({
        encabezado: s.encabezado,
        puntos: s.puntos
          .map((p) => ({
            texto: p.texto,
            evidencia: p.evidencia.filter((id) => fragmentoIds.has(id)),
            entidades: p.entidades.filter((n) => nombresEntidad.has(n)),
          }))
          .filter((p) => p.evidencia.length > 0 || p.entidades.length > 0),
      }))
      .filter((s) => s.puntos.length > 0),
  };
}
