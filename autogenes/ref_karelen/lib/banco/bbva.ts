/**
 * BBVA statement reader (Maestra PYME / personal) — pure, deterministic, on
 * device. A native-digital BBVA PDF carries a clean text layer laid out in
 * fixed columns: OPER · LIQ · COD/DESCRIPCIÓN · REFERENCIA · CARGOS · ABONOS
 * · SALDO. This module turns the positioned text (fed by pdf.js, never OCR)
 * into signed movements. Cargo vs abono is read from the amount's X column,
 * not its sign; the running balance and the statement totals are used as a
 * checksum so a misparse is caught, not silently trusted.
 */

export interface FragmentoRenglon {
  x: number;
  str: string;
}
export type Renglon = FragmentoRenglon[];

export interface MovimientoBanco {
  /** Operation date, YYYY-MM-DD. */
  fecha: string;
  fechaLiq?: string;
  /** BBVA operation code (A15, T17, N06, P14…). */
  codigo?: string;
  descripcion: string;
  referencia?: string;
  /** Signed: positive = abono/deposit, negative = cargo/withdrawal. */
  monto: number;
  /** Running operation balance after the movement, if the row shows it. */
  saldo: number | null;
}

export interface EstadoBanco {
  banco: "BBVA";
  periodo: { desde: string; hasta: string } | null;
  movimientos: MovimientoBanco[];
  totalCargos: number;
  totalAbonos: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
  /** saldoInicial + abonos − cargos === saldoFinal (within a cent). */
  cuadra: boolean;
}

/** Stable id for a movement, so re-importing the same statement dedups. */
export function idMovimiento(m: MovimientoBanco): string {
  return `${m.fecha}|${m.monto.toFixed(2)}|${m.saldo ?? "x"}|${m.descripcion}`.slice(0, 160);
}

const MESES: Record<string, string> = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
};

const FECHA_CORTA = /^(\d{2})\/([A-Z]{3})$/;

function aIso(ddMmm: string, anio: number): string | null {
  const m = FECHA_CORTA.exec(ddMmm.toUpperCase());
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  return `${anio}-${mes}-${m[1]}`;
}

function aNumero(s: string): number | null {
  if (!/^-?\d[\d,]*\.\d{2}$/.test(s.trim())) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Column X thresholds, read off the BBVA layout (right-aligned amounts). */
const X_CARGO_MAX = 400; // cargo amounts sit ~360–390
const X_ABONO_MAX = 460; // abono amounts sit ~410–435
const X_SALDO_MAX = 525; // saldo operación ~475–500

function esEncabezado(texto: string): boolean {
  return /Detalle de Movimientos|COD\.?\s*DESCRIPCI|Estado de Cuenta|PAGINA|Periodo\b|SUCURSAL|BBVA MEXICO/i.test(
    texto,
  );
}

export function parsearEstadoBbva(renglones: Renglon[]): EstadoBanco {
  // Statement year + period from "DEL DD/MM/YYYY AL DD/MM/YYYY".
  let anio = new Date().getFullYear();
  let periodo: EstadoBanco["periodo"] = null;
  let saldoInicial: number | null = null;
  let saldoFinal: number | null = null;
  let totalCargosDecl: number | null = null;
  let totalAbonosDecl: number | null = null;

  for (const r of renglones) {
    const texto = r.map((f) => f.str).join(" ");
    const per = /DEL\s+(\d{2})\/(\d{2})\/(\d{4})\s+AL\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(texto);
    if (per) {
      anio = Number(per[3]);
      periodo = {
        desde: `${per[3]}-${per[2]}-${per[1]}`,
        hasta: `${per[6]}-${per[5]}-${per[4]}`,
      };
    }
    const ini = /Saldo de Liquidaci[oó]n Inicial\s+([\d,]+\.\d{2})/i.exec(texto);
    if (ini) saldoInicial = aNumero(ini[1]);
    const fin = /Saldo (?:Final|de Operaci[oó]n Final)\s*\(?\+?\)?\s+([\d,]+\.\d{2})/i.exec(texto);
    if (fin) saldoFinal = aNumero(fin[1]);
    const tc = /TOTAL IMPORTE CARGOS\s+([\d,]+\.\d{2})/i.exec(texto);
    if (tc) totalCargosDecl = aNumero(tc[1]);
    const ta = /TOTAL IMPORTE ABONOS\s+([\d,]+\.\d{2})/i.exec(texto);
    if (ta) totalAbonosDecl = aNumero(ta[1]);
  }

  const movimientos: MovimientoBanco[] = [];
  let corriente: MovimientoBanco | null = null;

  for (const r of renglones) {
    const items = [...r].sort((a, b) => a.x - b.x);
    const texto = items.map((f) => f.str).join(" ");
    if (/TOTAL IMPORTE (CARGOS|ABONOS)/i.test(texto)) {
      corriente = null;
      continue;
    }
    const primero = items[0];
    const fechaOper = primero ? aIso(primero.str, anio) : null;

    if (fechaOper && items.length >= 2) {
      // New movement row. items[1] merges "LIQ COD DESCRIPCION".
      const cuerpo = items[1].str.trim();
      const mBody = /^(\d{2}\/[A-Z]{3})\s+(?:([A-Z]\d{2})\s+)?(.*)$/i.exec(cuerpo);
      const fechaLiq = mBody ? (aIso(mBody[1], anio) ?? undefined) : undefined;
      const codigo = mBody?.[2];
      const descripcion = (mBody?.[3] ?? cuerpo).trim();

      // Transaction amount: the numeric item in the CARGOS/ABONOS band.
      let monto = 0;
      let saldo: number | null = null;
      for (const it of items.slice(2)) {
        const n = aNumero(it.str);
        if (n === null) continue;
        if (it.x < X_ABONO_MAX) {
          monto = it.x < X_CARGO_MAX ? -n : n; // cargo negative, abono positive
        } else if (it.x < X_SALDO_MAX && saldo === null) {
          saldo = n;
        }
      }

      corriente = { fecha: fechaOper, fechaLiq, codigo, descripcion, monto, saldo };
      movimientos.push(corriente);
      continue;
    }

    // Continuation line (reference detail under the movement).
    if (corriente && !esEncabezado(texto) && items.length > 0 && items[0].x > 60 && items[0].x < 200) {
      const ref = texto.trim();
      if (ref) corriente.referencia = corriente.referencia ? `${corriente.referencia} ${ref}` : ref;
    }
  }

  const totalCargos = movimientos.filter((m) => m.monto < 0).reduce((a, m) => a - m.monto, 0);
  const totalAbonos = movimientos.filter((m) => m.monto > 0).reduce((a, m) => a + m.monto, 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let cuadra = false;
  if (saldoInicial !== null && saldoFinal !== null) {
    cuadra = Math.abs(round2(saldoInicial + totalAbonos - totalCargos) - saldoFinal) < 0.02;
  }
  // Also honor the declared totals when present.
  if (totalCargosDecl !== null) cuadra = cuadra && Math.abs(round2(totalCargos) - totalCargosDecl) < 0.02;
  if (totalAbonosDecl !== null) cuadra = cuadra && Math.abs(round2(totalAbonos) - totalAbonosDecl) < 0.02;

  return {
    banco: "BBVA",
    periodo,
    movimientos,
    totalCargos: round2(totalCargos),
    totalAbonos: round2(totalAbonos),
    saldoInicial,
    saldoFinal,
    cuadra,
  };
}

export interface SucursalBanco {
  clave: string;
  nombre: string;
  direccion: string;
  plaza: string;
}

/** Branch block from the statement header — FLUJO's geo anchor. */
export function sucursalDe(renglones: Renglon[]): SucursalBanco {
  const despuesDe = (re: RegExp): string => {
    for (const r of renglones) {
      const items = [...r].sort((a, b) => a.x - b.x);
      const idx = items.findIndex((f) => re.test(f.str.trim()));
      if (idx === -1) continue;
      const resto = items
        .slice(idx + 1)
        .map((f) => f.str.trim())
        .filter((s) => s.length > 0)
        .join(" ");
      if (resto) return resto;
    }
    return "";
  };
  const suc = despuesDe(/^SUCURSAL\s*:?$/i);
  const [clave, ...nombre] = suc.split(/\s+/);
  return {
    clave: /^\d+$/.test(clave ?? "") ? clave : "",
    nombre: nombre.join(" "),
    direccion: despuesDe(/^DIRECCION\s*:?$/i),
    plaza: despuesDe(/^PLAZA\s*:?$/i),
  };
}
