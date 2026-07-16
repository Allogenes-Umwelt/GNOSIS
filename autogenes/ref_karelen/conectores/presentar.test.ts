import { describe, expect, it } from "vitest";
import { conectores } from "@/conectores/registry";
import { ResultadoUniversalSchema, type Fuente } from "@/types/resultado";

const fuente = (conector: string, consulta: string): Fuente => ({
  conector,
  consulta,
  obtenido: "2026-07-04T00:00:00Z",
});

// Sample payloads matching each connector's invoke() return shape.
const CASOS: { id: string; consulta: string; datos: unknown; funcion: string }[] = [
  {
    id: "frankfurter",
    consulta: "cambio",
    funcion: "metrica",
    datos: {
      de: "USD",
      a: "MXN",
      cantidad: 1,
      tasa: 18.5,
      resultado: 18.5,
      fecha: "2026-07-04",
      canasta: [
        { divisa: "MXN", tasa: 18.5 },
        { divisa: "EUR", tasa: 0.92 },
      ],
      historia: [
        { fecha: "2026-06-05", tasa: 18.4 },
        { fecha: "2026-06-06", tasa: 18.6 },
      ],
    },
  },
  {
    id: "banxico",
    consulta: "cetes_28",
    funcion: "metrica",
    datos: { serie: "SF43936", titulo: "CETES", nota: "CETES 28", fecha: "2026-07-04", valor: "10.25" },
  },
  {
    id: "open-meteo",
    consulta: "pronostico",
    funcion: "metrica",
    datos: {
      current: { temperature_2m: 24, apparent_temperature: 25, precipitation: 0, weather_code: 1, wind_speed_10m: 10 },
      current_units: { temperature_2m: "°C" },
      daily: {
        time: ["2026-07-04", "2026-07-05", "2026-07-06"],
        temperature_2m_max: [26, 27, 28],
        temperature_2m_min: [18, 19, 20],
        precipitation_probability_max: [10, 20, 30],
      },
    },
  },
  {
    id: "nager-date",
    consulta: "dias_festivos",
    funcion: "metrica",
    datos: {
      anio: "2026",
      pais: "MX",
      festivos: [
        { fecha: "2026-01-01", nombre: "Año Nuevo", nacional: true },
        { fecha: "2026-02-02", nombre: "Constitución", nacional: true },
      ],
    },
  },
  {
    id: "osm",
    consulta: "buscar_lugar",
    funcion: "geo",
    datos: [
      { nombre: "Monterrey, Nuevo León, México", latitud: "25.6", longitud: "-100.3", tipo: "city" },
      { nombre: "Monterrey, Casanare, Colombia", latitud: "4.88", longitud: "-72.9", tipo: "town" },
    ],
  },
  {
    id: "osm",
    consulta: "ruta",
    funcion: "metrica",
    datos: { distancia_km: 900.5, duracion_min: 540 },
  },
  {
    id: "wikidata",
    consulta: "buscar_entidad",
    funcion: "catalogo",
    datos: [
      { id: "Q1", nombre: "Banco de México", descripcion: "banco central", url: "https://x" },
      { id: "Q2", nombre: "Banxico", descripcion: "sigla", url: "https://y" },
    ],
  },
  {
    id: "open-meteo",
    consulta: "historico",
    funcion: "metrica",
    datos: {
      fecha: "2024-11-03",
      temperatura_max: 23.4,
      temperatura_min: 11.2,
      precipitacion_mm: 0.4,
      viento_max_kmh: 18,
    },
  },
  {
    id: "open-meteo",
    consulta: "calidad_aire",
    funcion: "metrica",
    datos: { pm2_5: 12.3, pm10: 30.1, ozono: 80, aqi_us: 52 },
  },
  {
    id: "overpass",
    consulta: "alrededor",
    funcion: "geo",
    datos: {
      categoria: "farmacia",
      etiqueta: "Farmacias",
      radio_m: 1000,
      centro: { lat: 19.4326, lon: -99.1332 },
      total: 2,
      lugares: [
        { nombre: "Farmacia Central", lat: 19.433, lon: -99.134, distancia_m: 120 },
        { nombre: "(sin nombre)", lat: 19.431, lon: -99.131, distancia_m: 260 },
      ],
    },
  },
  {
    id: "wikipedia",
    consulta: "resumen",
    funcion: "catalogo",
    datos: {
      titulo: "Banco de México",
      descripcion: "banco central de México",
      extracto: "El Banco de México es el banco central del país…",
      url: "https://es.wikipedia.org/wiki/Banco_de_M%C3%A9xico",
      idioma: "es",
    },
  },
  {
    id: "rest-countries",
    consulta: "pais",
    funcion: "metrica",
    datos: {
      nombre: "Mexico",
      oficial: "Estados Unidos Mexicanos",
      codigo: "MX",
      capital: "Mexico City",
      region: "Americas · North America",
      poblacion: 128900000,
      monedas: ["MXN (Mexican peso)"],
      idiomas: ["Spanish"],
      husos: ["UTC-08:00", "UTC-07:00", "UTC-06:00"],
      vecinos: ["BLZ", "GTM", "USA"],
    },
  },
  {
    id: "open-food-facts",
    consulta: "producto",
    funcion: "dictamen",
    datos: {
      codigo: "7501055310883",
      nombre: "Refresco de cola",
      marca: "MarcaX",
      cantidad: "600 ml",
      nutriscore: "e",
      nova: 4,
      ecoscore: "c",
    },
  },
];

describe("connector presentadores", () => {
  for (const caso of CASOS) {
    it(`${caso.id}:${caso.consulta} → valid ${caso.funcion}`, () => {
      const c = conectores.find((x) => x.manifest.id === caso.id);
      if (!c?.presentar) throw new Error(`sin presentar: ${caso.id}`);
      const vistas = c.presentar(caso.datos, fuente(caso.id, caso.consulta));
      expect(vistas.length).toBeGreaterThan(0);
      expect(vistas[0].funcion).toBe(caso.funcion);
      for (const v of vistas) {
        expect(() => ResultadoUniversalSchema.parse(v)).not.toThrow();
        expect(v.fuente.conector).toBe(caso.id);
      }
    });
  }

  it("falls back to [] on unparseable data", () => {
    const c = conectores.find((x) => x.manifest.id === "frankfurter");
    expect(c?.presentar?.({ garbage: true }, fuente("frankfurter", "cambio"))).toEqual([]);
  });
});
