import { describe, expect, it } from "vitest";
import {
  construirCorpus,
  recuperar,
  tokenizar,
  fusionarRRF,
  type DocumentoCorpus,
} from "@/lib/recuperacion";
import type { Entidad, Evento, Fragmento } from "@/types/autogenes";
import type { Datum } from "@/types/datum";

const T = 1_700_000_000_000;

describe("tokenizar", () => {
  it("folds accents, drops stopwords, stems plurals", () => {
    expect(tokenizar("La extracción de las entidades")).toEqual([
      "extraccion",
      "entidad",
    ]);
    expect(tokenizar("el de la los y")).toEqual([]);
    expect(tokenizar("meses países")).toEqual(["mes", "pais"]);
  });
});

describe("construirCorpus", () => {
  it("projects all four layers with citations", () => {
    const corpus = construirCorpus(
      [{ id: "d1", campo: "fiscal", etiqueta: "RFC", valor: "XAXX", createdAt: T }] as Datum[],
      [{ id: "a1", kind: "pdf", nombre: "contrato.pdf", createdAt: T }],
      [
        { id: "f1", artefactoId: "a1", pagina: 2, texto: "renta mensual", createdAt: T },
        { id: "f2", artefactoId: "a1", texto: "   ", createdAt: T }, // empty → skipped
      ] as Fragmento[],
      [
        {
          id: "e1", nombre: "SAT", tipo: "organizacion", origen: "synesis",
          alias: ["Servicio de Administración Tributaria"], evidencia: [], createdAt: T,
        },
      ] as Entidad[],
      [
        {
          id: "ev1", titulo: "Firma del contrato", fecha: "2024-03-12",
          precision: "dia", entidades: [], evidencia: ["f1"], origen: "synesis", createdAt: T,
        },
      ] as Evento[],
    );
    expect(corpus.map((c) => c.clase).sort()).toEqual([
      "dato", "entidad", "evento", "fragmento",
    ]);
    expect(corpus.find((c) => c.clase === "fragmento")!.cita).toBe(
      "contrato.pdf · pág 2",
    );
    expect(corpus.find((c) => c.clase === "evento")!.cita).toBe(
      "evento · 12 MAR 2024",
    );
    // alias is searchable
    expect(corpus.find((c) => c.clase === "entidad")!.texto).toContain(
      "Tributaria",
    );
  });
});

const doc = (id: string, texto: string): DocumentoCorpus => ({
  clase: "fragmento",
  id,
  texto,
  titulo: id,
  cita: id,
});

describe("recuperar (BM25)", () => {
  const corpus = [
    doc("arrendamiento", "El contrato de arrendamiento fija la renta mensual del inmueble en tres pagos."),
    doc("clima", "El pronóstico del clima para Monterrey indica lluvia ligera toda la semana."),
    doc("nomina", "La nómina quincenal incluye el descuento del IMSS y la retención del ISR."),
  ];

  it("ranks the relevant document first, word order irrelevant", () => {
    const hits = recuperar("renta del arrendamiento", corpus);
    expect(hits[0].id).toBe("arrendamiento");
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it("matches accent-insensitively and across plural forms", () => {
    const hits = recuperar("pronostico lluvias", corpus);
    expect(hits[0].id).toBe("clima");
  });

  it("returns nothing for stopword-only or unrelated queries", () => {
    expect(recuperar("el de la", corpus)).toHaveLength(0);
    expect(recuperar("blockchain cuántico", corpus)).toHaveLength(0);
  });

  it("caps at k and excerpts around the hit for long docs", () => {
    const relleno = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(" ");
    const largo = doc("largo", `${relleno} arrendamiento vencido ${relleno}`);
    const hits = recuperar("arrendamiento", [...corpus, largo], 2);
    expect(hits).toHaveLength(2);
    const hitLargo = recuperar("arrendamiento", [largo])[0];
    expect(hitLargo.extracto).toContain("arrendamiento");
    expect(hitLargo.extracto.length).toBeLessThan(largo.texto.length);
  });
});

describe("fusionarRRF (F2a)", () => {
  it("un id bien rankeado por ambos carriles gana", () => {
    const bm25 = ["a", "b", "c"];
    const semantico = ["b", "a", "d"];
    const fusion = fusionarRRF([bm25, semantico]);
    // "a" (1º y 2º) y "b" (2º y 1º) empatan arriba; ambos por encima de c y d.
    expect(fusion.slice(0, 2).map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(fusion.map((r) => r.id)).toContain("d");
  });

  it("un id exclusivo de un carril entra pero por debajo", () => {
    const fusion = fusionarRRF([["x", "y"], ["x", "z"]]);
    expect(fusion[0].id).toBe("x"); // en ambos → mayor puntaje
    expect(fusion.map((r) => r.id)).toEqual(expect.arrayContaining(["x", "y", "z"]));
  });

  it("listas vacías dan resultado vacío", () => {
    expect(fusionarRRF([[], []])).toEqual([]);
  });
});
