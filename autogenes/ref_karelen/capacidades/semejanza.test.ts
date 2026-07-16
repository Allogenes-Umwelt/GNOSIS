import { describe, expect, it } from "vitest";
import { clavePar, paresSimilares } from "@/capacidades/semejanza";

describe("paresSimilares (N3)", () => {
  it("propone solo pares sobre el umbral, orientados al más específico", () => {
    const etiquetas = ["Renta", "renta mensual", "Notario"];
    const vectores = [
      [1, 0, 0],
      [0.95, 0.31, 0], // ~cos 0.95 con el primero
      [0, 1, 0],
    ];
    const pares = paresSimilares(etiquetas, vectores, 0.85);
    expect(pares).toHaveLength(1);
    expect(pares[0].a).toBe("Renta");
    expect(pares[0].b).toBe("renta mensual");
    expect(pares[0].similitud).toBeGreaterThan(0.85);
  });

  it("recorta al máximo pedido, más similares primero", () => {
    const etiquetas = ["a1", "a2", "a3", "a4"];
    const v = [
      [1, 0],
      [0.999, 0.045],
      [0.99, 0.14],
      [0.97, 0.24],
    ];
    const pares = paresSimilares(etiquetas, v, 0.9, 2);
    expect(pares).toHaveLength(2);
    expect(pares[0].similitud).toBeGreaterThanOrEqual(pares[1].similitud);
  });

  it("clavePar es estable ante el orden", () => {
    expect(clavePar("b", "a")).toBe(clavePar("a", "b"));
  });
});
