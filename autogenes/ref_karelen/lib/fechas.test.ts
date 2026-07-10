import { describe, expect, it } from "vitest";
import {
  agruparPorAnio,
  formatearFechaEs,
  histogramaMeses,
  parsearFechaEs,
  sanearCronologia,
} from "@/lib/fechas";
import type { Evento, PropuestaEvento } from "@/types/autogenes";

describe("parsearFechaEs", () => {
  it("parses ISO forms with precision", () => {
    expect(parsearFechaEs("2024-03-12")).toEqual({
      fecha: "2024-03-12",
      precision: "dia",
    });
    expect(parsearFechaEs("2024-03")).toEqual({
      fecha: "2024-03-01",
      precision: "mes",
    });
    expect(parsearFechaEs("2024")).toEqual({
      fecha: "2024-01-01",
      precision: "anio",
    });
  });

  it("parses Spanish prose and slash dates (day-first)", () => {
    expect(parsearFechaEs("12 de marzo de 2024")).toEqual({
      fecha: "2024-03-12",
      precision: "dia",
    });
    expect(parsearFechaEs("1 de septiembre del 2019")).toEqual({
      fecha: "2019-09-01",
      precision: "dia",
    });
    expect(parsearFechaEs("12 de marzo 2024")).toEqual({
      fecha: "2024-03-12",
      precision: "dia",
    });
    expect(parsearFechaEs("Marzo de 2024")).toEqual({
      fecha: "2024-03-01",
      precision: "mes",
    });
    expect(parsearFechaEs("05/11/2023")).toEqual({
      fecha: "2023-11-05",
      precision: "dia",
    });
  });

  it("rejects impossible dates and junk", () => {
    expect(parsearFechaEs("2024-02-30")).toBeNull();
    expect(parsearFechaEs("31/02/2023")).toBeNull();
    expect(parsearFechaEs("pronto")).toBeNull();
    expect(parsearFechaEs("catorce de nunca de 2024")).toBeNull();
  });
});

describe("formatearFechaEs", () => {
  it("formats by precision", () => {
    expect(formatearFechaEs("2024-03-12", "dia")).toBe("12 MAR 2024");
    expect(formatearFechaEs("2024-03-01", "mes")).toBe("MAR 2024");
    expect(formatearFechaEs("2024-01-01", "anio")).toBe("2024");
  });
});

const prop = (over: Partial<PropuestaEvento> = {}): PropuestaEvento => ({
  titulo: "Firma del contrato",
  fecha: "2024-03-12",
  entidades: [],
  evidencia: ["f1"],
  ...over,
});

describe("sanearCronologia", () => {
  const ids = new Set(["f1", "f2"]);

  it("normalizes prose dates, enforces provenance, sorts ascending", () => {
    const out = sanearCronologia(
      [
        prop({ titulo: "Publicación", fecha: "diciembre de 2023" }),
        prop(),
        prop({ titulo: "Sin cita", evidencia: ["fantasma"] }),
        prop({ titulo: "Sin fecha", fecha: "algún día" }),
      ],
      ids,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ fecha: "2023-12-01", precision: "mes" });
    expect(out[1]).toMatchObject({ fecha: "2024-03-12", precision: "dia" });
  });

  it("collapses duplicates by titulo+fecha", () => {
    expect(sanearCronologia([prop(), prop()], ids)).toHaveLength(1);
  });

  it("collapses titles differing only by accent/case on the same date", () => {
    const out = sanearCronologia(
      [
        prop({ titulo: "Pagó predial" }),
        prop({ titulo: "pago predial" }),
      ],
      ids,
    );
    expect(out).toHaveLength(1);
  });
});

describe("agruparPorAnio", () => {
  it("groups sorted events by year", () => {
    const ev = (id: string, fecha: string): Evento => ({
      id,
      titulo: id,
      fecha,
      precision: "dia",
      entidades: [],
      evidencia: ["f1"],
      origen: "synesis",
      createdAt: 1,
    });
    const grupos = agruparPorAnio([
      ev("b", "2024-05-01"),
      ev("a", "2023-01-15"),
      ev("c", "2024-01-02"),
    ]);
    expect(grupos.map((g) => g.anio)).toEqual(["2023", "2024"]);
    expect(grupos[1].eventos.map((e) => e.id)).toEqual(["c", "b"]);
  });
});

describe("histogramaMeses", () => {
  const ev = (
    fecha: string,
    precision: Evento["precision"] = "dia",
  ): Evento => ({
    id: fecha,
    titulo: fecha,
    fecha,
    precision,
    entidades: [],
    evidencia: ["f1"],
    origen: "synesis",
    createdAt: 1,
  });

  it("counts events into their month cells (ENE index 0)", () => {
    const h = histogramaMeses([
      ev("2024-01-05"),
      ev("2024-01-20"),
      ev("2024-03-11"),
    ]);
    expect(h.meses[0]).toBe(2); // enero
    expect(h.meses[2]).toBe(1); // marzo
    expect(h.pico).toBe(2);
    expect(h.total).toBe(3);
    expect(h.sinMes).toBe(0);
  });

  it("counts year-only precision apart instead of misfiling into January", () => {
    const h = histogramaMeses([ev("2024-01-01", "anio"), ev("2024-01-09")]);
    expect(h.meses[0]).toBe(1); // only the real january event
    expect(h.sinMes).toBe(1);
    expect(h.total).toBe(2);
  });

  it("keeps pico at least 1 for an empty year (no division by zero)", () => {
    const h = histogramaMeses([]);
    expect(h.pico).toBe(1);
    expect(h.meses).toHaveLength(12);
    expect(h.meses.every((m) => m === 0)).toBe(true);
  });
});
