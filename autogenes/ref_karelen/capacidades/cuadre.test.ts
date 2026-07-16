import { describe, expect, it } from "vitest";
import {
  cuadreContraBanco,
  marcasCadencia,
  obligacionDelMes,
  proyectarCajaAlLimite,
  repsEnRiesgo,
  veredictoCuadre,
} from "@/capacidades/cuadre";
import {
  diasAdicionalesRfc,
  esInhabil,
  fechaLimitePagoProvisional,
  fechaLimiteRep,
} from "@/lib/fiscal/reglas";

/* ── reglas: deadline arithmetic ──────────────────────────────────── */

describe("fechaLimitePagoProvisional", () => {
  it("day 17 of the following month when hábil (Art. 14 LISR)", () => {
    // 2026-03-17 is a Tuesday.
    const l = fechaLimitePagoProvisional("2026-02");
    expect(l.fecha).toBe("2026-03-17");
    expect(l.base).toBe("2026-03-17");
    expect(l.reglas.map((r) => r.id)).toContain("dia17");
  });

  it("rolls to next business day when the 17th is inhábil (Art. 12 CFF)", () => {
    // 2026-05-17 is a Sunday → Monday 18.
    const l = fechaLimitePagoProvisional("2026-04");
    expect(l.fecha).toBe("2026-05-18");
    expect(l.reglas.map((r) => r.id)).toContain("plazoInhabil");
  });

  it("adds business days by sixth RFC digit (Decreto 5.1)", () => {
    // Feb obligation, base 2026-03-17 (Tue): digit 9 → +5 hábiles = 03-24.
    const l = fechaLimitePagoProvisional("2026-02", "9");
    expect(l.diasAdicionales).toBe(5);
    expect(l.fecha).toBe("2026-03-24");
    expect(l.reglas.map((r) => r.id)).toContain("corrimientoRfc");
  });

  it("sixth-digit table matches the decree", () => {
    expect(diasAdicionalesRfc("1")).toBe(1);
    expect(diasAdicionalesRfc("4")).toBe(2);
    expect(diasAdicionalesRfc("6")).toBe(3);
    expect(diasAdicionalesRfc("8")).toBe(4);
    expect(diasAdicionalesRfc("0")).toBe(5);
  });
});

describe("esInhabil", () => {
  it("marks CFF Art. 12 fixed days and weekends", () => {
    expect(esInhabil("2026-01-01")).toBe(true); // 1 ene
    expect(esInhabil("2026-02-02")).toBe(true); // primer lunes de febrero
    expect(esInhabil("2026-09-16")).toBe(true);
    expect(esInhabil("2026-07-04")).toBe(true); // sábado
    expect(esInhabil("2026-07-06")).toBe(false); // lunes ordinario
  });
});

describe("fechaLimiteRep", () => {
  it("5th NATURAL day of the following month, no weekend roll (RMF 2.7.1.32)", () => {
    // 2026-07-05 is a Sunday — the deadline stays.
    expect(fechaLimiteRep("2026-06-10")).toBe("2026-07-05");
    expect(fechaLimiteRep("2026-02-26")).toBe("2026-03-05");
  });
});

/* ── obligación ───────────────────────────────────────────────────── */

describe("obligacionDelMes", () => {
  it("sums IVA + retenciones and abstains from ISR without CU", () => {
    const o = obligacionDelMes({
      mes: "2026-02",
      ivaACargo: 50_000,
      ivaSobreFlujo: false,
      retencionesAEnterar: 8_000,
    });
    expect(o.total).toBe(58_000);
    expect(o.componentes).toHaveLength(2);
    expect(o.abstenciones[0]).toMatch(/coeficiente de utilidad/);
    expect(o.componentes[0].base).toBe("facturacion");
  });

  it("estimates ISR with CU and labels it estimación", () => {
    const o = obligacionDelMes({
      mes: "2026-02",
      ivaACargo: 0,
      ivaSobreFlujo: true,
      retencionesAEnterar: 0,
      ingresosNominalesMes: 100_000,
      coeficienteUtilidad: 0.12,
    });
    // 100,000 × 0.12 × 30% = 3,600
    expect(o.total).toBe(3_600);
    expect(o.componentes[0].base).toBe("estimacion");
    expect(o.abstenciones).toHaveLength(0);
  });
});

/* ── proyección y veredicto ───────────────────────────────────────── */

const diario = (n: number, neto: number) =>
  Array.from({ length: n }, (_, i) => ({
    fecha: new Date(Date.UTC(2026, 1, 1 + i)).toISOString().slice(0, 10),
    monto: neto,
  }));

describe("proyectarCajaAlLimite", () => {
  it("projects with the median daily net over the window", () => {
    const p = proyectarCajaAlLimite(
      100_000,
      diario(20, -1_000),
      "2026-02-20",
      "2026-03-02",
    );
    expect(p.aplica).toBe(true);
    expect(p.netoDiarioMediano).toBe(-1_000);
    expect(p.diasRestantes).toBe(10);
    expect(p.saldoProyectado).toBe(90_000);
  });

  it("abstains with fewer than 14 active days", () => {
    const p = proyectarCajaAlLimite(
      100_000,
      diario(5, -1_000),
      "2026-02-06",
      "2026-03-17",
    );
    expect(p.aplica).toBe(false);
    expect(p.saldoProyectado).toBeNull();
  });
});

describe("veredictoCuadre", () => {
  const obligacion = obligacionDelMes({
    mes: "2026-02",
    ivaACargo: 60_000,
    ivaSobreFlujo: false,
    retencionesAEnterar: 0,
  });

  it("no cuadra when projected cash falls short, and says the gap", () => {
    const v = veredictoCuadre(obligacion, {
      aplica: true,
      saldoHoy: 80_000,
      saldoProyectado: 40_000,
      netoDiarioMediano: -2_000,
      diasRestantes: 20,
      diasBase: 28,
    });
    expect(v.estado).toBe("no_cuadra");
    expect(v.remanente).toBe(-20_000);
    expect(v.sentencia).toMatch(/No cuadra/);
    expect(v.nivel).toBeLessThan(0.5);
  });

  it("cuadra with ≥20% slack", () => {
    const v = veredictoCuadre(obligacion, {
      aplica: true,
      saldoHoy: 100_000,
      saldoProyectado: 90_000,
      netoDiarioMediano: -500,
      diasRestantes: 20,
      diasBase: 28,
    });
    expect(v.estado).toBe("cuadra");
    expect(v.holgura).toBe(0.5);
  });

  it("sin_base when nothing is owed", () => {
    const v = veredictoCuadre(
      obligacionDelMes({
        mes: "2026-02",
        ivaACargo: 0,
        ivaSobreFlujo: true,
        retencionesAEnterar: 0,
      }),
      {
        aplica: false,
        saldoHoy: 10_000,
        saldoProyectado: null,
        netoDiarioMediano: null,
        diasRestantes: 10,
        diasBase: 3,
      },
    );
    expect(v.estado).toBe("sin_base");
  });
});

/* ── REPs y cruce contra banco ────────────────────────────────────── */

describe("repsEnRiesgo", () => {
  it("classifies vencido / urgente / en_plazo against the 5th natural day", () => {
    const rs = repsEnRiesgo(
      [
        { uuid: "A", cliente: "ACME", monto: 10_000, fechaCobro: "2026-05-20" },
        { uuid: "B", cliente: "BETA", monto: 5_000, fechaCobro: "2026-06-28" },
        { uuid: "C", cliente: "GAMA", monto: 2_000, fechaCobro: "2026-07-01" },
      ],
      "2026-07-03",
    );
    // A due 06-05 (past) → vencido; B due 07-05 (2 days) → urgente;
    // C due 08-05 (33 days) → en_plazo. Sorted soonest first.
    expect(rs.map((r) => r.estado)).toEqual(["vencido", "urgente", "en_plazo"]);
    expect(rs[0].limite).toBe("2026-06-05");
    expect(rs[1].dias).toBe(2);
  });
});

describe("cuadreContraBanco", () => {
  it("matches a SAT charge to the PREVIOUS month's obligation", () => {
    const filas = cuadreContraBanco(
      [{ fecha: "2026-03-17", monto: -93_856 }],
      [{ mes: "2026-02", total: 90_000 }],
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].mes).toBe("2026-02");
    expect(filas[0].pagadoSat).toBe(93_856);
    expect(filas[0].diferencia).toBe(3_856);
    expect(filas[0].razon).toBeCloseTo(1.04, 2);
  });
});

describe("marcasCadencia", () => {
  it("merges and sorts cobros, pagos and límites", () => {
    const ms = marcasCadencia({
      cobros: [{ fecha: "2026-02-05", monto: 135_717 }],
      pagos: [{ fecha: "2026-02-17", monto: -93_856 }],
      limites: [
        { fecha: "2026-03-17", tipo: "limite_pago", etiqueta: "día 17" },
        { fecha: "2026-03-05", tipo: "limite_rep", etiqueta: "REP 5.º natural" },
      ],
    });
    expect(ms.map((m) => m.tipo)).toEqual([
      "cobro",
      "pago",
      "limite_rep",
      "limite_pago",
    ]);
  });
});
