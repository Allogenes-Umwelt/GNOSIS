import { describe, expect, it } from "vitest";
import {
  construirPropuestaEnlace,
  construirPropuestaPlan,
} from "@/microapps/signature/plan";
import { PropuestaPlanSchema } from "@/types/plan";
import type { RedSig, ResumenRed } from "@/capacidades/signature";

const red: RedSig = {
  nodos: ["rfc", "regimen", "otro"].map((id) => ({ id, etiqueta: id })),
  enlaces: [
    { origen: "rfc", destino: "regimen", peso: 5 },
    { origen: "rfc", destino: "otro", peso: 1 },
  ],
};

const resumen: ResumenRed = {
  nNodos: 3,
  nEnlaces: 2,
  densidad: 0.6,
  nComunidades: 1,
  nComponentes: 1,
  comunidadMayor: 3,
  exponente: null,
  puentes: [],
  hubs: [
    { id: "rfc", etiqueta: "RFC", grado: 6 },
    { id: "regimen", etiqueta: "Régimen", grado: 5 },
  ],
};

describe("construirPropuestaPlan", () => {
  it("proposes recordar for each hub then enlazar their strong co-occurrences", () => {
    const p = construirPropuestaPlan(resumen, red);
    expect(p).not.toBeNull();
    const plan = PropuestaPlanSchema.parse(p);
    const recordar = plan.pasos.filter((s) => s.op === "recordar");
    const enlazar = plan.pasos.filter((s) => s.op === "enlazar");
    expect(recordar).toHaveLength(2);
    // recordar steps come before enlazar (executor resolves names in order)
    const primerEnlazar = plan.pasos.findIndex((s) => s.op === "enlazar");
    const ultimoRecordar = plan.pasos.map((s) => s.op).lastIndexOf("recordar");
    expect(ultimoRecordar).toBeLessThan(primerEnlazar);
    // only the hub-to-hub edge (rfc—regimen) becomes a link
    expect(enlazar).toHaveLength(1);
    if (enlazar[0].op === "enlazar") {
      expect(new Set([enlazar[0].desde, enlazar[0].hasta])).toEqual(
        new Set(["RFC", "Régimen"]),
      );
    }
  });

  it("returns null when there are no concentrators", () => {
    expect(construirPropuestaPlan({ ...resumen, hubs: [] }, red)).toBeNull();
  });

  it("never emits more than 12 steps", () => {
    const muchos: ResumenRed = {
      ...resumen,
      hubs: Array.from({ length: 6 }, (_, i) => ({
        id: `h${i}`,
        etiqueta: `H${i}`,
        grado: 10 - i,
      })),
    };
    const redDensa: RedSig = {
      nodos: muchos.hubs.map((h) => ({ id: h.id, etiqueta: h.etiqueta })),
      enlaces: muchos.hubs.flatMap((a, i) =>
        muchos.hubs.slice(i + 1).map((b) => ({ origen: a.id, destino: b.id, peso: 1 })),
      ),
    };
    const p = construirPropuestaPlan(muchos, redDensa);
    expect(p?.pasos.length).toBeLessThanOrEqual(12);
  });
});

describe("construirPropuestaEnlace (M3)", () => {
  it("proposes recordar A, recordar B, then one enlazar A—B", () => {
    const p = construirPropuestaEnlace(red, "rfc", "regimen");
    expect(p).not.toBeNull();
    const plan = PropuestaPlanSchema.parse(p);
    expect(plan.pasos.map((s) => s.op)).toEqual([
      "recordar",
      "recordar",
      "enlazar",
    ]);
    const enlace = plan.pasos[2];
    if (enlace.op === "enlazar") {
      expect(enlace.desde).toBe("rfc");
      expect(enlace.hasta).toBe("regimen");
    }
  });

  it("rejects unknown ids, self-links and same-label pairs", () => {
    expect(construirPropuestaEnlace(red, "rfc", "nope")).toBeNull();
    expect(construirPropuestaEnlace(red, "rfc", "rfc")).toBeNull();
    const conDuplicado: RedSig = {
      nodos: [
        { id: "a", etiqueta: "Mismo" },
        { id: "b", etiqueta: "Mismo" },
      ],
      enlaces: [],
    };
    expect(construirPropuestaEnlace(conDuplicado, "a", "b")).toBeNull();
  });
});
