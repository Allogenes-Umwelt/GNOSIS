import { describe, expect, it } from "vitest";
import {
  caminoMasCorto,
  masConectadas,
  vecindario,
} from "@/capacidades/caminos";
import type {
  Artefacto,
  Entidad,
  Fragmento,
  Relacion,
} from "@/types/autogenes";

const T = 1_700_000_000_000;

const rel = (
  id: string,
  desdeId: string,
  hastaId: string,
  tipo = "liga",
  evidencia: string[] = [],
): Relacion => ({ id, desdeId, hastaId, tipo, peso: 0.5, evidencia, createdAt: T });

// a → b → c → d, plus a long way around a → x → y → d
const relaciones = [
  rel("r1", "a", "b", "emplea", ["f1"]),
  rel("r2", "c", "b", "audita"), // stored against the walking direction
  rel("r3", "c", "d", "paga a"),
  rel("r4", "a", "x"),
  rel("r5", "x", "y"),
  rel("r6", "y", "d"),
];

const artefactos = [
  { id: "a1", kind: "pdf", nombre: "contrato.pdf", createdAt: T },
] as Artefacto[];
const fragmentos = [
  { id: "f1", artefactoId: "a1", pagina: 2, texto: "x", createdAt: T },
] as Fragmento[];

describe("caminoMasCorto", () => {
  it("finds the fewest-hop path, reporting real edge direction and citations", () => {
    const c = caminoMasCorto("a", "d", relaciones, fragmentos, artefactos)!;
    expect(c.entidades).toEqual(["a", "b", "c", "d"]);
    expect(c.pasos).toHaveLength(3);
    expect(c.pasos[0]).toMatchObject({
      hastaId: "b",
      tipo: "emplea",
      saliente: true,
      citas: ["contrato.pdf · pág 2"],
    });
    // r2 is stored c→b; walking b→c goes against it.
    expect(c.pasos[1]).toMatchObject({ tipo: "audita", saliente: false });
  });

  it("returns null when disconnected and a zero-hop path to itself", () => {
    expect(caminoMasCorto("a", "zzz", relaciones, [], [])).toBeNull();
    expect(caminoMasCorto("a", "a", relaciones, [], [])).toEqual({
      entidades: ["a"],
      pasos: [],
    });
  });
});

describe("vecindario", () => {
  it("maps entities to hop distance up to the given depth", () => {
    const v = vecindario("a", relaciones, 2);
    expect(v.get("b")).toBe(1);
    expect(v.get("x")).toBe(1);
    expect(v.get("c")).toBe(2);
    expect(v.get("y")).toBe(2);
    expect(v.has("d")).toBe(false); // 3 hops away
    expect(v.has("a")).toBe(false); // self excluded
  });
});

describe("masConectadas", () => {
  it("ranks by degree, drops isolated entities, caps at n", () => {
    const entidades = ["a", "b", "c", "d", "x", "y", "suelta"].map(
      (id) =>
        ({
          id, nombre: id.toUpperCase(), tipo: "concepto", origen: "synesis",
          evidencia: [], createdAt: T,
        }) as Entidad,
    );
    const top = masConectadas(entidades, relaciones, 3);
    expect(top).toHaveLength(3);
    expect(top[0].grado).toBe(2);
    expect(top.map((x) => x.entidad.id)).not.toContain("suelta");
  });
});
