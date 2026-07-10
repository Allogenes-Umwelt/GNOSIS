import { describe, expect, it } from "vitest";
import { construirGrafo, seedDe } from "@/lib/grafo";
import type {
  Artefacto,
  Entidad,
  Fragmento,
  Relacion,
} from "@/types/autogenes";

const T = 1_700_000_000_000;

const artefactos: Artefacto[] = [
  { id: "a1", kind: "pdf", nombre: "apuntes.pdf", paginas: 2, createdAt: T },
  { id: "a2", kind: "pdf", nombre: "paper.pdf", paginas: 1, createdAt: T },
];
const fragmentos: Fragmento[] = [
  { id: "f1", artefactoId: "a1", pagina: 1, texto: "x", createdAt: T },
  { id: "f2", artefactoId: "a1", pagina: 2, texto: "y", createdAt: T },
  { id: "f3", artefactoId: "a2", pagina: 1, texto: "z", createdAt: T },
];
const entidades: Entidad[] = [
  {
    id: "e1",
    nombre: "Entropía",
    tipo: "concepto",
    origen: "synesis",
    evidencia: ["f1", "f2", "f3"],
    createdAt: T,
  },
  {
    id: "e2",
    nombre: "Boltzmann",
    tipo: "persona",
    origen: "synesis",
    evidencia: ["f3"],
    createdAt: T,
  },
];
const relaciones: Relacion[] = [
  {
    id: "r1",
    desdeId: "e1",
    hastaId: "e2",
    tipo: "formulada por",
    peso: 0.8,
    evidencia: ["f3"],
    createdAt: T,
  },
  {
    id: "r2",
    desdeId: "e1",
    hastaId: "fantasma",
    tipo: "x",
    peso: 0.5,
    evidencia: [],
    createdAt: T,
  },
];

describe("construirGrafo", () => {
  const { nodos, enlaces } = construirGrafo(
    artefactos,
    fragmentos,
    entidades,
    relaciones,
  );

  it("projects every artefacto and entidad as a node", () => {
    expect(nodos).toHaveLength(4);
    expect(nodos.filter((n) => n.kind === "artefacto")).toHaveLength(2);
    expect(nodos.filter((n) => n.kind === "entidad")).toHaveLength(2);
  });

  it("derives deduped cita edges from evidence, weighted by count", () => {
    const citas = enlaces.filter((l) => l.kind === "cita");
    // e1 cites a1 (f1+f2 → one edge) and a2 (f3); e2 cites a2.
    expect(citas).toHaveLength(3);
    const e1a1 = citas.find((l) => l.source === "e1" && l.target === "a1");
    const e1a2 = citas.find((l) => l.source === "e1" && l.target === "a2");
    expect(e1a1?.peso).toBeCloseTo(0.7);
    expect(e1a2?.peso).toBeCloseTo(0.5);
  });

  it("keeps relacion edges only between existing entidades", () => {
    const rel = enlaces.filter((l) => l.kind === "relacion");
    expect(rel).toHaveLength(1);
    expect(rel[0].tipo).toBe("formulada por");
  });

  it("computes grado from projected edges", () => {
    const e1 = nodos.find((n) => n.id === "e1");
    const a2 = nodos.find((n) => n.id === "a2");
    expect(e1?.grado).toBe(3); // a1, a2, e2
    expect(a2?.grado).toBe(2); // e1, e2
  });

  it("seed is deterministic and bounded", () => {
    expect(seedDe("abc")).toBe(seedDe("abc"));
    expect(seedDe("abc")).not.toBe(seedDe("abd"));
    for (const n of nodos) {
      expect(n.seed).toBeGreaterThanOrEqual(0);
      expect(n.seed).toBeLessThan(2 * Math.PI);
    }
  });
});
