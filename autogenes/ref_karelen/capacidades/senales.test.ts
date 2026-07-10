import { describe, expect, it } from "vitest";
import {
  diasDesde,
  etiquetaDias,
  fuentesFrias,
  proximosVencimientos,
} from "@/capacidades/senales";
import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
} from "@/types/autogenes";

// 2026-07-03 12:00 local — a fixed "now" for every test.
const AHORA = new Date(2026, 6, 3, 12, 0, 0).getTime();
const T = 1_700_000_000_000;

const evento = (id: string, fecha: string, titulo = id): Evento => ({
  id,
  titulo,
  fecha,
  precision: "dia",
  entidades: [],
  evidencia: [],
  origen: "synesis",
  createdAt: T,
});

describe("proximosVencimientos", () => {
  const artefactos = [
    { id: "a1", kind: "pdf", nombre: "contrato.pdf", createdAt: T },
  ] as Artefacto[];
  const fragmentos = [
    { id: "f1", artefactoId: "a1", pagina: 4, texto: "x", createdAt: T },
  ] as Fragmento[];

  it("keeps today→horizon, soonest first, past and beyond excluded", () => {
    const v = proximosVencimientos(
      [
        evento("pasado", "2026-07-02"),
        evento("hoy", "2026-07-03"),
        evento("prox", "2026-07-10"),
        evento("lejos", "2026-12-25"),
      ],
      fragmentos,
      artefactos,
      AHORA,
    );
    expect(v.map((x) => x.eventoId)).toEqual(["hoy", "prox"]);
    expect(v[0].enDias).toBe(0);
    expect(v[1].enDias).toBe(7);
  });

  it("resolves citations and formats the date", () => {
    const v = proximosVencimientos(
      [{ ...evento("e", "2026-07-05"), evidencia: ["f1", "muerto"] }],
      fragmentos,
      artefactos,
      AHORA,
    );
    expect(v[0].citas).toEqual(["contrato.pdf · pág 4"]);
    expect(v[0].fechaTexto).toBe("05 JUL 2026");
  });
});

describe("etiquetaDias", () => {
  it("speaks operator", () => {
    expect(etiquetaDias(0)).toBe("hoy");
    expect(etiquetaDias(1)).toBe("mañana");
    expect(etiquetaDias(9)).toBe("en 9 días");
  });
});

describe("fuentesFrias", () => {
  const artefactos = [
    { id: "a1", kind: "imagen", nombre: "captura.jpg", createdAt: T },
    { id: "a2", kind: "pdf", nombre: "frio.pdf", createdAt: T },
    { id: "a3", kind: "pdf", nombre: "vivo.pdf", createdAt: T },
  ] as Artefacto[];
  const fragmentos = [
    { id: "f1", artefactoId: "a1", texto: "  ", createdAt: T },
    { id: "f2", artefactoId: "a2", texto: "texto", createdAt: T },
    { id: "f3", artefactoId: "a3", texto: "texto", createdAt: T },
  ] as Fragmento[];
  const entidades = [
    {
      id: "e1", nombre: "X", tipo: "concepto", origen: "synesis",
      evidencia: ["f3"], createdAt: T,
    },
  ] as Entidad[];

  it("classifies OCR-pending vs extraction-pending, skips living sources", () => {
    expect(fuentesFrias(artefactos, fragmentos, entidades)).toEqual([
      { artefactoId: "a1", nombre: "captura.jpg", estado: "ocr-pendiente" },
      { artefactoId: "a2", nombre: "frio.pdf", estado: "sin-extraer" },
    ]);
  });
});

describe("diasDesde", () => {
  it("counts whole calendar days, never negative", () => {
    expect(diasDesde(new Date(2026, 5, 30, 23, 0).getTime(), AHORA)).toBe(3);
    expect(diasDesde(AHORA + 60_000, AHORA)).toBe(0);
  });
});
