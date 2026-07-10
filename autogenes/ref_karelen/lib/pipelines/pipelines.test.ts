import { describe, expect, it } from "vitest";
import { pipelineCfdi } from "@/lib/pipelines/cfdi";
import { pipelineCsv } from "@/lib/pipelines/csv";
import { pipelineIcs } from "@/lib/pipelines/ics";
import { detectarPipeline } from "@/lib/pipelines/registry";

const CFDI = `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="184" Fecha="2026-06-12T10:30:00" Total="1160.00" Moneda="MXN">
  <cfdi:Emisor Rfc="TME840315KT6" Nombre="TELEFONOS DE MEXICO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="JULIO SAENZ" UsoCFDI="G03"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="AAA-BBB-CCC"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const CSV = `Fecha,Concepto,Cargo/Abono
12/03/2026,OXXO MONTERREY,-150.50
13/03/2026,NOMINA QUINCENAL,"8,000.00"
14/03/2026,CFE PAGO SERVICIO,-780.00`;

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260812
SUMMARY:Renovación de póliza${" "}
 del auto
END:VEVENT
BEGIN:VEVENT
DTSTART:20260705T090000Z
SUMMARY:Cita SAT
END:VEVENT
END:VCALENDAR`;

describe("registry", () => {
  it("routes by sniff, first match wins", () => {
    expect(detectarPipeline("factura.xml", CFDI)?.id).toBe("cfdi");
    expect(detectarPipeline("estado.csv", CSV)?.id).toBe("csv");
    expect(detectarPipeline("agenda.ics", ICS)?.id).toBe("ics");
    expect(detectarPipeline("otro.xml", "<html/>")).toBeUndefined();
  });
});

describe("pipeline CFDI", () => {
  it("extracts parties, dated invoice event and cited digest", () => {
    const r = pipelineCfdi.procesar("factura.xml", CFDI);
    expect(r.fragmentos).toHaveLength(1);
    expect(r.fragmentos[0].texto).toContain("UUID: AAA-BBB-CCC");
    expect(r.entidades.map((e) => e.nombre)).toEqual([
      "TELEFONOS DE MEXICO",
      "JULIO SAENZ",
    ]);
    expect(r.entidades[0].resumen).toContain("TME840315KT6");
    expect(r.eventos[0]).toMatchObject({
      titulo: "Factura A-184 de TELEFONOS DE MEXICO por $1160.00 MXN",
      fecha: "2026-06-12",
      precision: "dia",
      fragmentos: [0],
    });
  });

  it("rejects incomplete XML with an operator-words error", () => {
    expect(() => pipelineCfdi.procesar("x.xml", "<Comprobante/>")).toThrow(
      /CFDI completo/,
    );
  });

  it("still detects a CFDI when a large prolog precedes <Comprobante>", () => {
    const relleno = `<!-- ${"x".repeat(3000)} -->\n`;
    expect(detectarPipeline("factura.xml", relleno + CFDI)?.id).toBe("cfdi");
  });
});

describe("pipeline CSV", () => {
  it("detects columns, normalizes rows and computes the summary", () => {
    const r = pipelineCsv.procesar("estado.csv", CSV);
    expect(r.fragmentos[0].texto).toContain("3 movimientos del 2026-03-12 al 2026-03-14");
    expect(r.fragmentos[0].texto).toContain("Cargos: 2 por -930.50");
    expect(r.fragmentos[0].texto).toContain("Abonos: 1 por 8000.00");
    expect(r.fragmentos[1].texto).toContain("2026-03-12 · OXXO MONTERREY · -150.50");
    expect(r.entidades).toHaveLength(0);
  });

  it("chunks long statements into paged fragments", () => {
    const filas = Array.from(
      { length: 40 },
      (_, i) => `${String(i + 1).padStart(2, "0")}/01/2026,MOV ${i},-1.00`,
    );
    const r = pipelineCsv.procesar("largo.csv", `F,C,M\n${filas.slice(0, 28).join("\n")}`);
    // 1 summary + 2 chunks of 15/13
    expect(r.fragmentos).toHaveLength(3);
    expect(r.fragmentos[2].pagina).toBe(3);
  });

  it("docks a non-ledger table as generic citable fragments", () => {
    // No date/amount columns → generic-table fallback (not rejected).
    const r = pipelineCsv.procesar("x.csv", "a,b\nuno,dos\ntres,cuatro");
    expect(r.fragmentos[0].texto).toContain("3 filas");
    expect(r.fragmentos[1].texto).toContain("uno · dos");
    expect(r.entidades).toHaveLength(0);
  });

  it("keeps rows whose quoted concept wraps across a newline (PL1)", () => {
    const r = pipelineCsv.procesar(
      "wrap.csv",
      'Fecha,Concepto,Monto\n12/03/2026,"PAGO A\nPROVEEDOR",-150.00\n13/03/2026,OXXO,-80.00',
    );
    expect(r.fragmentos[0].texto).toContain("2 movimientos");
    expect(r.fragmentos[1].texto).toContain("PAGO A PROVEEDOR");
  });

  it("never picks a data column as the concept column (PL2)", () => {
    // Amount first, date last, sparse reference in the middle.
    const r = pipelineCsv.procesar(
      "orden.csv",
      "Monto,Ref,Fecha\n-150.00,OXXO,12/03/2026\n-80.00,CFE,13/03/2026",
    );
    expect(r.fragmentos[1].texto).toContain("· OXXO · -150.00");
    expect(r.fragmentos[1].texto).not.toContain("-150.00 · -150.00");
  });

  it("reads an integer-only amount column instead of rejecting it (PL4)", () => {
    const r = pipelineCsv.procesar(
      "enteros.csv",
      "Fecha,Monto\n12/03/2026,2026\n13/03/2026,2027",
    );
    expect(r.fragmentos[0].texto).toContain("2 movimientos");
  });
});

describe("pipeline ICS", () => {
  it("unfolds continuations and docks each VEVENT citing its fragment", () => {
    const r = pipelineIcs.procesar("agenda.ics", ICS);
    expect(r.eventos).toHaveLength(2);
    expect(r.eventos[0]).toMatchObject({
      titulo: "Cita SAT",
      fecha: "2026-07-05",
      fragmentos: [0],
    });
    expect(r.eventos[1].titulo).toBe("Renovación de póliza del auto");
    expect(r.eventos[1].fecha).toBe("2026-08-12");
    expect(r.fragmentos[0].texto).toContain("2026-08-12 · Renovación de póliza del auto");
  });

  it("rejects calendars without readable events", () => {
    expect(() =>
      pipelineIcs.procesar("x.ics", "BEGIN:VCALENDAR\nEND:VCALENDAR"),
    ).toThrow(/citas con fecha/);
  });
});
