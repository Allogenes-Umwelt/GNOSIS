import { z } from "zod";
import type { GeoPunto } from "@/types/autogenes";

/**
 * Geo primitives for the territory plane — pure, testable. Web Mercator
 * projection, bbox fitting and an adaptive graticule for the substrate
 * canvas; candidate parsing for the OSM connector's geocoder. The TELOS
 * tile/routing stack plugs in on top of exactly this data later.
 */

const LAT_MAX = 85.05112878;

/** Web Mercator → world coordinates in [0,1]². */
export function proyectarMercator(lat: number, lon: number): {
  x: number;
  y: number;
} {
  const phi = (Math.max(-LAT_MAX, Math.min(LAT_MAX, lat)) * Math.PI) / 180;
  return {
    x: (lon + 180) / 360,
    y: (1 - Math.log(Math.tan(phi / 2 + Math.PI / 4)) / Math.PI) / 2,
  };
}

export interface Encuadre {
  aPantalla: (lat: number, lon: number) => [number, number];
  /** Padded lat/lon bounds actually visible — drives the graticule. */
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

/**
 * Fit a set of fixes into a w×h canvas with margin. A single point gets
 * a fixed ~city-scale window instead of an infinite zoom.
 */
export function encuadrar(
  puntos: GeoPunto[],
  w: number,
  h: number,
  margen = 36,
): Encuadre | null {
  if (puntos.length === 0 || w <= 0 || h <= 0) return null;
  const proy = puntos.map((p) => proyectarMercator(p.lat, p.lon));
  let x0 = Math.min(...proy.map((p) => p.x));
  let x1 = Math.max(...proy.map((p) => p.x));
  let y0 = Math.min(...proy.map((p) => p.y));
  let y1 = Math.max(...proy.map((p) => p.y));
  const MIN_SPAN = 0.0025; // ~ metro-area window in world units
  if (x1 - x0 < MIN_SPAN) {
    const cx = (x0 + x1) / 2;
    x0 = cx - MIN_SPAN / 2;
    x1 = cx + MIN_SPAN / 2;
  }
  if (y1 - y0 < MIN_SPAN) {
    const cy = (y0 + y1) / 2;
    y0 = cy - MIN_SPAN / 2;
    y1 = cy + MIN_SPAN / 2;
  }
  const escala = Math.min(
    (w - margen * 2) / (x1 - x0),
    (h - margen * 2) / (y1 - y0),
  );
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  const aPantalla = (lat: number, lon: number): [number, number] => {
    const p = proyectarMercator(lat, lon);
    return [w / 2 + (p.x - cx) * escala, h / 2 + (p.y - cy) * escala];
  };

  // Visible world window (inverse of the fit) → lat/lon bounds.
  const invLat = (y: number): number => {
    const ym = Math.min(0.999999, Math.max(0.000001, y));
    return ((2 * Math.atan(Math.exp((1 - 2 * ym) * Math.PI)) - Math.PI / 2) * 180) / Math.PI;
  };
  const wx = w / 2 / escala;
  const wy = h / 2 / escala;
  return {
    aPantalla,
    lonMin: Math.max(-180, (cx - wx) * 360 - 180),
    lonMax: Math.min(180, (cx + wx) * 360 - 180),
    latMin: invLat(cy + wy),
    latMax: invLat(cy - wy),
  };
}

/** Graticule step in degrees, adapted to the visible span. */
export function pasoGraticula(spanGrados: number): number {
  const pasos = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30];
  for (const p of pasos) {
    if (spanGrados / p <= 8) return p;
  }
  return 45;
}

/* ── Geocoder candidates (OSM connector through the gateway) ──────── */

export interface CandidatoLugar {
  nombre: string;
  lat: number;
  lon: number;
}

const RespuestaGeocodificador = z.object({
  datos: z.array(
    z.object({
      nombre: z.string(),
      latitud: z.string(),
      longitud: z.string(),
    }),
  ),
});

/* ── Screen-space clustering (declutter the plane) ───────────────── */

export interface PuntoPantalla {
  id: string;
  x: number;
  y: number;
}

export interface CumuloPantalla {
  /** Cluster centroid (average of members), in screen px. */
  x: number;
  y: number;
  /** Member point ids — length 1 means a lone fix. */
  ids: string[];
}

/**
 * Greedy single-pass clustering of already-projected points: any fix
 * within `radio` px of a growing cluster's centroid joins it. Dense
 * zones collapse into one count-badged marker instead of a pile of
 * overlapping diamonds, while far-apart fixes stay individual. Pure and
 * order-stable (input order decides seeds), so the render is
 * deterministic. `radio ≤ 0` disables clustering (every point is its
 * own cúmulo).
 */
export function agruparEnPantalla(
  puntos: PuntoPantalla[],
  radio: number,
): CumuloPantalla[] {
  const cumulos: (CumuloPantalla & { sx: number; sy: number })[] = [];
  const r2 = radio * radio;
  for (const p of puntos) {
    let destino: (typeof cumulos)[number] | null = null;
    if (radio > 0) {
      for (const c of cumulos) {
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        if (dx * dx + dy * dy <= r2) {
          destino = c;
          break;
        }
      }
    }
    if (destino) {
      destino.ids.push(p.id);
      destino.sx += p.x;
      destino.sy += p.y;
      destino.x = destino.sx / destino.ids.length;
      destino.y = destino.sy / destino.ids.length;
    } else {
      cumulos.push({ x: p.x, y: p.y, ids: [p.id], sx: p.x, sy: p.y });
    }
  }
  return cumulos.map(({ x, y, ids }) => ({ x, y, ids }));
}

/** Parse the gateway envelope into validated numeric candidates. */
export function parsearCandidatosLugar(raw: unknown): CandidatoLugar[] {
  const parsed = RespuestaGeocodificador.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.datos
    .map((d) => ({
      nombre: d.nombre,
      lat: Number(d.latitud),
      lon: Number(d.longitud),
    }))
    .filter(
      (c) =>
        Number.isFinite(c.lat) &&
        Number.isFinite(c.lon) &&
        Math.abs(c.lat) <= 90 &&
        Math.abs(c.lon) <= 180,
    )
    .slice(0, 5);
}
