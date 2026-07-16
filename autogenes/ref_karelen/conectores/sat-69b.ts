import { getTexto } from "@/conectores/http";
import type { Conector } from "@/types/conector";

/**
 * SAT · lista 69-B CFF — the public register of taxpayers presumed or
 * confirmed to invoice non-existent operations (EFOS). Open dataset
 * published by the SAT (datos abiertos, updated continuously); CUADRE
 * screens counterparties against it. A hit is not an accusation by
 * this system: it is the SAT's own published situation, cited.
 */

const URL_LISTADO =
  "https://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv";

export interface Fila69b {
  rfc: string;
  nombre: string;
  situacion: string;
}

/** One CSV line → fields, honoring quoted commas. */
function camposDe(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let enComillas = false;
  for (const ch of linea) {
    if (ch === '"') {
      enComillas = !enComillas;
    } else if (ch === "," && !enComillas) {
      campos.push(actual.trim());
      actual = "";
    } else {
      actual += ch;
    }
  }
  campos.push(actual.trim());
  return campos;
}

/**
 * Pure search over the SAT CSV text: finds the header row by its RFC
 * column, then the exact RFC (case-insensitive). Exported for tests.
 */
export function buscarEnCsv69b(
  texto: string,
  rfc: string,
): { encontrado: boolean; fila: Fila69b | null; filas: number } {
  const objetivo = rfc.trim().toUpperCase();
  const lineas = texto.split(/\r?\n/);
  let iRfc = -1;
  let iNombre = -1;
  let iSituacion = -1;
  let inicio = -1;
  for (let i = 0; i < Math.min(lineas.length, 5); i++) {
    const campos = camposDe(lineas[i]).map((c) => c.toUpperCase());
    const idx = campos.findIndex((c) => c === "RFC");
    if (idx >= 0) {
      iRfc = idx;
      iNombre = campos.findIndex((c) => c.includes("NOMBRE"));
      iSituacion = campos.findIndex((c) => c.includes("SITUACI"));
      inicio = i + 1;
      break;
    }
  }
  if (inicio < 0) {
    throw new Error(
      "El listado 69-B cambió de formato: no se encontró la columna RFC. Verifica el dataset del SAT.",
    );
  }
  let filas = 0;
  for (let i = inicio; i < lineas.length; i++) {
    if (lineas[i].trim().length === 0) continue;
    filas += 1;
    const campos = camposDe(lineas[i]);
    if ((campos[iRfc] ?? "").toUpperCase() === objetivo) {
      return {
        encontrado: true,
        fila: {
          rfc: objetivo,
          nombre: campos[iNombre] ?? "",
          situacion: campos[iSituacion] ?? "",
        },
        filas,
      };
    }
  }
  return { encontrado: false, fila: null, filas };
}

export const sat69b: Conector = {
  manifest: {
    id: "sat-69b",
    nombre: "SAT lista 69-B",
    campo: "fiscal",
    acceso: "abierta",
    fuente: "http://omawww.sat.gob.mx/cifras_sat/Paginas/DatosAbiertos/index.html",
    descripcion:
      "Lista pública del Art. 69-B CFF (EFOS): contribuyentes con operaciones presuntamente inexistentes, dato abierto del SAT.",
    consultas: [
      {
        id: "buscar_rfc",
        descripcion:
          "Busca un RFC exacto en el listado 69-B completo y devuelve su situación publicada.",
        parametros: [
          {
            nombre: "rfc",
            descripcion: "RFC de la contraparte a verificar",
            requerido: true,
            ejemplo: "AAA010101AAA",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    if (consulta !== "buscar_rfc") {
      throw new Error(`Consulta desconocida: ${consulta}.`);
    }
    const rfc = (parametros.rfc ?? "").trim().toUpperCase();
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}$/.test(rfc)) {
      throw new Error("RFC inválido. Verifica el formato y reintenta.");
    }
    const texto = await getTexto(URL_LISTADO);
    const r = buscarEnCsv69b(texto, rfc);
    return {
      rfc,
      encontrado: r.encontrado,
      nombre: r.fila?.nombre ?? null,
      situacion: r.fila?.situacion ?? null,
      filasRevisadas: r.filas,
    };
  },
  presentar(datos, fuente) {
    const d = datos as {
      rfc?: string;
      encontrado?: boolean;
      nombre?: string | null;
      situacion?: string | null;
      filasRevisadas?: number;
    };
    if (typeof d?.rfc !== "string" || typeof d.encontrado !== "boolean") {
      return [];
    }
    return [
      {
        funcion: "dictamen",
        titulo: `69-B CFF · ${d.rfc}`,
        veredicto: d.encontrado ? "atencion" : "favorable",
        enunciado: d.encontrado
          ? `${d.nombre ?? d.rfc} aparece en el listado 69-B: ${d.situacion ?? "situación publicada"}. Revisa tus operaciones con esta contraparte.`
          : `${d.rfc} no aparece en el listado 69-B del SAT (${d.filasRevisadas ?? 0} registros revisados hoy).`,
        evidencia: [
          {
            dato: d.encontrado
              ? `Situación: ${d.situacion ?? "publicada"}`
              : "Sin coincidencia exacta de RFC",
            cita: "Art. 69-B CFF · datos abiertos SAT",
          },
        ],
        fuente,
      },
    ];
  },
};
