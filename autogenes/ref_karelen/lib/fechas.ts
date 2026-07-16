import { normalizar } from "@/lib/similitud";
import type {
  Evento,
  PrecisionFecha,
  PropuestaEvento,
} from "@/types/autogenes";

/**
 * Spanish-first date handling for the timeline — pure, deterministic.
 * The model proposes dates in whatever form the source used; these
 * functions normalize them to ISO + precision, enforce the provenance
 * law, and format them back for the operator.
 */

export interface FechaNormalizada {
  fecha: string; // YYYY-MM-DD (month/year precision pads with 01)
  precision: PrecisionFecha;
}

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const MES_CORTO = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function valida(anio: number, mes: number, dia: number): boolean {
  if (anio < 1000 || anio > 2999 || mes < 1 || mes > 12 || dia < 1) {
    return false;
  }
  return dia <= new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function plegarMes(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Parse an ISO or Spanish date expression:
 * "2024-03-12" · "2024-03" · "2024" · "12/03/2024" (day-first) ·
 * "12 de marzo de 2024" · "marzo de 2024".
 */
export function parsearFechaEs(entrada: string): FechaNormalizada | null {
  const s = entrada.trim();

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valida(anio, mes, dia)
      ? { fecha: `${m[1]}-${m[2]}-${m[3]}`, precision: "dia" }
      : null;
  }
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const [anio, mes] = [Number(m[1]), Number(m[2])];
    return valida(anio, mes, 1)
      ? { fecha: `${m[1]}-${m[2]}-01`, precision: "mes" }
      : null;
  }
  m = /^(\d{4})$/.exec(s);
  if (m) {
    const anio = Number(m[1]);
    return valida(anio, 1, 1)
      ? { fecha: `${m[1]}-01-01`, precision: "anio" }
      : null;
  }
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) {
    const [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valida(anio, mes, dia)
      ? { fecha: `${anio}-${pad(mes)}-${pad(dia)}`, precision: "dia" }
      : null;
  }
  m = /^(\d{1,2})\s+de\s+([a-zñáéíóú]+)(?:\s+(?:de|del))?\s+(\d{4})$/i.exec(s);
  if (m) {
    const mes = MESES[plegarMes(m[2])];
    const [dia, anio] = [Number(m[1]), Number(m[3])];
    if (!mes || !valida(anio, mes, dia)) return null;
    return { fecha: `${anio}-${pad(mes)}-${pad(dia)}`, precision: "dia" };
  }
  m = /^([a-zñáéíóú]+)\s+(?:de|del)?\s*(\d{4})$/i.exec(s);
  if (m) {
    const mes = MESES[plegarMes(m[1])];
    const anio = Number(m[2]);
    if (!mes || !valida(anio, mes, 1)) return null;
    return { fecha: `${anio}-${pad(mes)}-01`, precision: "mes" };
  }
  return null;
}

/** "2024-03-12"/dia → "12 MAR 2024"; mes → "MAR 2024"; anio → "2024". */
export function formatearFechaEs(
  fecha: string,
  precision: PrecisionFecha,
): string {
  const [anio, mes, dia] = fecha.split("-");
  const nombreMes = MES_CORTO[Number(mes) - 1] ?? mes;
  if (precision === "anio") return anio;
  if (precision === "mes") return `${nombreMes} ${anio}`;
  return `${dia} ${nombreMes} ${anio}`;
}

export interface EventoSaneado {
  titulo: string;
  fecha: string;
  precision: PrecisionFecha;
  entidades: string[];
  evidencia: string[];
}

/**
 * Provenance + date law for timeline proposals: fecha must parse,
 * evidence must point at real fragmentos, duplicates (titulo+fecha)
 * collapse. Output sorted ascending.
 */
export function sanearCronologia(
  eventos: PropuestaEvento[],
  fragmentoIds: ReadonlySet<string>,
  max = 20,
): EventoSaneado[] {
  const salida: EventoSaneado[] = [];
  const vistos = new Set<string>();
  for (const e of eventos) {
    const normal = parsearFechaEs(e.fecha);
    const evidencia = [
      ...new Set(e.evidencia.filter((id) => fragmentoIds.has(id))),
    ];
    if (!normal || evidencia.length === 0) continue;
    // Dedup on the normalized title (accent/punct-insensitive, matching
    // how the rest of the system compares names) so "Pagó predial" and
    // "pago predial" on the same date collapse to one event.
    const clave = `${normalizar(e.titulo)}|${normal.fecha}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({
      titulo: e.titulo,
      fecha: normal.fecha,
      precision: normal.precision,
      entidades: e.entidades.filter((x) => x.length > 0).slice(0, 6),
      evidencia,
    });
    if (salida.length >= max) break;
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface HistogramaMeses {
  /** 12 counts, ENE…DIC — only mes/dia precision events land in a month. */
  meses: number[];
  /** Events dated to the year only (no month) — they have no cell. */
  sinMes: number;
  /** The busiest month's count, for normalizing intensity (≥ 1). */
  pico: number;
  /** Total events counted. */
  total: number;
}

/**
 * Month-density profile for one year's events — the heat spine. A year
 * with many events shows its SHAPE (when things cluster) instead of
 * collapsing into a long flat list. Pure and deterministic: year-only
 * dates carry no real month, so they are counted apart rather than
 * misfiled into January.
 */
export function histogramaMeses(eventos: Evento[]): HistogramaMeses {
  const meses = new Array<number>(12).fill(0);
  let sinMes = 0;
  for (const e of eventos) {
    if (e.precision === "anio") {
      sinMes += 1;
      continue;
    }
    const mes = Number(e.fecha.slice(5, 7));
    if (mes >= 1 && mes <= 12) meses[mes - 1] += 1;
  }
  const pico = Math.max(1, ...meses);
  return { meses, sinMes, pico, total: eventos.length };
}

/** Group persisted events by year for the timeline spine. */
export function agruparPorAnio(
  eventos: Evento[],
): { anio: string; eventos: Evento[] }[] {
  const orden = [...eventos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const grupos: { anio: string; eventos: Evento[] }[] = [];
  for (const e of orden) {
    const anio = e.fecha.slice(0, 4);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.anio === anio) ultimo.eventos.push(e);
    else grupos.push({ anio, eventos: [e] });
  }
  return grupos;
}
