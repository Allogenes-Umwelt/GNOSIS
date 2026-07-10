import { describe, expect, it } from "vitest";
import { conciliarBanco } from "@/capacidades/conciliacion";
import { claveComprobante } from "@/capacidades/finanzas";
import type { MovimientoBanco } from "@/lib/banco/bbva";
import { parsearCfdi } from "@/lib/cfdi/parse";
import type { RegistroCfdi } from "@/lib/cfdi/tipos";

const OP = "AAA010101AAA";
const TFD = 'xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"';

function reg(emisor: string, receptor: string, fecha: string, total: number, uuid: string): RegistroCfdi {
  const xml = `<cfdi:Comprobante Version="4.0" Fecha="${fecha}T00:00:00" Moneda="MXN" SubTotal="${total}" Total="${total}" TipoDeComprobante="I">
    <cfdi:Emisor Rfc="${emisor}" Nombre="E"/><cfdi:Receptor Rfc="${receptor}" Nombre="R"/>
    <cfdi:Complemento><tfd:TimbreFiscalDigital ${TFD} UUID="${uuid}"/></cfdi:Complemento>
  </cfdi:Comprobante>`;
  const comprobante = parsearCfdi(xml);
  return { clave: claveComprobante(comprobante), comprobante, importadoEn: 0 };
}

function mov(fecha: string, monto: number, descripcion: string): MovimientoBanco {
  return { fecha, descripcion, monto, saldo: null };
}

// Operator's emitida to a client (recurring same amount in May), and two
// recibidas from suppliers.
const REGISTROS: RegistroCfdi[] = [
  reg(OP, "CLI010101CL1", "2026-02-01", 135716.99, "E-FEB"),
  reg(OP, "CLI010101CL1", "2026-05-01", 135716.99, "E-MAY"), // recurring, future
  reg("PRV010101PR1", OP, "2026-01-30", 23560, "R-1"),
  reg("PRV020101PR2", OP, "2026-02-03", 7540, "R-2"),
];

describe("conciliarBanco", () => {
  it("matches deposits to emitidas and withdrawals to recibidas", () => {
    const movs = [
      mov("2026-02-05", 135717.0, "TEF RECIBIDO HSBC"), // +1¢ vs CFDI
      mov("2026-02-03", -23560.0, "PAGO CUENTA DE TERCERO"),
      mov("2026-02-05", -7540.0, "SPEI ENVIADO"),
      mov("2026-02-17", -11111.0, "P14 SAT"), // no CFDI
    ];
    const { conciliaciones: c, resumen } = conciliarBanco(movs, REGISTROS, OP);

    expect(resumen).toMatchObject({ total: 4, unicos: 3, ambiguos: 0, sinCfdi: 1 });

    // Deposit → emitida, one-cent difference tolerated, future invoice excluded.
    expect(c[0]).toMatchObject({ lado: "cobro", tipo: "unico", sugerido: "E-FEB" });
    expect(c[0].candidatos).toEqual(["E-FEB"]);
    expect(c[0].difMonto).toBeCloseTo(0.01, 2);

    expect(c[1]).toMatchObject({ lado: "pago", tipo: "unico", sugerido: "R-1" });
    expect(c[2]).toMatchObject({ lado: "pago", tipo: "unico", sugerido: "R-2" });
    expect(c[3]).toMatchObject({ tipo: "sin_cfdi", sugerido: null, candidatos: [] });
  });

  it("does not match a payment against a future invoice", () => {
    // A May-only corpus, paid in February → nothing (payment precedes invoice).
    const soloFuturo = [REGISTROS[1]];
    const { conciliaciones } = conciliarBanco(
      [mov("2026-02-05", 135717.0, "TEF")],
      soloFuturo,
      OP,
    );
    expect(conciliaciones[0].tipo).toBe("sin_cfdi");
  });

  it("flags ambiguity when two invoices fit, closest date first", () => {
    const dos = [
      reg("PRV030101PR3", OP, "2026-02-10", 1000, "A"),
      reg("PRV040101PR4", OP, "2026-02-11", 1000, "B"),
    ];
    const { conciliaciones } = conciliarBanco([mov("2026-02-12", -1000, "SPEI")], dos, OP);
    expect(conciliaciones[0].tipo).toBe("ambiguo");
    expect(conciliaciones[0].sugerido).toBe("B"); // 1 day vs 2 days
    expect(conciliaciones[0].candidatos).toEqual(["B", "A"]);
  });
});
