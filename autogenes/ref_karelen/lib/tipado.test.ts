import { describe, expect, it } from "vitest";
import {
  claveDeEtiqueta,
  tipoRelacionDe,
  validarExtremosRelacion,
  validarPropiedades,
} from "@/lib/tipado";
import type { TipoOperador } from "@/types/autogenes";

const poliza: TipoOperador = {
  id: "t1",
  nombre: "Póliza",
  base: "documento",
  propiedades: [
    { clave: "vigencia", etiqueta: "Vigencia", tipo: "fecha", requerida: true },
    { clave: "prima", etiqueta: "Prima anual", tipo: "numero", requerida: false },
    { clave: "aseguradora", etiqueta: "Aseguradora", tipo: "texto", requerida: false },
  ],
  createdAt: 1,
};

describe("validarPropiedades", () => {
  it("normalizes dates to ISO and numbers from currency input", () => {
    const v = validarPropiedades(poliza, {
      vigencia: "12/08/2026",
      prima: "$1,160.00",
      aseguradora: " GNP ",
    });
    expect(v.ok).toBe(true);
    expect(v.propiedades).toEqual({
      vigencia: "2026-08-12",
      prima: "1160",
      aseguradora: "GNP",
    });
  });

  it("reports missing required and unreadable values in operator words", () => {
    const v = validarPropiedades(poliza, { prima: "mucho" });
    expect(v.ok).toBe(false);
    expect(v.errores).toEqual([
      "Falta Vigencia.",
      "Prima anual debe ser un número.",
    ]);
  });

  it("drops undeclared keys — the type is the contract", () => {
    const v = validarPropiedades(poliza, {
      vigencia: "2026-08-12",
      intruso: "x",
    });
    expect(v.ok).toBe(true);
    expect(v.propiedades).toEqual({ vigencia: "2026-08-12" });
  });
});

describe("claveDeEtiqueta", () => {
  it("slugs operator labels, accents folded", () => {
    expect(claveDeEtiqueta("Prima anual (MXN)")).toBe("prima-anual-mxn");
    expect(claveDeEtiqueta("Número de póliza")).toBe("numero-de-poliza");
    expect(claveDeEtiqueta("  !!  ")).toBe("");
  });
});

describe("relaciones tipadas (D2b)", () => {
  const CAT = [
    {
      id: "tr1",
      nombre: "asegura a",
      desde: "organizacion" as const,
      hasta: "persona" as const,
      createdAt: 1,
    },
  ];

  it("resuelve el tipo por nombre sin importar mayúsculas", () => {
    expect(tipoRelacionDe(CAT, " Asegura A ")?.id).toBe("tr1");
    expect(tipoRelacionDe(CAT, "renta a")).toBeNull();
  });

  it("valida extremos: acepta lo declarado y rechaza lo torcido en palabras del operador", () => {
    const org = { nombre: "GNP", tipo: "organizacion" as const };
    const per = { nombre: "Julio", tipo: "persona" as const };
    expect(validarExtremosRelacion(CAT[0], org, per)).toBeNull();
    const error = validarExtremosRelacion(CAT[0], per, org);
    expect(error).toContain("«asegura a» sale de organizacion");
    expect(error).toContain("«Julio» es persona");
  });
});
