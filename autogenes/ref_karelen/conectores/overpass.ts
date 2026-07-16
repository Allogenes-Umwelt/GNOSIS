import { z } from "zod";
import { getJson, numeroRequerido } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * Overpass API — read-only structural queries over OpenStreetMap. One
 * deliberate consulta: what is AROUND a coordinate, by category. This is
 * the join that turns a location entity into intelligence (notaries,
 * hospitals, schools near a case's place). Community servers are shared
 * infrastructure: the query declares a tight [timeout], caps its output,
 * and the gateway result is stored as a cited fuente — never polled.
 */

const CATEGORIAS: Record<string, { filtro: string; nombre: string }> = {
  hospital: { filtro: '["amenity"="hospital"]', nombre: "Hospitales" },
  clinica: { filtro: '["amenity"="clinic"]', nombre: "Clínicas" },
  farmacia: { filtro: '["amenity"="pharmacy"]', nombre: "Farmacias" },
  escuela: { filtro: '["amenity"="school"]', nombre: "Escuelas" },
  universidad: { filtro: '["amenity"="university"]', nombre: "Universidades" },
  banco: { filtro: '["amenity"="bank"]', nombre: "Bancos" },
  cajero: { filtro: '["amenity"="atm"]', nombre: "Cajeros" },
  policia: { filtro: '["amenity"="police"]', nombre: "Policía" },
  bomberos: { filtro: '["amenity"="fire_station"]', nombre: "Bomberos" },
  notaria: { filtro: '["office"="notary"]', nombre: "Notarías" },
  abogado: { filtro: '["office"="lawyer"]', nombre: "Despachos legales" },
  supermercado: { filtro: '["shop"="supermarket"]', nombre: "Supermercados" },
  gasolinera: { filtro: '["amenity"="fuel"]', nombre: "Gasolineras" },
  transporte: {
    filtro: '["public_transport"="station"]',
    nombre: "Estaciones de transporte",
  },
};

const ElementoSchema = z.object({
  type: z.string(),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

const RespuestaSchema = z.object({
  elements: z.array(ElementoSchema),
});

function distanciaM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const overpass: Conector = {
  manifest: {
    id: "overpass",
    nombre: "Overpass (OSM)",
    campo: "hogar",
    acceso: "abierta",
    fuente: "https://overpass-api.de",
    descripcion:
      "Qué hay alrededor de una coordenada, por categoría (hospitales, notarías, escuelas…), desde OpenStreetMap.",
    consultas: [
      {
        id: "alrededor",
        descripcion:
          "Lugares de una categoría alrededor de una coordenada (radio en metros, máximo 25 resultados).",
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
            nombre: "categoria",
            descripcion: `Una de: ${Object.keys(CATEGORIAS).join(", ")}`,
            requerido: true,
            ejemplo: "farmacia",
          },
          {
            nombre: "radio",
            descripcion: "Radio de búsqueda en metros (100 a 5000; default 1000)",
            requerido: false,
            ejemplo: "1500",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    if (consulta !== "alrededor") {
      throw new Error(`Consulta desconocida: ${consulta}.`);
    }
    const lat = numeroRequerido(parametros, "latitud");
    const lon = numeroRequerido(parametros, "longitud");
    const cat = CATEGORIAS[parametros.categoria ?? ""];
    if (!cat) {
      throw new Error(
        `Categoría desconocida. Usa una de: ${Object.keys(CATEGORIAS).join(", ")}.`,
      );
    }
    const radio = Math.max(
      100,
      Math.min(5000, Number.parseFloat(parametros.radio ?? "1000") || 1000),
    );
    const ql = `[out:json][timeout:20];nwr${cat.filtro}(around:${radio},${lat},${lon});out center 25;`;
    const raw = await getJson(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`,
    );
    const parsed = RespuestaSchema.parse(raw);
    const lugares = parsed.elements
      .map((e) => {
        const pLat = e.lat ?? e.center?.lat;
        const pLon = e.lon ?? e.center?.lon;
        if (pLat === undefined || pLon === undefined) return null;
        return {
          nombre: e.tags?.name ?? "(sin nombre)",
          lat: pLat,
          lon: pLon,
          distancia_m: Math.round(distanciaM(lat, lon, pLat, pLon)),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.distancia_m - b.distancia_m)
      .slice(0, 25);
    return {
      categoria: parametros.categoria,
      etiqueta: cat.nombre,
      radio_m: radio,
      centro: { lat, lon },
      total: lugares.length,
      lugares,
    };
  },
  presentar(datos, fuente) {
    const s = z
      .object({
        etiqueta: z.string(),
        radio_m: z.number(),
        centro: z.object({ lat: z.number(), lon: z.number() }),
        lugares: z.array(
          z.object({
            nombre: z.string(),
            lat: z.number(),
            lon: z.number(),
            distancia_m: z.number(),
          }),
        ),
      })
      .safeParse(datos);
    if (!s.success || s.data.lugares.length === 0) return [];
    const d = s.data;
    return [
      {
        funcion: "geo",
        titulo: `${d.etiqueta} a ${d.radio_m} m`,
        puntos: [
          {
            etiqueta: "Centro",
            lat: d.centro.lat,
            lon: d.centro.lon,
            principal: true,
          },
          ...d.lugares.map((l) => ({
            etiqueta: l.nombre,
            lat: l.lat,
            lon: l.lon,
            detalle: `${l.distancia_m} m`,
          })),
        ],
        fuente,
      },
    ];
  },
};
