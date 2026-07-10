import { describe, expect, it } from "vitest";
import {
  esAcronimo,
  jaroWinkler,
  normalizar,
  similitudLevenshtein,
  similitudNombres,
  similitudTokens,
} from "@/lib/similitud";

describe("normalizar", () => {
  it("folds case, accents and punctuation", () => {
    expect(normalizar("Administración  Tributaria.")).toBe(
      "administracion tributaria",
    );
    expect(normalizar("S.A.T.")).toBe("s a t");
  });
});

describe("similitudLevenshtein", () => {
  it("handles identity, typos and disjoint strings", () => {
    expect(similitudLevenshtein("banxico", "banxico")).toBe(1);
    expect(similitudLevenshtein("banxico", "banxici")).toBeCloseTo(6 / 7, 5);
    expect(similitudLevenshtein("abc", "xyz")).toBe(0);
  });
});

describe("jaroWinkler", () => {
  it("matches the canonical MARTHA/MARHTA value", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.9611, 3);
  });
  it("boosts common prefixes", () => {
    expect(jaroWinkler("infonavit", "infonavit 2024")).toBeGreaterThan(0.9);
    expect(jaroWinkler("dwayne", "duane")).toBeCloseTo(0.84, 2);
  });
});

describe("esAcronimo", () => {
  it("detects initials across articles", () => {
    expect(esAcronimo("SAT", "Servicio de Administración Tributaria")).toBe(true);
    expect(esAcronimo("CFE", "Comisión Federal de Electricidad")).toBe(true);
    expect(esAcronimo("SAT", "Sistema de Ahorro")).toBe(false);
  });
});

describe("similitudTokens", () => {
  it("gives containment credit to subset names", () => {
    expect(
      similitudTokens("Ley Federal del Trabajo", "Ley Federal del Trabajo (LFT)"),
    ).toBeGreaterThan(0.85);
  });
});

describe("similitudNombres", () => {
  it("resolves accents, acronyms and near-typos high; unrelated low", () => {
    expect(similitudNombres("Administración", "administracion")).toBe(1);
    expect(
      similitudNombres("SAT", "Servicio de Administración Tributaria"),
    ).toBeCloseTo(0.92, 5);
    expect(similitudNombres("Banxico", "Banxici")).toBeGreaterThan(0.85);
    expect(similitudNombres("Banxico", "Profeco")).toBeLessThan(0.6);
  });
});
