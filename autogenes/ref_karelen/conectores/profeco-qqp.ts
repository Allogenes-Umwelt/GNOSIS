import { getTexto } from "@/conectores/http";
import { parsearCsvQqp } from "@/lib/qqp/parse";
import type { Conector } from "@/types/conector";

/**
 * Profeco · Quién es Quién en los Precios — official open price survey
 * per product/brand/establishment with coordinates. The weekly CSV URL
 * rotates on Profeco's portal, so it is configurable via env
 * (PROFECO_QQP_URL); a changed format fails loudly through the shared
 * parser. The local pipeline (loading the downloaded CSV on device) is
 * the sovereign path; this connector is the convenience path.
 */

const URL_DEFAULT =
  "https://datos.profeco.gob.mx/datos_abiertos/qqp/QQP_SEMANAL.csv";

export const profecoQqp: Conector = {
  manifest: {
    id: "profeco-qqp",
    nombre: "Profeco QQP",
    campo: "consumo",
    acceso: "abierta",
    fuente: "https://datos.profeco.gob.mx/datos_abiertos/qqp.php",
    descripcion:
      "Quién es Quién en los Precios: muestreo oficial de precios por producto y establecimiento, con ubicación.",
    consultas: [
      {
        id: "precios_producto",
        descripcion:
          "Busca un producto en el muestreo QQP vigente y devuelve precios por establecimiento (máx. 200 filas).",
        parametros: [
          {
            nombre: "producto",
            descripcion: "Término a buscar en producto/marca/categoría",
            requerido: true,
            ejemplo: "leche",
          },
          {
            nombre: "estado",
            descripcion: "Filtra por entidad federativa (contiene)",
            requerido: false,
            ejemplo: "CIUDAD DE MEXICO",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    if (consulta !== "precios_producto") {
      throw new Error(`Consulta desconocida: ${consulta}.`);
    }
    const producto = (parametros.producto ?? "").trim();
    if (producto.length < 3) {
      throw new Error(
        "Indica un producto de al menos 3 letras y reintenta.",
      );
    }
    const url = process.env.PROFECO_QQP_URL ?? URL_DEFAULT;
    const texto = await getTexto(url);
    const { registros, total } = parsearCsvQqp(texto, [producto]);
    const estado = (parametros.estado ?? "").trim().toUpperCase();
    const filtrados =
      estado.length > 0
        ? registros.filter((r) => r.estado.toUpperCase().includes(estado))
        : registros;
    return {
      producto,
      filas: filtrados.slice(0, 200),
      encontradas: filtrados.length,
      muestreoTotal: total,
    };
  },
  presentar(datos, fuente) {
    const d = datos as {
      producto?: string;
      filas?: { producto: string; precio: number; tienda: string; fecha: string }[];
    };
    if (typeof d?.producto !== "string" || !Array.isArray(d.filas) || d.filas.length === 0) {
      return [];
    }
    const orden = [...d.filas].sort((a, b) => a.precio - b.precio).slice(0, 8);
    const pares = orden.map((f) => ({
      etiqueta: `${f.tienda.slice(0, 22)} · ${f.fecha.slice(5)}`,
      valor: f.precio,
    }));
    return [
      {
        funcion: "comparacion",
        titulo: `QQP · ${d.producto}`,
        unidad: "MXN",
        decimales: 2,
        pares,
        sujeto: pares[0]?.etiqueta,
        fuente,
      },
    ];
  },
};
