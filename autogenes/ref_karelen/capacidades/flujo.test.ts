import { describe, expect, it } from "vitest";
import {
  comisiones,
  concentracion,
  contraparteDe,
  movimientosUsd,
  recurrentes,
  resumenFlujo,
  runway,
  serieDiaria,
  type MovimientoFlujo,
} from "@/capacidades/flujo";

const mov = (
  fecha: string,
  monto: number,
  descripcion: string,
  extra: Partial<MovimientoFlujo> = {},
): MovimientoFlujo => ({ fecha, monto, descripcion, ...extra });

// A February shaped like the real fixture: one big client payment in,
// rent + SAT + subscriptions + fees out.
const FEB: MovimientoFlujo[] = [
  mov("2026-02-05", 135717, "TEF RECIBIDO HSBC", {
    codigo: "T09",
    referencia: "1930NA103 Ref. 12 021",
  }),
  mov("2026-02-05", -7540, "SPEI ENVIADO SANTANDER", {
    codigo: "T17",
    referencia: "RentaFeb26 Ref. 77 014 WORKCO PRADO NORTE SAPIDECV",
  }),
  mov("2026-02-17", -15629, "SAT", { codigo: "P14", referencia: "REF:AD CIE:1" }),
  mov("2026-02-17", -2092, "SAT", { codigo: "P14", referencia: "REF:XY CIE:1" }),
  mov("2026-02-03", -219, "PlayStation Network", {
    codigo: "A15",
    referencia: "USD 13.91TC017.4176AUT: 569211",
  }),
  mov("2026-02-03", -219, "PlayStation Network", { codigo: "A15" }),
  mov("2026-02-06", -32.5, "SERV BANCA INTERNET", { codigo: "S39" }),
];

describe("resumenFlujo", () => {
  it("suma ingresos, egresos y neto con conteos exactos", () => {
    const r = resumenFlujo(FEB);
    expect(r.ingresos).toBe(135717);
    expect(r.egresos).toBeCloseTo(25731.5, 2);
    expect(r.neto).toBeCloseTo(109985.5, 2);
    expect(r.nAbonos).toBe(1);
    expect(r.nCargos).toBe(6);
  });
});

describe("runway", () => {
  it("no aplica cuando el flujo es positivo", () => {
    const r = runway(60000, FEB, 28);
    expect(r.aplica).toBe(false);
    expect(r.meses).toBeNull();
  });

  it("mide meses de caja al ritmo de quema observado", () => {
    const quemando = [
      mov("2026-02-01", 10000, "TEF RECIBIDO HSBC"),
      mov("2026-02-10", -40000, "SPEI ENVIADO SANTANDER"),
    ];
    const r = runway(60000, quemando, 30);
    expect(r.aplica).toBe(true);
    expect(r.burnMensual).toBe(30000);
    expect(r.meses).toBe(2);
  });
});

describe("contrapartes y concentración", () => {
  it("nombra por reglas explicables: banco, beneficiario en referencia, comercio, SAT", () => {
    expect(contraparteDe(FEB[0])).toBe("HSBC");
    // Transfer with an ALL-CAPS beneficiary in the reference wins over the bank.
    expect(contraparteDe(FEB[1])).toBe("WORKCO PRADO NORTE SAPIDECV");
    expect(contraparteDe(FEB[2])).toBe("SAT");
    expect(contraparteDe(FEB[4])).toBe("PlayStation Network");
  });

  it("mide la concentración del ingreso y del gasto", () => {
    const c = concentracion(FEB);
    expect(c.concentracionIngresos).toBe(1);
    expect(c.egresos[0].nombre).toBe("SAT");
    expect(c.egresos[0].total).toBeCloseTo(17721, 2);
    expect(c.concentracionEgresos).toBeCloseTo(17721 / 25731.5, 2);
  });
});

describe("recurrentes, comisiones y USD", () => {
  it("detecta cargos recurrentes de monto estable", () => {
    const r = recurrentes(FEB);
    expect(r.some((x) => x.nombre === "PlayStation Network" && x.n === 2)).toBe(
      true,
    );
    const ps = r.find((x) => x.nombre === "PlayStation Network")!;
    expect(ps.montoTipico).toBe(219);
  });

  it("suma comisiones bancarias por código y descripción", () => {
    const c = comisiones(FEB);
    expect(c.n).toBe(1);
    expect(c.total).toBe(32.5);
  });

  it("extrae USD y tipo de cambio de la referencia de tarjeta", () => {
    const u = movimientosUsd(FEB);
    expect(u).toHaveLength(1);
    expect(u[0].usd).toBe(13.91);
    expect(u[0].tipoCambio).toBeCloseTo(17.4176, 4);
    expect(u[0].mxn).toBe(219);
  });
});

describe("serieDiaria", () => {
  it("cubre todos los días del periodo, con ceros honestos", () => {
    const s = serieDiaria(FEB, "2026-02-01", "2026-02-28");
    expect(s).toHaveLength(28);
    expect(s[4].fecha).toBe("2026-02-05");
    expect(s[4].ingresos).toBe(135717);
    expect(s[4].egresos).toBe(7540);
    expect(s[0].ingresos).toBe(0);
  });
});

describe("P1 · liquidez y forense", () => {
  it("puntoFragil encuentra el día más delgado con la cadena de saldos", async () => {
    const { puntoFragil } = await import("@/capacidades/flujo");
    const movs = [
      mov("2026-02-02", -50000, "SPEI ENVIADO SANTANDER"),
      mov("2026-02-05", 80000, "TEF RECIBIDO HSBC"),
    ];
    const r = puntoFragil(movs, 60000, "2026-02-01", "2026-02-07");
    expect(r.minimo?.fecha).toBe("2026-02-02");
    expect(r.minimo?.saldo).toBe(10000);
    expect(r.saldos).toHaveLength(7);
    expect(r.saldos[6].saldo).toBe(90000);
  });

  it("costoOportunidad usa convención 360 y spreadFx mide contra el FIX", async () => {
    const { costoOportunidad, spreadFx } = await import("@/capacidades/flujo");
    expect(costoOportunidad(100000, 10, 36)).toBe(1000);
    const s = spreadFx(
      [{ fecha: "2026-02-03", descripcion: "PSN", usd: 100, tipoCambio: 17.4, mxn: 1740 }],
      new Map([["2026-02-03", 17.2]]),
    );
    expect(s.total).toBeCloseTo(20, 2);
    expect(s.detalle[0].costo).toBeCloseTo(20, 2);
  });

  it("presión fiscal, duplicados y gasto hormiga", async () => {
    const { presionFiscal, duplicados, gastoHormiga } = await import("@/capacidades/flujo");
    const movs = [
      mov("2026-02-17", -1000, "SAT", { codigo: "P14" }),
      mov("2026-02-17", -1000, "SAT", { codigo: "P14" }),
      mov("2026-02-10", -150, "Uber"),
      mov("2026-02-11", -80, "OXXO"),
      mov("2026-02-05", 5000, "TEF RECIBIDO HSBC"),
    ];
    const pf = presionFiscal(movs);
    expect(pf.total).toBe(2000);
    expect(pf.porcentajeEgresos).toBeCloseTo(2000 / 2230, 2);
    const dup = duplicados(movs);
    expect(dup).toHaveLength(1);
    expect(dup[0].n).toBe(2);
    const gh = gastoHormiga(movs);
    expect(gh.n).toBe(2);
    expect(gh.total).toBe(230);
  });
});

describe("P1 · Benford honesto", () => {
  it("se abstiene con muestra corta y lo dice", async () => {
    const { benford } = await import("@/capacidades/flujo");
    const b = benford([mov("2026-02-01", -123, "X")]);
    expect(b.aplica).toBe(false);
    expect(b.veredicto).toBe("insuficiente");
    expect(b.n).toBe(1);
  });

  it("una muestra Benford-perfecta sale conforme", async () => {
    const { benford } = await import("@/capacidades/flujo");
    // Build 100 amounts whose first digits follow Benford closely.
    const movs = [];
    for (let d = 1; d <= 9; d++) {
      const n = Math.round(Math.log10(1 + 1 / d) * 100);
      for (let i = 0; i < n; i++) movs.push(mov("2026-02-01", -(d * 100 + i), "X"));
    }
    const b = benford(movs);
    expect(b.aplica).toBe(true);
    expect(b.veredicto === "conforme" || b.veredicto === "aceptable").toBe(true);
  });

  it("una muestra sesgada al 9 sale desviada", async () => {
    const { benford } = await import("@/capacidades/flujo");
    const movs = Array.from({ length: 60 }, (_, i) => mov("2026-02-01", -(900 + i), "X"));
    const b = benford(movs);
    expect(b.aplica).toBe(true);
    expect(b.veredicto).toBe("desviado");
  });
});

describe("P1 · veredicto y serie multi-estado", () => {
  it("veredictoCaja clasifica por runway y nombra el día frágil", async () => {
    const { veredictoCaja } = await import("@/capacidades/flujo");
    const v = veredictoCaja(
      { aplica: true, meses: 0.8, burnMensual: 73278.1 },
      { fecha: "2026-02-17", saldo: 8412 },
      1,
    );
    expect(v.zona).toBe("critico");
    expect(v.sentencia).toContain("0.8 meses");
    expect(v.sentencia).toContain("2026-02-17");
    const pos = veredictoCaja({ aplica: false, meses: null, burnMensual: -5 }, null, 0.9);
    expect(pos.zona).toBe("estable");
    expect(pos.sentencia).toContain("una sola fuente");
  });

  it("serieMensual agrupa por mes y calidadIngreso exige tres meses", async () => {
    const { serieMensual, calidadIngreso } = await import("@/capacidades/flujo");
    const movs = [
      mov("2026-01-05", 100, "TEF RECIBIDO HSBC"),
      mov("2026-02-05", 100, "TEF RECIBIDO HSBC"),
      mov("2026-02-20", -40, "OXXO"),
      mov("2026-03-05", 220, "TEF RECIBIDO HSBC"),
    ];
    const s = serieMensual(movs);
    expect(s.map((m) => m.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(s[1].neto).toBe(60);
    const c = calidadIngreso(s);
    expect(c.cv).toBeGreaterThan(0);
    expect(calidadIngreso(s.slice(0, 2)).cv).toBeNull();
  });

  it("ritmoClienteTop detecta el atraso contra su propia cadencia", async () => {
    const { ritmoClienteTop } = await import("@/capacidades/flujo");
    const movs = [
      mov("2026-01-05", 100, "TEF RECIBIDO HSBC"),
      mov("2026-02-04", 100, "TEF RECIBIDO HSBC"),
      mov("2026-03-06", 100, "TEF RECIBIDO HSBC"),
    ];
    const r1 = ritmoClienteTop(movs, "2026-03-20")!;
    expect(r1.diasPromedio).toBe(30);
    expect(r1.atrasado).toBe(false);
    const r2 = ritmoClienteTop(movs, "2026-04-30")!;
    expect(r2.diasDesdeUltimo).toBeGreaterThan(45);
    expect(r2.atrasado).toBe(true);
  });
});

describe("P2 · estacionalidad, drenado y mes típico", () => {
  it("porDiaSemana concentra el gasto en su día pico", async () => {
    const { porDiaSemana } = await import("@/capacidades/flujo");
    // 2026-02-06 es viernes; 2026-02-05 jueves.
    const r = porDiaSemana([
      mov("2026-02-06", -900, "OXXO"),
      mov("2026-02-06", -100, "Uber"),
      mov("2026-02-05", -50, "Cafe"),
      mov("2026-02-05", 500, "TEF RECIBIDO HSBC"),
    ]);
    expect(r.picoEgreso?.dia).toBe("viernes");
    expect(r.picoEgreso?.egresos).toBe(1000);
    expect(r.dias.find((d) => d.dia === "jueves")?.ingresos).toBe(500);
  });

  it("tendenciaMensual y runwaySuavizado exigen serie y usan mediana", async () => {
    const { tendenciaMensual, runwaySuavizado } = await import("@/capacidades/flujo");
    const mes = (mes: string, ingresos: number, egresos: number) => ({
      mes, ingresos, egresos, neto: ingresos - egresos, n: 10,
    });
    const serie = [mes("2026-01", 100, 150), mes("2026-02", 100, 160), mes("2026-03", 100, 400)];
    const t = tendenciaMensual(serie);
    expect(t.deltaNeto).toBe(-240);
    expect(t.media3Neto).toBeCloseTo((-50 - 60 - 300) / 3, 2);
    // Smoothed burn = median(50, 60, 300) = 60 — the weird month no manda.
    const rw = runwaySuavizado(120, serie)!;
    expect(rw.burnMensual).toBe(60);
    expect(rw.meses).toBe(2);
    expect(runwaySuavizado(120, serie.slice(0, 2))).toBeNull();
  });

  it("estacionalidadAnual se abstiene sin 13 meses", async () => {
    const { estacionalidadAnual } = await import("@/capacidades/flujo");
    const corta = Array.from({ length: 6 }, (_, i) => ({
      mes: `2026-0${i + 1}`, ingresos: 100, egresos: 50, neto: 50, n: 5,
    }));
    const r = estacionalidadAnual(corta);
    expect(r.aplica).toBe(false);
    expect(r.correlacion12).toBeNull();
  });

  it("velocidadDrenado mide días hasta drenar 80% del cobro grande", async () => {
    const { velocidadDrenado } = await import("@/capacidades/flujo");
    const movs = [
      mov("2026-02-01", 1000, "TEF RECIBIDO HSBC"),
      mov("2026-02-03", -500, "SPEI ENVIADO SANTANDER"),
      mov("2026-02-05", -400, "SAT"),
    ];
    const r = velocidadDrenado(movs);
    expect(r.diasMediana).toBe(4);
    expect(r.casos).toBe(1);
  });

  it("reaccionACobro cuenta egresos en 48 h tras el cobro grande", async () => {
    const { reaccionACobro } = await import("@/capacidades/flujo");
    const movs = [
      mov("2026-02-01", 1000, "TEF RECIBIDO HSBC"),
      mov("2026-02-02", -300, "SPEI ENVIADO SANTANDER"),
      mov("2026-02-10", -300, "SAT"),
    ];
    const r = reaccionACobro(movs);
    expect(r.cobros).toBe(1);
    expect(r.egresos48h).toBe(1);
    expect(r.monto48h).toBe(300);
  });

  it("desviacionesMes compara contra la mediana propia y exige 4 meses", async () => {
    const { desviacionesMes } = await import("@/capacidades/flujo");
    const mes = (mes: string, ingresos: number) => ({
      mes, ingresos, egresos: 50, neto: ingresos - 50, n: 10,
    });
    const serie = [mes("2026-01", 100), mes("2026-02", 110), mes("2026-03", 90), mes("2026-04", 220)];
    const d = desviacionesMes(serie);
    expect(d.some((x) => x.metrica === "Ingresos")).toBe(true);
    expect(desviacionesMes(serie.slice(0, 3))).toEqual([]);
  });
});
