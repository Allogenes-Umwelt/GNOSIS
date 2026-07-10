import { direccion } from "@/capacidades/finanzas";
import type { MovimientoBanco } from "@/lib/banco/bbva";
import type { RegistroCfdi } from "@/lib/cfdi/tipos";

/**
 * Bank reconciliation — pure, deterministic matcher between bank movements
 * and CFDI. An abono (deposit) is a collection of one of the operator's
 * emitidas; a cargo (withdrawal) is a payment of one of its recibidas. A
 * movement matches an invoice when the amounts agree within tolerance (a
 * centavo of bank rounding must not break the match) and the payment falls
 * on or after the invoice, inside a window. The matcher only SUGGESTS: a
 * unique hit is proposed, several become ambiguous, none is left as sin_cfdi
 * (a commission, a tax payment, a transfer). The operator confirms — nothing
 * is asserted as paid from a guess.
 */

export interface OpcionesConciliacion {
  /** Absolute amount tolerance, pesos. */
  toleranciaAbs: number;
  /** Relative amount tolerance, fraction. */
  toleranciaPct: number;
  /** Payment allowed from invoiceDate−3 up to invoiceDate+ventanaDias. */
  ventanaDias: number;
}

export const CONCILIACION_DEFAULT: OpcionesConciliacion = {
  toleranciaAbs: 1,
  toleranciaPct: 0.005,
  ventanaDias: 90,
};

export type TipoMatch = "unico" | "ambiguo" | "sin_cfdi";

export interface Conciliacion {
  movimiento: MovimientoBanco;
  /** cobro = a deposit settling an emitida; pago = a withdrawal settling a recibida. */
  lado: "cobro" | "pago";
  tipo: TipoMatch;
  /** Best candidate's CFDI key, or null. */
  sugerido: string | null;
  /** All candidate keys, closest first. */
  candidatos: string[];
  difMonto: number | null;
  difDias: number | null;
}

export interface ResultadoConciliacion {
  conciliaciones: Conciliacion[];
  resumen: {
    total: number;
    unicos: number;
    ambiguos: number;
    sinCfdi: number;
    montoConciliado: number;
  };
}

const DIA_MS = 86_400_000;

function fechaUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function diasEntre(a: string, b: string): number {
  return Math.round((fechaUtc(b) - fechaUtc(a)) / DIA_MS);
}

function redondea(n: number): number {
  return Math.round(n * 100) / 100;
}

function montoMxn(r: RegistroCfdi): number {
  return r.comprobante.total * (r.comprobante.tipoCambio || 1);
}

/**
 * Suggest, for each bank movement, the CFDI it most likely settles. Amount
 * is the primary key (within tolerance); date proximity disambiguates
 * recurring same-amount invoices; a payment can't match a future invoice.
 */
export function conciliarBanco(
  movimientos: MovimientoBanco[],
  registros: RegistroCfdi[],
  rfc: string | null,
  opciones: OpcionesConciliacion = CONCILIACION_DEFAULT,
): ResultadoConciliacion {
  const conciliaciones: Conciliacion[] = movimientos.map((mov) => {
    const cobro = mov.monto > 0;
    const dir = cobro ? "emitida" : "recibida";
    const monto = Math.abs(mov.monto);
    const tol = Math.max(opciones.toleranciaAbs, monto * opciones.toleranciaPct);

    const candidatos = registros
      .filter(
        (r) => direccion(r.comprobante, rfc) === dir && r.comprobante.tipo === "I",
      )
      .map((r) => ({
        clave: r.clave,
        dm: Math.abs(montoMxn(r) - monto),
        dd: diasEntre(r.comprobante.fechaDia, mov.fecha),
      }))
      .filter((c) => c.dm <= tol && c.dd >= -3 && c.dd <= opciones.ventanaDias)
      .sort((a, b) => Math.abs(a.dd) - Math.abs(b.dd) || a.dm - b.dm);

    const tipo: TipoMatch =
      candidatos.length === 0
        ? "sin_cfdi"
        : candidatos.length === 1
          ? "unico"
          : "ambiguo";
    const best = candidatos[0];

    return {
      movimiento: mov,
      lado: cobro ? "cobro" : "pago",
      tipo,
      sugerido: best ? best.clave : null,
      candidatos: candidatos.map((c) => c.clave),
      difMonto: best ? redondea(best.dm) : null,
      difDias: best ? best.dd : null,
    };
  });

  const unicos = conciliaciones.filter((c) => c.tipo === "unico").length;
  const ambiguos = conciliaciones.filter((c) => c.tipo === "ambiguo").length;
  const sinCfdi = conciliaciones.filter((c) => c.tipo === "sin_cfdi").length;
  const montoConciliado = conciliaciones
    .filter((c) => c.tipo === "unico")
    .reduce((a, c) => a + Math.abs(c.movimiento.monto), 0);

  return {
    conciliaciones,
    resumen: {
      total: conciliaciones.length,
      unicos,
      ambiguos,
      sinCfdi,
      montoConciliado: redondea(montoConciliado),
    },
  };
}
