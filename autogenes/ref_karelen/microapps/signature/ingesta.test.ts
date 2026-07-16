import { describe, expect, it } from "vitest";
import { parsearEntradas } from "@/microapps/signature/ingesta";

describe("parsearEntradas", () => {
  it("splits etiqueta and valor on colon or equals", () => {
    expect(parsearEntradas("RFC: AAA010101AAA")).toEqual([
      { etiqueta: "RFC", valor: "AAA010101AAA" },
    ]);
    expect(parsearEntradas("Régimen = 601")).toEqual([
      { etiqueta: "Régimen", valor: "601" },
    ]);
  });

  it("uses the concept as its own value when there is no separator", () => {
    expect(parsearEntradas("Contrato marco")).toEqual([
      { etiqueta: "Contrato marco", valor: "Contrato marco" },
    ]);
  });

  it("defaults an empty value to the etiqueta", () => {
    expect(parsearEntradas("RFC:")).toEqual([{ etiqueta: "RFC", valor: "RFC" }]);
  });

  it("parses many lines and drops blanks", () => {
    const out = parsearEntradas("a: 1\n\n  \nb = 2\nc");
    expect(out).toEqual([
      { etiqueta: "a", valor: "1" },
      { etiqueta: "b", valor: "2" },
      { etiqueta: "c", valor: "c" },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(parsearEntradas("   \n  ")).toEqual([]);
  });
});
