import { describe, expect, it } from "vitest";
import {
  entidadDeConcepto,
  narrativaAInforme,
} from "@/microapps/signature/producto";
import type { Narrativa } from "@/microapps/signature/narrativa";

const narrativa: Narrativa = {
  panorama: "La red se centra en un concentrador.",
  lecturas: [
    { concepto: "autogenes::e1", lectura: "Ata a casi todo." },
    { concepto: "fuentes::rfc", lectura: "Concepto propio recurrente." },
  ],
  observaciones: ["Revisa el concentrador principal."],
};

describe("entidadDeConcepto", () => {
  it("extracts the graph entity id from an autogenes-namespaced clave", () => {
    expect(entidadDeConcepto("autogenes::e1")).toBe("e1");
    expect(entidadDeConcepto("fuentes::rfc")).toBeNull();
  });
});

describe("narrativaAInforme", () => {
  const etiqueta = (c: string) =>
    ({ "autogenes::e1": "Ana", "fuentes::rfc": "RFC" })[c] ?? c;

  it("builds a cited informe and anchors on the graph entities", () => {
    const { informe, entidades } = narrativaAInforme(
      narrativa,
      ["6 conceptos y 7 vínculos.", "Estructura densa."],
      "Qualia · 6 conceptos",
      etiqueta,
    );
    expect(informe.titulo).toBe("Qualia · 6 conceptos");
    expect(informe.secciones.map((s) => s.encabezado)).toEqual([
      "Panorama",
      "Estructura",
      "Lecturas",
      "Observaciones",
    ]);
    // the autogenes concept resolves to its entity and cites it
    expect(entidades).toEqual(["e1"]);
    const lecturas = informe.secciones.find((s) => s.encabezado === "Lecturas");
    expect(lecturas?.puntos[0].texto.startsWith("Ana:")).toBe(true);
    expect(lecturas?.puntos[0].entidades).toEqual(["e1"]);
  });

  it("omits empty sections", () => {
    const { informe } = narrativaAInforme(
      { panorama: "Solo panorama.", lecturas: [], observaciones: [] },
      [],
      "Qualia",
      (c) => c,
    );
    expect(informe.secciones.map((s) => s.encabezado)).toEqual(["Panorama"]);
  });
});
