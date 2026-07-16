import { autocorrelacion } from "@/capacidades/series";
import type { ResumenRed } from "@/capacidades/signature";

/**
 * Anomaly engine (M0) — OBSERVAR's honest core. An anomaly is a MEASURED
 * deviation of the current network against the operator's own baseline
 * (the last docked snapshot), never a hidden model's opinion. Every
 * finding carries its detector, the numbers behind it, and a severity in
 * [0,1] the radar can deflect by. Pure and deterministic.
 */

export interface SnapshotQualia {
  ts: number;
  nNodos: number;
  nEnlaces: number;
  densidad: number;
  nComunidades: number;
  nComponentes: number;
  exponente: number | null;
  /** Top hubs at snapshot time (id + label + degree). */
  hubs: { id: string; etiqueta: string; grado: number }[];
  /** Articulation-bridge ids at snapshot time. */
  puentes: string[];
}

export function tomarSnapshot(resumen: ResumenRed, ts: number): SnapshotQualia {
  return {
    ts,
    nNodos: resumen.nNodos,
    nEnlaces: resumen.nEnlaces,
    densidad: resumen.densidad,
    nComunidades: resumen.nComunidades,
    nComponentes: resumen.nComponentes,
    exponente: resumen.exponente,
    hubs: resumen.hubs.map((h) => ({ id: h.id, etiqueta: h.etiqueta, grado: h.grado })),
    puentes: resumen.puentes.map((p) => p.id),
  };
}

export interface Anomalia {
  /** Detector id — one radar spoke each. */
  detector:
    | "hub-nuevo"
    | "exponente"
    | "puente-nuevo"
    | "puente-caido"
    | "islas"
    | "densidad"
    | "rafaga"
    | "ritmo"
    | "fuente";
  titulo: string;
  detalle: string;
  /** Normalized deflection for the radar, in [0,1]. */
  severidad: number;
  /** Citable key for the SYNESIS digest. */
  clave: string;
}

const acotar = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Compare the network NOW against the baseline snapshot. Empty baseline
 * or empty network → no findings (the surface says why, honestly).
 */
export function detectarAnomalias(
  actual: ResumenRed,
  base: SnapshotQualia,
): Anomalia[] {
  const hallazgos: Anomalia[] = [];
  if (actual.nNodos === 0 || base.nNodos === 0) return hallazgos;

  // 1 · A newcomer in the top hubs — structure reorganized around it.
  const hubsBase = new Set(base.hubs.map((h) => h.id));
  const nuevos = actual.hubs.filter((h) => !hubsBase.has(h.id)).slice(0, 2);
  for (const h of nuevos) {
    const rango = actual.hubs.findIndex((x) => x.id === h.id);
    hallazgos.push({
      detector: "hub-nuevo",
      titulo: `Concentrador nuevo: «${h.etiqueta}»`,
      detalle: `Entró al top de conectividad (rango ${rango + 1}, grado ${h.grado}) sin estar en tu referencia.`,
      severidad: acotar(1 - rango / Math.max(1, actual.hubs.length)),
      clave: `anom-hub-${h.id}`,
    });
  }

  // 2 · Degree-law exponent moved — the concentration regime changed.
  if (actual.exponente !== null && base.exponente !== null) {
    const delta = Math.abs(actual.exponente - base.exponente);
    if (delta >= 0.3) {
      hallazgos.push({
        detector: "exponente",
        titulo: "La ley de conectividad cambió de régimen",
        detalle: `Exponente ${base.exponente.toFixed(2)} → ${actual.exponente.toFixed(2)}: la estructura ${actual.exponente > base.exponente ? "se concentra en menos nodos" : "se reparte más"}.`,
        severidad: acotar(delta / 1.5),
        clave: "anom-exponente",
      });
    }
  }

  // 3 · Bridges appearing or vanishing — fragility moved.
  const puentesBase = new Set(base.puentes);
  const puentesAhora = new Set(actual.puentes.map((p) => p.id));
  for (const p of actual.puentes) {
    if (!puentesBase.has(p.id)) {
      hallazgos.push({
        detector: "puente-nuevo",
        titulo: `Puente crítico nuevo: «${p.etiqueta}»`,
        detalle: "Si cae, la red se parte — y en tu referencia no era puente.",
        severidad: 0.8,
        clave: `anom-puente-${p.id}`,
      });
    }
  }
  for (const id of base.puentes) {
    if (!puentesAhora.has(id)) {
      const etiqueta = base.hubs.find((h) => h.id === id)?.etiqueta ?? id;
      hallazgos.push({
        detector: "puente-caido",
        titulo: `Un puente dejó de serlo: «${etiqueta}»`,
        detalle: "La estructura ganó redundancia ahí — o el nodo perdió su posición.",
        severidad: 0.4,
        clave: `anom-expuente-${id}`,
      });
    }
  }

  // 4 · Islands formed or fused.
  const dIslas = actual.nComponentes - base.nComponentes;
  if (dIslas !== 0) {
    hallazgos.push({
      detector: "islas",
      titulo:
        dIslas > 0
          ? `${dIslas} ${dIslas === 1 ? "isla nueva" : "islas nuevas"}`
          : `${-dIslas} ${dIslas === -1 ? "isla se fusionó" : "islas se fusionaron"}`,
      detalle: `Componentes: ${base.nComponentes} → ${actual.nComponentes}.`,
      severidad: acotar(Math.abs(dIslas) / 3),
      clave: "anom-islas",
    });
  }

  // 5 · Density shift ≥ 30% — the weave tightened or loosened.
  if (base.densidad > 0) {
    const razon = actual.densidad / base.densidad;
    if (razon >= 1.3 || razon <= 0.7) {
      hallazgos.push({
        detector: "densidad",
        titulo: razon > 1 ? "El tejido se apretó" : "El tejido se aflojó",
        detalle: `Densidad ${(base.densidad * 100).toFixed(0)} → ${(actual.densidad * 100).toFixed(0)} por ciento.`,
        severidad: acotar(Math.abs(razon - 1)),
        clave: "anom-densidad",
      });
    }
  }

  return hallazgos.sort((a, b) => b.severidad - a.severidad);
}

/**
 * Activity burst — classical z-score of the last bucket against the mean
 * and deviation of the previous window. Statistics, not magic.
 */
export function rafagaActividad(
  serie: number[],
  ventana = 8,
): { z: number; esRafaga: boolean } {
  if (serie.length < 3) return { z: 0, esRafaga: false };
  const previos = serie.slice(Math.max(0, serie.length - 1 - ventana), -1);
  const ultimo = serie[serie.length - 1];
  const media = previos.reduce((s, x) => s + x, 0) / previos.length;
  const varianza =
    previos.reduce((s, x) => s + (x - media) ** 2, 0) / previos.length;
  const sd = Math.sqrt(varianza);
  const z = sd === 0 ? (ultimo > media ? 3 : 0) : (ultimo - media) / sd;
  return { z, esRafaga: z >= 2 };
}

export interface QuiebreRitmo {
  /** Dominant period (in buckets) found in the earlier window. */
  lag: number;
  /** Autocorrelation at that lag, earlier window. */
  antes: number;
  /** Autocorrelation at the same lag, recent window. */
  ahora: number;
  esQuiebre: boolean;
}

/**
 * Rhythm break (N0) — the radar's sixth spoke, finally wired. If the
 * operator's activity series had a clear periodicity (autocorrelation
 * ≥ 0.5 at some lag in the earlier half of the window) and that
 * periodicity collapsed in the recent, DISJOINT half (< 0.2 at the same
 * lag), the rhythm broke. Disjoint halves matter: overlapping windows
 * dilute the collapse. Classical statistics on the operator's own
 * series — no model, no magic.
 */
export function quiebreRitmo(serie: number[]): QuiebreRitmo {
  const nada = { lag: 0, antes: 0, ahora: 0, esQuiebre: false };
  const n = serie.length;
  if (n < 12) return nada;
  const mitad = Math.floor(n / 2);
  const antes = serie.slice(0, mitad);
  const ahora = serie.slice(n - mitad);
  const maxLag = Math.floor(mitad / 2);
  let mejorLag = 0;
  let mejorR = -Infinity;
  for (let lag = 2; lag <= maxLag; lag++) {
    const r = autocorrelacion(antes, lag);
    if (r > mejorR) {
      mejorR = r;
      mejorLag = lag;
    }
  }
  if (mejorLag === 0 || mejorR < 0.5) return nada;
  const rAhora = autocorrelacion(ahora, mejorLag);
  return {
    lag: mejorLag,
    antes: mejorR,
    ahora: rAhora,
    esQuiebre: rAhora < 0.2,
  };
}

/**
 * Connector-series deviation (N2) — the FUENTES spoke. Each numeric
 * series the operator has accumulated from a connector (FIX, CETES,
 * UDI…) is checked with the same classical z-score as the activity
 * burst: the last value against its own history. Top two findings by
 * severity; the world speaks only through the operator's own stored
 * queries — nothing is fetched here. Pure.
 */
export function desviacionFuentes(
  series: { etiqueta: string; valores: number[] }[],
): Anomalia[] {
  const hallazgos: Anomalia[] = [];
  for (const s of series) {
    const r = rafagaActividad(s.valores);
    if (!r.esRafaga) continue;
    // Relevance floor: a near-constant series drifting by hundredths
    // clears z≥2 on tiny variance but means nothing to the operator.
    // Ask for at least a 1% move against the window's own mean.
    const previos = s.valores.slice(0, -1);
    const media = previos.reduce((a, x) => a + x, 0) / previos.length;
    const ultimo = s.valores[s.valores.length - 1];
    if (media !== 0 && Math.abs(ultimo - media) / Math.abs(media) < 0.01) {
      continue;
    }
    hallazgos.push({
      detector: "fuente",
      titulo: `Serie «${s.etiqueta}» se desvió`,
      detalle: `El último valor está a ${r.z.toFixed(1)} desviaciones de su propia historia (${s.valores.length} consultas guardadas).`,
      severidad: acotar(r.z / 4),
      clave: `anom-fuente-${s.etiqueta}`,
    });
  }
  return hallazgos.sort((a, b) => b.severidad - a.severidad).slice(0, 2);
}
