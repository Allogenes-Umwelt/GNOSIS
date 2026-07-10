import { describe, expect, it } from "vitest";
import { arbolOntologia, construirOntologia, NUCLEO_ID, proyectarMemoria } from "@/lib/ontologia";
import type { Artefacto, Entidad, Fragmento, Relacion } from "@/types/autogenes";
import type { Datum } from "@/types/datum";

const T = 1_700_000_000_000;
const ent = (id: string, nombre: string, extra: Partial<Entidad> = {}): Entidad => ({
  id,
  nombre,
  tipo: "concepto",
  origen: "synesis",
  evidencia: [],
  createdAt: T,
  ...extra,
});
const datum = (id: string, campo: Datum["campo"], etiqueta: string): Datum => ({
  id,
  campo,
  etiqueta,
  valor: "valor real",
  createdAt: T,
});

describe("proyectarMemoria", () => {
  it("projects entities with outgoing relations resolved to names", () => {
    const entidades = [ent("e1", "SAT"), ent("e2", "RFC", { resumen: "Clave fiscal" })];
    const relaciones: Relacion[] = [
      {
        id: "r1",
        desdeId: "e2",
        hastaId: "e1",
        tipo: "emitido por",
        peso: 0.5,
        evidencia: [],
        createdAt: T,
      },
      // dangling target must not leak
      {
        id: "r2",
        desdeId: "e2",
        hastaId: "fantasma",
        tipo: "x",
        peso: 0.5,
        evidencia: [],
        createdAt: T,
      },
    ];
    const objetos = proyectarMemoria(entidades, relaciones);
    expect(objetos).toHaveLength(2);
    const rfc = objetos.find((o) => o.nombre === "RFC")!;
    expect(rfc.resumen).toBe("Clave fiscal");
    expect(rfc.relaciones).toEqual([{ con: "SAT", tipo: "emitido por" }]);
    expect(objetos.find((o) => o.nombre === "SAT")!.relaciones).toEqual([]);
  });
});

describe("construirOntologia", () => {
  it("returns empty for an empty umwelt", () => {
    const m = construirOntologia([], [], [], [], []);
    expect(m.nodos).toEqual([]);
    expect(m.enlaces).toEqual([]);
  });

  it("anchors the nucleus and hangs campos, datos, sources and entities", () => {
    const datos = [datum("d1", "fiscal", "RFC"), datum("d2", "fiscal", "CURP")];
    const artefactos: Artefacto[] = [
      { id: "a1", kind: "pdf", nombre: "contrato.pdf", createdAt: T },
    ];
    const fragmentos: Fragmento[] = [
      { id: "f1", artefactoId: "a1", texto: "x", createdAt: T },
    ];
    const entidades = [
      ent("e1", "SAT", { campo: "fiscal", evidencia: ["f1"] }),
      ent("e2", "Suelto"),
    ];
    const m = construirOntologia(datos, artefactos, fragmentos, entidades, []);

    const nucleo = m.nodos.find((n) => n.id === NUCLEO_ID)!;
    expect(nucleo.kind).toBe("nucleo");
    expect(nucleo.fx).toBe(0);

    expect(m.nodos.filter((n) => n.kind === "campo")).toHaveLength(1);
    expect(m.nodos.filter((n) => n.kind === "dato")).toHaveLength(2);
    expect(m.nodos.filter((n) => n.kind === "artefacto")).toHaveLength(1);
    expect(m.nodos.filter((n) => n.kind === "entidad")).toHaveLength(2);
    // the source's fragment paints under it, tethered to the artefacto
    expect(m.nodos.filter((n) => n.kind === "fragmento")).toHaveLength(1);
    expect(
      m.enlaces.some((l) => l.source === "a1" && l.target === "frag-f1"),
    ).toBe(true);

    // nucleus → campo, campo → datos, campo → tagged entity, nucleus → source
    expect(m.enlaces.some((l) => l.source === NUCLEO_ID && l.target === "campo-fiscal")).toBe(true);
    expect(m.enlaces.some((l) => l.source === "campo-fiscal" && l.target === "dato-d1")).toBe(true);
    expect(m.enlaces.some((l) => l.source === "campo-fiscal" && l.target === "e1")).toBe(true);
    expect(m.enlaces.some((l) => l.source === NUCLEO_ID && l.target === "a1")).toBe(true);
    // untagged entity hangs only from its evidence (cita edge from base graph)
    expect(m.enlaces.some((l) => l.target === "e2" || l.source === "e2")).toBe(false);

    // degrees recomputed over the full map
    expect(nucleo.grado).toBeGreaterThanOrEqual(2);
  });
});

describe("arbolOntologia (O1)", () => {
  it("cuelga campos y fuentes del operador, con ids del inspector", () => {
    const datos = [datum("d1", "fiscal", "RFC")];
    const artefactos: Artefacto[] = [
      { id: "a1", kind: "pdf", nombre: "contrato.pdf", createdAt: T },
    ];
    const fragmentos: Fragmento[] = [
      { id: "f1", artefactoId: "a1", texto: "x", createdAt: T },
    ];
    const entidades = [
      ent("e1", "SAT", { campo: "fiscal" }),
      ent("e2", "Notario", { evidencia: ["f1"] }),
      ent("e3", "Suelta"),
    ];
    const raiz = arbolOntologia(datos, artefactos, fragmentos, entidades)!;
    expect(raiz.id).toBe(NUCLEO_ID);
    const campo = raiz.hijos.find((h) => h.id === "campo-fiscal")!;
    expect(campo.hijos.map((h) => h.id)).toEqual(["dato-d1", "e1"]);
    const fuente = raiz.hijos.find((h) => h.id === "a1")!;
    expect(fuente.hijos.map((h) => h.id)).toEqual(["frag-f1", "e2"]);
    // La entidad sin campo ni evidencia queda a la vista, bajo el operador.
    expect(raiz.hijos.some((h) => h.id === "e3")).toBe(true);
  });

  it("vacío devuelve null y los excedentes se agregan con conteo honesto", () => {
    expect(arbolOntologia([], [], [], [])).toBeNull();
    const muchos = Array.from({ length: 14 }, (_, i) =>
      datum(`d${i}`, "fiscal", `D${i}`),
    );
    const raiz = arbolOntologia(muchos, [], [], [])!;
    const campo = raiz.hijos.find((h) => h.id === "campo-fiscal")!;
    expect(campo.hijos).toHaveLength(11);
    expect(campo.hijos[10].kind).toBe("agregado");
    expect(campo.hijos[10].etiqueta).toBe("+4 datos");
  });
});
