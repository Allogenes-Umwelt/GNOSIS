import { describe, expect, it } from "vitest";
import { parsearCfdi } from "@/lib/cfdi/parse";
import { ComprobanteCfdiSchema } from "@/lib/cfdi/tipos";

const TFD = 'xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"';

// Ingreso PUE, IVA 16% trasladado + ISR retenido (honorarios-style).
const INGRESO = `<?xml version="1.0"?>
<cfdi:Comprobante Version="4.0" Serie="A" Folio="184" Fecha="2026-06-12T10:30:00" FormaPago="03" MetodoPago="PUE" Moneda="MXN" TipoCambio="1" SubTotal="10000.00" Descuento="0" Total="11040.00" TipoDeComprobante="I" LugarExpedicion="64000">
  <cfdi:Emisor Rfc="TME840315KT6" Nombre="TELEFONOS DE MEXICO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="GRUPO ALVEAR" UsoCFDI="G03" RegimenFiscalReceptor="601"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="81111500" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicios de consultoria" ValorUnitario="10000.00" Importe="10000.00" Descuento="0" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosRetenidos="560.00" TotalImpuestosTrasladados="1600.00">
    <cfdi:Retenciones><cfdi:Retencion Impuesto="001" Importe="560.00"/></cfdi:Retenciones>
    <cfdi:Traslados><cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/></cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital ${TFD} UUID="AAA-BBB-CCC" FechaTimbrado="2026-06-12T10:31:00" NoCertificadoSAT="00001000000504465028"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const PPD_USD = `<cfdi:Comprobante Version="4.0" Folio="200" Fecha="2026-05-03T09:00:00" MetodoPago="PPD" Moneda="USD" TipoCambio="18.50" SubTotal="1000.00" Total="1160.00" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="ACME GLOBAL"/>
  <cfdi:Receptor Rfc="XEXX010101000" Nombre="CLIENTE EXTRANJERO" UsoCFDI="G03"/>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00"><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital ${TFD} UUID="USD-1"/></cfdi:Complemento>
</cfdi:Comprobante>`;

const PAGO = `<cfdi:Comprobante Version="4.0" Fecha="2026-07-01T12:00:00" Moneda="XXX" SubTotal="0" Total="0" TipoDeComprobante="P">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="ACME GLOBAL"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="GRUPO ALVEAR" UsoCFDI="CP01"/>
  <cfdi:Complemento>
    <pago20:Pagos xmlns:pago20="http://www.sat.gob.mx/Pagos20">
      <pago20:Pago FechaPago="2026-07-01T00:00:00" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="11040.00">
        <pago20:DoctoRelacionado IdDocumento="AAA-BBB-CCC" MonedaDR="MXN" NumParcialidad="1" ImpSaldoAnt="11040.00" ImpPagado="11040.00" ImpSaldoInsoluto="0.00"/>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital ${TFD} UUID="PAY-1"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const EGRESO = `<cfdi:Comprobante Version="4.0" Folio="NC1" Fecha="2026-06-20T10:00:00" MetodoPago="PUE" Moneda="MXN" SubTotal="500.00" Total="580.00" TipoDeComprobante="E">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="ACME GLOBAL"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="GRUPO ALVEAR" UsoCFDI="G02"/>
  <cfdi:Impuestos TotalImpuestosTrasladados="80.00"><cfdi:Traslados><cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="80.00"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital ${TFD} UUID="NC-1"/></cfdi:Complemento>
</cfdi:Comprobante>`;

// Same shape, no namespace prefix — the parser must be prefix-agnostic.
const SIN_PREFIJO = `<Comprobante Version="4.0" Fecha="2026-01-05T00:00:00" MetodoPago="PUE" Moneda="MXN" SubTotal="100.00" Total="116.00" TipoDeComprobante="I">
  <Emisor Rfc="AAA010101AAA" Nombre="ACME"/><Receptor Rfc="XAXX010101000" Nombre="X"/>
  <Complemento><TimbreFiscalDigital UUID="NP-1"/></Complemento>
</Comprobante>`;

// Escaped XML entities in free-text attributes (real invoices carry
// `&amp;` in company names and `&quot;` inside quoted descriptions).
const CON_ENTIDADES = `<cfdi:Comprobante Version="4.0" Folio="9" Fecha="2026-03-01T00:00:00" MetodoPago="PUE" Moneda="MXN" SubTotal="100.00" Total="116.00" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="WORK &amp; CO PRADO NORTE" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="M&amp;M SA" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto Descripcion="Soporte al proyecto &quot;Innovacion&quot; &lt;fase 1&gt;" Cantidad="1" ValorUnitario="100.00" Importe="100.00"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="16.00"><cfdi:Traslados><cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16.00"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital ${TFD} UUID="ENT-1"/></cfdi:Complemento>
</cfdi:Comprobante>`;

describe("parsearCfdi", () => {
  it("parses an Ingreso PUE with traslado and retención (contract-valid)", () => {
    const c = parsearCfdi(INGRESO);
    expect(() => ComprobanteCfdiSchema.parse(c)).not.toThrow();
    expect(c.tipo).toBe("I");
    expect(c.metodoPago).toBe("PUE");
    expect(c.fechaDia).toBe("2026-06-12");
    expect(c.subTotal).toBe(10000);
    expect(c.total).toBe(11040);
    expect(c.emisor).toMatchObject({ rfc: "TME840315KT6", nombre: "TELEFONOS DE MEXICO" });
    expect(c.receptor).toMatchObject({ rfc: "XAXX010101000", nombre: "GRUPO ALVEAR", usoCfdi: "G03" });
    expect(c.conceptos).toHaveLength(1);
    expect(c.conceptos[0]).toMatchObject({ importe: 10000, claveProdServ: "81111500" });
    // Comprobante-level totals, NOT double-counted with the concepto block.
    expect(c.impuestos.totalTrasladados).toBe(1600);
    expect(c.impuestos.trasladados[0]).toMatchObject({ impuesto: "002", tasaOCuota: 0.16, importe: 1600 });
    expect(c.impuestos.totalRetenidos).toBe(560);
    expect(c.impuestos.retenidos[0]).toMatchObject({ impuesto: "001", importe: 560 });
    expect(c.timbre?.uuid).toBe("AAA-BBB-CCC");
  });

  it("reads PPD + foreign currency with exchange rate", () => {
    const c = parsearCfdi(PPD_USD);
    expect(c.metodoPago).toBe("PPD");
    expect(c.moneda).toBe("USD");
    expect(c.tipoCambio).toBe(18.5);
    expect(c.impuestos.totalTrasladados).toBe(160);
  });

  it("reads a payment complement (type P) with its settled document", () => {
    const c = parsearCfdi(PAGO);
    expect(c.tipo).toBe("P");
    expect(c.pagos).toHaveLength(1);
    expect(c.pagos[0]).toMatchObject({ fecha: "2026-07-01", monto: 11040, moneda: "MXN" });
    expect(c.pagos[0].relacionados[0]).toMatchObject({ uuid: "AAA-BBB-CCC", pagado: 11040, parcialidad: 1 });
  });

  it("recognizes an Egreso (nota de crédito)", () => {
    expect(parsearCfdi(EGRESO).tipo).toBe("E");
  });

  it("is namespace-prefix agnostic", () => {
    const c = parsearCfdi(SIN_PREFIJO);
    expect(c.tipo).toBe("I");
    expect(c.total).toBe(116);
    expect(c.emisor.rfc).toBe("AAA010101AAA");
    expect(c.timbre?.uuid).toBe("NP-1");
  });

  it("decodes XML entities in names and descriptions", () => {
    const c = parsearCfdi(CON_ENTIDADES);
    expect(c.emisor.nombre).toBe("WORK & CO PRADO NORTE");
    expect(c.receptor.nombre).toBe("M&M SA");
    expect(c.conceptos[0].descripcion).toBe('Soporte al proyecto "Innovacion" <fase 1>');
  });

  it("throws on non-CFDI or incomplete XML with operator words", () => {
    expect(() => parsearCfdi("<html/>")).toThrow(/no es un CFDI/i);
    expect(() =>
      parsearCfdi('<cfdi:Comprobante Fecha="2026-01-01T00:00:00"><cfdi:Emisor Rfc="A"/></cfdi:Comprobante>'),
    ).toThrow(/CFDI completo/i);
  });
});
