import { describe, expect, it } from "vitest";
import { construirExpediente, type GrafoFuente } from "@/capacidades/expediente";
import type { Entidad, Evento, Fragmento, Relacion } from "@/types/autogenes";

const T = 1_700_000_000_000;

const grafo: GrafoFuente = {
  artefactos: [
    { id: "a1", kind: "pdf", nombre: "contrato.pdf", createdAt: T },
  ],
  fragmentos: [
    {
      id: "f1",
      artefactoId: "a1",
      pagina: 2,
      texto: "ACME Corporación firma el arrendamiento del inmueble.",
      createdAt: T,
    },
    {
      id: "f2",
      artefactoId: "a1",
      pagina: 5,
      texto: "La renta pactada con ACME vence cada primer día hábil.",
      createdAt: T,
    },
  ] as Fragmento[],
  entidades: [
    {
      id: "e1",
      nombre: "ACME",
      tipo: "organizacion",
      alias: ["ACME Corporación"],
      origen: "synesis",
      evidencia: ["f1", "frag-borrado"],
      createdAt: T,
    },
    {
      id: "e2",
      nombre: "Julio",
      tipo: "persona",
      origen: "operador",
      evidencia: [],
      createdAt: T,
    },
  ] as Entidad[],
  relaciones: [
    {
      id: "r1",
      desdeId: "e1",
      hastaId: "e2",
      tipo: "arrienda a",
      peso: 0.8,
      evidencia: ["f1"],
      createdAt: T,
    },
    {
      id: "r2",
      desdeId: "e2",
      hastaId: "e1",
      tipo: "paga a",
      peso: 0.5,
      evidencia: [],
      createdAt: T,
    },
  ] as Relacion[],
  eventos: [
    {
      id: "ev1",
      titulo: "Firma del contrato",
      fecha: "2024-03-12",
      precision: "dia",
      entidades: ["acme corporación"],
      evidencia: ["f1"],
      origen: "synesis",
      createdAt: T,
    },
    {
      id: "ev2",
      titulo: "Evento ajeno",
      fecha: "2024-01-01",
      precision: "anio",
      entidades: ["Otra Empresa"],
      evidencia: [],
      origen: "synesis",
      createdAt: T,
    },
  ] as Evento[],
};

describe("construirExpediente", () => {
  it("returns null for an unknown entity", () => {
    expect(construirExpediente("nadie", grafo)).toBeNull();
  });

  it("resolves declared evidence to citations, dropping dead fragment ids", () => {
    const x = construirExpediente("e1", grafo)!;
    expect(x.evidencia).toHaveLength(1);
    expect(x.evidencia[0].cita).toBe("contrato.pdf · pág 2");
    expect(x.evidencia[0].extracto).toContain("ACME");
  });

  it("labels neighbors by edge direction with resolved citations", () => {
    const x = construirExpediente("e1", grafo)!;
    expect(x.vecinos).toHaveLength(2);
    expect(x.vecinos[0]).toMatchObject({
      nombre: "Julio",
      enlace: "arrienda a →",
      citas: ["contrato.pdf · pág 2"],
    });
    expect(x.vecinos[1].enlace).toBe("← paga a");
  });

  it("matches cronología by name OR alias, accent/case-insensitive, date-ordered", () => {
    const x = construirExpediente("e1", grafo)!;
    expect(x.cronologia).toHaveLength(1);
    expect(x.cronologia[0]).toMatchObject({
      fecha: "12 MAR 2024",
      titulo: "Firma del contrato",
    });
  });

  it("surfaces cited mentions beyond declared evidence, never duplicating it", () => {
    const x = construirExpediente("e1", grafo)!;
    const ids = x.menciones.map((m) => m.fragmentoId);
    expect(ids).toContain("f2");
    expect(ids).not.toContain("f1");
    expect(x.menciones[0].cita).toBe("contrato.pdf · pág 5");
  });
});
