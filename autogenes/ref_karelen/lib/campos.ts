import type { Campo } from "@/types/microapp";

/**
 * The 13 semantic fields — the permanent structure of the operator's
 * operative life (concept paper §03). Marketplace categories organized
 * by the operator's perception, not by industry taxonomy.
 */

export interface CampoInfo {
  num: string;
  slug: Campo;
  nombre: string;
  descripcion: string;
}

export const CAMPOS_INFO: readonly CampoInfo[] = [
  {
    num: "01",
    slug: "legal",
    nombre: "Legal",
    descripcion: "Conflictos, derechos, procesos jurídicos.",
  },
  {
    num: "02",
    slug: "fiscal",
    nombre: "Fiscal",
    descripcion: "SAT. Obligaciones tributarias, facturación, declaraciones.",
  },
  {
    num: "03",
    slug: "empleo",
    nombre: "Empleo",
    descripcion: "Búsqueda, operación y derechos del trabajo.",
  },
  {
    num: "04",
    slug: "freelance",
    nombre: "Freelance / Negocio",
    descripcion: "Cotizaciones, contratos, cobranza, tarifas.",
  },
  {
    num: "05",
    slug: "salud",
    nombre: "Salud",
    descripcion: "Servicios médicos, farmacéuticos, seguro social.",
  },
  {
    num: "06",
    slug: "hogar",
    nombre: "Hogar / Servicios",
    descripcion: "CFE, agua, gas, internet, telecomunicaciones.",
  },
  {
    num: "07",
    slug: "gobierno",
    nombre: "Gobierno / Trámites",
    descripcion: "Pasaporte, actas, CURP, constancias, licencias.",
  },
  {
    num: "08",
    slug: "patrimonio",
    nombre: "Patrimonio",
    descripcion: "Vivienda, INFONAVIT, hipotecas, escrituración.",
  },
  {
    num: "09",
    slug: "automotriz",
    nombre: "Automotriz",
    descripcion: "Multas, verificación, tenencia, placas, seguros.",
  },
  {
    num: "10",
    slug: "educacion",
    nombre: "Educación",
    descripcion: "Becas, admisiones, cédulas, equivalencias.",
  },
  {
    num: "11",
    slug: "consumo",
    nombre: "Consumo / Derechos",
    descripcion: "PROFECO, telecoms, aerolíneas, garantías.",
  },
  {
    num: "12",
    slug: "banca",
    nombre: "Banca y Finanzas",
    descripcion: "Buró, tarjetas, créditos, CONDUSEF, CETES.",
  },
  {
    num: "13",
    slug: "vacaciones",
    nombre: "Vacaciones",
    descripcion: "Viajes, vuelos, hoteles, derechos del viajero.",
  },
];

export function getCampoInfo(slug: string): CampoInfo | undefined {
  return CAMPOS_INFO.find((c) => c.slug === slug);
}

/** Keyword heuristics: the system proposes, the operator decides. */
const CAMPO_KEYWORDS: readonly [Campo, readonly string[]][] = [
  ["hogar", ["cfe", "luz", "agua", "gas", "internet", "telmex", "izzi", "totalplay", "recibo"]],
  ["fiscal", ["sat", "rfc", "cfdi", "factura", "isr", "iva", "declaraci", "fiscal"]],
  ["salud", ["imss", "receta", "farmacia", "medic", "médic", "doctor", "issste"]],
  ["empleo", ["nomina", "nómina", "finiquito", "patron", "patrón", "laboral", "sueldo"]],
  ["patrimonio", ["infonavit", "hipoteca", "escritur", "predial", "inmueble"]],
  ["automotriz", ["placa", "multa", "verificaci", "tenencia", "vehicul", "vehícul", "auto"]],
  ["gobierno", ["curp", "pasaporte", "acta", "tramite", "trámite", "ine ", "licencia"]],
  ["consumo", ["profeco", "garantia", "garantía", "reembolso", "devoluc", "queja"]],
  ["banca", ["banco", "tarjeta", "credito", "crédito", "buro", "buró", "cetes", "bbva", "santander", "banorte"]],
  ["vacaciones", ["vuelo", "hotel", "aerol", "viaje", "reservaci", "boleto"]],
  ["legal", ["demanda", "abogad", "juzgado", "contrato", "juridic", "jurídic"]],
  ["educacion", ["beca", "cedula", "cédula", "universidad", "colegiatura", "escuela"]],
  ["freelance", ["cotizaci", "cliente", "honorarios", "invoice", "proyecto", "tarifa"]],
];

export function sugerirCampo(texto: string): Campo | null {
  const t = texto.toLowerCase();
  for (const [campo, keywords] of CAMPO_KEYWORDS) {
    if (keywords.some((k) => t.includes(k))) return campo;
  }
  return null;
}
