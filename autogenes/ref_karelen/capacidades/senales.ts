import { formatearFechaEs } from "@/lib/fechas";
import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
} from "@/types/autogenes";

/**
 * RADAR signals — pure, deterministic reads of the substrate. Every
 * signal is something the operator can ACT on, with its provenance
 * where it has one. No prediction, no scoring theater: dates come from
 * the cited cronología, queues from the real adjudication surfaces.
 */

const DIA_MS = 86_400_000;
export const HORIZONTE_DIAS = 120;

/** Local calendar day of `ahora`, anchored in UTC for stable diffs. */
function hoyUtc(ahora: number): number {
  const d = new Date(ahora);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function fechaUtc(iso: string): number {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

export interface Vencimiento {
  eventoId: string;
  titulo: string;
  fechaTexto: string;
  /** Calendar days from today; 0 = today. */
  enDias: number;
  citas: string[];
}

export function etiquetaDias(enDias: number): string {
  if (enDias === 0) return "hoy";
  if (enDias === 1) return "mañana";
  return `en ${enDias} días`;
}

/** Dated events from today up to the horizon, soonest first, cited. */
export function proximosVencimientos(
  eventos: Evento[],
  fragmentos: Fragmento[],
  artefactos: Artefacto[],
  ahora: number,
  horizonteDias = HORIZONTE_DIAS,
): Vencimiento[] {
  const hoy = hoyUtc(ahora);
  const fragmentoPorId = new Map(fragmentos.map((f) => [f.id, f] as const));
  const artefactoPorId = new Map(artefactos.map((a) => [a.id, a] as const));
  return eventos
    .map((ev) => ({
      ev,
      enDias: Math.round((fechaUtc(ev.fecha) - hoy) / DIA_MS),
    }))
    .filter(({ enDias }) => enDias >= 0 && enDias <= horizonteDias)
    .sort((a, b) => a.enDias - b.enDias)
    .map(({ ev, enDias }) => ({
      eventoId: ev.id,
      titulo: ev.titulo,
      fechaTexto: formatearFechaEs(ev.fecha, ev.precision),
      enDias,
      citas: [
        ...new Set(
          ev.evidencia.flatMap((id) => {
            const f = fragmentoPorId.get(id);
            if (!f) return [];
            const fuente = artefactoPorId.get(f.artefactoId)?.nombre ?? "fuente";
            return [`${fuente}${f.pagina ? ` · pág ${f.pagina}` : ""}`];
          }),
        ),
      ],
    }));
}

export interface FuenteFria {
  artefactoId: string;
  nombre: string;
  estado: "ocr-pendiente" | "sin-extraer";
}

/** Sources docked but never processed: no citable text (OCR pending)
 *  or citable text no entity ever cited (extraction pending). */
export function fuentesFrias(
  artefactos: Artefacto[],
  fragmentos: Fragmento[],
  entidades: Entidad[],
): FuenteFria[] {
  const citados = new Set(entidades.flatMap((e) => e.evidencia));
  return artefactos.flatMap((a): FuenteFria[] => {
    const propios = fragmentos.filter((f) => f.artefactoId === a.id);
    const conTexto = propios.filter((f) => f.texto.trim().length > 0);
    if (conTexto.length === 0) {
      return [{ artefactoId: a.id, nombre: a.nombre, estado: "ocr-pendiente" }];
    }
    if (!conTexto.some((f) => citados.has(f.id))) {
      return [{ artefactoId: a.id, nombre: a.nombre, estado: "sin-extraer" }];
    }
    return [];
  });
}

/** Whole days elapsed since a timestamp. */
export function diasDesde(ts: number, ahora: number): number {
  return Math.max(0, Math.floor((hoyUtc(ahora) - hoyUtc(ts)) / DIA_MS));
}

export const RESPALDO_UMBRAL_DIAS = 14;
