import { describe, expect, it } from "vitest";
import { aplicarFiltro, metricasDeVista } from "@/capacidades/vistas";
import type { Entidad, TipoOperador } from "@/types/autogenes";

const T = 1_700_000_000_000;
const AHORA = new Date(2026, 6, 3).getTime(); // 2026-07-03 local

const poliza: TipoOperador = {
  id: "t1",
  nombre: "Póliza",
  base: "documento",
  propiedades: [
    { clave: "prima", etiqueta: "Prima anual", tipo: "numero", requerida: false },
    { clave: "vigencia", etiqueta: "Vigencia", tipo: "fecha", requerida: false },
    { clave: "aseguradora", etiqueta: "Aseguradora", tipo: "texto", requerida: false },
  ],
  createdAt: T,
};

const ent = (
  id: string,
  extra: Partial<Entidad> = {},
): Entidad => ({
  id,
  nombre: id.toUpperCase(),
  tipo: "documento",
  origen: "operador",
  evidencia: [],
  createdAt: T,
  ...extra,
});

const entidades = [
  ent("auto", {
    subtipo: "t1",
    campo: "patrimonio",
    propiedades: { prima: "1160", vigencia: "2026-08-12" },
  }),
  ent("casa", {
    subtipo: "t1",
    alias: ["Seguro Hogar"],
    propiedades: { prima: "2840", vigencia: "2026-01-01" },
  }),
  ent("sat", { tipo: "organizacion" }),
];

describe("aplicarFiltro", () => {
  it("filters by facets and accent-insensitive text over name/alias/resumen", () => {
    expect(aplicarFiltro(entidades, { subtipo: "t1" })).toHaveLength(2);
    expect(aplicarFiltro(entidades, { tipo: "organizacion" })).toHaveLength(1);
    expect(aplicarFiltro(entidades, { texto: "hogár" })).toHaveLength(1);
    expect(
      aplicarFiltro(entidades, { subtipo: "t1", campo: "patrimonio" }),
    ).toHaveLength(1);
  });
});

describe("metricasDeVista", () => {
  it("always counts; typed views add sum/avg of numero props and next fecha", () => {
    const vista = aplicarFiltro(entidades, { subtipo: "t1" });
    const m = metricasDeVista(vista, poliza, AHORA);
    const por = Object.fromEntries(m.map((x) => [x.clave, x]));
    expect(por["conteo"].numero).toBe(2);
    expect(por["suma-prima"].numero).toBe(4000);
    expect(por["prom-prima"].numero).toBe(2000);
    // 2026-01-01 already passed; the next vigencia is the August one.
    expect(por["prox-vigencia"].valor).toBe("12 AGO 2026");
    // texto props aggregate to nothing.
    expect(m.some((x) => x.clave.includes("aseguradora"))).toBe(false);
  });

  it("untyped views carry only the count", () => {
    expect(metricasDeVista(entidades, undefined, AHORA)).toHaveLength(1);
  });
});
