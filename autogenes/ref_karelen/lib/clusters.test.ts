import { describe, expect, it } from "vitest";
import { construirConstelaciones } from "@/lib/clusters";
import type { Entidad, Relacion } from "@/types/autogenes";

const T = 1_700_000_000_000;
const ent = (id: string, nombre: string, evidencia: string[] = []): Entidad => ({
  id,
  nombre,
  tipo: "concepto",
  origen: "synesis",
  evidencia,
  createdAt: T,
});
const rel = (id: string, desdeId: string, hastaId: string, peso = 0.8): Relacion => ({
  id,
  desdeId,
  hastaId,
  tipo: "liga",
  peso,
  evidencia: ["f1"],
  createdAt: T,
});

describe("construirConstelaciones", () => {
  it("returns nothing for tiny or disconnected graphs", () => {
    expect(construirConstelaciones([ent("e1", "Sola")], [])).toEqual([]);
    expect(
      construirConstelaciones([ent("e1", "A"), ent("e2", "B")], []),
    ).toEqual([]);
  });

  it("separates two communities linked internally", () => {
    const entidades = [
      ent("a1", "Alfa"),
      ent("a2", "Beta"),
      ent("a3", "Gamma"),
      ent("b1", "Delta"),
      ent("b2", "Épsilon"),
    ];
    const relaciones = [
      rel("r1", "a1", "a2"),
      rel("r2", "a2", "a3"),
      rel("r3", "a1", "a3"),
      rel("r4", "b1", "b2"),
    ];
    const cs = construirConstelaciones(entidades, relaciones);
    expect(cs).toHaveLength(2);
    expect(cs[0].miembros).toHaveLength(3);
    expect(cs[1].miembros).toHaveLength(2);
    // banner = best-connected member
    expect(["Alfa", "Beta", "Gamma"]).toContain(cs[0].etiqueta);
  });

  it("binds entities by co-citation when no relation exists", () => {
    const entidades = [
      ent("e1", "Uno", ["f1"]),
      ent("e2", "Dos", ["f1"]),
      ent("e3", "Tres", ["f9"]),
    ];
    const cs = construirConstelaciones(entidades, []);
    expect(cs).toHaveLength(1);
    expect(cs[0].miembros.sort()).toEqual(["e1", "e2"]);
  });

  it("is deterministic regardless of input order", () => {
    const entidades = [
      ent("e1", "Uno", ["f1"]),
      ent("e2", "Dos", ["f1", "f2"]),
      ent("e3", "Tres", ["f2"]),
      ent("e4", "Cuatro", ["f3"]),
      ent("e5", "Cinco", ["f3"]),
    ];
    const relaciones = [rel("r1", "e1", "e3"), rel("r2", "e4", "e5")];
    const a = construirConstelaciones(entidades, relaciones);
    const b = construirConstelaciones(
      [...entidades].reverse(),
      [...relaciones].reverse(),
    );
    expect(a).toEqual(b);
  });
});
