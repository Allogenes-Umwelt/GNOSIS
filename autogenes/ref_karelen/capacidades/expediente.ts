import { formatearFechaEs } from "@/lib/fechas";
import { construirCorpus, recuperar } from "@/lib/recuperacion";
import { normalizar } from "@/lib/similitud";
import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
  Relacion,
} from "@/types/autogenes";

/**
 * DOSSIER assembly — everything the graph knows about ONE entity,
 * every claim with its citation. Pure projection over the substrate:
 * nothing here writes, fetches or invents; if a cited fragment no
 * longer exists, the citation is dropped rather than fabricated.
 */

export interface GrafoFuente {
  artefactos: Artefacto[];
  fragmentos: Fragmento[];
  entidades: Entidad[];
  relaciones: Relacion[];
  eventos: Evento[];
}

export interface PasajeCitado {
  fragmentoId: string;
  cita: string;
  extracto: string;
}

export interface VecinoExpediente {
  entidadId: string;
  /** The underlying edge — curation (cutting) needs it (Q3). */
  relacionId: string;
  nombre: string;
  tipo: Entidad["tipo"];
  /** Typed edge as read from this entity: "representa →" / "← emplea". */
  enlace: string;
  peso: number;
  citas: string[];
}

export interface HitoExpediente {
  eventoId: string;
  /** ISO date, for ordering. */
  iso: string;
  fecha: string;
  titulo: string;
  citas: string[];
}

export interface Expediente {
  entidad: Entidad;
  evidencia: PasajeCitado[];
  vecinos: VecinoExpediente[];
  cronologia: HitoExpediente[];
  /** BM25 hits in fragments BEYOND the declared evidence — also cited. */
  menciones: PasajeCitado[];
}

const EXTRACTO_MAX = 260;
const MENCIONES_MAX = 6;

function nombresDe(entidad: Entidad): string[] {
  return [entidad.nombre, ...(entidad.alias ?? [])];
}

export function construirExpediente(
  entidadId: string,
  g: GrafoFuente,
): Expediente | null {
  const entidad = g.entidades.find((e) => e.id === entidadId);
  if (!entidad) return null;

  const fragmentoPorId = new Map(g.fragmentos.map((f) => [f.id, f] as const));
  const artefactoPorId = new Map(g.artefactos.map((a) => [a.id, a] as const));
  const citaDe = (fragmentoId: string): string | null => {
    const f = fragmentoPorId.get(fragmentoId);
    if (!f) return null;
    const fuente = artefactoPorId.get(f.artefactoId)?.nombre ?? "fuente";
    return `${fuente}${f.pagina ? ` · pág ${f.pagina}` : ""}`;
  };
  const citasDe = (ids: string[]): string[] =>
    [...new Set(ids.map(citaDe).filter((c): c is string => c !== null))];

  const evidencia: PasajeCitado[] = entidad.evidencia.flatMap((id) => {
    const f = fragmentoPorId.get(id);
    const cita = citaDe(id);
    if (!f || !cita || f.texto.trim().length === 0) return [];
    return [
      {
        fragmentoId: id,
        cita,
        extracto:
          f.texto.trim().length > EXTRACTO_MAX
            ? `${f.texto.trim().slice(0, EXTRACTO_MAX)}…`
            : f.texto.trim(),
      },
    ];
  });

  const entidadPorId = new Map(g.entidades.map((e) => [e.id, e] as const));
  const vecinos: VecinoExpediente[] = g.relaciones
    .filter((r) => r.desdeId === entidadId || r.hastaId === entidadId)
    .flatMap((r) => {
      const saliente = r.desdeId === entidadId;
      const otro = entidadPorId.get(saliente ? r.hastaId : r.desdeId);
      if (!otro) return [];
      return [
        {
          entidadId: otro.id,
          relacionId: r.id,
          nombre: otro.nombre,
          tipo: otro.tipo,
          enlace: saliente ? `${r.tipo} →` : `← ${r.tipo}`,
          peso: r.peso,
          citas: citasDe(r.evidencia),
        },
      ];
    })
    .sort((a, b) => b.peso - a.peso);

  const nombres = new Set(nombresDe(entidad).map(normalizar));
  const cronologia: HitoExpediente[] = g.eventos
    .filter((ev) => ev.entidades.some((n) => nombres.has(normalizar(n))))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((ev) => ({
      eventoId: ev.id,
      iso: ev.fecha,
      fecha: formatearFechaEs(ev.fecha, ev.precision),
      titulo: ev.titulo,
      citas: citasDe(ev.evidencia),
    }));

  // Mentions: retrieval (C2) over the fragment layer only, minus the
  // fragments already cited as declared evidence.
  const declarada = new Set(entidad.evidencia);
  const corpusFragmentos = construirCorpus([], g.artefactos, g.fragmentos, [], []);
  const menciones: PasajeCitado[] = recuperar(
    nombresDe(entidad).join(" "),
    corpusFragmentos,
    MENCIONES_MAX + declarada.size,
  )
    .filter((h) => !declarada.has(h.id))
    .slice(0, MENCIONES_MAX)
    .map((h) => ({ fragmentoId: h.id, cita: h.cita, extracto: h.extracto }));

  return { entidad, evidencia, vecinos, cronologia, menciones };
}
