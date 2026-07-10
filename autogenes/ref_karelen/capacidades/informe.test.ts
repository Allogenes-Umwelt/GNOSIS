import { describe, expect, it } from "vitest";
import {
  construirDigesto,
  sanearInforme,
  type Informe,
} from "@/capacidades/informe";
import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
  Relacion,
} from "@/types/autogenes";

const T = 1_700_000_000_000;

describe("construirDigesto", () => {
  const artefactos = [
    { id: "a1", kind: "pdf", nombre: "contrato.pdf", createdAt: T },
    { id: "a2", kind: "pdf", nombre: "poliza.pdf", createdAt: T },
  ] as Artefacto[];
  const frag = (id: string, artefactoId: string, texto = `texto ${id}`): Fragmento =>
    ({ id, artefactoId, texto, createdAt: T }) as Fragmento;

  it("samples fragments round-robin across sources, skipping empty ones", () => {
    const fragmentos = [
      ...Array.from({ length: 20 }, (_, i) => frag(`c${i}`, "a1")),
      frag("vacio", "a2", "   "),
      frag("p0", "a2"),
      frag("p1", "a2"),
    ];
    const d = construirDigesto(artefactos, fragmentos, [], [], []);
    expect(d.fragmentos).toHaveLength(18);
    // Both sources represented — no single document hogs the digest.
    expect(d.fragmentos.some((f) => f.fuente === "poliza.pdf")).toBe(true);
    expect(d.fragmentos.some((f) => f.id === "vacio")).toBe(false);
  });

  it("renders relations by name and events with formatted dates", () => {
    const entidades = [
      { id: "e1", nombre: "ACME", tipo: "organizacion", origen: "synesis", evidencia: [], createdAt: T },
      { id: "e2", nombre: "JULIO", tipo: "persona", origen: "operador", evidencia: [], createdAt: T },
    ] as Entidad[];
    const relaciones = [
      { id: "r1", desdeId: "e1", hastaId: "e2", tipo: "emplea", peso: 0.5, evidencia: [], createdAt: T },
      { id: "r2", desdeId: "e1", hastaId: "muerta", tipo: "x", peso: 0.5, evidencia: [], createdAt: T },
    ] as Relacion[];
    const eventos = [
      { id: "ev1", titulo: "Firma", fecha: "2024-03-12", precision: "dia", entidades: [], evidencia: [], origen: "synesis", createdAt: T },
    ] as Evento[];
    const d = construirDigesto([], [], entidades, relaciones, eventos);
    expect(d.relaciones).toEqual(["ACME —emplea→ JULIO"]);
    expect(d.eventos).toEqual([{ titulo: "Firma", fecha: "12 MAR 2024" }]);
  });
});

describe("sanearInforme", () => {
  const informe: Informe = {
    titulo: "Situación",
    secciones: [
      {
        encabezado: "Actores",
        puntos: [
          { texto: "Punto citado", evidencia: ["f1", "inventado"], entidades: [] },
          { texto: "Punto del grafo", evidencia: [], entidades: ["ACME", "FALSA"] },
          { texto: "Punto huérfano", evidencia: ["nada"], entidades: ["NADIE"] },
        ],
      },
      {
        encabezado: "Vacía tras poda",
        puntos: [{ texto: "Sin nada", evidencia: [], entidades: [] }],
      },
    ],
  };

  it("prunes fabricated ids/names, kills uncited points and empty sections", () => {
    const s = sanearInforme(informe, new Set(["f1"]), new Set(["ACME"]));
    expect(s.secciones).toHaveLength(1);
    expect(s.secciones[0].puntos).toHaveLength(2);
    expect(s.secciones[0].puntos[0].evidencia).toEqual(["f1"]);
    expect(s.secciones[0].puntos[1].entidades).toEqual(["ACME"]);
  });
});
