import type { ComprobanteCfdi, RegistroCfdi } from "@/lib/cfdi/tipos";

/**
 * COBRANZA finance engine — pure, deterministic reads over parsed CFDI.
 * Every figure is arithmetic on the invoices and payment complements the
 * operator holds; nothing is predicted or scored. The engine never invents
 * cash: a PUE invoice is assumed collected at emission, a PPD invoice is
 * collected only to the extent a payment complement (tipo P) proves it, and
 * cancellation comes solely from the SAT Metadata the operator imports.
 * Money aggregates to MXN via each comprobante's tipoCambio. SYNESIS may
 * later interpret these numbers; it must never recompute them.
 */

const IVA = "002";
const ISR = "001";
const DIA_MS = 86_400_000;
const EPS = 0.005;

/** UUID → cancellation status, as read from SAT Metadata. */
export type EstatusMetadata = Record<string, { estatus: "vigente" | "cancelado" }>;

function redondea(n: number): number {
  return Math.round(n * 100) / 100;
}

/** MXN equivalent of an amount stated in the comprobante's currency. */
function aMxn(valor: number, c: ComprobanteCfdi): number {
  return valor * (c.tipoCambio || 1);
}

function mesDe(fechaDia: string): string {
  return fechaDia.slice(0, 7);
}

function fechaUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** Whole calendar days from `a` to `b` (both YYYY-MM-DD). */
function diasEntre(a: string, b: string): number {
  return Math.round((fechaUtc(b) - fechaUtc(a)) / DIA_MS);
}

/**
 * Stable dedup key: the fiscal UUID when stamped, otherwise a composite of
 * the identifying fields so re-importing the same file never duplicates.
 */
export function claveComprobante(c: ComprobanteCfdi): string {
  if (c.timbre?.uuid) return c.timbre.uuid.toUpperCase();
  return [c.emisor.rfc, c.serie ?? "", c.folio ?? "", c.fechaDia, c.total].join(
    "|",
  );
}

/**
 * Infer the operator's RFC as the one party present in the most invoices —
 * an operator is a counterparty to every CFDI they hold. Returns null on an
 * empty corpus or an exact tie (the UI then asks the operator to declare it).
 */
export function inferirRfcOperador(registros: RegistroCfdi[]): string | null {
  const cuenta = new Map<string, number>();
  for (const { comprobante: c } of registros) {
    for (const rfc of [c.emisor.rfc, c.receptor.rfc]) {
      cuenta.set(rfc, (cuenta.get(rfc) ?? 0) + 1);
    }
  }
  let mejor: string | null = null;
  let max = 0;
  let empate = false;
  for (const [rfc, n] of cuenta) {
    if (n > max) {
      max = n;
      mejor = rfc;
      empate = false;
    } else if (n === max) {
      empate = true;
    }
  }
  return empate ? null : mejor;
}

export type Direccion = "emitida" | "recibida" | "ajena";

/** Where a comprobante sits relative to the operator. */
export function direccion(c: ComprobanteCfdi, rfc: string | null): Direccion {
  if (!rfc) return "ajena";
  if (c.emisor.rfc === rfc) return "emitida";
  if (c.receptor.rfc === rfc) return "recibida";
  return "ajena";
}

function uuidDe(c: ComprobanteCfdi): string {
  return c.timbre?.uuid?.toUpperCase() ?? "";
}

function esCancelado(c: ComprobanteCfdi, metadata?: EstatusMetadata): boolean {
  const u = uuidDe(c);
  return u !== "" && metadata?.[u]?.estatus === "cancelado";
}

function retenidoDe(c: ComprobanteCfdi): number {
  const t = c.impuestos.totalRetenidos;
  if (t) return t;
  return c.impuestos.retenidos.reduce((a, r) => a + r.importe, 0);
}

/* ── Payment reconciliation (complementos de pago, tipo P) ────────── */

interface PagoAplicado {
  fecha: string; // YYYY-MM-DD
  pagado: number; // MXN
}

/**
 * A confirmed bank reconciliation, treated as proof of payment alongside the
 * SAT complementos: the bank movement's date and amount settle the invoice
 * whose CFDI key it was matched to.
 */
export interface PagoBanco {
  clave: string;
  fecha: string; // YYYY-MM-DD
  monto: number; // MXN, positive
}

/**
 * Invoice key → the payments applied to it (oldest first). Payments come
 * from SAT payment complements AND from operator-confirmed bank movements;
 * both feed the same reconciliation, so the bank is a third proof of cash.
 */
function indicePagos(
  registros: RegistroCfdi[],
  pagosBanco: PagoBanco[] = [],
): Map<string, PagoAplicado[]> {
  const m = new Map<string, PagoAplicado[]>();
  const agrega = (clave: string, fecha: string, pagado: number) => {
    const u = clave.toUpperCase();
    const arr = m.get(u) ?? [];
    arr.push({ fecha, pagado });
    m.set(u, arr);
  };
  for (const { comprobante: c } of registros) {
    for (const p of c.pagos) {
      const tc = p.tipoCambio || 1;
      for (const rel of p.relacionados) agrega(rel.uuid, p.fecha, rel.pagado * tc);
    }
  }
  for (const pb of pagosBanco) agrega(pb.clave, pb.fecha, pb.monto);
  for (const arr of m.values()) arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return m;
}

export type EstadoCobro = "cobrada" | "parcial" | "pendiente";

export interface CobroInvoice {
  uuid: string;
  serie?: string;
  folio?: string;
  /** The other party: client (receivable) or supplier (payable). */
  contraparte: string;
  total: number; // MXN
  cobrado: number;
  saldo: number;
  estado: EstadoCobro;
  fechaEmision: string;
  fechaLiquidacion?: string;
  diasACobro?: number;
}

function reconciliarUno(
  c: ComprobanteCfdi,
  idx: Map<string, PagoAplicado[]>,
  lado: Direccion,
): CobroInvoice {
  const uuid = uuidDe(c);
  const total = aMxn(c.total, c);
  const pagos = uuid ? (idx.get(uuid) ?? []) : [];
  const bruto = pagos.reduce((a, p) => a + p.pagado, 0);
  const cobrado = Math.min(bruto, total);
  const saldo = Math.max(total - cobrado, 0);
  const estado: EstadoCobro =
    cobrado <= EPS ? "pendiente" : cobrado + EPS >= total ? "cobrada" : "parcial";

  let fechaLiquidacion: string | undefined;
  let diasACobro: number | undefined;
  if (estado === "cobrada" && pagos.length > 0) {
    let acum = 0;
    fechaLiquidacion = pagos[pagos.length - 1].fecha;
    for (const p of pagos) {
      acum += p.pagado;
      if (acum + EPS >= total) {
        fechaLiquidacion = p.fecha;
        break;
      }
    }
    diasACobro = Math.max(diasEntre(c.fechaDia, fechaLiquidacion), 0);
  }

  return {
    uuid,
    serie: c.serie,
    folio: c.folio,
    contraparte: lado === "emitida" ? c.receptor.nombre : c.emisor.nombre,
    total: redondea(total),
    cobrado: redondea(cobrado),
    saldo: redondea(saldo),
    estado,
    fechaEmision: c.fechaDia,
    fechaLiquidacion,
    diasACobro,
  };
}

/**
 * Reconcile one side's deferred (non-PUE) invoices against the payment
 * complements in the corpus. `lado === "emitida"` is the receivables book
 * (what clients owe the operator); `"recibida"` is the payables book (what
 * the operator owes suppliers). PUE is excluded — settled at emission.
 */
function reconciliarLado(
  registros: RegistroCfdi[],
  rfc: string | null,
  lado: Direccion,
  metadata?: EstatusMetadata,
  pagosBanco?: PagoBanco[],
): CobroInvoice[] {
  const idx = indicePagos(registros, pagosBanco);
  const out: CobroInvoice[] = [];
  for (const { comprobante: c } of registros) {
    if (direccion(c, rfc) !== lado || c.tipo !== "I") continue;
    if (c.metodoPago === "PUE") continue; // settled at emission by assumption
    if (esCancelado(c, metadata)) continue;
    out.push(reconciliarUno(c, idx, lado));
  }
  return out;
}

/** Receivables — the deferred emitidas and their collection state. */
export function reconciliarCartera(
  registros: RegistroCfdi[],
  rfc: string | null,
  metadata?: EstatusMetadata,
  pagosBanco?: PagoBanco[],
): CobroInvoice[] {
  return reconciliarLado(registros, rfc, "emitida", metadata, pagosBanco);
}

/** Payables — the deferred recibidas and what the operator still owes. */
export function reconciliarPagables(
  registros: RegistroCfdi[],
  rfc: string | null,
  metadata?: EstatusMetadata,
  pagosBanco?: PagoBanco[],
): CobroInvoice[] {
  return reconciliarLado(registros, rfc, "recibida", metadata, pagosBanco);
}

/* ── Collection survival curve (Kaplan-Meier over pesos-to-cash) ──── */

export interface PuntoCurva {
  dia: number;
  supervivencia: number; // fraction still uncollected, 0..1
}

export interface CurvaCobro {
  puntos: PuntoCurva[];
  /** Days at which half the deferred invoices are collected, or null. */
  mediana: number | null;
  n: number;
  cobradas: number;
  pendientes: number;
}

/**
 * Kaplan-Meier survival of collection: for each deferred invoice, the event
 * is "fully collected" at diasACobro; invoices still open are censored at
 * their age today. S(t) is the fraction of the book still uncollected at day
 * t. Censoring is honest — an unpaid young invoice is not counted as slow.
 */
export function curvaCobro(
  registros: RegistroCfdi[],
  rfc: string | null,
  hoy: string,
  metadata?: EstatusMetadata,
  pagosBanco?: PagoBanco[],
): CurvaCobro {
  const sujetos = reconciliarCartera(registros, rfc, metadata, pagosBanco).map((inv) =>
    inv.estado === "cobrada" && inv.diasACobro != null
      ? { t: inv.diasACobro, evento: true }
      : { t: Math.max(diasEntre(inv.fechaEmision, hoy), 0), evento: false },
  );
  const n = sujetos.length;
  if (n === 0) {
    return { puntos: [], mediana: null, n: 0, cobradas: 0, pendientes: 0 };
  }
  const cobradas = sujetos.filter((s) => s.evento).length;
  const tiempos = [
    ...new Set(sujetos.filter((s) => s.evento).map((s) => s.t)),
  ].sort((a, b) => a - b);

  const puntos: PuntoCurva[] = [{ dia: 0, supervivencia: 1 }];
  let S = 1;
  let mediana: number | null = null;
  for (const t of tiempos) {
    const enRiesgo = sujetos.filter((s) => s.t >= t).length;
    const d = sujetos.filter((s) => s.evento && s.t === t).length;
    if (enRiesgo > 0) S *= 1 - d / enRiesgo;
    puntos.push({ dia: t, supervivencia: Math.round(S * 10000) / 10000 });
    if (mediana === null && S <= 0.5) mediana = t;
  }
  return { puntos, mediana, n, cobradas, pendientes: n - cobradas };
}

/* ── Aging (cartera vencida) ──────────────────────────────────────── */

export interface TramoCartera {
  rango: string;
  monto: number;
  count: number;
}

const TRAMOS: { rango: string; min: number; max: number }[] = [
  { rango: "0–30", min: 0, max: 30 },
  { rango: "31–60", min: 31, max: 60 },
  { rango: "61–90", min: 61, max: 90 },
  { rango: "90+", min: 91, max: Infinity },
];

/** Bucket a set of reconciled invoices by outstanding-balance age at `hoy`. */
function agingDe(invoices: CobroInvoice[], hoy: string): TramoCartera[] {
  const pendientes = invoices.filter((inv) => inv.saldo > EPS);
  return TRAMOS.map((tr) => {
    const items = pendientes.filter((inv) => {
      const edad = diasEntre(inv.fechaEmision, hoy);
      return edad >= tr.min && edad <= tr.max;
    });
    return {
      rango: tr.rango,
      monto: redondea(items.reduce((a, i) => a + i.saldo, 0)),
      count: items.length,
    };
  });
}

/** Outstanding receivable balance bucketed by invoice age at `hoy`. */
export function cartera(
  registros: RegistroCfdi[],
  rfc: string | null,
  hoy: string,
  metadata?: EstatusMetadata,
  pagosBanco?: PagoBanco[],
): TramoCartera[] {
  return agingDe(reconciliarCartera(registros, rfc, metadata, pagosBanco), hoy);
}

/** Outstanding payable balance (what the operator owes) bucketed by age. */
export function carteraPagar(
  registros: RegistroCfdi[],
  rfc: string | null,
  hoy: string,
  metadata?: EstatusMetadata,
  pagosBanco?: PagoBanco[],
): TramoCartera[] {
  return agingDe(reconciliarPagables(registros, rfc, metadata, pagosBanco), hoy);
}

/* ── Period summary (N0–N1, now collection-aware) ─────────────────── */

export interface ResumenCliente {
  rfc: string;
  nombre: string;
  total: number;
  count: number;
  share: number; // 0..1
}

export interface PuntoMes {
  mes: string;
  ingreso: number;
  count: number;
}

export interface ResumenCobranza {
  rfcOperador: string | null;
  multiMoneda: boolean;
  numFacturas: number;
  ingresoFacturado: number;
  ticketPromedio: number;
  ivaTrasladado: number;
  retenidoTotal: number;
  /** PUE — assumed collected at emission. */
  cobradoPue: number;
  /** PPD billed in the period. */
  facturadoPpd: number;
  /** PPD collected, proven by payment complements. */
  cobradoPpd: number;
  cobradoTotal: number;
  /** PPD still outstanding (billed − collected). */
  porCobrar: number;
  numDiferidas: number;
  numPendientes: number;
  /** Cancelled emitidas dropped from income (needs SAT Metadata). */
  canceladas: number;
  montoCancelado: number;
  porMes: PuntoMes[];
  clientes: ResumenCliente[];
  hhi: number;
  topShare: number;
  numRecibidas: number;
  gastoRecibido: number;
  ivaAcreditable: number;
  notasCredito: number;
}

interface ConDir {
  c: ComprobanteCfdi;
  dir: Direccion;
}

/**
 * The revenue-and-collection picture for a set of registros and the operator
 * RFC, optionally narrowed to a date range (fechaDia, inclusive) and enriched
 * with SAT Metadata to exclude cancelled invoices. Payments are matched from
 * the whole corpus, so a payment dated after the period still settles its
 * invoice. Pass rfc = null for a well-formed empty summary.
 */
export function resumenCobranza(
  registros: RegistroCfdi[],
  rfc: string | null,
  rango?: { desde?: string; hasta?: string },
  metadata?: EstatusMetadata,
  pagosBanco?: PagoBanco[],
): ResumenCobranza {
  const idx = indicePagos(registros, pagosBanco);
  const dentro = (fechaDia: string) =>
    (!rango?.desde || fechaDia >= rango.desde) &&
    (!rango?.hasta || fechaDia <= rango.hasta);

  const items: ConDir[] = registros
    .map(({ comprobante }) => comprobante)
    .filter((c) => dentro(c.fechaDia))
    .map((c) => ({ c, dir: direccion(c, rfc) }));

  const multiMoneda = items.some(({ c }) => c.moneda !== "MXN");

  const emitidasTodas = items.filter(
    ({ c, dir }) => dir === "emitida" && c.tipo === "I",
  );
  const canceladasArr = emitidasTodas.filter(({ c }) => esCancelado(c, metadata));
  const emitidasI = emitidasTodas.filter(({ c }) => !esCancelado(c, metadata));
  const emitidasE = items.filter(
    ({ c, dir }) => dir === "emitida" && c.tipo === "E" && !esCancelado(c, metadata),
  );
  const recibidasI = items.filter(
    ({ c, dir }) => dir === "recibida" && c.tipo === "I" && !esCancelado(c, metadata),
  );

  const ingresoBruto = emitidasI.reduce((a, { c }) => a + aMxn(c.total, c), 0);
  const notasCredito = emitidasE.reduce((a, { c }) => a + aMxn(c.total, c), 0);
  const ingresoFacturado = ingresoBruto - notasCredito;
  const numFacturas = emitidasI.length;
  const montoCancelado = canceladasArr.reduce((a, { c }) => a + aMxn(c.total, c), 0);

  const ivaTrasladado = emitidasI.reduce(
    (a, { c }) => a + aMxn(c.impuestos.totalTrasladados, c),
    0,
  );
  const retenidoTotal = emitidasI.reduce(
    (a, { c }) => a + aMxn(retenidoDe(c), c),
    0,
  );

  // Collection: PUE assumed collected; everything else reconciled against
  // the payment complements in the corpus.
  const pue = emitidasI.filter(({ c }) => c.metodoPago === "PUE");
  const diferidas = emitidasI.filter(({ c }) => c.metodoPago !== "PUE");
  const cobradoPue = pue.reduce((a, { c }) => a + aMxn(c.total, c), 0);
  let facturadoPpd = 0;
  let cobradoPpd = 0;
  let porCobrar = 0;
  let numPendientes = 0;
  for (const { c } of diferidas) {
    const rec = reconciliarUno(c, idx, "emitida");
    facturadoPpd += rec.total;
    cobradoPpd += rec.cobrado;
    porCobrar += rec.saldo;
    if (rec.saldo > EPS) numPendientes += 1;
  }

  const meses = new Map<string, { ingreso: number; count: number }>();
  for (const { c } of emitidasI) {
    const k = mesDe(c.fechaDia);
    const m = meses.get(k) ?? { ingreso: 0, count: 0 };
    m.ingreso += aMxn(c.total, c);
    m.count += 1;
    meses.set(k, m);
  }
  const porMes: PuntoMes[] = [...meses.entries()]
    .map(([mes, m]) => ({ mes, ingreso: redondea(m.ingreso), count: m.count }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  const porCliente = new Map<
    string,
    { nombre: string; total: number; count: number }
  >();
  for (const { c } of emitidasI) {
    const g = porCliente.get(c.receptor.rfc) ?? {
      nombre: c.receptor.nombre,
      total: 0,
      count: 0,
    };
    g.total += aMxn(c.total, c);
    g.count += 1;
    porCliente.set(c.receptor.rfc, g);
  }
  const totalClientes = [...porCliente.values()].reduce((a, g) => a + g.total, 0);
  const clientes: ResumenCliente[] = [...porCliente.entries()]
    .map(([rfcCli, g]) => ({
      rfc: rfcCli,
      nombre: g.nombre,
      total: redondea(g.total),
      count: g.count,
      share: totalClientes > 0 ? g.total / totalClientes : 0,
    }))
    .sort((a, b) => b.total - a.total);
  const hhi = clientes.reduce((a, c) => a + c.share * c.share, 0);
  const topShare = clientes.length > 0 ? clientes[0].share : 0;

  const gastoRecibido = recibidasI.reduce((a, { c }) => a + aMxn(c.total, c), 0);
  const ivaAcreditable = recibidasI.reduce(
    (a, { c }) => a + aMxn(c.impuestos.totalTrasladados, c),
    0,
  );

  return {
    rfcOperador: rfc,
    multiMoneda,
    numFacturas,
    ingresoFacturado: redondea(ingresoFacturado),
    ticketPromedio: numFacturas > 0 ? redondea(ingresoFacturado / numFacturas) : 0,
    ivaTrasladado: redondea(ivaTrasladado),
    retenidoTotal: redondea(retenidoTotal),
    cobradoPue: redondea(cobradoPue),
    facturadoPpd: redondea(facturadoPpd),
    cobradoPpd: redondea(cobradoPpd),
    cobradoTotal: redondea(cobradoPue + cobradoPpd),
    porCobrar: redondea(porCobrar),
    numDiferidas: diferidas.length,
    numPendientes,
    canceladas: canceladasArr.length,
    montoCancelado: redondea(montoCancelado),
    porMes,
    clientes,
    hhi,
    topShare,
    numRecibidas: recibidasI.length,
    gastoRecibido: redondea(gastoRecibido),
    ivaAcreditable: redondea(ivaAcreditable),
    notasCredito: redondea(notasCredito),
  };
}

/* ── Expense / supplier side (payables), mirror of the income view ─── */

export interface ResumenGasto {
  numGastos: number;
  gastoTotal: number;
  ivaAcreditable: number;
  /** Retenciones the operator withheld and must remit to the SAT. */
  retencionesAEnterar: number;
  /** PUE — assumed paid at reception. */
  pagadoPue: number;
  facturadoPpd: number;
  /** PPD paid, proven by payment complements. */
  pagadoPpd: number;
  pagadoTotal: number;
  /** PPD still owed to suppliers. */
  porPagar: number;
  numPorPagar: number;
  proveedores: ResumenCliente[];
  hhi: number;
  topShare: number;
  porMes: PuntoMes[];
  canceladas: number;
  montoCancelado: number;
  multiMoneda: boolean;
}

/** The expense-and-payables picture — recibidas, symmetric to resumenCobranza. */
export function resumenGasto(
  registros: RegistroCfdi[],
  rfc: string | null,
  rango?: { desde?: string; hasta?: string },
  metadata?: EstatusMetadata,
  pagosBanco?: PagoBanco[],
): ResumenGasto {
  const idx = indicePagos(registros, pagosBanco);
  const dentro = (fechaDia: string) =>
    (!rango?.desde || fechaDia >= rango.desde) &&
    (!rango?.hasta || fechaDia <= rango.hasta);

  const recibidas = registros
    .map(({ comprobante }) => comprobante)
    .filter((c) => dentro(c.fechaDia) && direccion(c, rfc) === "recibida" && c.tipo === "I");
  const canceladasArr = recibidas.filter((c) => esCancelado(c, metadata));
  const vigentes = recibidas.filter((c) => !esCancelado(c, metadata));

  const multiMoneda = vigentes.some((c) => c.moneda !== "MXN");
  const gastoTotal = vigentes.reduce((a, c) => a + aMxn(c.total, c), 0);
  const ivaAcreditable = vigentes.reduce(
    (a, c) => a + aMxn(c.impuestos.totalTrasladados, c),
    0,
  );
  const retencionesAEnterar = vigentes.reduce(
    (a, c) => a + aMxn(retenidoDe(c), c),
    0,
  );
  const montoCancelado = canceladasArr.reduce((a, c) => a + aMxn(c.total, c), 0);

  const pue = vigentes.filter((c) => c.metodoPago === "PUE");
  const diferidas = vigentes.filter((c) => c.metodoPago !== "PUE");
  const pagadoPue = pue.reduce((a, c) => a + aMxn(c.total, c), 0);
  let facturadoPpd = 0;
  let pagadoPpd = 0;
  let porPagar = 0;
  let numPorPagar = 0;
  for (const c of diferidas) {
    const rec = reconciliarUno(c, idx, "recibida");
    facturadoPpd += rec.total;
    pagadoPpd += rec.cobrado;
    porPagar += rec.saldo;
    if (rec.saldo > EPS) numPorPagar += 1;
  }

  const porProv = new Map<
    string,
    { nombre: string; total: number; count: number }
  >();
  for (const c of vigentes) {
    const g = porProv.get(c.emisor.rfc) ?? {
      nombre: c.emisor.nombre,
      total: 0,
      count: 0,
    };
    g.total += aMxn(c.total, c);
    g.count += 1;
    porProv.set(c.emisor.rfc, g);
  }
  const totalProv = [...porProv.values()].reduce((a, g) => a + g.total, 0);
  const proveedores: ResumenCliente[] = [...porProv.entries()]
    .map(([rfcP, g]) => ({
      rfc: rfcP,
      nombre: g.nombre,
      total: redondea(g.total),
      count: g.count,
      share: totalProv > 0 ? g.total / totalProv : 0,
    }))
    .sort((a, b) => b.total - a.total);
  const hhi = proveedores.reduce((a, p) => a + p.share * p.share, 0);
  const topShare = proveedores.length > 0 ? proveedores[0].share : 0;

  const meses = new Map<string, { ingreso: number; count: number }>();
  for (const c of vigentes) {
    const k = mesDe(c.fechaDia);
    const m = meses.get(k) ?? { ingreso: 0, count: 0 };
    m.ingreso += aMxn(c.total, c);
    m.count += 1;
    meses.set(k, m);
  }
  const porMes: PuntoMes[] = [...meses.entries()]
    .map(([mes, m]) => ({ mes, ingreso: redondea(m.ingreso), count: m.count }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return {
    numGastos: vigentes.length,
    gastoTotal: redondea(gastoTotal),
    ivaAcreditable: redondea(ivaAcreditable),
    retencionesAEnterar: redondea(retencionesAEnterar),
    pagadoPue: redondea(pagadoPue),
    facturadoPpd: redondea(facturadoPpd),
    pagadoPpd: redondea(pagadoPpd),
    pagadoTotal: redondea(pagadoPue + pagadoPpd),
    porPagar: redondea(porPagar),
    numPorPagar,
    proveedores,
    hhi,
    topShare,
    porMes,
    canceladas: canceladasArr.length,
    montoCancelado: redondea(montoCancelado),
    multiMoneda,
  };
}

/* ── Net fiscal position ──────────────────────────────────────────── */

export interface PosicionFiscal {
  ivaTrasladado: number;
  ivaAcreditable: number;
  /** Trasladado − acreditable on a billing basis (positive = a cargo). */
  ivaACargo: number;
  /** Retenciones clients withheld from you (creditable). */
  retenidoAFavor: number;
  /** Retenciones you withheld from suppliers (to remit). */
  retencionesAEnterar: number;
}

/**
 * Net fiscal position for the period. IVA is billing-basis here: Mexican IVA
 * is legally determined on cash flow (collected/paid), so this is a reference
 * that tightens as payment complements are reconciled.
 */
export function posicionFiscal(
  ingreso: ResumenCobranza,
  gasto: ResumenGasto,
): PosicionFiscal {
  return {
    ivaTrasladado: ingreso.ivaTrasladado,
    ivaAcreditable: gasto.ivaAcreditable,
    ivaACargo: redondea(ingreso.ivaTrasladado - gasto.ivaAcreditable),
    retenidoAFavor: ingreso.retenidoTotal,
    retencionesAEnterar: gasto.retencionesAEnterar,
  };
}

/** SAT tax codes, for labeling. */
export const IMPUESTO_IVA = IVA;
export const IMPUESTO_ISR = ISR;
