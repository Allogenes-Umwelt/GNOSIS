import { z } from "zod";
import { getJson } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * Wikidata — open structured-knowledge base. Entity search grounds
 * names (organizations, places, concepts) with stable identifiers.
 */

const RespuestaSchema = z.object({
  search: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
});

export const wikidata: Conector = {
  manifest: {
    id: "wikidata",
    nombre: "Wikidata",
    campo: "educacion",
    acceso: "abierta",
    fuente: "https://www.wikidata.org",
    descripcion:
      "Búsqueda de entidades (personas, organizaciones, lugares, conceptos) en la base de conocimiento abierta.",
    consultas: [
      {
        id: "buscar_entidad",
        descripcion:
          "Busca una entidad por nombre y devuelve identificador y descripción.",
        parametros: [
          {
            nombre: "consulta",
            descripcion: "Nombre de la entidad",
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
    if (consulta !== "buscar_entidad") {
      throw new Error(`Consulta desconocida: ${consulta}.`);
    }
    const q = (parametros.consulta ?? "").trim();
    if (q.length === 0) {
      throw new Error('Falta el parámetro "consulta". Indica la entidad.');
    }
    const idioma = /^[a-z]{2}$/.test(parametros.idioma ?? "")
      ? parametros.idioma
      : "es";
    const raw = await getJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=${idioma}&uselang=${idioma}&format=json&limit=5`,
    );
    const parsed = RespuestaSchema.parse(raw);
    if (parsed.search.length === 0) {
      throw new Error("No se encontró la entidad. Reformula el nombre.");
    }
    return parsed.search.map((e) => ({
      id: e.id,
      nombre: e.label,
      descripcion: e.description,
      url: `https://www.wikidata.org/wiki/${e.id}`,
    }));
  },
  presentar(datos, fuente) {
    const s = z
      .array(
        z.object({
          id: z.string(),
          nombre: z.string().optional(),
          descripcion: z.string().optional(),
          url: z.string().optional(),
        }),
      )
      .safeParse(datos);
    if (!s.success || s.data.length === 0) return [];
    return [
      {
        funcion: "catalogo",
        titulo: "Entidades encontradas",
        registros: s.data.slice(0, 8).map((e) => ({
          id: e.id,
          nombre: e.nombre ?? e.id,
          descripcion: e.descripcion,
          url: e.url,
        })),
        fuente,
      },
    ];
  },
};
