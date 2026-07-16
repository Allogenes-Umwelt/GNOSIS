import { describe, expect, it } from "vitest";
import { buscarEnUmwelt } from "@/lib/busqueda";
import type { Artefacto, Entidad, Fragmento } from "@/types/autogenes";
import type { Datum } from "@/types/datum";

const T = 1_700_000_000_000;

const fuentes = {
  datos: [
    {
      id: "d1",
      campo: "fiscal",
      etiqueta: "RFC",
      valor: "XAXX010101000",
      createdAt: T,
    },
  ] as Datum[],
  artefactos: [
    { id: "a1", kind: "pdf", nombre: "contrato.pdf", createdAt: T },
  ] as Artefacto[],
  fragmentos: [
    {
      id: "f1",
      artefactoId: "a1",
      pagina: 3,
      texto:
        "El patrón deberá pagar la indemnización conforme a la Ley Federal del Trabajo vigente.",
      createdAt: T,
    },
  ] as Fragmento[],
  entidades: [
    {
      id: "e1",
      nombre: "Ley Federal del Trabajo",
      tipo: "documento",
      origen: "synesis",
      resumen: "Norma laboral",
      alias: ["LFT"],
      evidencia: ["f1"],
      createdAt: T,
    },
  ] as Entidad[],
};

describe("buscarEnUmwelt", () => {
  it("finds accent-insensitively across the three layers, cited", () => {
    const hits = buscarEnUmwelt("indemnizacion", fuentes);
    const frag = hits.find((h) => h.clase === "fragmento");
    expect(frag).toBeDefined();
    expect(frag!.cita).toBe("contrato.pdf · pág 3");
    expect(frag!.detalle).toContain("indemnización");
  });

  it("matches entities by alias and datos by value", () => {
    expect(
      buscarEnUmwelt("lft", fuentes).some((h) => h.clase === "entidad"),
    ).toBe(true);
    expect(
      buscarEnUmwelt("XAXX01", fuentes).some((h) => h.clase === "dato"),
    ).toBe(true);
  });

  it("ignores sub-2-char queries", () => {
    expect(buscarEnUmwelt("l", fuentes)).toHaveLength(0);
  });
});
