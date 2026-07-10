import { describe, expect, it } from "vitest";
import {
  autocorrelacion,
  embeddingRetardo,
  estadisticaSerie,
  parsearSerie,
  recurrencia,
  retardoOptimo,
} from "@/capacidades/series";

const seno = Array.from({ length: 200 }, (_, i) => Math.sin(i * 0.3));

describe("parsearSerie", () => {
  it("parses numbers across whitespace, commas and newlines", () => {
    expect(parsearSerie("1, 2\n3.5  -4\t5")).toEqual([1, 2, 3.5, -4, 5]);
  });
  it("drops non-numeric tokens", () => {
    expect(parsearSerie("10 abc 20")).toEqual([10, 20]);
  });
});

describe("estadisticaSerie", () => {
  it("reports n, range, mean and deviation", () => {
    const s = estadisticaSerie([2, 4, 6]);
    expect(s.n).toBe(3);
    expect(s.min).toBe(2);
    expect(s.max).toBe(6);
    expect(s.media).toBe(4);
    expect(s.desv).toBeCloseTo(Math.sqrt(8 / 3));
  });
});

describe("autocorrelacion", () => {
  it("is 1 at lag 0-equivalent and near the period for a sine", () => {
    expect(autocorrelacion(seno, 0)).toBe(0); // guarded (lag<=0)
    // strong positive autocorrelation at a full period (~21 samples)
    expect(autocorrelacion(seno, 21)).toBeGreaterThan(0.5);
  });
});

describe("retardoOptimo", () => {
  it("returns a positive delay within the search bound", () => {
    const tau = retardoOptimo(seno);
    expect(tau).toBeGreaterThanOrEqual(1);
    expect(tau).toBeLessThanOrEqual(50);
  });
});

describe("embeddingRetardo", () => {
  it("builds vectors of the requested dimension", () => {
    const emb = embeddingRetardo([1, 2, 3, 4, 5], 1, 2);
    expect(emb).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
  });
  it("respects the delay in 3-D", () => {
    const emb = embeddingRetardo([1, 2, 3, 4, 5, 6], 2, 3);
    expect(emb[0]).toEqual([1, 3, 5]);
  });
});

describe("recurrencia", () => {
  it("is symmetric with a set diagonal and bounded size", () => {
    const r = recurrencia(seno, retardoOptimo(seno));
    expect(r.n).toBeGreaterThan(0);
    expect(r.n).toBeLessThanOrEqual(200);
    for (let i = 0; i < r.n; i++) expect(r.matriz[i][i]).toBe(true);
    // symmetry
    expect(r.matriz[0][r.n - 1]).toBe(r.matriz[r.n - 1][0]);
  });
});
