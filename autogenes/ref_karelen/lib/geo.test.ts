import { describe, expect, it } from "vitest";
import {
  agruparEnPantalla,
  encuadrar,
  parsearCandidatosLugar,
  pasoGraticula,
  proyectarMercator,
} from "@/lib/geo";

describe("proyectarMercator", () => {
  it("maps the known anchors", () => {
    expect(proyectarMercator(0, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(proyectarMercator(0, 180).x).toBe(1);
    expect(proyectarMercator(0, -180).x).toBe(0);
    // CDMX sits west of Greenwich, north of the equator
    const cdmx = proyectarMercator(19.4326, -99.1332);
    expect(cdmx.x).toBeLessThan(0.5);
    expect(cdmx.y).toBeLessThan(0.5);
  });

  it("clamps polar latitudes instead of diverging", () => {
    expect(Number.isFinite(proyectarMercator(90, 0).y)).toBe(true);
    expect(Number.isFinite(proyectarMercator(-90, 0).y)).toBe(true);
  });
});

describe("encuadrar", () => {
  const cdmx = { lat: 19.4326, lon: -99.1332 };
  const mty = { lat: 25.6866, lon: -100.3161 };

  it("fits both fixes inside the canvas with margin", () => {
    const enc = encuadrar([cdmx, mty], 400, 300)!;
    const EPS = 1e-9;
    for (const p of [cdmx, mty]) {
      const [x, y] = enc.aPantalla(p.lat, p.lon);
      expect(x).toBeGreaterThanOrEqual(36 - EPS);
      expect(x).toBeLessThanOrEqual(400 - 36 + EPS);
      expect(y).toBeGreaterThanOrEqual(36 - EPS);
      expect(y).toBeLessThanOrEqual(300 - 36 + EPS);
    }
    // north point renders above the south point
    expect(enc.aPantalla(mty.lat, mty.lon)[1]).toBeLessThan(
      enc.aPantalla(cdmx.lat, cdmx.lon)[1],
    );
    expect(enc.latMax).toBeGreaterThan(enc.latMin);
    expect(enc.lonMax).toBeGreaterThan(enc.lonMin);
  });

  it("gives a single fix a finite window and centers it", () => {
    const enc = encuadrar([cdmx], 400, 300)!;
    const [x, y] = enc.aPantalla(cdmx.lat, cdmx.lon);
    expect(x).toBeCloseTo(200, 0);
    expect(y).toBeCloseTo(150, 0);
    expect(enc.lonMax - enc.lonMin).toBeGreaterThan(0);
  });

  it("returns null with nothing to frame", () => {
    expect(encuadrar([], 400, 300)).toBeNull();
  });
});

describe("pasoGraticula", () => {
  it("adapts the step to the span", () => {
    expect(pasoGraticula(0.05)).toBe(0.01);
    expect(pasoGraticula(6)).toBe(1);
    expect(pasoGraticula(60)).toBe(10);
    expect(pasoGraticula(360)).toBe(45);
  });
});

describe("parsearCandidatosLugar", () => {
  it("parses the gateway envelope into numeric candidates", () => {
    const out = parsearCandidatosLugar({
      conector: "osm",
      datos: [
        { nombre: "Monterrey, Nuevo León, México", latitud: "25.6866", longitud: "-100.3161" },
        { nombre: "Basura", latitud: "abc", longitud: "0" },
        { nombre: "Fuera de rango", latitud: "95", longitud: "0" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      nombre: "Monterrey, Nuevo León, México",
      lat: 25.6866,
      lon: -100.3161,
    });
  });

  it("returns empty on a malformed envelope", () => {
    expect(parsearCandidatosLugar({ error: "x" })).toEqual([]);
  });
});

describe("agruparEnPantalla", () => {
  it("merges points within the radius and keeps far ones apart", () => {
    const cumulos = agruparEnPantalla(
      [
        { id: "a", x: 100, y: 100 },
        { id: "b", x: 108, y: 104 }, // ~9px from a → same cluster
        { id: "c", x: 400, y: 400 }, // far → its own cluster
      ],
      26,
    );
    expect(cumulos).toHaveLength(2);
    const grande = cumulos.find((c) => c.ids.length > 1)!;
    expect(grande.ids.sort()).toEqual(["a", "b"]);
    // centroid is the average of members
    expect(grande.x).toBe(104);
    expect(grande.y).toBe(102);
    expect(cumulos.find((c) => c.ids.length === 1)!.ids).toEqual(["c"]);
  });

  it("is order-stable and disables clustering at radio 0", () => {
    const puntos = [
      { id: "a", x: 10, y: 10 },
      { id: "b", x: 11, y: 11 },
    ];
    expect(agruparEnPantalla(puntos, 0)).toHaveLength(2);
    expect(agruparEnPantalla([], 26)).toEqual([]);
  });
});
