import { describe, expect, it } from "vitest";
import {
  clavesDigesto,
  construirDigestoMaquina,
  construirDigestoRed,
  sanearNarrativa,
  type Narrativa,
} from "@/microapps/signature/narrativa";
import type { ResumenRed } from "@/capacidades/signature";

const resumen: ResumenRed = {
  nNodos: 6,
  nEnlaces: 7,
  densidad: 0.46,
  nComunidades: 2,
  nComponentes: 1,
  comunidadMayor: 3,
  exponente: null,
  puentes: [],
  hubs: [
    { id: "fuentes::rfc", etiqueta: "RFC", grado: 12 },
    { id: "fuentes::regimen", etiqueta: "Régimen", grado: 6 },
  ],
};

describe("construirDigestoRed", () => {
  it("carries metrics and concentrators with exact claves", () => {
    const d = construirDigestoRed(resumen);
    expect(d.metricas.find((m) => m.clave === "nodos")?.valor).toBe("6");
    expect(d.metricas.find((m) => m.clave === "densidad")?.valor).toContain("46");
    expect(d.conceptos.map((c) => c.clave)).toEqual(["fuentes::rfc", "fuentes::regimen"]);
  });
});

describe("sanearNarrativa", () => {
  it("drops readings citing a clave not in the digest", () => {
    const claves = clavesDigesto(construirDigestoRed(resumen));
    const narrativa: Narrativa = {
      panorama: "La red se centra en un concentrador.",
      lecturas: [
        { concepto: "fuentes::rfc", lectura: "Ata a casi todo." },
        { concepto: "inventado", lectura: "No existe en el digesto." },
        { concepto: "densidad", lectura: "Estructura moderada." },
      ],
      observaciones: ["Revisa el concentrador principal."],
    };
    const saneada = sanearNarrativa(narrativa, claves);
    expect(saneada.lecturas.map((l) => l.concepto)).toEqual([
      "fuentes::rfc",
      "densidad",
    ]);
    expect(saneada.observaciones).toHaveLength(1);
  });
});

describe("construirDigestoMaquina (M4)", () => {
  it("adds the four windows as citable claves within the route caps", () => {
    const d = construirDigestoMaquina({
      resumen,
      anomalias: [
        { clave: "anom-rafaga", titulo: "Ráfaga de actividad", severidad: 0.8 },
      ],
      monolitos: [
        { id: "fuentes::rfc", etiqueta: "RFC", masa: 1 },
        { id: "fuentes::otro", etiqueta: "Otro", masa: 0.4 },
      ],
      nReferencias: 3,
      delta: { nodos: 2, enlaces: -1 },
    });
    expect(d.metricas.find((m) => m.clave === "anomalias")?.valor).toBe("1");
    expect(d.metricas.find((m) => m.clave === "monolito")?.valor).toBe("RFC");
    expect(d.metricas.find((m) => m.clave === "telemetria")?.valor).toContain(
      "+2",
    );
    // Monolith already present as hub stays deduped; the new one lands.
    const claves = d.conceptos.map((c) => c.clave);
    expect(claves.filter((c) => c === "fuentes::rfc")).toHaveLength(1);
    expect(claves).toContain("fuentes::otro");
    expect(claves).toContain("anom-rafaga");
    // Route contract: caps and value lengths hold.
    expect(d.metricas.length).toBeLessThanOrEqual(12);
    expect(d.conceptos.length).toBeLessThanOrEqual(20);
    for (const m of d.metricas) expect(m.valor.length).toBeLessThanOrEqual(60);
  });
});
