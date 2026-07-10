import { describe, expect, it } from "vitest";
import { construirLectura } from "@/microapps/signature/lectura";
import type { ResumenRed } from "@/capacidades/signature";

const base: ResumenRed = {
  nNodos: 6,
  nEnlaces: 7,
  densidad: 0.46,
  nComunidades: 2,
  nComponentes: 1,
  comunidadMayor: 3,
  exponente: null,
  puentes: [],
  hubs: [{ id: "rfc", etiqueta: "RFC", grado: 12 }],
};

describe("construirLectura", () => {
  it("states counts, hub, density and provenance", () => {
    const lineas = construirLectura(base, 20);
    expect(lineas[0]).toContain("6 conceptos");
    expect(lineas.some((l) => l.includes("«RFC»"))).toBe(true);
    expect(lineas.some((l) => l.includes("densa"))).toBe(true);
    expect(lineas.at(-1)).toContain("20 registros");
    expect(lineas.at(-1)).toContain("fuentes");
  });

  it("flags disconnected islands only when present", () => {
    const conIslas = construirLectura({ ...base, nComponentes: 3 }, 20);
    expect(conIslas.some((l) => l.includes("islas"))).toBe(true);
    const sinIslas = construirLectura(base, 20);
    expect(sinIslas.some((l) => l.includes("islas"))).toBe(false);
  });

  it("returns nothing for an empty network", () => {
    expect(construirLectura({ ...base, nNodos: 0 }, 0)).toEqual([]);
  });

  it("uses singular forms for a single registro", () => {
    const lineas = construirLectura({ ...base, nComunidades: 1 }, 1);
    expect(lineas[0]).toContain("1 comunidad.");
    expect(lineas.at(-1)).toContain("1 registro ");
  });
});
