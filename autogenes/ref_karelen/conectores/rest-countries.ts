import { z } from "zod";
import { getJson } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * REST Countries — geopolitical context for a country entity: capital,
 * region, currencies, timezones, neighbours. Open, field-selected so the
 * payload stays small on mobile.
 */

const PaisSchema = z.object({
  name: z.object({
    common: z.string(),
    official: z.string().optional(),
  }),
  cca2: z.string().optional(),
  capital: z.array(z.string()).optional(),
  region: z.string().optional(),
  subregion: z.string().optional(),
  population: z.number().optional(),
  currencies: z
    .record(z.string(), z.object({ name: z.string().optional(), symbol: z.string().optional() }))
    .optional(),
  languages: z.record(z.string(), z.string()).optional(),
  timezones: z.array(z.string()).optional(),
  borders: z.array(z.string()).optional(),
});

export const restCountries: Conector = {
  manifest: {
    id: "rest-countries",
    nombre: "REST Countries",
    campo: "vacaciones",
    acceso: "abierta",
    fuente: "https://restcountries.com",
    descripcion:
      "Ficha geopolítica de un país: capital, región, moneda, husos, vecinos y población.",
    consultas: [
      {
        id: "pais",
        descripcion: "Ficha de un país por nombre (común u oficial).",
        parametros: [
          {
            nombre: "nombre",
            descripcion: "Nombre del país",
            requerido: true,
            ejemplo: "Mexico",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    if (consulta !== "pais") {
      throw new Error(`Consulta desconocida: ${consulta}.`);
    }
    const nombre = (parametros.nombre ?? "").trim();
    if (!nombre) {
      throw new Error('Falta el parámetro "nombre". Indícalo y reintenta.');
    }
    const raw = await getJson(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(nombre)}?fields=name,cca2,capital,region,subregion,population,currencies,languages,timezones,borders`,
    );
    const lista = z.array(PaisSchema).parse(raw);
    const p = lista[0];
    if (!p) throw new Error("Ningún país coincide con ese nombre.");
    return {
      nombre: p.name.common,
      oficial: p.name.official ?? p.name.common,
      codigo: p.cca2 ?? "",
      capital: p.capital?.[0] ?? "",
      region: [p.region, p.subregion].filter(Boolean).join(" · "),
      poblacion: p.population ?? null,
      monedas: Object.entries(p.currencies ?? {}).map(
        ([codigo, m]) => `${codigo}${m.name ? ` (${m.name})` : ""}`,
      ),
      idiomas: Object.values(p.languages ?? {}),
      husos: p.timezones ?? [],
      vecinos: p.borders ?? [],
    };
  },
  presentar(datos, fuente) {
    const s = z
      .object({
        nombre: z.string(),
        oficial: z.string(),
        capital: z.string(),
        region: z.string(),
        poblacion: z.number().nullable(),
        monedas: z.array(z.string()),
        husos: z.array(z.string()),
        vecinos: z.array(z.string()),
      })
      .safeParse(datos);
    if (!s.success) return [];
    const d = s.data;
    if (d.poblacion === null) return [];
    return [
      {
        funcion: "metrica",
        titulo: d.nombre,
        unidad: "hab",
        valor: d.poblacion,
        decimales: 0,
        serie: [],
        laterales: [
          { etiqueta: "Capital", valor: d.capital || "—" },
          { etiqueta: "Región", valor: d.region || "—" },
          { etiqueta: "Moneda", valor: d.monedas[0] ?? "—" },
          { etiqueta: "Husos", valor: String(d.husos.length) },
          { etiqueta: "Vecinos", valor: String(d.vecinos.length) },
        ],
        fuente,
      },
    ];
  },
};
