import { describe, it, expect } from "vitest";
import {
  empacar,
  desempacar,
  probarEmpaqueLocal,
  parseSobre,
} from "@/services/sync";
import { FraseIncorrectaError, RespaldoDanadoError } from "@/lib/cifrado";
import type { ExportBundle } from "@/types/datum";

const LIMITE = 20_000;
const FRASE = "frase larga del operador para el respaldo";
const T = 1_700_000_000_000;

const BUNDLE: ExportBundle = {
  version: 2,
  exportedAt: T,
  datos: [
    { id: "d1", campo: "fiscal", etiqueta: "RFC", valor: "XAXX010101000", createdAt: T },
  ],
  operations: [],
  grafo: {
    artefactos: [{ id: "a1", kind: "nota", nombre: "Nota", createdAt: T }],
    fragmentos: [{ id: "f1", artefactoId: "a1", texto: "hola", createdAt: T }],
    entidades: [],
    relaciones: [],
    eventos: [],
    productos: [],
    casos: [],
    tiposOperador: [],
    tiposRelacion: [],
    vistas: [],
  },
};

describe("sync (F0)", () => {
  it(
    "empacar → desempacar devuelve el bundle idéntico",
    async () => {
      const sobre = await empacar(BUNDLE, FRASE);
      expect(await desempacar(sobre, FRASE)).toEqual(BUNDLE);
    },
    LIMITE,
  );

  it(
    "probarEmpaqueLocal reporta integridad y conteos reales",
    async () => {
      const r = await probarEmpaqueLocal(BUNDLE, FRASE);
      expect(r.integro).toBe(true);
      expect(r.datos).toBe(1);
      expect(r.operaciones).toBe(0);
      expect(r.elementosGrafo).toBe(2);
    },
    LIMITE,
  );

  it(
    "frase incorrecta al desempacar falla con FraseIncorrectaError",
    async () => {
      const sobre = await empacar(BUNDLE, FRASE);
      await expect(desempacar(sobre, "frase equivocada")).rejects.toBeInstanceOf(
        FraseIncorrectaError,
      );
    },
    LIMITE,
  );

  it("parseSobre rechaza un JSON que no es un sobre válido", () => {
    expect(() => parseSobre("{}")).toThrow(RespaldoDanadoError);
    expect(() => parseSobre("no es json")).toThrow(RespaldoDanadoError);
  });
});
