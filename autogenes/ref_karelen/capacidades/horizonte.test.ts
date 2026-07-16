import { describe, expect, it } from "vitest";
import { construirHorizonte } from "@/capacidades/horizonte";
import type { SnapshotQualia } from "@/capacidades/anomalias";

function snap(ts: number, nNodos: number, nEnlaces: number): SnapshotQualia {
  return {
    ts,
    nNodos,
    nEnlaces,
    densidad: 0.5,
    nComunidades: 1,
    nComponentes: 1,
    exponente: null,
    hubs: [],
    puentes: [],
  };
}

describe("construirHorizonte (M4)", () => {
  it("returns null without samples and orders samples oldest first", () => {
    expect(construirHorizonte([], [])).toBeNull();
    // Store keeps newest first; the horizon must re-sort.
    const h = construirHorizonte([snap(300, 8, 12), snap(100, 4, 5)], []);
    expect(h?.puntos.map((p) => p.ts)).toEqual([100, 300]);
    expect(h?.t0).toBe(100);
    expect(h?.t1).toBe(300);
    expect(h?.maxNodos).toBe(8);
    expect(h?.maxEnlaces).toBe(12);
  });

  it("measures the delta between the samples flanking an intervention", () => {
    const h = construirHorizonte(
      [snap(100, 4, 5), snap(300, 8, 12)],
      [{ ts: 200, accion: "plan", detalle: "Plan aprobado" }],
    );
    expect(h?.lineas).toHaveLength(1);
    expect(h?.lineas[0].delta).toEqual({ nodos: 4, enlaces: 7 });
  });

  it("leaves delta null when no later sample exists yet", () => {
    // Intervention lands exactly on the last sample: nothing after it.
    const h = construirHorizonte(
      [snap(100, 4, 5), snap(300, 8, 12)],
      [{ ts: 300, accion: "dock", detalle: "Informe dockeado" }],
    );
    expect(h?.lineas[0].delta).toBeNull();
  });

  it("drops interventions outside the sampled window and caps the rest", () => {
    const dentro = Array.from({ length: 15 }, (_, k) => ({
      ts: 110 + k,
      accion: "op",
      detalle: `n${k}`,
    }));
    const h = construirHorizonte(
      [snap(100, 4, 5), snap(300, 8, 12)],
      [{ ts: 50, accion: "antes", detalle: "fuera" }, ...dentro],
      12,
    );
    expect(h?.lineas).toHaveLength(12);
    expect(h?.lineas.every((l) => l.accion === "op")).toBe(true);
    // Keeps the LATEST 12, oldest → newest.
    expect(h?.lineas[0].detalle).toBe("n3");
  });
});
