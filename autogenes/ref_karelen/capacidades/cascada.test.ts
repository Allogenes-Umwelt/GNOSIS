import { describe, expect, it } from "vitest";
import { ondaDesde, simularCaida, simularEnlace } from "@/capacidades/cascada";
import type { RedSig } from "@/capacidades/signature";

// barra a—b—c—d  +  isla x—y : b y c son puentes; d es hoja.
const RED: RedSig = {
  nodos: ["a", "b", "c", "d", "x", "y"].map((id) => ({
    id,
    etiqueta: id.toUpperCase(),
  })),
  enlaces: [
    { origen: "a", destino: "b", peso: 1 },
    { origen: "b", destino: "c", peso: 1 },
    { origen: "c", destino: "d", peso: 1 },
    { origen: "x", destino: "y", peso: 1 },
  ],
};

describe("cascada simulada (M0)", () => {
  it("la onda BFS avanza por pasos deterministas", () => {
    expect(ondaDesde(RED, "a")).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  it("deducción destructiva: quitar un puente parte la red y mide el daño", () => {
    const impacto = simularCaida(RED, "b");
    expect(impacto.relacionesCaidas).toBe(2);
    expect(impacto.islasAntes).toBe(2);
    expect(impacto.islasDespues).toBe(3); // {a}, {c,d}, {x,y}
    // "a" queda sin ningún vínculo — huérfana de la caída.
    expect(impacto.desconectados.map((d) => d.id)).toEqual(["a"]);
    expect(impacto.pesoEstructural).toBeGreaterThan(0);
    // La simulación NO muta la red original.
    expect(RED.nodos).toHaveLength(6);
    expect(RED.enlaces).toHaveLength(4);
  });

  it("quitar una hoja no parte nada", () => {
    const impacto = simularCaida(RED, "d");
    expect(impacto.islasDespues).toBe(2);
    expect(impacto.desconectados).toEqual([]);
  });

  it("inducción creativa: enlazar dos islas las fusiona y acerca lo lejano", () => {
    const impacto = simularEnlace(RED, "a", "x");
    expect(impacto.fusionaIslas).toBe(true);
    expect(impacto.islasAntes).toBe(2);
    expect(impacto.islasDespues).toBe(1);
    expect(impacto.saltosAntes).toBeNull(); // inalcanzable antes
    expect(impacto.acercados).toBeGreaterThan(0); // x e y quedan cerca de a
  });

  it("enlazar dentro de la misma isla reporta el atajo, no fusión", () => {
    const impacto = simularEnlace(RED, "a", "d");
    expect(impacto.fusionaIslas).toBe(false);
    expect(impacto.saltosAntes).toBe(3);
  });
});
