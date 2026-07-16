import { describe, expect, it } from "vitest";
import { claveConexion, proponerConexiones } from "@/lib/inferencia";
import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
  Relacion,
} from "@/types/autogenes";

const T = 1_700_000_000_000;

const ent = (id: string, nombre: string, evidencia: string[] = []): Entidad => ({
  id,
  nombre,
  tipo: "organizacion",
  origen: "synesis",
  evidencia,
  createdAt: T,
});

const base = {
  artefactos: [
    { id: "a1", kind: "pdf", nombre: "contrato.pdf", createdAt: T },
  ] as Artefacto[],
  fragmentos: [
    { id: "f1", artefactoId: "a1", pagina: 2, texto: "x", createdAt: T },
    { id: "f2", artefactoId: "a1", pagina: 3, texto: "y", createdAt: T },
  ] as Fragmento[],
  relaciones: [] as Relacion[],
  eventos: [] as Evento[],
};

describe("proponerConexiones", () => {
  it("proposes co-cited pairs with the shared fragments as evidence", () => {
    const p = proponerConexiones(
      {
        ...base,
        entidades: [ent("e1", "ACME", ["f1", "f2"]), ent("e2", "SAT", ["f1", "f2"])],
      },
      new Set(),
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      aId: "e1",
      bId: "e2",
      evidencia: ["f1", "f2"],
      motivos: ["co-citadas en 2 fragmentos"],
    });
    expect(p[0].citas).toContain("contrato.pdf · pág 2");
    expect(p[0].peso).toBeCloseTo(0.55, 5);
  });

  it("proposes pairs sharing a dated event, matched by alias", () => {
    const p = proponerConexiones(
      {
        ...base,
        entidades: [
          { ...ent("e1", "ACME"), alias: ["ACME Corporación"] },
          ent("e2", "Julio"),
        ],
        eventos: [
          {
            id: "ev1",
            titulo: "Firma del contrato",
            fecha: "2024-03-12",
            precision: "dia",
            entidades: ["acme corporación", "JULIO"],
            evidencia: ["f1"],
            origen: "synesis",
            createdAt: T,
          },
        ] as Evento[],
      },
      new Set(),
    );
    expect(p).toHaveLength(1);
    expect(p[0].motivos[0]).toContain("Firma del contrato");
    expect(p[0].motivos[0]).toContain("12 MAR 2024");
    expect(p[0].evidencia).toEqual(["f1"]);
  });

  it("corroborating signals raise the weight above either alone", () => {
    const ambos = proponerConexiones(
      {
        ...base,
        entidades: [ent("e1", "ACME", ["f1"]), ent("e2", "SAT", ["f1"])],
        eventos: [
          {
            id: "ev1",
            titulo: "Auditoría",
            fecha: "2024-01-01",
            precision: "anio",
            entidades: ["ACME", "SAT"],
            evidencia: [],
            origen: "synesis",
            createdAt: T,
          },
        ] as Evento[],
      },
      new Set(),
    );
    expect(ambos[0].motivos).toHaveLength(2);
    expect(ambos[0].peso).toBeCloseTo(0.55, 5);
  });

  it("never proposes already-related or discarded pairs", () => {
    const entidades = [ent("e1", "ACME", ["f1"]), ent("e2", "SAT", ["f1"])];
    expect(
      proponerConexiones(
        {
          ...base,
          entidades,
          relaciones: [
            {
              id: "r1",
              desdeId: "e2",
              hastaId: "e1",
              tipo: "audita",
              peso: 0.5,
              evidencia: [],
              createdAt: T,
            },
          ] as Relacion[],
        },
        new Set(),
      ),
    ).toHaveLength(0);
    expect(
      proponerConexiones(
        { ...base, entidades },
        new Set([claveConexion("e2", "e1")]),
      ),
    ).toHaveLength(0);
  });

  it("claveConexion is order-insensitive and namespaced", () => {
    expect(claveConexion("b", "a")).toBe(claveConexion("a", "b"));
    expect(claveConexion("a", "b").startsWith("inf:")).toBe(true);
  });
});
