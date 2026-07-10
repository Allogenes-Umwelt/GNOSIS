import { describe, expect, it } from "vitest";
import { parsearEstadoBbva, type Renglon } from "@/lib/banco/bbva";

// Synthetic BBVA layout — fictional amounts, real column geometry.
// Amount X: cargo ~360–390, abono ~415, saldo operación ~485, saldo liq ~553.
const ESTADO: Renglon[] = [
  [{ x: 310, str: "Periodo" }, { x: 481, str: "DEL 01/03/2026 AL 31/03/2026" }],
  [{ x: 316, str: "Saldo de Liquidación Inicial" }, { x: 559, str: "10,000.00" }],
  [{ x: 316, str: "Saldo Final (+)" }, { x: 564, str: "11,450.00" }],
  [{ x: 10, str: "Detalle de Movimientos Realizados" }],
  [{ x: 18, str: "OPER" }, { x: 51, str: "LIQ" }, { x: 86, str: "COD. DESCRIPCIÓN" }, { x: 362, str: "CARGOS" }, { x: 423, str: "ABONOS" }],
  // cargo with saldo
  [{ x: 10, str: "03/MAR" }, { x: 53, str: "03/MAR N06 PAGO CUENTA DE TERCERO" }, { x: 361, str: "1,000.00" }, { x: 485, str: "9,000.00" }, { x: 553, str: "9,000.00" }],
  // abono, no saldo shown on the row
  [{ x: 10, str: "05/MAR" }, { x: 53, str: "05/MAR T09 TEF RECIBIDO" }, { x: 415, str: "5,000.00" }],
  // cargo + continuation reference line
  [{ x: 10, str: "05/MAR" }, { x: 53, str: "05/MAR T17 SPEI ENVIADO BANCO" }, { x: 366, str: "2,500.00" }, { x: 485, str: "11,500.00" }, { x: 553, str: "11,500.00" }],
  [{ x: 86, str: "0503260 Ref. 0037584288 014" }],
  // small cargo
  [{ x: 10, str: "06/MAR" }, { x: 53, str: "06/MAR S39 SERV BANCA INTERNET" }, { x: 377, str: "50.00" }, { x: 485, str: "11,450.00" }, { x: 553, str: "11,450.00" }],
  [{ x: 27, str: "TOTAL IMPORTE CARGOS" }, { x: 233, str: "3,550.00" }, { x: 313, str: "TOTAL MOVIMIENTOS CARGOS" }, { x: 584, str: "3" }],
  [{ x: 27, str: "TOTAL IMPORTE ABONOS" }, { x: 233, str: "5,000.00" }, { x: 313, str: "TOTAL MOVIMIENTOS ABONOS" }, { x: 588, str: "1" }],
];

describe("parsearEstadoBbva", () => {
  const e = parsearEstadoBbva(ESTADO);

  it("reads the period and opening/closing balances", () => {
    expect(e.periodo).toEqual({ desde: "2026-03-01", hasta: "2026-03-31" });
    expect(e.saldoInicial).toBe(10000);
    expect(e.saldoFinal).toBe(11450);
  });

  it("extracts four movements with signed amounts", () => {
    expect(e.movimientos).toHaveLength(4);
    expect(e.movimientos[0]).toMatchObject({
      fecha: "2026-03-03",
      fechaLiq: "2026-03-03",
      codigo: "N06",
      descripcion: "PAGO CUENTA DE TERCERO",
      monto: -1000,
      saldo: 9000,
    });
    expect(e.movimientos[1]).toMatchObject({ codigo: "T09", monto: 5000, saldo: null });
    expect(e.movimientos[3]).toMatchObject({ codigo: "S39", monto: -50 });
  });

  it("distinguishes cargo from abono by column, not sign", () => {
    expect(e.totalCargos).toBe(3550); // 1000 + 2500 + 50
    expect(e.totalAbonos).toBe(5000);
  });

  it("attaches continuation lines as the reference", () => {
    expect(e.movimientos[2].codigo).toBe("T17");
    expect(e.movimientos[2].referencia).toContain("Ref. 0037584288");
  });

  it("validates against the running balance and declared totals", () => {
    expect(e.cuadra).toBe(true); // 10000 + 5000 − 3550 = 11450
  });

  it("flags a misparse when a movement is dropped", () => {
    const roto = ESTADO.filter((r) => !r.some((f) => f.str.includes("PAGO CUENTA")));
    expect(parsearEstadoBbva(roto).cuadra).toBe(false);
  });
});

describe("sucursalDe (FLUJO P0)", () => {
  it("extrae clave, nombre, dirección y plaza del bloque de sucursal", async () => {
    const { sucursalDe } = await import("@/lib/banco/bbva");
    const renglones = [
      [{ x: 10, str: "SUCURSAL :" }, { x: 80, str: "0742" }, { x: 120, str: "PARQUE TOREO" }],
      [{ x: 10, str: "DIRECCION:" }, { x: 80, str: "BLVD. AVILA CAMACHO" }],
      [{ x: 10, str: "PLAZA:" }, { x: 80, str: "NAUCALPAN" }],
    ];
    const s = sucursalDe(renglones);
    expect(s.clave).toBe("0742");
    expect(s.nombre).toBe("PARQUE TOREO");
    expect(s.direccion).toBe("BLVD. AVILA CAMACHO");
    expect(s.plaza).toBe("NAUCALPAN");
  });
});
