import { describe, expect, it } from "vitest";
import {
  claveOmision,
  oportunidadesFicha,
  parsearCandidatosFicha,
} from "@/lib/enriquecimiento";
import type { Entidad } from "@/types/autogenes";

const T = 1_700_000_000_000;

const ent = (id: string, resumen?: string, createdAt = T): Entidad => ({
  id,
  nombre: id.toUpperCase(),
  tipo: "organizacion",
  resumen,
  origen: "synesis",
  evidencia: [],
  createdAt,
});

describe("oportunidadesFicha", () => {
  it("surfaces only entities without a summary, skipping omitted, oldest first", () => {
    const lista = oportunidadesFicha(
      [
        ent("nueva", undefined, T + 10),
        ent("vieja", "   ", T),
        ent("completa", "Ya tiene ficha."),
        ent("omitida"),
      ],
      new Set([claveOmision("omitida")]),
    );
    expect(lista.map((e) => e.id)).toEqual(["vieja", "nueva"]);
  });

  it("caps at 8", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => ent(`e${i}`));
    expect(oportunidadesFicha(muchas, new Set())).toHaveLength(8);
  });
});

describe("parsearCandidatosFicha", () => {
  it("parses the connector envelope and drops description-less hits", () => {
    const candidatos = parsearCandidatosFicha({
      conector: "wikidata",
      obtenido: "2026-07-02",
      datos: [
        { id: "Q1", nombre: "SAT", descripcion: "autoridad fiscal de México" },
        { id: "Q2", nombre: "Sin descripción" },
      ],
    });
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]).toMatchObject({ id: "Q1", nombre: "SAT" });
  });

  it("returns empty on an invalid shape", () => {
    expect(parsearCandidatosFicha({ error: "x" })).toEqual([]);
    expect(parsearCandidatosFicha(null)).toEqual([]);
  });
});

describe("candidatosLote y confianzaFicha (N3)", () => {
  it("el lote solo admite tipos públicos: las personas nunca viajan", async () => {
    const { candidatosLote } = await import("@/lib/enriquecimiento");
    const persona: Entidad = { ...ent("juan"), tipo: "persona" };
    const documento: Entidad = { ...ent("acta"), tipo: "documento" };
    const lista = candidatosLote([ent("banxico"), persona, documento], new Set());
    expect(lista.map((e) => e.id)).toEqual(["banxico"]);
  });

  it("respeta omisiones y el tope del lote", async () => {
    const { candidatosLote } = await import("@/lib/enriquecimiento");
    const muchas = Array.from({ length: 9 }, (_, i) => ent(`e${i}`, undefined, T + i));
    const lista = candidatosLote(muchas, new Set([claveOmision("e0")]));
    expect(lista).toHaveLength(6);
    expect(lista[0].id).toBe("e1");
  });

  it("la confianza es determinista y explicable", async () => {
    const { confianzaFicha } = await import("@/lib/enriquecimiento");
    const exacta = confianzaFicha("Banco de México", {
      id: "Q1",
      nombre: "banco de méxico",
      descripcion: "banco central",
      url: "https://x",
    });
    expect(exacta).toBeCloseTo(0.9, 5);
    const parcial = confianzaFicha("Banco de México", {
      id: "Q2",
      nombre: "México",
      descripcion: "país",
    });
    expect(parcial).toBeCloseTo(0.5, 5);
    const nula = confianzaFicha("Casero", { id: "Q3", nombre: "Renta" });
    expect(nula).toBe(0);
  });
});
