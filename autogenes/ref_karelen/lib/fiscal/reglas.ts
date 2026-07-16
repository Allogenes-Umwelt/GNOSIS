/**
 * CUADRE · cited fiscal rules — every rule the engine applies carries
 * its legal article, source and vigency, verified against LISR / LIVA /
 * CFF / RMF 2026 at authoring time. Nothing here is advice: it is the
 * operative reference the dashboard cites at the foot of each verdict,
 * TELOS-style. Amounts of fines are deliberately NOT encoded (they are
 * updated by inflation every year); only obligations and deadlines.
 */

export interface ReglaFiscal {
  id: string;
  nombre: string;
  /** Legal citation, e.g. "Art. 1o.-B LIVA". */
  articulo: string;
  fuente: string;
  vigencia: string;
  /** One line, operator words. */
  resumen: string;
}

export const REGLAS_FISCALES = {
  ivaFlujo: {
    id: "ivaFlujo",
    nombre: "IVA sobre flujo de efectivo",
    articulo: "Art. 1o.-B LIVA",
    fuente: "Ley del IVA",
    vigencia: "2026",
    resumen:
      "El IVA se causa cuando la contraprestación se cobra efectivamente, no cuando se factura.",
  },
  ivaTasa: {
    id: "ivaTasa",
    nombre: "Tasa general de IVA",
    articulo: "Art. 1o. LIVA",
    fuente: "Ley del IVA",
    vigencia: "2026",
    resumen: "La tasa general del IVA es 16%.",
  },
  dia17: {
    id: "dia17",
    nombre: "Pago provisional mensual",
    articulo: "Art. 14 LISR",
    fuente: "Ley del ISR",
    vigencia: "2026",
    resumen:
      "Los pagos provisionales se enteran a más tardar el día 17 del mes inmediato posterior.",
  },
  corrimientoRfc: {
    id: "corrimientoRfc",
    nombre: "Días adicionales por sexto dígito del RFC",
    articulo: "Art. 5.1, Decreto de facilidades (DOF 26-dic-2013)",
    fuente: "Decreto de beneficios fiscales",
    vigencia: "2026",
    resumen:
      "Sexto dígito 1-2: +1 día hábil; 3-4: +2; 5-6: +3; 7-8: +4; 9-0: +5. No aplica a grandes contribuyentes ni a quienes dictaminan.",
  },
  repQuintoDia: {
    id: "repQuintoDia",
    nombre: "Plazo del complemento de pago (REP)",
    articulo: "Regla 2.7.1.32, RMF 2026",
    fuente: "Resolución Miscelánea Fiscal 2026",
    vigencia: "2026",
    resumen:
      "El REP se emite a más tardar el 5.º día natural del mes siguiente al cobro — natural, sin prórroga por fin de semana.",
  },
  retencionIvaPf: {
    id: "retencionIvaPf",
    nombre: "Retención de IVA a personas físicas",
    articulo: "Art. 1o.-A LIVA",
    fuente: "Ley del IVA",
    vigencia: "2026",
    resumen:
      "La persona moral retiene dos terceras partes del IVA (10.6667%) en servicios personales independientes.",
  },
  retencionIsrPf: {
    id: "retencionIsrPf",
    nombre: "Retención de ISR por honorarios",
    articulo: "Art. 106, último párrafo, LISR",
    fuente: "Ley del ISR",
    vigencia: "2026",
    resumen:
      "La persona moral retiene 10% de ISR sobre honorarios pagados a personas físicas, y lo entera junto con el pago provisional.",
  },
  plazoInhabil: {
    id: "plazoInhabil",
    nombre: "Cómputo de plazos y días inhábiles",
    articulo: "Art. 12 CFF",
    fuente: "Código Fiscal de la Federación",
    vigencia: "2026",
    resumen:
      "Si el último día del plazo es inhábil, se prorroga al siguiente día hábil. Sábados y domingos no cuentan.",
  },
  coeficienteUtilidad: {
    id: "coeficienteUtilidad",
    nombre: "Coeficiente de utilidad",
    articulo: "Art. 14, fracc. I, LISR",
    fuente: "Ley del ISR",
    vigencia: "2026",
    resumen:
      "El pago provisional de ISR se calcula con el coeficiente de utilidad del último ejercicio de doce meses.",
  },
  tasaIsrPm: {
    id: "tasaIsrPm",
    nombre: "Tasa de ISR de personas morales",
    articulo: "Art. 9 LISR",
    fuente: "Ley del ISR",
    vigencia: "2026",
    resumen: "La tasa del ISR para personas morales es 30%.",
  },
  efos69b: {
    id: "efos69b",
    nombre: "Operaciones inexistentes (EFOS)",
    articulo: "Art. 69-B CFF",
    fuente: "Código Fiscal de la Federación · datos abiertos SAT",
    vigencia: "2026",
    resumen:
      "El SAT publica a los contribuyentes que presuntamente facturan operaciones inexistentes; deducir sus comprobantes tiene consecuencias.",
  },
  diot: {
    id: "diot",
    nombre: "Declaración informativa de operaciones con terceros",
    articulo: "Art. 32, fracc. VIII, LIVA",
    fuente: "Ley del IVA",
    vigencia: "2026",
    resumen:
      "El IVA retenido y las operaciones con proveedores se informan mensualmente en la DIOT.",
  },
} as const satisfies Record<string, ReglaFiscal>;

export type ReglaFiscalId = keyof typeof REGLAS_FISCALES;

/* ── deadline arithmetic (UTC, YYYY-MM-DD strings) ────────────────── */

const DIA_MS = 86_400_000;

function aFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Nth Monday of a month, ISO date. */
function lunesN(anio: number, mes0: number, n: number): string {
  const primero = new Date(Date.UTC(anio, mes0, 1));
  const dia = 1 + ((8 - primero.getUTCDay()) % 7) + (n - 1) * 7;
  return aIso(new Date(Date.UTC(anio, mes0, dia)));
}

/**
 * Statutory non-working days per Art. 12 CFF: weekends plus the fixed
 * list (1 ene; primer lunes de feb; tercer lunes de mar; 1 y 5 de may;
 * 16 sep; tercer lunes de nov; 1 dic cada 6 años — transmisión del
 * Ejecutivo, 2024 + 6k —; 25 dic). SAT general vacation days count as
 * hábiles for filing declarations, so they are not modeled.
 */
export function esInhabil(iso: string): boolean {
  const d = aFecha(iso);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return true;
  const anio = d.getUTCFullYear();
  const fijos = new Set([
    `${anio}-01-01`,
    lunesN(anio, 1, 1),
    lunesN(anio, 2, 3),
    `${anio}-05-01`,
    `${anio}-05-05`,
    `${anio}-09-16`,
    lunesN(anio, 10, 3),
    `${anio}-12-25`,
  ]);
  if ((anio - 2024) % 6 === 0) fijos.add(`${anio}-12-01`);
  return fijos.has(iso);
}

export function siguienteHabil(iso: string): string {
  let d = aFecha(iso);
  while (esInhabil(aIso(d))) d = new Date(d.getTime() + DIA_MS);
  return aIso(d);
}

function sumarHabiles(iso: string, n: number): string {
  let d = aFecha(iso);
  let restantes = n;
  while (restantes > 0) {
    d = new Date(d.getTime() + DIA_MS);
    if (!esInhabil(aIso(d))) restantes -= 1;
  }
  return aIso(d);
}

/** Extra business days after day 17 by the RFC's sixth digit. */
export function diasAdicionalesRfc(sextoDigito: string): number {
  const n = Number.parseInt(sextoDigito, 10);
  if (!Number.isInteger(n)) return 0;
  if (n === 1 || n === 2) return 1;
  if (n === 3 || n === 4) return 2;
  if (n === 5 || n === 6) return 3;
  if (n === 7 || n === 8) return 4;
  return 5; // 9 y 0
}

export interface FechaLimite {
  /** Final due date after every applicable rule. */
  fecha: string;
  /** Day-17 base before adjustments. */
  base: string;
  diasAdicionales: number;
  reglas: ReglaFiscal[];
}

/**
 * Due date of the provisional payment for a given month ("YYYY-MM"):
 * day 17 of the following month (Art. 14 LISR), plus the sixth-digit
 * facility when provided (Decreto 5.1), rolled to the next business
 * day when it lands on an inhábil (Art. 12 CFF).
 */
export function fechaLimitePagoProvisional(
  mes: string,
  sextoDigitoRfc?: string,
): FechaLimite {
  const [anio, mes1] = mes.split("-").map((v) => Number.parseInt(v, 10));
  const base = aIso(new Date(Date.UTC(anio, mes1, 17)));
  const reglas: ReglaFiscal[] = [REGLAS_FISCALES.dia17];
  const adicionales = sextoDigitoRfc ? diasAdicionalesRfc(sextoDigitoRfc) : 0;
  if (adicionales > 0) reglas.push(REGLAS_FISCALES.corrimientoRfc);
  let fecha =
    adicionales > 0 ? sumarHabiles(base, adicionales) : base;
  if (esInhabil(fecha)) {
    fecha = siguienteHabil(fecha);
    reglas.push(REGLAS_FISCALES.plazoInhabil);
  }
  return { fecha, base, diasAdicionales: adicionales, reglas };
}

/**
 * REP deadline for a payment collected on `fechaCobro`: the 5th NATURAL
 * day of the following month (RMF 2026, 2.7.1.32) — no weekend roll.
 */
export function fechaLimiteRep(fechaCobro: string): string {
  const d = aFecha(fechaCobro);
  return aIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 5)));
}
