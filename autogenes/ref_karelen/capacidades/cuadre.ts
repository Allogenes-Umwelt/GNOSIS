import {
  fechaLimitePagoProvisional,
  fechaLimiteRep,
  REGLAS_FISCALES,
  type FechaLimite,
  type ReglaFiscal,
} from "@/lib/fiscal/reglas";

/**
 * CUADRE engine — caja vs impuestos. Pure and unit-agnostic: it takes
 * the fiscal position COBRANZA already derives from the CFDI corpus and
 * the bank movements FLUJO already verifies, and answers ONE question
 * with cited law: on the due date, does your cash cover what the SAT
 * will claim? Every output names its rule; every gap abstains honestly
 * instead of inventing (no coeficiente → no ISR estimate). This is an
 * operative reference, never a dictamen.
 */

const r2 = (v: number): number => Math.round(v * 100) / 100;

const mediana = (vals: number[]): number => {
  const o = [...vals].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};

/* ── obligación estimada del mes ──────────────────────────────────── */

export interface ComponenteObligacion {
  concepto: string;
  monto: number;
  /** Where the number comes from — the honesty label. */
  base: "flujo" | "facturacion" | "estimacion";
  regla: ReglaFiscal;
  detalle: string;
}

export interface Obligacion {
  mes: string;
  componentes: ComponenteObligacion[];
  total: number;
  /** What the engine refused to estimate, and why — cited. */
  abstenciones: string[];
  limite: FechaLimite;
}

export function obligacionDelMes(entrada: {
  mes: string;
  /** IVA a cargo from the reconciled fiscal position (COBRANZA). */
  ivaACargo: number;
  /** True when the IVA figure is backed by collected/paid flow (REPs
   * reconciled); false when it is billing-basis reference. */
  ivaSobreFlujo: boolean;
  /** Retenciones withheld from suppliers, to remit with the payment. */
  retencionesAEnterar: number;
  /** Nominal income of the month, for the ISR provisional estimate. */
  ingresosNominalesMes?: number;
  /** Operator-provided coefficient (Art. 14-I LISR); absent → abstain. */
  coeficienteUtilidad?: number;
  sextoDigitoRfc?: string;
}): Obligacion {
  const componentes: ComponenteObligacion[] = [];
  const abstenciones: string[] = [];

  if (entrada.ivaACargo > 0) {
    componentes.push({
      concepto: "IVA a cargo",
      monto: r2(entrada.ivaACargo),
      base: entrada.ivaSobreFlujo ? "flujo" : "facturacion",
      regla: REGLAS_FISCALES.ivaFlujo,
      detalle: entrada.ivaSobreFlujo
        ? "Sobre cobros y pagos efectivos (REPs conciliados)."
        : "Referencia sobre facturación: el IVA legal se causa al cobro; concilia tus REPs para afinarlo.",
    });
  }

  if (entrada.retencionesAEnterar > 0) {
    componentes.push({
      concepto: "Retenciones a enterar",
      monto: r2(entrada.retencionesAEnterar),
      base: "facturacion",
      regla: REGLAS_FISCALES.retencionIsrPf,
      detalle:
        "ISR 10% e IVA 2/3 retenidos a personas físicas, se enteran con el pago provisional.",
    });
  }

  if (
    entrada.coeficienteUtilidad !== undefined &&
    entrada.coeficienteUtilidad > 0 &&
    entrada.ingresosNominalesMes !== undefined
  ) {
    const isr = r2(
      entrada.ingresosNominalesMes * entrada.coeficienteUtilidad * 0.3,
    );
    if (isr > 0) {
      componentes.push({
        concepto: "ISR provisional estimado",
        monto: isr,
        base: "estimacion",
        regla: REGLAS_FISCALES.coeficienteUtilidad,
        detalle: `Ingresos del mes × CU ${entrada.coeficienteUtilidad} × 30% (Art. 9 LISR). Estimación: no considera acumulados ni pérdidas.`,
      });
    }
  } else {
    abstenciones.push(
      "Sin coeficiente de utilidad no se estima ISR provisional (Art. 14, fracc. I, LISR). Captúralo de tu última declaración anual.",
    );
  }

  return {
    mes: entrada.mes,
    componentes,
    total: r2(componentes.reduce((s, c) => s + c.monto, 0)),
    abstenciones,
    limite: fechaLimitePagoProvisional(entrada.mes, entrada.sextoDigitoRfc),
  };
}

/* ── proyección de caja al día límite ─────────────────────────────── */

export interface ProyeccionCaja {
  aplica: boolean;
  saldoHoy: number;
  saldoProyectado: number | null;
  /** Median daily net flow over the recent window used to project. */
  netoDiarioMediano: number | null;
  diasRestantes: number;
  diasBase: number;
}

/**
 * Cash at the due date, projected from the operator's OWN recent rhythm:
 * median daily net flow over the last ≤90 days extended linearly. Needs
 * ≥14 days of history; otherwise it abstains.
 */
export function proyectarCajaAlLimite(
  saldoHoy: number,
  movimientos: { fecha: string; monto: number }[],
  hoy: string,
  fechaLimite: string,
): ProyeccionCaja {
  const tHoy = Date.parse(hoy);
  const desde = tHoy - 90 * 86_400_000;
  const porDia = new Map<string, number>();
  for (const m of movimientos) {
    const t = Date.parse(m.fecha);
    if (t > tHoy || t < desde) continue;
    porDia.set(m.fecha, r2((porDia.get(m.fecha) ?? 0) + m.monto));
  }
  const diasRestantes = Math.max(
    0,
    Math.round((Date.parse(fechaLimite) - tHoy) / 86_400_000),
  );
  if (porDia.size < 14) {
    return {
      aplica: false,
      saldoHoy: r2(saldoHoy),
      saldoProyectado: null,
      netoDiarioMediano: null,
      diasRestantes,
      diasBase: porDia.size,
    };
  }
  const neto = mediana([...porDia.values()]);
  return {
    aplica: true,
    saldoHoy: r2(saldoHoy),
    saldoProyectado: r2(saldoHoy + neto * diasRestantes),
    netoDiarioMediano: r2(neto),
    diasRestantes,
    diasBase: porDia.size,
  };
}

/* ── el veredicto ─────────────────────────────────────────────────── */

export const ZONAS_CUADRE = [
  "no cuadra",
  "justo <20%",
  "cuadra ≥20%",
] as const;

export interface VeredictoCuadre {
  estado: "cuadra" | "justo" | "no_cuadra" | "sin_base";
  /** Cash remaining after paying, at the due date (or today's cash). */
  remanente: number | null;
  /** Slack as fraction of the obligation (remanente / obligación). */
  holgura: number | null;
  /** 0..1 position for the arc — 0.5 is the exact break-even. */
  nivel: number;
  zonas: readonly string[];
  sentencia: string;
  reglas: ReglaFiscal[];
}

export function veredictoCuadre(
  obligacion: Obligacion,
  proyeccion: ProyeccionCaja,
): VeredictoCuadre {
  const saldo = proyeccion.aplica
    ? (proyeccion.saldoProyectado ?? proyeccion.saldoHoy)
    : proyeccion.saldoHoy;
  const reglas = obligacion.limite.reglas;
  if (obligacion.total <= 0) {
    return {
      estado: "sin_base",
      remanente: null,
      holgura: null,
      nivel: 1,
      zonas: ZONAS_CUADRE,
      sentencia:
        "Sin obligación estimada este mes: no hay IVA a cargo ni componentes que enterar con lo conciliado.",
      reglas,
    };
  }
  const remanente = r2(saldo - obligacion.total);
  const holgura = r2(remanente / obligacion.total);
  const estado =
    holgura >= 0.2 ? "cuadra" : holgura >= 0 ? "justo" : "no_cuadra";
  const nivel = Math.max(0, Math.min(1, 0.5 + holgura / 2));
  const modo = proyeccion.aplica ? "proyectada a tu ritmo" : "de hoy";
  const sentencia =
    estado === "no_cuadra"
      ? `El ${obligacion.limite.fecha} el SAT reclama ${fmt(obligacion.total)} y tu caja ${modo} es ${fmt(saldo)}: faltan ${fmt(-remanente)}. No cuadra.`
      : estado === "justo"
        ? `El ${obligacion.limite.fecha} pagas ${fmt(obligacion.total)} y te quedan ${fmt(remanente)}: cuadra sin margen (${Math.round(holgura * 100)}%).`
        : `El ${obligacion.limite.fecha} pagas ${fmt(obligacion.total)} con ${fmt(remanente)} de holgura (${Math.round(holgura * 100)}%). Cuadra.`;
  return { estado, remanente, holgura, nivel, zonas: ZONAS_CUADRE, sentencia, reglas };
}

const fmt = (v: number): string =>
  `$${Math.abs(v).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

/* ── REPs en riesgo (regla 2.7.1.32) ──────────────────────────────── */

export interface RepEnRiesgo {
  uuid: string;
  cliente: string;
  monto: number;
  fechaCobro: string;
  limite: string;
  estado: "vencido" | "urgente" | "en_plazo";
  /** Days until (positive) or past (negative) the deadline. */
  dias: number;
  regla: ReglaFiscal;
}

/**
 * PPD collections that still lack their payment complement, against the
 * 5th-natural-day deadline. "urgente" = due within 5 days.
 */
export function repsEnRiesgo(
  cobrosSinRep: { uuid: string; cliente: string; monto: number; fechaCobro: string }[],
  hoy: string,
): RepEnRiesgo[] {
  const tHoy = Date.parse(hoy);
  return cobrosSinRep
    .map((c) => {
      const limite = fechaLimiteRep(c.fechaCobro);
      const dias = Math.round((Date.parse(limite) - tHoy) / 86_400_000);
      return {
        ...c,
        monto: r2(c.monto),
        limite,
        dias,
        estado:
          dias < 0 ? ("vencido" as const) : dias <= 5 ? ("urgente" as const) : ("en_plazo" as const),
        regla: REGLAS_FISCALES.repQuintoDia,
      };
    })
    .sort((a, b) => a.dias - b.dias);
}

/* ── cuadre histórico contra el banco ─────────────────────────────── */

export interface CuadreMes {
  mes: string;
  pagadoSat: number;
  obligacionEstimada: number;
  diferencia: number;
  /** pagado / estimado, null when there is nothing estimated. */
  razon: number | null;
}

/**
 * The verifiable cross: what actually LEFT the bank toward the SAT
 * (FLUJO already isolates those charges) vs what the CFDI corpus
 * implied for each month. A gap does not accuse — it says where the
 * estimate or the workpapers need a look.
 */
export function cuadreContraBanco(
  pagosSat: { fecha: string; monto: number }[],
  obligaciones: { mes: string; total: number }[],
): CuadreMes[] {
  const pagosPorMes = new Map<string, number>();
  for (const p of pagosSat) {
    // A payment on month M settles the obligation of month M-1.
    const d = new Date(`${p.fecha.slice(0, 7)}-01T00:00:00Z`);
    const previo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 7);
    pagosPorMes.set(previo, r2((pagosPorMes.get(previo) ?? 0) + Math.abs(p.monto)));
  }
  const meses = new Set([
    ...pagosPorMes.keys(),
    ...obligaciones.map((o) => o.mes),
  ]);
  return [...meses]
    .sort()
    .map((mes) => {
      const pagado = pagosPorMes.get(mes) ?? 0;
      const estimado = obligaciones.find((o) => o.mes === mes)?.total ?? 0;
      return {
        mes,
        pagadoSat: pagado,
        obligacionEstimada: r2(estimado),
        diferencia: r2(pagado - estimado),
        razon: estimado > 0 ? r2(pagado / estimado) : null,
      };
    });
}

/* ── cadencia fiscal (marcas para el código de barras, V1) ────────── */

export interface MarcaCadencia {
  fecha: string;
  tipo: "cobro" | "pago" | "limite_pago" | "limite_rep";
  etiqueta: string;
  monto?: number;
}

export function marcasCadencia(entrada: {
  cobros: { fecha: string; monto: number }[];
  pagos: { fecha: string; monto: number }[];
  limites: { fecha: string; tipo: "limite_pago" | "limite_rep"; etiqueta: string }[];
}): MarcaCadencia[] {
  const marcas: MarcaCadencia[] = [
    ...entrada.cobros.map((c) => ({
      fecha: c.fecha,
      tipo: "cobro" as const,
      etiqueta: "cobro",
      monto: r2(c.monto),
    })),
    ...entrada.pagos.map((p) => ({
      fecha: p.fecha,
      tipo: "pago" as const,
      etiqueta: "pago",
      monto: r2(Math.abs(p.monto)),
    })),
    ...entrada.limites.map((l) => ({
      fecha: l.fecha,
      tipo: l.tipo,
      etiqueta: l.etiqueta,
    })),
  ];
  return marcas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}
