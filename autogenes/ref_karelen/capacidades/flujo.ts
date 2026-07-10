/**
 * FLUJO engine (P0) — SME cash-flow analysis over parsed bank movements.
 * Pure, deterministic, unit-agnostic: signed movements in (abono
 * positive, cargo negative — the shape lib/banco emits), measured
 * findings out. Every number is arithmetic over the operator's own
 * statement; counterparty names come from explainable string rules, and
 * anything the rules cannot name stays under its literal description —
 * never invented.
 */

export interface MovimientoFlujo {
  /** ISO date. */
  fecha: string;
  codigo?: string;
  descripcion: string;
  referencia?: string;
  /** Signed: positive = abono, negative = cargo. */
  monto: number;
}

export interface ResumenFlujo {
  ingresos: number;
  egresos: number;
  neto: number;
  nMovimientos: number;
  nAbonos: number;
  nCargos: number;
  diasConMovimiento: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenFlujo(movs: MovimientoFlujo[]): ResumenFlujo {
  const ingresos = movs.filter((m) => m.monto > 0).reduce((s, m) => s + m.monto, 0);
  const egresos = movs.filter((m) => m.monto < 0).reduce((s, m) => s - m.monto, 0);
  return {
    ingresos: r2(ingresos),
    egresos: r2(egresos),
    neto: r2(ingresos - egresos),
    nMovimientos: movs.length,
    nAbonos: movs.filter((m) => m.monto > 0).length,
    nCargos: movs.filter((m) => m.monto < 0).length,
    diasConMovimiento: new Set(movs.map((m) => m.fecha)).size,
  };
}

export interface Runway {
  /** Only meaningful while the flow burns cash. */
  aplica: boolean;
  /** Months of cash left at the observed net burn (null when not burning). */
  meses: number | null;
  /** Net monthly burn normalized to 30 days (positive = burning). */
  burnMensual: number;
}

/** Months of runway from the closing balance and the observed period. */
export function runway(
  saldoFinal: number,
  movs: MovimientoFlujo[],
  diasPeriodo: number,
): Runway {
  const res = resumenFlujo(movs);
  const dias = Math.max(1, diasPeriodo);
  const burnMensual = r2(((res.egresos - res.ingresos) / dias) * 30);
  if (burnMensual <= 0 || saldoFinal <= 0) {
    return { aplica: burnMensual > 0, meses: burnMensual > 0 ? 0 : null, burnMensual };
  }
  return { aplica: true, meses: r2(saldoFinal / burnMensual), burnMensual };
}

/**
 * Counterparty naming — explainable string rules over the BBVA codes:
 * card charges (A15) and services name the merchant in the description;
 * SPEI/TEF rows name the bank there, and the beneficiary usually rides
 * the reference as the longest ALL-CAPS run; SAT is SAT. Fallback: the
 * literal description.
 */
export function contraparteDe(m: MovimientoFlujo): string {
  const desc = m.descripcion.trim();
  const limpio = desc
    .replace(/^(SPEI|TEF)\s+(ENVIADO|RECIBIDO)\s*/i, "")
    .replace(/^PAGO CUENTA DE TERCERO\s*/i, "")
    .trim();
  if (limpio.length > 0 && limpio !== desc) {
    // Transfer row: prefer the beneficiary in the reference when present.
    const mayus = (m.referencia ?? "").match(/[A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,5}/g);
    const beneficiario = (mayus ?? [])
      .filter((s) => !/^(BNET|SPEI|REF|RFC|AUT|CIE|GUIA|USD|TEF)/.test(s))
      .sort((a, b) => b.length - a.length)[0];
    return beneficiario ?? limpio;
  }
  if (limpio.length === 0) {
    // "PAGO CUENTA DE TERCERO" with nothing else: look at the reference.
    const mayus = (m.referencia ?? "").match(/[A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,5}/g);
    const beneficiario = (mayus ?? [])
      .filter((s) => !/^(BNET|SPEI|REF|RFC|AUT|CIE|GUIA|USD|TEF)/.test(s))
      .sort((a, b) => b.length - a.length)[0];
    if (beneficiario) return beneficiario;
  }
  return desc.length > 0 ? desc : "(sin descripción)";
}

export interface Contraparte {
  nombre: string;
  total: number;
  n: number;
}

export interface Concentracion {
  ingresos: Contraparte[];
  egresos: Contraparte[];
  /** Share of total income carried by the top income counterparty. */
  concentracionIngresos: number;
  /** Share of total spend carried by the top spend counterparty. */
  concentracionEgresos: number;
}

export function concentracion(
  movs: MovimientoFlujo[],
  top = 5,
): Concentracion {
  const agrupar = (lista: MovimientoFlujo[]): Contraparte[] => {
    const m = new Map<string, Contraparte>();
    for (const mov of lista) {
      const nombre = contraparteDe(mov);
      const prev = m.get(nombre) ?? { nombre, total: 0, n: 0 };
      prev.total = r2(prev.total + Math.abs(mov.monto));
      prev.n += 1;
      m.set(nombre, prev);
    }
    return [...m.values()].sort(
      (a, b) => b.total - a.total || (a.nombre < b.nombre ? -1 : 1),
    );
  };
  const ing = agrupar(movs.filter((m) => m.monto > 0));
  const egr = agrupar(movs.filter((m) => m.monto < 0));
  const totalIng = ing.reduce((s, c) => s + c.total, 0);
  const totalEgr = egr.reduce((s, c) => s + c.total, 0);
  return {
    ingresos: ing.slice(0, top),
    egresos: egr.slice(0, top),
    concentracionIngresos: totalIng > 0 ? r2(ing[0].total / totalIng) : 0,
    concentracionEgresos: totalEgr > 0 ? r2(egr[0].total / totalEgr) : 0,
  };
}

export interface Recurrente {
  nombre: string;
  n: number;
  total: number;
  montoTipico: number;
}

/**
 * Recurring charges: same counterparty, ≥ minVeces occurrences, amounts
 * within ±15% of their median — subscriptions and rents surface here.
 */
export function recurrentes(
  movs: MovimientoFlujo[],
  minVeces = 2,
): Recurrente[] {
  const porNombre = new Map<string, number[]>();
  for (const m of movs.filter((x) => x.monto < 0)) {
    const nombre = contraparteDe(m);
    const lista = porNombre.get(nombre) ?? [];
    lista.push(-m.monto);
    porNombre.set(nombre, lista);
  }
  const salida: Recurrente[] = [];
  for (const [nombre, montos] of porNombre) {
    if (montos.length < minVeces) continue;
    const orden = [...montos].sort((a, b) => a - b);
    const mediana = orden[Math.floor(orden.length / 2)];
    if (mediana <= 0) continue;
    const estables = montos.filter(
      (v) => Math.abs(v - mediana) / mediana <= 0.15,
    );
    if (estables.length < minVeces) continue;
    salida.push({
      nombre,
      n: estables.length,
      total: r2(estables.reduce((s, v) => s + v, 0)),
      montoTipico: r2(mediana),
    });
  }
  return salida.sort((a, b) => b.total - a.total);
}

export interface Comisiones {
  total: number;
  n: number;
}

/** Bank fees: service codes and fee-like descriptions, cargos only. */
export function comisiones(movs: MovimientoFlujo[]): Comisiones {
  const esComision = (m: MovimientoFlujo) =>
    m.monto < 0 &&
    (/^S\d{2}$/.test(m.codigo ?? "") ||
      /COMISION|SERV\.?\s*BANCA|MEMBRESIA|ANUALIDAD|IVA COMISION/i.test(
        m.descripcion,
      ));
  const lista = movs.filter(esComision);
  return {
    total: r2(lista.reduce((s, m) => s - m.monto, 0)),
    n: lista.length,
  };
}

export interface MovimientoUsd {
  fecha: string;
  descripcion: string;
  usd: number;
  tipoCambio: number;
  mxn: number;
}

/** Card rows carry "USD 13.91TC017.4176" in the reference — extract them. */
export function movimientosUsd(movs: MovimientoFlujo[]): MovimientoUsd[] {
  const salida: MovimientoUsd[] = [];
  for (const m of movs) {
    const match = /USD\s*([\d,]+\.?\d*)\s*TC0?([\d,]+\.\d+)/i.exec(
      m.referencia ?? "",
    );
    if (!match) continue;
    const usd = Number.parseFloat(match[1].replaceAll(",", ""));
    const tc = Number.parseFloat(match[2].replaceAll(",", ""));
    if (!Number.isFinite(usd) || !Number.isFinite(tc)) continue;
    salida.push({
      fecha: m.fecha,
      descripcion: m.descripcion,
      usd: r2(usd),
      tipoCambio: tc,
      mxn: r2(Math.abs(m.monto)),
    });
  }
  return salida;
}

export interface DiaFlujo {
  fecha: string;
  ingresos: number;
  egresos: number;
}

/** Daily series across the full period (empty days included, honest). */
export function serieDiaria(
  movs: MovimientoFlujo[],
  desde: string,
  hasta: string,
): DiaFlujo[] {
  const porDia = new Map<string, DiaFlujo>();
  const d0 = new Date(`${desde}T00:00:00Z`);
  const d1 = new Date(`${hasta}T00:00:00Z`);
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return [];
  for (let t = d0.getTime(); t <= d1.getTime(); t += 86_400_000) {
    const fecha = new Date(t).toISOString().slice(0, 10);
    porDia.set(fecha, { fecha, ingresos: 0, egresos: 0 });
  }
  for (const m of movs) {
    const dia = porDia.get(m.fecha);
    if (!dia) continue;
    if (m.monto > 0) dia.ingresos = r2(dia.ingresos + m.monto);
    else dia.egresos = r2(dia.egresos - m.monto);
  }
  return [...porDia.values()];
}

/* ── P1: liquidity, forensics and multi-statement series ──────────── */

export interface PuntoFragil {
  fecha: string;
  saldo: number;
}

/** Daily running balance; the month's thinnest day is what kills SMEs. */
export function puntoFragil(
  movs: MovimientoFlujo[],
  saldoInicial: number,
  desde: string,
  hasta: string,
): { minimo: PuntoFragil | null; saldos: PuntoFragil[]; promedio: number } {
  const dias = serieDiaria(movs, desde, hasta);
  if (dias.length === 0) return { minimo: null, saldos: [], promedio: 0 };
  let saldo = saldoInicial;
  const saldos: PuntoFragil[] = [];
  for (const d of dias) {
    saldo = r2(saldo + d.ingresos - d.egresos);
    saldos.push({ fecha: d.fecha, saldo });
  }
  const minimo = saldos.reduce((m, s) => (s.saldo < m.saldo ? s : m), saldos[0]);
  const promedio = r2(saldos.reduce((s, x) => s + x.saldo, 0) / saldos.length);
  return { minimo, saldos, promedio };
}

/** Idle-cash opportunity vs a reference annual rate (CETES convention). */
export function costoOportunidad(
  saldoPromedio: number,
  tasaAnualPct: number,
  dias: number,
): number {
  if (saldoPromedio <= 0 || tasaAnualPct <= 0 || dias <= 0) return 0;
  return r2(saldoPromedio * (tasaAnualPct / 100) * (dias / 360));
}

export interface SpreadFx {
  total: number;
  detalle: { fecha: string; usd: number; tcPagado: number; fix: number; costo: number }[];
}

/** What the bank's FX rate cost vs the official FIX of each date. */
export function spreadFx(
  usd: MovimientoUsd[],
  fixPorFecha: Map<string, number>,
): SpreadFx {
  const detalle: SpreadFx["detalle"] = [];
  for (const u of usd) {
    const fix = fixPorFecha.get(u.fecha);
    if (fix === undefined || fix <= 0) continue;
    detalle.push({
      fecha: u.fecha,
      usd: u.usd,
      tcPagado: u.tipoCambio,
      fix,
      costo: r2((u.tipoCambio - fix) * u.usd),
    });
  }
  return { total: r2(detalle.reduce((s, d) => s + d.costo, 0)), detalle };
}

export interface PresionFiscal {
  total: number;
  n: number;
  porcentajeEgresos: number;
  fechas: string[];
}

/** The SAT charges themselves — rows for cross-engines (CUADRE). */
export function pagosSat(
  movs: MovimientoFlujo[],
): { fecha: string; monto: number }[] {
  return movs
    .filter(
      (m) => m.monto < 0 && /^SAT\b|\bSAT\b/.test(m.descripcion.toUpperCase()),
    )
    .map((m) => ({ fecha: m.fecha, monto: m.monto }));
}

/** SAT share of the spend, with its calendar. */
export function presionFiscal(movs: MovimientoFlujo[]): PresionFiscal {
  const sat = pagosSat(movs);
  const total = r2(sat.reduce((s, m) => s - m.monto, 0));
  const egresos = resumenFlujo(movs).egresos;
  return {
    total,
    n: sat.length,
    porcentajeEgresos: egresos > 0 ? r2(total / egresos) : 0,
    fechas: [...new Set(sat.map((m) => m.fecha))].sort(),
  };
}

export interface Duplicado {
  fecha: string;
  nombre: string;
  monto: number;
  n: number;
}

/** Same day + same counterparty + same amount, twice or more. */
export function duplicados(movs: MovimientoFlujo[]): Duplicado[] {
  const porClave = new Map<string, Duplicado>();
  for (const m of movs.filter((x) => x.monto < 0)) {
    const nombre = contraparteDe(m);
    const clave = `${m.fecha}|${nombre}|${Math.abs(m.monto).toFixed(2)}`;
    const prev = porClave.get(clave);
    if (prev) prev.n += 1;
    else porClave.set(clave, { fecha: m.fecha, nombre, monto: r2(Math.abs(m.monto)), n: 1 });
  }
  return [...porClave.values()]
    .filter((d) => d.n >= 2)
    .sort((a, b) => b.monto * b.n - a.monto * a.n);
}

export interface GastoHormiga {
  total: number;
  n: number;
  umbral: number;
}

/** Micro-charges below the threshold — the leak nobody itemizes. */
export function gastoHormiga(
  movs: MovimientoFlujo[],
  umbral = 200,
): GastoHormiga {
  const lista = movs.filter((m) => m.monto < 0 && -m.monto < umbral);
  return {
    total: r2(lista.reduce((s, m) => s - m.monto, 0)),
    n: lista.length,
    umbral,
  };
}

export interface Benford {
  /** Honest gate: below 50 amounts the test says so and abstains. */
  aplica: boolean;
  n: number;
  digitos: { digito: number; observado: number; esperado: number }[];
  /** Mean absolute deviation between observed and expected shares. */
  mad: number | null;
  veredicto: "conforme" | "aceptable" | "marginal" | "desviado" | "insuficiente";
}

const N_MINIMO_BENFORD = 50;

/** First-digit Benford screen (Nigrini MAD bands) over all amounts. */
export function benford(movs: MovimientoFlujo[]): Benford {
  const digitos = movs
    .map((m) => Math.abs(m.monto))
    .filter((v) => v >= 1)
    .map((v) => Number.parseInt(String(v).replace(/[^1-9]/g, "").charAt(0), 10))
    .filter((d) => d >= 1 && d <= 9);
  const n = digitos.length;
  const filas = Array.from({ length: 9 }, (_, i) => {
    const d = i + 1;
    return {
      digito: d,
      observado: n > 0 ? r2(digitos.filter((x) => x === d).length / n * 100) / 100 : 0,
      esperado: Math.round(Math.log10(1 + 1 / d) * 10000) / 10000,
    };
  });
  if (n < N_MINIMO_BENFORD) {
    return { aplica: false, n, digitos: filas, mad: null, veredicto: "insuficiente" };
  }
  const mad =
    filas.reduce((s, f) => s + Math.abs(f.observado - f.esperado), 0) / 9;
  const madR = Math.round(mad * 10000) / 10000;
  const veredicto =
    madR <= 0.006
      ? "conforme"
      : madR <= 0.012
        ? "aceptable"
        : madR <= 0.015
          ? "marginal"
          : "desviado";
  return { aplica: true, n, digitos: filas, mad: madR, veredicto };
}

export interface VeredictoCaja {
  /** 0..1 position on the health scale (1 = healthiest). */
  nivel: number;
  zonas: [string, string, string];
  zona: "critico" | "alerta" | "estable";
  sentencia: string;
}

/** The hero verdict: runway-first, fragile-day aware, plain sentence. */
export function veredictoCaja(
  rw: Runway,
  fragil: PuntoFragil | null,
  concIngresos: number,
): VeredictoCaja {
  const zonas: [string, string, string] = ["crítico <1 mes", "alerta 1–3", "estable >3"];
  if (!rw.aplica || rw.meses === null) {
    const aviso =
      concIngresos >= 0.7
        ? ` Ojo: ${(concIngresos * 100).toFixed(0)}% del ingreso viene de una sola fuente.`
        : "";
    return {
      nivel: 0.9,
      zonas,
      zona: "estable",
      sentencia: `Flujo positivo en el periodo: la caja creció.${aviso}`,
    };
  }
  const meses = rw.meses;
  const zona = meses < 1 ? "critico" : meses < 3 ? "alerta" : "estable";
  const nivel = Math.max(0.02, Math.min(0.98, meses / 6));
  const fragilTxt =
    fragil !== null
      ? ` Día más frágil: ${fragil.fecha} con ${fragil.saldo.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}.`
      : "";
  return {
    nivel: Math.round(nivel * 100) / 100,
    zonas,
    zona,
    sentencia: `A este ritmo de quema (${rw.burnMensual.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}/mes) la caja dura ${meses.toFixed(1)} meses.${fragilTxt}`,
  };
}

export interface MesFlujo {
  mes: string; // AAAA-MM
  ingresos: number;
  egresos: number;
  neto: number;
  n: number;
}

/** Monthly series across however many statements are loaded. */
export function serieMensual(movs: MovimientoFlujo[]): MesFlujo[] {
  const porMes = new Map<string, MesFlujo>();
  for (const m of movs) {
    const mes = m.fecha.slice(0, 7);
    const prev = porMes.get(mes) ?? { mes, ingresos: 0, egresos: 0, neto: 0, n: 0 };
    if (m.monto > 0) prev.ingresos = r2(prev.ingresos + m.monto);
    else prev.egresos = r2(prev.egresos - m.monto);
    prev.neto = r2(prev.ingresos - prev.egresos);
    prev.n += 1;
    porMes.set(mes, prev);
  }
  return [...porMes.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1));
}

export interface CalidadIngreso {
  /** Coefficient of variation of monthly income (needs ≥3 months). */
  cv: number | null;
  meses: number;
}

export function calidadIngreso(mensual: MesFlujo[]): CalidadIngreso {
  if (mensual.length < 3) return { cv: null, meses: mensual.length };
  const vals = mensual.map((m) => m.ingresos);
  const media = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (media === 0) return { cv: null, meses: mensual.length };
  const sd = Math.sqrt(
    vals.reduce((s, v) => s + (v - media) ** 2, 0) / vals.length,
  );
  return { cv: Math.round((sd / media) * 100) / 100, meses: mensual.length };
}

export interface RitmoCliente {
  nombre: string;
  pagos: number;
  diasPromedio: number | null;
  diasDesdeUltimo: number | null;
  /** Fires when the silence exceeds 1.5× the usual gap. */
  atrasado: boolean;
}

/** Payment cadence of the top income counterparty (needs ≥3 payments). */
export function ritmoClienteTop(
  movs: MovimientoFlujo[],
  hastaIso: string,
): RitmoCliente | null {
  const c = concentracion(movs);
  const top = c.ingresos[0];
  if (!top) return null;
  const fechas = movs
    .filter((m) => m.monto > 0 && contraparteDe(m) === top.nombre)
    .map((m) => Date.parse(m.fecha))
    .sort((a, b) => a - b);
  if (fechas.length < 3) {
    return {
      nombre: top.nombre,
      pagos: fechas.length,
      diasPromedio: null,
      diasDesdeUltimo: null,
      atrasado: false,
    };
  }
  const brechas: number[] = [];
  for (let i = 1; i < fechas.length; i++) {
    brechas.push((fechas[i] - fechas[i - 1]) / 86_400_000);
  }
  const diasPromedio = Math.round(
    brechas.reduce((s, v) => s + v, 0) / brechas.length,
  );
  const diasDesdeUltimo = Math.round(
    (Date.parse(hastaIso) - fechas[fechas.length - 1]) / 86_400_000,
  );
  return {
    nombre: top.nombre,
    pagos: fechas.length,
    diasPromedio,
    diasDesdeUltimo,
    atrasado: diasPromedio > 0 && diasDesdeUltimo > diasPromedio * 1.5,
  };
}

/* ── P2: seasonality, drainage, typical-month deviations ──────────── */

export interface DiaSemana {
  dia: string;
  egresos: number;
  ingresos: number;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Weekly shape of the money: which weekday concentrates the spend. */
export function porDiaSemana(movs: MovimientoFlujo[]): {
  dias: DiaSemana[];
  picoEgreso: DiaSemana | null;
} {
  const filas: DiaSemana[] = DIAS_SEMANA.map((dia) => ({
    dia,
    egresos: 0,
    ingresos: 0,
  }));
  for (const m of movs) {
    const d = new Date(`${m.fecha}T00:00:00Z`).getUTCDay();
    if (m.monto > 0) filas[d].ingresos = r2(filas[d].ingresos + m.monto);
    else filas[d].egresos = r2(filas[d].egresos - m.monto);
  }
  const conEgreso = filas.filter((f) => f.egresos > 0);
  const picoEgreso =
    conEgreso.length === 0
      ? null
      : conEgreso.reduce((a, b) => (b.egresos > a.egresos ? b : a));
  return { dias: filas, picoEgreso };
}

export interface TendenciaMensual {
  /** MoM change of net flow, latest month vs previous (needs ≥2). */
  deltaNeto: number | null;
  deltaIngresos: number | null;
  /** 3-month moving average of net flow (needs ≥3). */
  media3Neto: number | null;
}

export function tendenciaMensual(mensual: MesFlujo[]): TendenciaMensual {
  const n = mensual.length;
  if (n < 2) return { deltaNeto: null, deltaIngresos: null, media3Neto: null };
  const ult = mensual[n - 1];
  const prev = mensual[n - 2];
  const ultimos3 = mensual.slice(-3);
  return {
    deltaNeto: r2(ult.neto - prev.neto),
    deltaIngresos: r2(ult.ingresos - prev.ingresos),
    media3Neto:
      n >= 3 ? r2(ultimos3.reduce((s, m) => s + m.neto, 0) / 3) : null,
  };
}

/**
 * Smoothed runway: burn = median monthly net burn over the last months
 * (≤6), so one weird month does not decide the verdict. Needs ≥3.
 */
export function runwaySuavizado(
  saldoFinal: number,
  mensual: MesFlujo[],
): Runway | null {
  if (mensual.length < 3) return null;
  const quemas = mensual
    .slice(-6)
    .map((m) => m.egresos - m.ingresos)
    .sort((a, b) => a - b);
  const burn = r2(quemas[Math.floor(quemas.length / 2)]);
  if (burn <= 0 || saldoFinal <= 0) {
    return { aplica: burn > 0, meses: burn > 0 ? 0 : null, burnMensual: burn };
  }
  return { aplica: true, meses: r2(saldoFinal / burn), burnMensual: burn };
}

/** Annual seasonality — honest gate: needs ≥ 13 months of series. */
export function estacionalidadAnual(mensual: MesFlujo[]): {
  aplica: boolean;
  meses: number;
  correlacion12: number | null;
} {
  if (mensual.length < 13) {
    return { aplica: false, meses: mensual.length, correlacion12: null };
  }
  const serie = mensual.map((m) => m.ingresos);
  const n = serie.length;
  const media = serie.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) den += (serie[i] - media) ** 2;
  for (let i = 0; i < n - 12; i++)
    num += (serie[i] - media) * (serie[i + 12] - media);
  const r = den === 0 ? 0 : num / den;
  return { aplica: true, meses: n, correlacion12: Math.round(r * 100) / 100 };
}

export interface VelocidadDrenado {
  /** Median days for a big inflow to be 80% drained (null = no basis). */
  diasMediana: number | null;
  casos: number;
}

/** How fast a big payment leaves: days until 80% of it flowed out. */
export function velocidadDrenado(movs: MovimientoFlujo[]): VelocidadDrenado {
  const abonos = movs.filter((m) => m.monto > 0).map((m) => m.monto);
  if (abonos.length === 0) return { diasMediana: null, casos: 0 };
  const orden = [...abonos].sort((a, b) => a - b);
  const p75 = orden[Math.floor(orden.length * 0.75)];
  const grandes = movs.filter((m) => m.monto > 0 && m.monto >= p75);
  const dias: number[] = [];
  for (const g of grandes) {
    const t0 = Date.parse(g.fecha);
    let salido = 0;
    let alcanzado: number | null = null;
    for (const m of movs) {
      const t = Date.parse(m.fecha);
      if (m.monto >= 0 || t < t0) continue;
      salido += -m.monto;
      if (salido >= g.monto * 0.8) {
        alcanzado = Math.round((t - t0) / 86_400_000);
        break;
      }
    }
    if (alcanzado !== null) dias.push(alcanzado);
  }
  if (dias.length === 0) return { diasMediana: null, casos: grandes.length };
  const ordenD = [...dias].sort((a, b) => a - b);
  return {
    diasMediana: ordenD[Math.floor(ordenD.length / 2)],
    casos: dias.length,
  };
}

export interface ReaccionACobro {
  cobros: number;
  /** Outflows within 48 h of a big inflow — measured co-occurrence,
   * never causality. */
  egresos48h: number;
  monto48h: number;
}

export function reaccionACobro(movs: MovimientoFlujo[]): ReaccionACobro {
  const abonos = movs.filter((m) => m.monto > 0).map((m) => m.monto);
  if (abonos.length === 0) return { cobros: 0, egresos48h: 0, monto48h: 0 };
  const orden = [...abonos].sort((a, b) => a - b);
  const p75 = orden[Math.floor(orden.length * 0.75)];
  const grandes = movs.filter((m) => m.monto > 0 && m.monto >= p75);
  let egresos48h = 0;
  let monto48h = 0;
  for (const g of grandes) {
    const t0 = Date.parse(g.fecha);
    for (const m of movs) {
      if (m.monto >= 0) continue;
      const dt = Date.parse(m.fecha) - t0;
      if (dt >= 0 && dt <= 2 * 86_400_000) {
        egresos48h += 1;
        monto48h += -m.monto;
      }
    }
  }
  return { cobros: grandes.length, egresos48h, monto48h: r2(monto48h) };
}

export interface DesviacionMes {
  metrica: string;
  actual: number;
  tipico: number;
  detalle: string;
}

/**
 * The QUALIA projection: the latest month against the operator's OWN
 * typical month (median of the previous ones; needs ≥4 months). A
 * deviation fires when the latest doubles the median or falls under
 * half of it — plain, explainable thresholds.
 */
export function desviacionesMes(mensual: MesFlujo[]): DesviacionMes[] {
  if (mensual.length < 4) return [];
  const previos = mensual.slice(0, -1);
  const ultimo = mensual[mensual.length - 1];
  const mediana = (vals: number[]): number => {
    const o = [...vals].sort((a, b) => a - b);
    return o[Math.floor(o.length / 2)];
  };
  const hallazgos: DesviacionMes[] = [];
  const revisar = (
    metrica: string,
    actual: number,
    tipico: number,
    unidad: string,
  ) => {
    if (tipico <= 0) return;
    const razon = actual / tipico;
    if (razon >= 2 || razon <= 0.5) {
      hallazgos.push({
        metrica,
        actual: r2(actual),
        tipico: r2(tipico),
        detalle: `${metrica}: ${razon >= 2 ? "al doble" : "a la mitad"} de tu mes típico (${unidad}).`,
      });
    }
  };
  revisar("Ingresos", ultimo.ingresos, mediana(previos.map((m) => m.ingresos)), "mediana previa");
  revisar("Egresos", ultimo.egresos, mediana(previos.map((m) => m.egresos)), "mediana previa");
  revisar(
    "Movimientos",
    ultimo.n,
    mediana(previos.map((m) => m.n)),
    "conteo mediano",
  );
  return hallazgos;
}
