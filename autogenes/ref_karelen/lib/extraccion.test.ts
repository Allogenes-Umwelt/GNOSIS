import { describe, expect, it } from "vitest";
import {
  extraerJson,
  fusionarPropuestas,
  partirFragmentos,
  sanearPropuesta,
} from "@/lib/extraccion";
import type { Fragmento, PropuestaGrafo } from "@/types/autogenes";

const T = 1_700_000_000_000;
const frag = (id: string, texto: string, pagina = 1): Fragmento => ({
  id,
  artefactoId: "a1",
  pagina,
  texto,
  createdAt: T,
});

describe("partirFragmentos", () => {
  it("skips empty fragments and truncates long ones", () => {
    const pases = partirFragmentos([
      frag("f1", "   "),
      frag("f2", "x".repeat(5000)),
    ]);
    expect(pases).toHaveLength(1);
    expect(pases[0]).toHaveLength(1);
    expect(pases[0][0].texto.length).toBe(1600);
  });

  it("splits into passes under the char budget", () => {
    const fs = [
      frag("f1", "a".repeat(900)),
      frag("f2", "b".repeat(900)),
      frag("f3", "c".repeat(900)),
    ];
    const pases = partirFragmentos(fs, 2000);
    expect(pases).toHaveLength(2);
    expect(pases[0].map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(pases[1].map((f) => f.id)).toEqual(["f3"]);
  });
});

describe("sanearPropuesta", () => {
  const ids = new Set(["f1", "f2"]);
  const base: PropuestaGrafo = {
    entidades: [
      { nombre: "Entropía", tipo: "concepto", evidencia: ["f1", "falso"] },
      { nombre: "Fantasma", tipo: "concepto", evidencia: ["inventado"] },
      { nombre: "entropía", tipo: "termino", evidencia: ["f2"] },
    ],
    relaciones: [
      { desde: "Entropía", hasta: "Boltzmann", tipo: "formulada por", peso: 0.8, evidencia: ["f1"] },
      { desde: "Entropía", hasta: "Nadie", tipo: "x", peso: 0.5, evidencia: ["f1"] },
      { desde: "Entropía", hasta: "entropía", tipo: "auto", peso: 0.5, evidencia: ["f1"] },
      { desde: "Entropía", hasta: "Boltzmann", tipo: "sin evidencia", peso: 2, evidencia: ["falso"] },
    ],
  };

  it("drops invented evidence, evidence-less items, and duplicate names", () => {
    const s = sanearPropuesta(base, ids, ["Boltzmann"]);
    expect(s.entidades).toHaveLength(1);
    expect(s.entidades[0].evidencia).toEqual(["f1"]);
  });

  it("keeps relations only between known names, no self-loops", () => {
    const s = sanearPropuesta(base, ids, ["Boltzmann"]);
    expect(s.relaciones).toHaveLength(1);
    expect(s.relaciones[0].hasta).toBe("Boltzmann");
  });

  it("without existing names, unresolved relations die", () => {
    const s = sanearPropuesta(base, ids, []);
    expect(s.relaciones).toHaveLength(0);
  });
});

describe("fusionarPropuestas", () => {
  it("unions evidence by name and dedupes relation pairs", () => {
    const a: PropuestaGrafo = {
      entidades: [{ nombre: "X", tipo: "concepto", evidencia: ["f1"] }],
      relaciones: [{ desde: "X", hasta: "Y", tipo: "liga", peso: 0.5, evidencia: ["f1"] }],
    };
    const b: PropuestaGrafo = {
      entidades: [
        { nombre: "x", tipo: "concepto", resumen: "r", evidencia: ["f2"] },
        { nombre: "Z", tipo: "persona", evidencia: ["f2"] },
      ],
      relaciones: [
        { desde: "X", hasta: "Y", tipo: "liga", peso: 0.9, evidencia: ["f2"] },
        { desde: "Z", hasta: "X", tipo: "cita", peso: 0.4, evidencia: ["f2"] },
      ],
    };
    const m = fusionarPropuestas(a, b);
    expect(m.entidades).toHaveLength(2);
    expect(new Set(m.entidades[0].evidencia)).toEqual(new Set(["f1", "f2"]));
    expect(m.relaciones).toHaveLength(2);
  });
});

describe("extraerJson", () => {
  it("pulls JSON out of fences and prose", () => {
    const crudo = 'Claro, aquí está:\n```json\n{"entidades":[]}\n```\nEspero sirva.';
    expect(extraerJson(crudo)).toBe('{"entidades":[]}');
  });
  it("returns null when there is no object", () => {
    expect(extraerJson("no hay nada")).toBeNull();
  });
});

describe("partirFragmentos — count cap (bugfix)", () => {
  it("never exceeds the API route's 24-fragment cap per pass", () => {
    // 30 short pages used to land in ONE pass and 400 at the route.
    const fragmentos = Array.from({ length: 30 }, (_, i) => ({
      id: `f${i}`,
      artefactoId: "a1",
      pagina: i + 1,
      texto: `página corta ${i}`,
      createdAt: 1,
    }));
    const pases = partirFragmentos(fragmentos);
    expect(pases.length).toBeGreaterThan(1);
    for (const pase of pases) {
      expect(pase.length).toBeLessThanOrEqual(24);
    }
    expect(pases.flat()).toHaveLength(30);
  });
});
