import { z } from "zod";
import { getJson, numeroRequerido } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * OpenStreetMap — geocoding via Nominatim and driving routes via the
 * public OSRM demo server. Both open; Nominatim's usage policy asks for
 * an identifying User-Agent, sent below.
 */

const UA = "UMWELT-prototipo/0.1 (operador unico; contacto en repositorio)";

const LugarSchema = z.array(
  z.object({
    display_name: z.string(),
    lat: z.string(),
    lon: z.string(),
    type: z.string().optional(),
  }),
);

const RutaSchema = z.object({
  routes: z
    .array(z.object({ distance: z.number(), duration: z.number() }))
    .min(1),
});

export const osm: Conector = {
  manifest: {
    id: "osm",
    nombre: "OpenStreetMap",
    campo: "automotriz",
    acceso: "abierta",
    fuente: "https://www.openstreetmap.org",
    descripcion:
      "Geocodificación de lugares (Nominatim) y rutas en auto con distancia y tiempo (OSRM).",
    consultas: [
      {
        id: "buscar_lugar",
        descripcion:
          "Busca un lugar por nombre y devuelve coordenadas (encadenable con open-meteo o ruta).",
        parametros: [
          {
            nombre: "consulta",
            descripcion: "Nombre o dirección del lugar",
            requerido: true,
            ejemplo: "Monterrey, Nuevo León",
          },
        ],
      },
      {
        id: "ruta",
        descripcion:
          "Ruta en auto entre dos coordenadas: distancia (km) y duración (min).",
        parametros: [
          {
            nombre: "origen_latitud",
            descripcion: "Latitud de origen",
            requerido: true,
            ejemplo: "19.4326",
          },
          {
            nombre: "origen_longitud",
            descripcion: "Longitud de origen",
            requerido: true,
            ejemplo: "-99.1332",
          },
          {
            nombre: "destino_latitud",
            descripcion: "Latitud de destino",
            requerido: true,
            ejemplo: "20.6597",
          },
          {
            nombre: "destino_longitud",
            descripcion: "Longitud de destino",
            requerido: true,
            ejemplo: "-103.3496",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    if (consulta === "buscar_lugar") {
      const q = (parametros.consulta ?? "").trim();
      if (q.length === 0) {
        throw new Error('Falta el parámetro "consulta". Indica el lugar.');
      }
      const raw = await getJson(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5`,
        { "User-Agent": UA },
      );
      const parsed = LugarSchema.parse(raw);
      if (parsed.length === 0) {
        throw new Error(
          "No se encontró el lugar. Reformula con ciudad y estado.",
        );
      }
      return parsed.map((l) => ({
        nombre: l.display_name,
        latitud: l.lat,
        longitud: l.lon,
        tipo: l.type,
      }));
    }
    if (consulta === "ruta") {
      const oLat = numeroRequerido(parametros, "origen_latitud");
      const oLon = numeroRequerido(parametros, "origen_longitud");
      const dLat = numeroRequerido(parametros, "destino_latitud");
      const dLon = numeroRequerido(parametros, "destino_longitud");
      const raw = await getJson(
        `https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=false`,
        { "User-Agent": UA },
      );
      const parsed = RutaSchema.parse(raw);
      const ruta = parsed.routes[0];
      return {
        distancia_km: Math.round(ruta.distance / 100) / 10,
        duracion_min: Math.round(ruta.duration / 60),
      };
    }
    throw new Error(`Consulta desconocida: ${consulta}.`);
  },
  presentar(datos, fuente) {
    if (fuente.consulta === "buscar_lugar") {
      const s = z
        .array(
          z.object({
            nombre: z.string(),
            latitud: z.string(),
            longitud: z.string(),
            tipo: z.string().optional(),
          }),
        )
        .safeParse(datos);
      if (!s.success || s.data.length === 0) return [];
      const puntos = s.data
        .slice(0, 12)
        .map((l, i) => ({
          etiqueta: l.nombre.split(",")[0].slice(0, 40),
          lat: Number(l.latitud),
          lon: Number(l.longitud),
          principal: i === 0,
          detalle: l.tipo,
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (puntos.length === 0) return [];
      return [{ funcion: "geo", titulo: "Lugares encontrados", puntos, fuente }];
    }
    if (fuente.consulta === "ruta") {
      const s = z
        .object({ distancia_km: z.number(), duracion_min: z.number() })
        .safeParse(datos);
      if (!s.success) return [];
      const d = s.data;
      const horas = d.duracion_min / 60;
      const velocidad = horas > 0 ? Math.round(d.distancia_km / horas) : 0;
      return [
        {
          funcion: "metrica",
          titulo: "Ruta en auto",
          unidad: "km",
          valor: d.distancia_km,
          acento: true,
          decimales: 1,
          serie: [],
          laterales: [
            { etiqueta: "Duración", valor: String(d.duracion_min), unidad: "min" },
            { etiqueta: "Velocidad media", valor: String(velocidad), unidad: "km/h" },
          ],
          fuente,
        },
      ];
    }
    return [];
  },
};
