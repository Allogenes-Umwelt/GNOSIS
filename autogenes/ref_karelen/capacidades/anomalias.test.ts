import { describe, expect, it } from "vitest";
import {
  detectarAnomalias,
  quiebreRitmo,
  rafagaActividad,
  tomarSnapshot,
} from "@/capacidades/anomalias";
import { resumenRed, type RedSig } from "@/capacidades/signature";

function estrella(centro: string, hojas: string[]): RedSig {
  return {
    nodos: [centro, ...hojas].map((id) => ({ id, etiqueta: id })),
    enlaces: hojas.map((h) => ({ origen: centro, destino: h, peso: 1 })),
  };
}

describe("anomalías (M0)", () => {
  it("detecta un concentrador nuevo y una isla nueva contra la línea base", () => {
    const antes = estrella("sol", ["a", "b", "c"]);
    const base = tomarSnapshot(resumenRed(antes), 1000);

    // Después: aparece "luna" como nuevo centro Y una isla aparte.
    const despues: RedSig = {
      nodos: [
        ...antes.nodos,
        { id: "luna", etiqueta: "luna" },
        { id: "solo", etiqueta: "solo" },
      ],
      enlaces: [
        ...antes.enlaces,
        { origen: "luna", destino: "a", peso: 3 },
        { origen: "luna", destino: "b", peso: 3 },
        { origen: "luna", destino: "c", peso: 3 },
        { origen: "luna", destino: "sol", peso: 3 },
      ],
    };
    const hallazgos = detectarAnomalias(resumenRed(despues), base);
    const detectores = hallazgos.map((h) => h.detector);
    expect(detectores).toContain("hub-nuevo");
    expect(detectores).toContain("islas");
    // Ordenadas por severidad, todas con clave citable.
    expect(hallazgos.every((h) => h.clave.length > 0)).toBe(true);
    expect(
      [...hallazgos].sort((a, b) => b.severidad - a.severidad).map((h) => h.clave),
    ).toEqual(hallazgos.map((h) => h.clave));
  });

  it("sin cambios reales, sin hallazgos — nada de placebo", () => {
    const red = estrella("sol", ["a", "b", "c"]);
    const base = tomarSnapshot(resumenRed(red), 1000);
    expect(detectarAnomalias(resumenRed(red), base)).toEqual([]);
  });

  it("ráfaga: z-score clásico sobre la ventana previa", () => {
    const plana = [2, 2, 2, 2, 2, 2, 2, 2];
    expect(rafagaActividad(plana).esRafaga).toBe(false);
    const conPico = [2, 3, 2, 2, 3, 2, 2, 14];
    const r = rafagaActividad(conPico);
    expect(r.esRafaga).toBe(true);
    expect(r.z).toBeGreaterThan(2);
  });
});

describe("centralidad de vector propio (M0)", () => {
  it("el centro de la estrella pesa 1 y las hojas menos", async () => {
    const { centralidadVectorPropio } = await import("@/capacidades/signature");
    const c = centralidadVectorPropio(estrella("sol", ["a", "b", "c", "d"]));
    expect(c.get("sol")).toBeCloseTo(1, 5);
    for (const hoja of ["a", "b", "c", "d"]) {
      expect(c.get(hoja)).toBeLessThan(1);
      expect(c.get(hoja)).toBeGreaterThan(0);
    }
  });
});

describe("quiebre de ritmo (N0)", () => {
  // Period-4 activity: [5,0,0,0] repeating.
  const periodica = Array.from({ length: 28 }, (_, i) => (i % 4 === 0 ? 5 : 0));

  it("no dispara mientras el ritmo se sostiene", () => {
    expect(quiebreRitmo(periodica).esQuiebre).toBe(false);
  });

  it("dispara cuando la periodicidad colapsa en la ventana reciente", () => {
    // Same rhythm for the first half, then flat silence (disjoint halves).
    const rota = [...periodica.slice(0, 14), ...new Array(14).fill(2)];
    const q = quiebreRitmo(rota);
    expect(q.esQuiebre).toBe(true);
    expect(q.lag).toBeGreaterThanOrEqual(2);
    expect(q.antes).toBeGreaterThanOrEqual(0.5);
    expect(q.ahora).toBeLessThan(0.2);
  });

  it("series cortas o sin ritmo previo no disparan", () => {
    expect(quiebreRitmo([1, 2, 3]).esQuiebre).toBe(false);
    const ruido = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6, 2, 6, 4, 3, 3, 8, 3];
    // May or may not have accidental autocorrelation, but must not throw
    // and must report coherent numbers.
    const q = quiebreRitmo(ruido);
    expect(typeof q.esQuiebre).toBe("boolean");
  });
});

describe("desviación de fuentes de conector (N2)", () => {
  it("dispara sobre la serie cuyo último valor rompe su historia", async () => {
    const { desviacionFuentes } = await import("@/capacidades/anomalias");
    const hallazgos = desviacionFuentes([
      { etiqueta: "FIX", valores: [18.4, 18.5, 18.4, 18.6, 18.5, 21.9] },
      { etiqueta: "UDI", valores: [8.1, 8.1, 8.11, 8.12, 8.12, 8.13] },
    ]);
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0].detector).toBe("fuente");
    expect(hallazgos[0].clave).toBe("anom-fuente-FIX");
    expect(hallazgos[0].severidad).toBeGreaterThan(0);
  });

  it("recorta a los dos hallazgos más severos", async () => {
    const { desviacionFuentes } = await import("@/capacidades/anomalias");
    const brinco = (v: number) => [1, 1, 1, 1, 1, v];
    const hallazgos = desviacionFuentes([
      { etiqueta: "A", valores: brinco(50) },
      { etiqueta: "B", valores: brinco(80) },
      { etiqueta: "C", valores: brinco(120) },
    ]);
    expect(hallazgos).toHaveLength(2);
  });
});
