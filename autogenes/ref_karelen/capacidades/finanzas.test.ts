import { describe, expect, it } from "vitest";
import {
  cartera,
  carteraPagar,
  claveComprobante,
  curvaCobro,
  direccion,
  inferirRfcOperador,
  posicionFiscal,
  reconciliarCartera,
  reconciliarPagables,
  resumenCobranza,
  resumenGasto,
} from "@/capacidades/finanzas";
import { parsearCfdi } from "@/lib/cfdi/parse";
import type { RegistroCfdi } from "@/lib/cfdi/tipos";

const OP = "AAA010101AAA";
const C1 = "BBB010101BB1"; // CLIENTE UNO
const C2 = "CCC010101CC2"; // CLIENTE DOS
const PROV = "DDD010101DD3"; // PROVEEDOR

interface Args {
  emisor: string;
  receptor: string;
  receptorNombre?: string;
  fecha: string; // YYYY-MM-DD
  tipo?: string;
  metodo?: "PUE" | "PPD";
  subtotal: number;
  iva: number;
  total: number;
  retenido?: number;
  moneda?: string;
  tipoCambio?: number;
  uuid: string;
}

function cfdi(o: Args): string {
  const st = o.subtotal.toFixed(2);
  const iva = o.iva.toFixed(2);
  const retAttr = o.retenido ? `TotalImpuestosRetenidos="${o.retenido.toFixed(2)}" ` : "";
  const retBlock = o.retenido
    ? `<cfdi:Retenciones><cfdi:Retencion Impuesto="001" Importe="${o.retenido.toFixed(2)}"/></cfdi:Retenciones>`
    : "";
  return `<cfdi:Comprobante Version="4.0" Fecha="${o.fecha}T00:00:00" ${o.metodo ? `MetodoPago="${o.metodo}" ` : ""}Moneda="${o.moneda ?? "MXN"}" ${o.tipoCambio ? `TipoCambio="${o.tipoCambio}" ` : ""}SubTotal="${st}" Total="${o.total.toFixed(2)}" TipoDeComprobante="${o.tipo ?? "I"}">
    <cfdi:Emisor Rfc="${o.emisor}" Nombre="EMISOR ${o.emisor}" RegimenFiscal="601"/>
    <cfdi:Receptor Rfc="${o.receptor}" Nombre="${o.receptorNombre ?? "RECEPTOR"}" UsoCFDI="G03"/>
    <cfdi:Conceptos><cfdi:Concepto Descripcion="Servicio" Cantidad="1" ValorUnitario="${st}" Importe="${st}">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="${st}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}"/></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto></cfdi:Conceptos>
    <cfdi:Impuestos ${retAttr}TotalImpuestosTrasladados="${iva}">
      ${retBlock}
      <cfdi:Traslados><cfdi:Traslado Base="${st}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}"/></cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${o.uuid}"/></cfdi:Complemento>
  </cfdi:Comprobante>`;
}

function reg(o: Args): RegistroCfdi {
  const comprobante = parsearCfdi(cfdi(o));
  return { clave: claveComprobante(comprobante), comprobante, importadoEn: 0 };
}

// inv1 PUE (C1), inv2 PPD (C2), inv3 PUE (C1), nota de crédito (C1), gasto (PROV).
const CORPUS: RegistroCfdi[] = [
  reg({ emisor: OP, receptor: C1, receptorNombre: "CLIENTE UNO", fecha: "2026-01-10", metodo: "PUE", subtotal: 10000, iva: 1600, total: 11600, uuid: "U-1" }),
  reg({ emisor: OP, receptor: C2, receptorNombre: "CLIENTE DOS", fecha: "2026-02-15", metodo: "PPD", subtotal: 20000, iva: 3200, total: 23200, uuid: "U-2" }),
  reg({ emisor: OP, receptor: C1, receptorNombre: "CLIENTE UNO", fecha: "2026-01-20", metodo: "PUE", subtotal: 5000, iva: 800, total: 5800, uuid: "U-3" }),
  reg({ emisor: OP, receptor: C1, receptorNombre: "CLIENTE UNO", fecha: "2026-01-25", tipo: "E", metodo: "PUE", subtotal: 1000, iva: 160, total: 1160, uuid: "U-4" }),
  reg({ emisor: PROV, receptor: OP, fecha: "2026-01-05", metodo: "PUE", subtotal: 1000, iva: 160, total: 1160, uuid: "U-5" }),
];

describe("finanzas — resumenCobranza", () => {
  it("infers the operator RFC as the ubiquitous party", () => {
    expect(inferirRfcOperador(CORPUS)).toBe(OP);
  });

  it("classifies direction relative to the operator", () => {
    expect(direccion(CORPUS[0].comprobante, OP)).toBe("emitida");
    expect(direccion(CORPUS[4].comprobante, OP)).toBe("recibida");
    expect(direccion(CORPUS[0].comprobante, null)).toBe("ajena");
  });

  it("aggregates billed income net of credit notes", () => {
    const r = resumenCobranza(CORPUS, OP);
    expect(r.numFacturas).toBe(3);
    expect(r.ingresoFacturado).toBe(39440); // 40600 gross − 1160 nota
    expect(r.notasCredito).toBe(1160);
    expect(r.ivaTrasladado).toBe(5600);
    expect(r.ticketPromedio).toBeCloseTo(13146.67, 2);
  });

  it("splits collection into immediate (PUE) and deferred (PPD)", () => {
    const r = resumenCobranza(CORPUS, OP);
    expect(r.cobradoPue).toBe(17400); // inv1 + inv3
    expect(r.facturadoPpd).toBe(23200); // inv2
    // No payment complements in the corpus yet → all PPD is outstanding.
    expect(r.cobradoPpd).toBe(0);
    expect(r.porCobrar).toBe(23200);
    expect(r.numDiferidas).toBe(1);
    expect(r.numPendientes).toBe(1);
  });

  it("measures client concentration (HHI over billed income)", () => {
    const r = resumenCobranza(CORPUS, OP);
    expect(r.clientes).toHaveLength(2);
    expect(r.clientes[0].rfc).toBe(C2); // most concentrated first
    expect(r.clientes[0].share).toBeCloseTo(23200 / 40600, 4);
    expect(r.topShare).toBeCloseTo(0.5714, 3);
    expect(r.hhi).toBeCloseTo(0.5102, 3);
  });

  it("summarizes received expenses separately", () => {
    const r = resumenCobranza(CORPUS, OP);
    expect(r.numRecibidas).toBe(1);
    expect(r.gastoRecibido).toBe(1160);
    expect(r.ivaAcreditable).toBe(160);
  });

  it("builds an ascending monthly income series", () => {
    const r = resumenCobranza(CORPUS, OP);
    expect(r.porMes).toEqual([
      { mes: "2026-01", ingreso: 17400, count: 2 },
      { mes: "2026-02", ingreso: 23200, count: 1 },
    ]);
  });

  it("narrows to a date range", () => {
    const r = resumenCobranza(CORPUS, OP, { desde: "2026-02-01", hasta: "2026-02-28" });
    expect(r.numFacturas).toBe(1);
    expect(r.ingresoFacturado).toBe(23200);
    expect(r.cobradoPue).toBe(0);
  });

  it("returns a well-formed empty summary when the operator is unknown", () => {
    const r = resumenCobranza(CORPUS, null);
    expect(r.numFacturas).toBe(0);
    expect(r.ingresoFacturado).toBe(0);
    expect(r.clientes).toEqual([]);
    expect(r.hhi).toBe(0);
  });

  it("sums retenciones withheld by clients", () => {
    const honorarios = [
      reg({ emisor: OP, receptor: C1, fecha: "2026-03-01", metodo: "PUE", subtotal: 10000, iva: 1600, retenido: 2067, total: 9533, uuid: "H-1" }),
    ];
    const r = resumenCobranza(honorarios, OP);
    expect(r.retenidoTotal).toBe(2067);
    expect(r.ivaTrasladado).toBe(1600);
  });

  it("converts foreign currency to MXN via the exchange rate", () => {
    const usd = [
      reg({ emisor: OP, receptor: C2, fecha: "2026-04-01", metodo: "PUE", moneda: "USD", tipoCambio: 20, subtotal: 100, iva: 16, total: 116, uuid: "USD-1" }),
    ];
    const r = resumenCobranza(usd, OP);
    expect(r.multiMoneda).toBe(true);
    expect(r.ingresoFacturado).toBe(2320); // 116 * 20
    expect(r.ivaTrasladado).toBe(320); // 16 * 20
  });
});

interface ArgsPago {
  emisor: string;
  receptor: string;
  fechaPago: string; // YYYY-MM-DD
  monto: number;
  docto: string; // UUID of the invoice being settled
  uuid: string;
}

function pago(o: ArgsPago): string {
  const m = o.monto.toFixed(2);
  return `<cfdi:Comprobante Version="4.0" Fecha="${o.fechaPago}T12:00:00" Moneda="XXX" SubTotal="0" Total="0" TipoDeComprobante="P">
    <cfdi:Emisor Rfc="${o.emisor}" Nombre="EMISOR"/>
    <cfdi:Receptor Rfc="${o.receptor}" Nombre="RECEPTOR" UsoCFDI="CP01"/>
    <cfdi:Complemento>
      <pago20:Pagos xmlns:pago20="http://www.sat.gob.mx/Pagos20">
        <pago20:Pago FechaPago="${o.fechaPago}T12:00:00" MonedaP="MXN" TipoCambioP="1" Monto="${m}">
          <pago20:DoctoRelacionado IdDocumento="${o.docto}" MonedaDR="MXN" NumParcialidad="1" ImpSaldoAnt="${m}" ImpPagado="${m}" ImpSaldoInsoluto="0.00"/>
        </pago20:Pago>
      </pago20:Pagos>
      <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${o.uuid}"/>
    </cfdi:Complemento>
  </cfdi:Comprobante>`;
}

function regPago(o: ArgsPago): RegistroCfdi {
  const comprobante = parsearCfdi(pago(o));
  return { clave: claveComprobante(comprobante), comprobante, importadoEn: 0 };
}

// Three PPD invoices emitted the same day; A and C get paid, B stays open.
const DIFERIDAS: RegistroCfdi[] = [
  reg({ emisor: OP, receptor: C1, fecha: "2026-01-01", metodo: "PPD", subtotal: 1000, iva: 0, total: 1000, uuid: "A" }),
  reg({ emisor: OP, receptor: C1, fecha: "2026-01-01", metodo: "PPD", subtotal: 1000, iva: 0, total: 1000, uuid: "B" }),
  reg({ emisor: OP, receptor: C1, fecha: "2026-01-01", metodo: "PPD", subtotal: 1000, iva: 0, total: 1000, uuid: "C" }),
  regPago({ emisor: OP, receptor: C1, fechaPago: "2026-01-31", monto: 1000, docto: "A", uuid: "PA" }),
  regPago({ emisor: OP, receptor: C1, fechaPago: "2026-03-02", monto: 1000, docto: "C", uuid: "PC" }),
];

describe("finanzas — F3 collection intelligence", () => {
  it("reconciles a PPD invoice against its payment complement", () => {
    const conPago = [
      ...CORPUS,
      regPago({ emisor: OP, receptor: C2, fechaPago: "2026-03-15", monto: 23200, docto: "U-2", uuid: "PAY-1" }),
    ];
    const cart = reconciliarCartera(conPago, OP);
    expect(cart).toHaveLength(1); // only inv2 is deferred
    expect(cart[0]).toMatchObject({ estado: "cobrada", cobrado: 23200, saldo: 0, diasACobro: 28 });

    const r = resumenCobranza(conPago, OP);
    expect(r.cobradoPpd).toBe(23200);
    expect(r.porCobrar).toBe(0);
    expect(r.numPendientes).toBe(0);
  });

  it("computes a Kaplan-Meier collection curve with censoring", () => {
    const c = curvaCobro(DIFERIDAS, OP, "2026-04-15");
    expect(c.n).toBe(3);
    expect(c.cobradas).toBe(2);
    expect(c.pendientes).toBe(1);
    expect(c.mediana).toBe(60);
    expect(c.puntos).toEqual([
      { dia: 0, supervivencia: 1 },
      { dia: 30, supervivencia: 0.6667 },
      { dia: 60, supervivencia: 0.3333 },
    ]);
  });

  it("ages the outstanding receivable balance", () => {
    const tramos = cartera(DIFERIDAS, OP, "2026-04-15");
    const total = tramos.reduce((a, t) => a + t.monto, 0);
    expect(total).toBe(1000); // only B remains open
    expect(tramos.find((t) => t.rango === "90+")).toMatchObject({ monto: 1000, count: 1 });
    expect(tramos.find((t) => t.rango === "0–30")).toMatchObject({ monto: 0, count: 0 });
  });

  it("drops cancelled invoices from income when SAT Metadata says so", () => {
    const x = [
      reg({ emisor: OP, receptor: C1, fecha: "2026-05-01", metodo: "PUE", subtotal: 5000, iva: 800, total: 5800, uuid: "X-1" }),
    ];
    const sin = resumenCobranza(x, OP);
    expect(sin.numFacturas).toBe(1);
    expect(sin.ingresoFacturado).toBe(5800);

    const con = resumenCobranza(x, OP, undefined, { "X-1": { estatus: "cancelado" } });
    expect(con.numFacturas).toBe(0);
    expect(con.ingresoFacturado).toBe(0);
    expect(con.canceladas).toBe(1);
    expect(con.montoCancelado).toBe(5800);
  });
});

const P1 = "PRA010101PP1"; // PROVEEDOR UNO
const P2 = "PRB010101PP2"; // PROVEEDOR DOS

// Operator receives from two suppliers: one PUE (paid), one PPD (owed, with
// a retención the operator must remit).
const GASTOS: RegistroCfdi[] = [
  reg({ emisor: P1, receptor: OP, fecha: "2026-01-05", metodo: "PUE", subtotal: 1000, iva: 160, total: 1160, uuid: "G-1" }),
  reg({ emisor: P2, receptor: OP, fecha: "2026-02-10", metodo: "PPD", subtotal: 2000, iva: 320, retenido: 300, total: 2020, uuid: "G-2" }),
];

describe("finanzas — F4 expense and payables", () => {
  it("summarizes expenses, suppliers and retenciones to remit", () => {
    const g = resumenGasto(GASTOS, OP);
    expect(g.numGastos).toBe(2);
    expect(g.gastoTotal).toBe(3180); // 1160 + 2020
    expect(g.ivaAcreditable).toBe(480); // 160 + 320
    expect(g.retencionesAEnterar).toBe(300);
    expect(g.pagadoPue).toBe(1160);
    expect(g.porPagar).toBe(2020); // G-2 unpaid
    expect(g.numPorPagar).toBe(1);
    expect(g.proveedores[0].rfc).toBe(P2); // largest supplier first
    expect(g.proveedores).toHaveLength(2);
  });

  it("reconciles payables and ages what the operator owes", () => {
    const pend = reconciliarPagables(GASTOS, OP);
    expect(pend).toHaveLength(1);
    expect(pend[0]).toMatchObject({ saldo: 2020, estado: "pendiente" });
    expect(pend[0].contraparte).toContain(P2); // the supplier (emisor)

    const tramos = carteraPagar(GASTOS, OP, "2026-04-15");
    expect(tramos.reduce((a, t) => a + t.monto, 0)).toBe(2020);
    expect(tramos.find((t) => t.rango === "61–90")).toMatchObject({ monto: 2020, count: 1 });
  });

  it("computes the net IVA position from both sides", () => {
    const mixto = [
      reg({ emisor: OP, receptor: C1, fecha: "2026-03-01", metodo: "PUE", subtotal: 10000, iva: 1600, total: 11600, uuid: "M-1" }),
      reg({ emisor: P1, receptor: OP, fecha: "2026-03-05", metodo: "PUE", subtotal: 5000, iva: 800, total: 5800, uuid: "M-2" }),
    ];
    const pf = posicionFiscal(resumenCobranza(mixto, OP), resumenGasto(mixto, OP));
    expect(pf.ivaTrasladado).toBe(1600);
    expect(pf.ivaAcreditable).toBe(800);
    expect(pf.ivaACargo).toBe(800); // 1600 − 800
  });
});

describe("finanzas — F4b bank match as payment", () => {
  const ppd = [
    reg({ emisor: OP, receptor: C1, fecha: "2026-01-10", metodo: "PPD", subtotal: 10000, iva: 1600, total: 11600, uuid: "BK-1" }),
  ];
  const pagosBanco = [{ clave: "BK-1", fecha: "2026-02-01", monto: 11600 }];

  it("settles a PPD invoice from a confirmed bank movement", () => {
    expect(resumenCobranza(ppd, OP).porCobrar).toBe(11600);
    const con = resumenCobranza(ppd, OP, undefined, undefined, pagosBanco);
    expect(con.cobradoPpd).toBe(11600);
    expect(con.porCobrar).toBe(0);
    expect(con.numPendientes).toBe(0);
  });

  it("moves the invoice onto the collected side of the curve", () => {
    const c = curvaCobro(ppd, OP, "2026-03-01", undefined, pagosBanco);
    expect(c.cobradas).toBe(1);
    expect(c.pendientes).toBe(0);
  });

  it("clears it from the receivables aging", () => {
    const antes = cartera(ppd, OP, "2026-03-01");
    expect(antes.reduce((a, t) => a + t.monto, 0)).toBe(11600);
    const despues = cartera(ppd, OP, "2026-03-01", undefined, pagosBanco);
    expect(despues.reduce((a, t) => a + t.monto, 0)).toBe(0);
  });
});
