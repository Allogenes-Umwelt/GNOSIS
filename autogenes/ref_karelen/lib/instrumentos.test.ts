import { describe, expect, it } from "vitest";
import {
  construirDictamenRespaldo,
  construirNodosMemoria,
  deltaSerie,
  escalarSerie,
  posicionNodo,
} from "@/lib/instrumentos";
import { ResultadoUniversalSchema } from "@/types/resultado";

const DIA = 86_400_000;

describe("posicionNodo", () => {
  it("is deterministic and stays on its ring", () => {
    const a = posicionNodo(0, 4, 1, 160, { 1: 72, 2: 122 });
    const b = posicionNodo(0, 4, 1, 160, { 1: 72, 2: 122 });
    expect(a).toEqual(b);
    const r = Math.hypot(a.x - 160, a.y - 160);
    expect(r).toBeCloseTo(72, 6);
  });

  it("spreads nodes apart on the same ring", () => {
    const a = posicionNodo(0, 3, 2, 160, { 1: 72, 2: 122 });
    const b = posicionNodo(1, 3, 2, 160, { 1: 72, 2: 122 });
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(50);
  });
});

describe("escalarSerie", () => {
  it("maps first/last points to the padded box edges", () => {
    const pts = escalarSerie(
      [
        { t: 0, v: 10 },
        { t: 100, v: 20 },
      ],
      320,
      96,
      10,
    );
    expect(pts[0]).toEqual({ x: 10, y: 86 });
    expect(pts[1]).toEqual({ x: 310, y: 10 });
  });

  it("handles flat and single series without division by zero", () => {
    expect(
      escalarSerie(
        [
          { t: 0, v: 5 },
          { t: 10, v: 5 },
        ],
        320,
        96,
        10,
      ).every((p) => Number.isFinite(p.y)),
    ).toBe(true);
    expect(escalarSerie([{ t: 0, v: 5 }], 320, 96, 10)).toHaveLength(1);
  });
});

describe("deltaSerie", () => {
  it("computes percent change between the last two points", () => {
    const d = deltaSerie([
      { t: 0, v: 100 },
      { t: 1, v: 103 },
    ]);
    expect(d?.pct).toBeCloseTo(3);
  });

  it("returns undefined for short series", () => {
    expect(deltaSerie([{ t: 0, v: 1 }])).toBeUndefined();
  });
});

describe("construirDictamenRespaldo", () => {
  const base = {
    totalDatos: 12,
    totalObjetos: 3,
    totalOperaciones: 5,
    ahora: 100 * DIA,
  };

  it("empty system → insuficiente pointing to Ingesta", () => {
    const d = construirDictamenRespaldo({
      totalDatos: 0,
      totalObjetos: 0,
      totalOperaciones: 0,
      lastExport: null,
      ahora: base.ahora,
    });
    expect(d.veredicto).toBe("insuficiente");
    expect(d.siguienteAccion?.href).toBe("/ingesta");
    expect(ResultadoUniversalSchema.parse(d)).toBeTruthy();
  });

  it("data without recent export → atencion with action", () => {
    const d = construirDictamenRespaldo({
      ...base,
      lastExport: base.ahora - 9 * DIA,
    });
    expect(d.veredicto).toBe("atencion");
    expect(d.nivel?.valor).toBeGreaterThan(0.5);
    expect(d.siguienteAccion).toBeDefined();
  });

  it("fresh export → favorable, no action needed", () => {
    const d = construirDictamenRespaldo({
      ...base,
      lastExport: base.ahora - 1 * DIA,
    });
    expect(d.veredicto).toBe("favorable");
    expect(d.siguienteAccion).toBeUndefined();
  });
});

describe("construirNodosMemoria", () => {
  it("relates → ring 1, loose → ring 2, recent → vivo; caps at 20", () => {
    const ahora = 100 * DIA;
    const objetos = Array.from({ length: 25 }, (_, i) => ({
      id: `o${i}`,
      nombre: `Objeto ${i}`,
      tipo: "concepto",
      resumen: "r",
      relaciones: i % 2 === 0 ? [{ con: "x", tipo: "liga" }] : [],
      createdAt: i < 5 ? ahora - 2 * DIA : ahora - 30 * DIA,
    }));
    const nodos = construirNodosMemoria(objetos, ahora);
    expect(nodos).toHaveLength(20);
    expect(nodos[0].anillo).toBe(1);
    expect(nodos[1].anillo).toBe(2);
    expect(nodos[0].vivo).toBe(true);
    expect(nodos[10].vivo).toBe(false);
  });
});
