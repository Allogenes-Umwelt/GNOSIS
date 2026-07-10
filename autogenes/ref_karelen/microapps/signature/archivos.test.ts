import { describe, expect, it } from "vitest";
import {
  entradasDeCSV,
  entradasDeConector,
  entradasDeJSON,
  extraerPares,
  parsearCSV,
} from "@/microapps/signature/archivos";

describe("parsearCSV", () => {
  it("detects the delimiter and splits rows", () => {
    expect(parsearCSV("a;b;c\n1;2;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("honours quoted fields containing the delimiter", () => {
    expect(parsearCSV('nombre,valor\n"Pérez, Ana",10')).toEqual([
      ["nombre", "valor"],
      ["Pérez, Ana", "10"],
    ]);
  });
});

describe("entradasDeCSV", () => {
  it("names concepts from the header and takes cells as values", () => {
    const out = entradasDeCSV([
      ["RFC", "Régimen"],
      ["AAA010101AAA", "601"],
    ]);
    expect(out).toEqual([
      { etiqueta: "RFC", valor: "AAA010101AAA" },
      { etiqueta: "Régimen", valor: "601" },
    ]);
  });

  it("treats a single row as bare concepts", () => {
    expect(entradasDeCSV([["uno", "dos"]])).toEqual([
      { etiqueta: "uno", valor: "uno" },
      { etiqueta: "dos", valor: "dos" },
    ]);
  });
});

describe("entradasDeJSON", () => {
  it("flattens an object into key/value concepts", () => {
    expect(entradasDeJSON('{"rfc":"AAA","total":10}')).toEqual([
      { etiqueta: "rfc", valor: "AAA" },
      { etiqueta: "total", valor: "10" },
    ]);
  });

  it("descends one level into nested objects", () => {
    const out = entradasDeJSON('{"fiscal":{"rfc":"AAA"}}');
    expect(out).toEqual([{ etiqueta: "fiscal.rfc", valor: "AAA" }]);
  });

  it("returns nothing for invalid JSON", () => {
    expect(entradasDeJSON("{no")).toEqual([]);
  });
});

describe("extraerPares", () => {
  it("keeps only lines with an explicit separator", () => {
    const out = extraerPares("Contrato de servicios\nRFC: AAA010101AAA\nprosa suelta");
    expect(out).toEqual([{ etiqueta: "RFC", valor: "AAA010101AAA" }]);
  });
});

describe("entradasDeConector", () => {
  it("makes one batch per record, string values as concepts, numbers skipped", () => {
    const out = entradasDeConector([
      { nombre: "México", region: "América", poblacion: 126000000 },
      { nombre: "Canadá", region: "América", poblacion: 38000000 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual([
      { etiqueta: "México", valor: "México" },
      { etiqueta: "América", valor: "América" },
    ]);
    // "América" repeats → dedups into a hub downstream (same node id)
    expect(out[1].some((e) => e.etiqueta === "América")).toBe(true);
  });

  it("unwraps a single array-valued field", () => {
    const out = entradasDeConector({ resultados: [{ nombre: "Ada" }, { nombre: "Alan" }] });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual([{ etiqueta: "Ada", valor: "Ada" }]);
  });

  it("returns nothing for an all-numeric or empty payload", () => {
    expect(entradasDeConector({ a: 1, b: 2 })).toEqual([]);
    expect(entradasDeConector(null)).toEqual([]);
  });
});
