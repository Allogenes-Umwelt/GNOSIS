import { z } from "zod";
import { getJson, numeroRequerido } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * Open-Meteo — open weather API, no key. Coordinates in, current
 * conditions plus 3-day outlook out; N1 adds the ERA5 archive (weather
 * of any past date since 1940 — the world-state join for the timeline)
 * and current air quality. Chain with osm→buscar_lugar when only a
 * place name is known.
 */

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export const openMeteo: Conector = {
  manifest: {
    id: "open-meteo",
    nombre: "Open-Meteo",
    campo: "hogar",
    acceso: "abierta",
    fuente: "https://open-meteo.com",
    descripcion:
      "Clima actual y pronóstico a 3 días para cualquier coordenada, sin llave.",
    consultas: [
      {
        id: "pronostico",
        descripcion:
          "Condiciones actuales y pronóstico de 3 días para una coordenada.",
        parametros: [
          {
            nombre: "latitud",
            descripcion: "Latitud decimal",
            requerido: true,
            ejemplo: "19.4326",
          },
          {
            nombre: "longitud",
            descripcion: "Longitud decimal",
            requerido: true,
            ejemplo: "-99.1332",
          },
        ],
      },
      {
        id: "historico",
        descripcion:
          "Clima observado (reanálisis ERA5) de una fecha pasada, desde 1940.",
        parametros: [
          {
            nombre: "latitud",
            descripcion: "Latitud decimal",
            requerido: true,
            ejemplo: "19.4326",
          },
          {
            nombre: "longitud",
            descripcion: "Longitud decimal",
            requerido: true,
            ejemplo: "-99.1332",
          },
          {
            nombre: "fecha",
            descripcion: "Fecha AAAA-MM-DD",
            requerido: true,
            ejemplo: "2024-11-03",
          },
        ],
      },
      {
        id: "calidad_aire",
        descripcion:
          "Calidad del aire actual para una coordenada (PM2.5, PM10, ozono).",
        parametros: [
          {
            nombre: "latitud",
            descripcion: "Latitud decimal",
            requerido: true,
            ejemplo: "19.4326",
          },
          {
            nombre: "longitud",
            descripcion: "Longitud decimal",
            requerido: true,
            ejemplo: "-99.1332",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    const lat = numeroRequerido(parametros, "latitud");
    const lon = numeroRequerido(parametros, "longitud");
    if (consulta === "pronostico") {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        "&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
        "&timezone=auto&forecast_days=3";
      return getJson(url);
    }
    if (consulta === "historico") {
      const fecha = parametros.fecha ?? "";
      if (!FECHA_RE.test(fecha)) {
        throw new Error('La fecha debe venir como AAAA-MM-DD. Corrígela y reintenta.');
      }
      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${fecha}&end_date=${fecha}` +
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max" +
        "&timezone=auto";
      const raw = await getJson(url);
      const s = z
        .object({
          daily: z.object({
            time: z.array(z.string()),
            temperature_2m_max: z.array(z.number().nullable()),
            temperature_2m_min: z.array(z.number().nullable()),
            precipitation_sum: z.array(z.number().nullable()),
            wind_speed_10m_max: z.array(z.number().nullable()),
          }),
        })
        .parse(raw);
      if (s.daily.time.length === 0 || s.daily.temperature_2m_max[0] === null) {
        throw new Error(
          "Sin dato de archivo para esa fecha (el reanálisis tarda unos días en cerrar).",
        );
      }
      return {
        fecha: s.daily.time[0],
        temperatura_max: s.daily.temperature_2m_max[0],
        temperatura_min: s.daily.temperature_2m_min[0],
        precipitacion_mm: s.daily.precipitation_sum[0],
        viento_max_kmh: s.daily.wind_speed_10m_max[0],
      };
    }
    if (consulta === "calidad_aire") {
      const url =
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        "&current=pm2_5,pm10,ozone,us_aqi&timezone=auto";
      const raw = await getJson(url);
      const s = z
        .object({
          current: z.object({
            pm2_5: z.number().nullable(),
            pm10: z.number().nullable(),
            ozone: z.number().nullable(),
            us_aqi: z.number().nullable(),
          }),
        })
        .parse(raw);
      return {
        pm2_5: s.current.pm2_5,
        pm10: s.current.pm10,
        ozono: s.current.ozone,
        aqi_us: s.current.us_aqi,
      };
    }
    throw new Error(`Consulta desconocida: ${consulta}.`);
  },
  presentar(datos, fuente) {
    if (fuente.consulta === "historico") {
      const h = z
        .object({
          fecha: z.string(),
          temperatura_max: z.number(),
          temperatura_min: z.number().nullable(),
          precipitacion_mm: z.number().nullable(),
          viento_max_kmh: z.number().nullable(),
        })
        .safeParse(datos);
      if (!h.success) return [];
      const d = h.data;
      return [
        {
          funcion: "metrica",
          titulo: `Clima del ${d.fecha}`,
          unidad: "°C",
          valor: d.temperatura_max,
          decimales: 1,
          serie: [],
          laterales: [
            {
              etiqueta: "Mínima",
              valor: d.temperatura_min === null ? "—" : d.temperatura_min.toFixed(1),
              unidad: "°",
            },
            {
              etiqueta: "Lluvia",
              valor: d.precipitacion_mm === null ? "—" : d.precipitacion_mm.toFixed(1),
              unidad: "mm",
            },
            {
              etiqueta: "Viento máx",
              valor: d.viento_max_kmh === null ? "—" : d.viento_max_kmh.toFixed(0),
              unidad: "km/h",
            },
          ],
          fuente,
        },
      ];
    }
    if (fuente.consulta === "calidad_aire") {
      const a = z
        .object({
          pm2_5: z.number().nullable(),
          pm10: z.number().nullable(),
          ozono: z.number().nullable(),
          aqi_us: z.number().nullable(),
        })
        .safeParse(datos);
      if (!a.success || a.data.aqi_us === null) return [];
      const d = a.data;
      return [
        {
          funcion: "metrica",
          titulo: "Calidad del aire (AQI EUA)",
          unidad: "AQI",
          valor: d.aqi_us ?? 0,
          decimales: 0,
          serie: [],
          laterales: [
            {
              etiqueta: "PM2.5",
              valor: d.pm2_5 === null ? "—" : d.pm2_5.toFixed(1),
              unidad: "µg/m³",
            },
            {
              etiqueta: "PM10",
              valor: d.pm10 === null ? "—" : d.pm10.toFixed(1),
              unidad: "µg/m³",
            },
            {
              etiqueta: "Ozono",
              valor: d.ozono === null ? "—" : d.ozono.toFixed(0),
              unidad: "µg/m³",
            },
          ],
          fuente,
        },
      ];
    }
    const s = z
      .object({
        current: z.object({
          temperature_2m: z.number(),
          apparent_temperature: z.number(),
          wind_speed_10m: z.number(),
        }),
        current_units: z.object({ temperature_2m: z.string() }).partial().optional(),
        daily: z.object({
          time: z.array(z.string()),
          temperature_2m_max: z.array(z.number()),
          temperature_2m_min: z.array(z.number()),
          precipitation_probability_max: z.array(z.number()),
        }),
      })
      .safeParse(datos);
    if (!s.success) return [];
    const d = s.data;
    const u = d.current_units?.temperature_2m ?? "°C";
    const serie = d.daily.time
      .map((t, i) => ({ t: Date.parse(t), v: d.daily.temperature_2m_max[i] }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
    const nombreDia = (iso: string, i: number) =>
      i === 0
        ? "Hoy"
        : i === 1
          ? "Mañana"
          : new Date(iso).toLocaleDateString("es-MX", { weekday: "short" });
    const pares = d.daily.time.slice(0, 3).map((t, i) => ({
      etiqueta: nombreDia(t, i),
      valor: Math.round(d.daily.temperature_2m_max[i]),
      detalle: `mín ${Math.round(d.daily.temperature_2m_min[i])}° · lluvia ${d.daily.precipitation_probability_max[i] ?? 0}%`,
    }));
    // Rich composition: current conditions, then the 3-day outlook side by side.
    return [
      {
        funcion: "metrica",
        titulo: "Ahora",
        unidad: u,
        valor: d.current.temperature_2m,
        decimales: 1,
        serie,
        laterales: [
          { etiqueta: "Sensación", valor: d.current.apparent_temperature.toFixed(1), unidad: "°" },
          { etiqueta: "Lluvia hoy", valor: String(d.daily.precipitation_probability_max[0] ?? 0), unidad: "%" },
          { etiqueta: "Viento", valor: d.current.wind_speed_10m.toFixed(0), unidad: "km/h" },
        ],
        fuente,
      },
      {
        funcion: "comparacion",
        titulo: "Próximos 3 días",
        unidad: u,
        decimales: 0,
        pares,
        sujeto: pares[0]?.etiqueta,
        fuente,
      },
    ];
  },
};
