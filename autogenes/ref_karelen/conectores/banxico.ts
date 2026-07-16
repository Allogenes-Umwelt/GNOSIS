import { z } from "zod";
import { getJson } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * Banxico SIE — official Mexican macro series (FIX exchange rate,
 * CETES 28, UDIS). Free personal token from banxico.org.mx (SIE API).
 */

const SERIES: Record<string, { serie: string; nota: string }> = {
  tipo_de_cambio: {
    serie: "SF43718",
    nota: "Tipo de cambio FIX USD/MXN (pesos por dólar)",
  },
  cetes_28: {
    serie: "SF43936",
    nota: "CETES a 28 días, tasa de rendimiento anual (%)",
  },
  udis: { serie: "SP68257", nota: "Valor de la UDI en pesos" },
  tiie_28: {
    serie: "SF43783",
    nota: "TIIE a 28 días, tasa de interés interbancaria (%)",
  },
};

const RespuestaSchema = z.object({
  bmx: z.object({
    series: z.array(
      z.object({
        idSerie: z.string(),
        titulo: z.string(),
        datos: z
          .array(z.object({ fecha: z.string(), dato: z.string() }))
          .optional(),
      }),
    ),
  }),
});

export const banxico: Conector = {
  manifest: {
    id: "banxico",
    nombre: "Banxico SIE",
    campo: "banca",
    acceso: "token",
    fuente: "https://www.banxico.org.mx/SieAPIRest/",
    descripcion:
      "Series oficiales del Banco de México: tipo de cambio FIX, CETES 28 y UDIS, dato oportuno.",
    envToken: "BANXICO_TOKEN",
    consultas: [
      ...Object.entries(SERIES).map(([id, s]) => ({
        id,
        descripcion: s.nota,
        parametros: [],
      })),
      {
        id: "tipo_de_cambio_fecha",
        descripcion:
          "Tipo de cambio FIX USD/MXN de una fecha específica (día hábil bancario).",
        parametros: [
          {
            nombre: "fecha",
            descripcion: "Fecha AAAA-MM-DD",
            requerido: true,
            ejemplo: "2024-11-03",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros, ctx) {
    if (!ctx.token) {
      throw new Error(
        "Banxico requiere un token personal. Solicítalo gratis en banxico.org.mx (SIE API) y guárdalo en Synesis → C2 → Servicios.",
      );
    }
    if (consulta === "tipo_de_cambio_fecha") {
      const fecha = parametros.fecha ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        throw new Error("La fecha debe venir como AAAA-MM-DD. Corrígela y reintenta.");
      }
      const raw = await getJson(
        `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/${fecha}/${fecha}`,
        { "Bmx-Token": ctx.token },
      );
      const parsed = RespuestaSchema.parse(raw);
      const serie = parsed.bmx.series[0];
      const dato = serie?.datos?.[0];
      if (!serie || !dato) {
        throw new Error(
          "Sin dato FIX para esa fecha (fin de semana o feriado bancario). Prueba el día hábil previo.",
        );
      }
      return {
        serie: serie.idSerie,
        titulo: serie.titulo,
        nota: `Tipo de cambio FIX USD/MXN del ${fecha}`,
        fecha: dato.fecha,
        valor: dato.dato,
      };
    }
    const def = SERIES[consulta];
    if (!def) throw new Error(`Consulta desconocida: ${consulta}.`);
    const raw = await getJson(
      `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${def.serie}/datos/oportuno`,
      { "Bmx-Token": ctx.token },
    );
    const parsed = RespuestaSchema.parse(raw);
    const serie = parsed.bmx.series[0];
    const dato = serie?.datos?.[0];
    if (!serie || !dato) {
      throw new Error("Banxico no devolvió dato oportuno para la serie.");
    }
    return {
      serie: serie.idSerie,
      titulo: serie.titulo,
      nota: def.nota,
      fecha: dato.fecha,
      valor: dato.dato,
    };
  },
  presentar(datos, fuente) {
    const s = z
      .object({
        serie: z.string(),
        titulo: z.string(),
        nota: z.string(),
        fecha: z.string(),
        valor: z.string(),
      })
      .safeParse(datos);
    if (!s.success) return [];
    const d = s.data;
    const v = Number(d.valor);
    if (!Number.isFinite(v)) return [];
    const esTasa =
      fuente.consulta === "cetes_28" || fuente.consulta === "tiie_28";
    return [
      {
        funcion: "metrica",
        titulo: d.nota,
        unidad: esTasa ? "%" : "MXN",
        valor: v,
        decimales: esTasa ? 2 : 4,
        serie: [],
        laterales: [
          { etiqueta: "Serie", valor: d.serie },
          { etiqueta: "Fecha", valor: d.fecha },
        ],
        fuente,
      },
    ];
  },
};
