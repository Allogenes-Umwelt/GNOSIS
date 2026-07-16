import { z } from "zod";
import { getJson } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * Wikipedia REST — the one-paragraph human context for a public entity.
 * Complements Wikidata: Wikidata gives structure (Q-ids, claims), this
 * gives the readable summary, licensed CC BY-SA and cited by URL.
 */

const ResumenSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  extract: z.string().optional(),
  content_urls: z
    .object({
      desktop: z.object({ page: z.string() }).optional(),
    })
    .optional(),
});

export const wikipedia: Conector = {
  manifest: {
    id: "wikipedia",
    nombre: "Wikipedia",
    campo: "educacion",
    acceso: "abierta",
    fuente: "https://es.wikipedia.org",
    descripcion:
      "Resumen enciclopédico de un tema o entidad pública, con su liga citable.",
    consultas: [
      {
        id: "resumen",
        descripcion: "Resumen de una página de Wikipedia por título.",
        parametros: [
          {
            nombre: "titulo",
            descripcion: "Título del artículo",
            requerido: true,
            ejemplo: "Banco de México",
          },
          {
            nombre: "idioma",
            descripcion: "Código de idioma (default: es)",
            requerido: false,
            ejemplo: "es",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    if (consulta !== "resumen") {
      throw new Error(`Consulta desconocida: ${consulta}.`);
    }
    const titulo = (parametros.titulo ?? "").trim();
    if (!titulo) {
      throw new Error('Falta el parámetro "titulo". Indícalo y reintenta.');
    }
    const idioma = /^[a-z]{2,3}$/.test(parametros.idioma ?? "")
      ? parametros.idioma
      : "es";
    const raw = await getJson(
      `https://${idioma}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo)}`,
    );
    const p = ResumenSchema.parse(raw);
    return {
      titulo: p.title,
      descripcion: p.description ?? "",
      extracto: p.extract ?? "",
      url: p.content_urls?.desktop?.page ?? "",
      idioma,
    };
  },
  presentar(datos, fuente) {
    const s = z
      .object({
        titulo: z.string(),
        descripcion: z.string(),
        extracto: z.string(),
        url: z.string(),
      })
      .safeParse(datos);
    if (!s.success || s.data.extracto.length === 0) return [];
    const d = s.data;
    return [
      {
        funcion: "catalogo",
        titulo: "Wikipedia",
        registros: [
          {
            id: d.url || d.titulo,
            nombre: d.titulo,
            descripcion:
              (d.descripcion ? `${d.descripcion} — ` : "") +
              d.extracto.slice(0, 280),
            url: d.url || undefined,
          },
        ],
        fuente,
      },
    ];
  },
};
