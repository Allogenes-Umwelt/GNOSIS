import { describe, expect, it } from "vitest";
import { clavePar, proponerFusiones, UMBRAL_PROPUESTA } from "@/lib/resolucion";
import type { Entidad, Relacion } from "@/types/autogenes";

const T = 1_700_000_000_000;
const ent = (id: string, nombre: string, extra: Partial<Entidad> = {}): Entidad => ({
  id,
  nombre,
  tipo: "organizacion",
  origen: "synesis",
  evidencia: [],
  createdAt: T,
  ...extra,
});
const rel = (id: string, desdeId: string, hastaId: string): Relacion => ({
  id,
  desdeId,
  hastaId,
  tipo: "liga",
  peso: 0.5,
  evidencia: [],
  createdAt: T,
});

describe("proponerFusiones", () => {
  it("proposes accent variants and acronyms; skips unrelated names", () => {
    const entidades = [
      ent("e1", "Administración Tributaria"),
      ent("e2", "Administracion tributaria."),
      ent("e3", "SAT", { tipo: "otro" }),
      ent("e4", "Servicio de Administración Tributaria"),
      ent("e5", "Profeco"),
    ];
    const p = proponerFusiones(entidades, []);
    const claves = p.map((x) => clavePar(x.aId, x.bId));
    expect(claves).toContain("e1|e2");
    expect(claves).toContain("e3|e4");
    expect(claves.every((c) => !c.includes("e5"))).toBe(true);
    expect(p[0].score).toBeGreaterThanOrEqual(UMBRAL_PROPUESTA);
  });

  it("shared evidence and neighbors raise the score", () => {
    const sueltas = proponerFusiones(
      [ent("a", "Banxico"), ent("b", "Banxici")],
      [],
    );
    const corroboradas = proponerFusiones(
      [
        ent("a", "Banxico", { evidencia: ["f1", "f2"] }),
        ent("b", "Banxici", { evidencia: ["f1", "f2"] }),
        ent("c", "Tipo de cambio"),
      ],
      [rel("r1", "a", "c"), rel("r2", "b", "c")],
    );
    const s1 = sueltas.find((x) => clavePar(x.aId, x.bId) === "a|b")!;
    const s2 = corroboradas.find((x) => clavePar(x.aId, x.bId) === "a|b")!;
    expect(s2.score).toBeGreaterThan(s1.score);
    expect(s2.senales.evidenciaCompartida).toBe(2);
    expect(s2.senales.vecinosCompartidos).toBe(1);
  });

  it("never re-proposes pairs the operator ruled out", () => {
    const entidades = [ent("e1", "Banxico"), ent("e2", "Banxici")];
    expect(proponerFusiones(entidades, [])).toHaveLength(1);
    expect(
      proponerFusiones(entidades, [], new Set([clavePar("e1", "e2")])),
    ).toHaveLength(0);
  });

  it("matches through aliases", () => {
    const entidades = [
      ent("e1", "Hacienda", { alias: ["Secretaría de Hacienda"] }),
      ent("e2", "Secretaria de Hacienda."),
    ];
    const p = proponerFusiones(entidades, []);
    expect(p).toHaveLength(1);
    expect(p[0].senales.nombre).toBeGreaterThan(0.9);
  });
});
