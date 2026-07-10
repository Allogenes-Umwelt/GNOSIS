import { z } from "zod";
import { getJson } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * Nager.Date — open public-holiday API. Defaults to Mexico and the
 * current year; useful for labor-law and agenda questions.
 */

const RespuestaSchema = z.array(
  z.object({
    date: z.string(),
    localName: z.string(),
    name: z.string(),
    global: z.boolean(),
  }),
);

export const nagerDate: Conector = {
  manifest: {
    id: "nager-date",
    nombre: "Nager.Date",
    campo: "empleo",
    acceso: "abierta",
    fuente: "https://date.nager.at",
    descripcion:
      "Días festivos oficiales por país y año (default: México, año en curso).",
    consultas: [
      {
        id: "dias_festivos",
        descripcion: "Lista los días festivos oficiales de un país y año.",
        parametros: [
          {
            nombre: "anio",
            descripcion: "Año de cuatro dígitos (default: año en curso)",
            requerido: false,
            ejemplo: "2026",
          },
          {
            nombre: "pais",
            descripcion: "Código de país ISO 3166-1 alfa-2 (default: MX)",
            requerido: false,
            ejemplo: "MX",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    if (consulta !== "dias_festivos") {
      throw new Error(`Consulta desconocida: ${consulta}.`);
    }
    const anio = /^\d{4}$/.test(parametros.anio ?? "")
      ? parametros.anio
      : String(new Date().getFullYear());
    const pais = /^[A-Za-z]{2}$/.test(parametros.pais ?? "")
      ? (parametros.pais ?? "MX").toUpperCase()
      : "MX";
    const raw = await getJson(
      `https://date.nager.at/api/v3/PublicHolidays/${anio}/${pais}`,
    );
    const parsed = RespuestaSchema.parse(raw);
    return {
      anio,
      pais,
      festivos: parsed.map((f) => ({
        fecha: f.date,
        nombre: f.localName,
        nacional: f.global,
      })),
    };
  },
  presentar(datos, fuente) {
    const s = z
      .object({
        anio: z.string(),
        pais: z.string(),
        festivos: z.array(
          z.object({ fecha: z.string(), nombre: z.string(), nacional: z.boolean() }),
        ),
      })
      .safeParse(datos);
    if (!s.success) return [];
    const d = s.data;
    return [
      {
        funcion: "metrica",
        titulo: `Días festivos ${d.anio} · ${d.pais}`,
        unidad: "días",
        valor: d.festivos.length,
        decimales: 0,
        serie: [],
        laterales: d.festivos
          .slice(0, 6)
          .map((f) => ({ etiqueta: f.nombre.slice(0, 26), valor: f.fecha.slice(5) })),
        fuente,
      },
    ];
  },
};
