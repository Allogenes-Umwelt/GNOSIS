import { describe, expect, it } from "vitest";
import {
  muestrearFragmentos,
  sanearQuiz,
  sanearResumen,
} from "@/lib/estudio";
import type { Fragmento, PreguntaQuiz, PuntoResumen } from "@/types/autogenes";

const T = 1_700_000_000_000;
const frag = (id: string, texto: string, pagina = 1): Fragmento => ({
  id,
  artefactoId: "a1",
  pagina,
  texto,
  createdAt: T,
});

describe("muestrearFragmentos", () => {
  it("skips empty fragments and truncates long ones", () => {
    const m = muestrearFragmentos([frag("f1", "   "), frag("f2", "x".repeat(5000))]);
    expect(m).toHaveLength(1);
    expect(m[0].id).toBe("f2");
    expect(m[0].texto.length).toBe(1600);
  });

  it("samples evenly across a long source, preserving order", () => {
    const fs = Array.from({ length: 100 }, (_, i) => frag(`f${i}`, `pag ${i}`, i + 1));
    const m = muestrearFragmentos(fs, 10);
    expect(m).toHaveLength(10);
    expect(m[0].id).toBe("f0");
    // spread: last sampled fragment comes from the tail, not the head
    const ultimo = Number(m[m.length - 1].id.slice(1));
    expect(ultimo).toBeGreaterThan(80);
    const indices = m.map((f) => Number(f.id.slice(1)));
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  it("respects the char budget", () => {
    const fs = Array.from({ length: 20 }, (_, i) => frag(`f${i}`, "x".repeat(1600)));
    const m = muestrearFragmentos(fs, 24, 5000);
    expect(m.length).toBeLessThanOrEqual(4);
  });
});

const pregunta = (over: Partial<PreguntaQuiz> = {}): PreguntaQuiz => ({
  pregunta: "¿Qué es KARELEN?",
  opciones: ["Un sustrato", "Un lago", "Un modelo", "Un puerto"],
  correcta: 0,
  evidencia: ["f1"],
  ...over,
});

describe("sanearQuiz", () => {
  const ids = new Set(["f1", "f2"]);

  it("drops questions with no real evidence", () => {
    const out = sanearQuiz([pregunta({ evidencia: ["fantasma"] })], ids);
    expect(out).toHaveLength(0);
  });

  it("drops out-of-range answers and duplicate options", () => {
    expect(sanearQuiz([pregunta({ correcta: 4 })], ids)).toHaveLength(0);
    expect(
      sanearQuiz([pregunta({ opciones: ["a", "a", "b", "c"] })], ids),
    ).toHaveLength(0);
  });

  it("filters evidence to real ids and collapses duplicate questions", () => {
    const out = sanearQuiz(
      [pregunta({ evidencia: ["f1", "falso", "f2"] }), pregunta()],
      ids,
    );
    expect(out).toHaveLength(1);
    expect(out[0].evidencia).toEqual(["f1", "f2"]);
  });

  it("caps the total", () => {
    const muchas = Array.from({ length: 20 }, (_, i) =>
      pregunta({ pregunta: `P${i}` }),
    );
    expect(sanearQuiz(muchas, ids, 10)).toHaveLength(10);
  });
});

const punto = (over: Partial<PuntoResumen> = {}): PuntoResumen => ({
  texto: "KARELEN es el sustrato.",
  evidencia: ["f1"],
  ...over,
});

describe("sanearResumen", () => {
  const ids = new Set(["f1"]);

  it("enforces the provenance law and dedupes", () => {
    const out = sanearResumen(
      [punto(), punto(), punto({ texto: "Otro punto.", evidencia: ["nope"] })],
      ids,
    );
    expect(out).toHaveLength(1);
    expect(out[0].evidencia).toEqual(["f1"]);
  });
});
