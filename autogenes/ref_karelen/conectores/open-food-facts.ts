import { z } from "zod";
import { getJson } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * Open Food Facts — barcode in, food transparency out: Nutri-Score,
 * NOVA processing group and Eco-Score. Strict shared-server etiquette:
 * single on-demand product lookups only (the manifest exposes no search
 * consulta on purpose), and every result docks as a cited fuente.
 */

const ProductoSchema = z.object({
  status: z.number(),
  product: z
    .object({
      product_name: z.string().optional(),
      brands: z.string().optional(),
      quantity: z.string().optional(),
      nutriscore_grade: z.string().optional(),
      nova_group: z.number().optional(),
      ecoscore_grade: z.string().optional(),
    })
    .optional(),
});

const NUTRI: Record<string, { nivel: number; lectura: string }> = {
  a: { nivel: 0.1, lectura: "calidad nutricional alta" },
  b: { nivel: 0.3, lectura: "buena calidad nutricional" },
  c: { nivel: 0.5, lectura: "calidad nutricional media" },
  d: { nivel: 0.7, lectura: "calidad nutricional baja" },
  e: { nivel: 0.9, lectura: "calidad nutricional muy baja" },
};

export const openFoodFacts: Conector = {
  manifest: {
    id: "open-food-facts",
    nombre: "Open Food Facts",
    campo: "consumo",
    acceso: "abierta",
    fuente: "https://world.openfoodfacts.org",
    descripcion:
      "Ficha de un alimento por código de barras: Nutri-Score, grupo NOVA de procesamiento y Eco-Score.",
    consultas: [
      {
        id: "producto",
        descripcion: "Ficha nutricional de un producto por código de barras.",
        parametros: [
          {
            nombre: "codigo",
            descripcion: "Código de barras (EAN-8/13 o UPC)",
            requerido: true,
            ejemplo: "7501055310883",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    if (consulta !== "producto") {
      throw new Error(`Consulta desconocida: ${consulta}.`);
    }
    const codigo = (parametros.codigo ?? "").replace(/\D/g, "");
    if (codigo.length < 8 || codigo.length > 14) {
      throw new Error(
        "El código de barras debe tener entre 8 y 14 dígitos. Verifícalo y reintenta.",
      );
    }
    const raw = await getJson(
      `https://world.openfoodfacts.org/api/v2/product/${codigo}?fields=product_name,brands,quantity,nutriscore_grade,nova_group,ecoscore_grade`,
    );
    const p = ProductoSchema.parse(raw);
    if (p.status !== 1 || !p.product) {
      throw new Error(
        "Producto no registrado en Open Food Facts. Verifica el código.",
      );
    }
    const d = p.product;
    return {
      codigo,
      nombre: d.product_name ?? "(sin nombre)",
      marca: d.brands ?? "",
      cantidad: d.quantity ?? "",
      nutriscore: (d.nutriscore_grade ?? "").toLowerCase(),
      nova: d.nova_group ?? null,
      ecoscore: (d.ecoscore_grade ?? "").toLowerCase(),
    };
  },
  presentar(datos, fuente) {
    const s = z
      .object({
        codigo: z.string(),
        nombre: z.string(),
        marca: z.string(),
        nutriscore: z.string(),
        nova: z.number().nullable(),
        ecoscore: z.string(),
      })
      .safeParse(datos);
    if (!s.success) return [];
    const d = s.data;
    const n = NUTRI[d.nutriscore];
    if (!n) return [];
    const evidencia = [
      { dato: `Nutri-Score ${d.nutriscore.toUpperCase()}`, cita: "Open Food Facts" },
    ];
    if (d.nova !== null) {
      evidencia.push({
        dato: `NOVA ${d.nova} (${d.nova >= 4 ? "ultraprocesado" : d.nova === 1 ? "sin procesar o mínimo" : "procesado"})`,
        cita: "Open Food Facts",
      });
    }
    if (d.ecoscore && d.ecoscore !== "unknown" && d.ecoscore !== "not-applicable") {
      evidencia.push({
        dato: `Eco-Score ${d.ecoscore.toUpperCase()}`,
        cita: "Open Food Facts",
      });
    }
    return [
      {
        funcion: "dictamen",
        titulo: `${d.nombre}${d.marca ? ` · ${d.marca}` : ""}`,
        veredicto:
          n.nivel <= 0.3 ? "favorable" : n.nivel <= 0.5 ? "atencion" : "insuficiente",
        enunciado: `Nutri-Score ${d.nutriscore.toUpperCase()}: ${n.lectura}.`,
        evidencia,
        nivel: {
          valor: n.nivel,
          zonas: ["A–B", "C", "D–E"],
        },
        fuente,
      },
    ];
  },
};
