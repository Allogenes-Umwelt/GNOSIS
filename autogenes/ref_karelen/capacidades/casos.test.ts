import { describe, expect, it } from "vitest";
import {
  alcanceDeCaso,
  informeDeCierre,
  PLANTILLAS_CASO,
  resumenCaso,
} from "@/capacidades/casos";
import { InformeSchema } from "@/capacidades/informe";
import type {
  Artefacto,
  Caso,
  Entidad,
  Evento,
  Fragmento,
  Producto,
} from "@/types/autogenes";

const T = 1_700_000_000_000;

const g = {
  artefactos: [
    { id: "a1", kind: "estructurado", nombre: "agenda.ics", createdAt: T },
  ] as Artefacto[],
  fragmentos: [
    { id: "f1", artefactoId: "a1", pagina: 1, texto: "x", createdAt: T },
  ] as Fragmento[],
  entidades: [
    {
      id: "e1", nombre: "ACME", tipo: "organizacion", alias: ["ACME Corp"],
      origen: "synesis", evidencia: [], createdAt: T,
    },
  ] as Entidad[],
  eventos: [
    {
      id: "ev1", titulo: "Firma con acme corp", fecha: "2026-03-12",
      precision: "dia", entidades: ["acme corp"], evidencia: [], origen: "synesis", createdAt: T,
    },
    {
      id: "ev2", titulo: "Cita del calendario", fecha: "2026-01-05",
      precision: "dia", entidades: [], evidencia: ["f1"], origen: "synesis", createdAt: T,
    },
    {
      id: "ev3", titulo: "Ajeno al caso", fecha: "2026-02-01",
      precision: "dia", entidades: ["OTRA"], evidencia: [], origen: "synesis", createdAt: T,
    },
  ] as Evento[],
  productos: [] as Producto[],
};

const caso: Caso = {
  id: "c1",
  nombre: "Renovación",
  estado: "abierto",
  entidades: ["e1", "muerta"],
  artefactos: ["a1"],
  productos: ["p-muerto"],
  notas: [],
  createdAt: T,
};

describe("resumenCaso", () => {
  it("resolves live anchors and silently drops dead ids", () => {
    const r = resumenCaso(caso, g);
    expect(r.entidades.map((e) => e.nombre)).toEqual(["ACME"]);
    expect(r.artefactos.map((a) => a.nombre)).toEqual(["agenda.ics"]);
    expect(r.productos).toHaveLength(0);
  });

  it("derives the case cronología: member entities (by alias) OR member-source fragments, dated and cited", () => {
    const r = resumenCaso(caso, g);
    expect(r.cronologia.map((h) => h.eventoId)).toEqual(["ev2", "ev1"]);
    expect(r.cronologia[0].citas).toEqual(["agenda.ics · pág 1"]);
    expect(r.cronologia[1].fecha).toBe("12 MAR 2026");
  });
});

describe("informeDeCierre (L·3)", () => {
  it("arma el informe determinista con la evidencia REAL del caso", () => {
    const caso: Caso = {
      id: "c1",
      nombre: "Renovación de póliza",
      objetivo: "Renovar sin lagunas de cobertura",
      estado: "abierto",
      entidades: ["e1"],
      artefactos: ["a1"],
      productos: [],
      notas: [{ id: "n1", texto: "La prima subió 8 por ciento", createdAt: T }],
      createdAt: T,
    };
    const resumen = resumenCaso(caso, g);
    const { informe, evidencia, entidades } = informeDeCierre(resumen);

    // Válido por construcción contra el contrato real de informes.
    expect(() => InformeSchema.parse(informe)).not.toThrow();
    expect(informe.titulo).toBe("Cierre · Renovación de póliza");
    expect(informe.secciones.map((s) => s.encabezado)).toEqual([
      "Objetivo",
      "Entidades del caso",
      "Cronología",
      "Notas del operador",
    ]);
    // La cronología cita los fragmentos reales del evento del fixture.
    expect(evidencia).toContain("f1");
    expect(entidades).toEqual(["e1"]);
  });

  it("las plantillas traen checklist y objetivo listos para sembrar", () => {
    expect(PLANTILLAS_CASO.length).toBeGreaterThanOrEqual(4);
    for (const p of PLANTILLAS_CASO) {
      expect(p.nombre.length).toBeGreaterThan(0);
      expect(p.lista.length).toBeGreaterThan(0);
      expect(p.lista.every((x) => x.startsWith("Pendiente:"))).toBe(true);
    }
  });
});

describe("alcanceDeCaso (L·5)", () => {
  it("delimita entidades ancladas, fragmentos de sus fuentes y eventos que las nombran o citan", () => {
    const caso: Caso = {
      id: "c1",
      nombre: "Caso",
      estado: "abierto",
      entidades: ["e1"],
      artefactos: ["a1"],
      productos: [],
      notas: [],
      createdAt: T,
    };
    const a = alcanceDeCaso(caso, g);
    expect(a.entidadIds.has("e1")).toBe(true);
    expect(a.fragmentoIds.has("f1")).toBe(true);
    // El evento del fixture nombra a la entidad anclada (o cita f1).
    expect(a.eventoIds.size).toBeGreaterThan(0);
  });

  it("un caso sin anclas delimita el conjunto vacío", () => {
    const caso: Caso = {
      id: "c2",
      nombre: "Vacío",
      estado: "abierto",
      entidades: [],
      artefactos: [],
      productos: [],
      notas: [],
      createdAt: T,
    };
    const a = alcanceDeCaso(caso, g);
    expect(a.entidadIds.size).toBe(0);
    expect(a.fragmentoIds.size).toBe(0);
    expect(a.eventoIds.size).toBe(0);
  });
});
