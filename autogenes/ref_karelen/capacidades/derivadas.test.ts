import { describe, expect, it } from "vitest";
import { derivadasDeEntidad } from "@/capacidades/derivadas";
import type { Entidad, Relacion, TipoOperador } from "@/types/autogenes";

const T = 1_700_000_000_000;

const TIPO_PAGO: TipoOperador = {
  id: "t-pago",
  nombre: "Pago",
  base: "documento",
  propiedades: [
    { clave: "monto", etiqueta: "Monto", tipo: "numero", requerida: true },
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha", requerida: false },
  ],
  createdAt: T,
};

function ent(
  parcial: Partial<Entidad> & { id: string; nombre: string },
): Entidad {
  return {
    tipo: "documento",
    origen: "operador",
    evidencia: [],
    createdAt: T,
    ...parcial,
  } as Entidad;
}

function rel(desdeId: string, hastaId: string, tipo: string): Relacion {
  return {
    id: `${desdeId}-${hastaId}`,
    desdeId,
    hastaId,
    tipo,
    peso: 0.5,
    evidencia: [],
    createdAt: T,
  };
}

describe("derivadasDeEntidad (L·4)", () => {
  const casero = ent({ id: "x", nombre: "Casero", tipo: "persona" });
  const pagos = [
    ent({
      id: "p1",
      nombre: "Pago enero",
      subtipo: "t-pago",
      propiedades: { monto: "1500", fecha: "2026-01-05" },
    }),
    ent({
      id: "p2",
      nombre: "Pago febrero",
      subtipo: "t-pago",
      propiedades: { monto: "1500.5", fecha: "2026-02-05" },
    }),
    ent({
      id: "p3",
      nombre: "Pago futuro",
      subtipo: "t-pago",
      propiedades: { monto: "1600", fecha: "2026-09-05" },
    }),
  ];
  const g = {
    entidades: [casero, ...pagos],
    relaciones: pagos.map((p) => rel(p.id, "x", "pagado a")),
    tiposOperador: [TIPO_PAGO],
  };

  it("suma la propiedad numérica de los vecinos por tipo de relación", () => {
    const d = derivadasDeEntidad("x", g, "2026-07-05");
    const monto = d.find((x) => x.propiedad === "Monto");
    expect(monto).toMatchObject({
      relacion: "pagado a",
      tipo: "numero",
      conteo: 3,
      suma: 4600.5,
    });
  });

  it("de las fechas reporta la próxima futura, no la última pasada", () => {
    const d = derivadasDeEntidad("x", g, "2026-07-05");
    const fecha = d.find((x) => x.propiedad === "Fecha");
    expect(fecha).toMatchObject({ fecha: "2026-09-05", proxima: true });
  });

  it("sin vecinos tipados no deriva nada", () => {
    expect(
      derivadasDeEntidad("x", { ...g, tiposOperador: [] }, "2026-07-05"),
    ).toEqual([]);
  });
});
