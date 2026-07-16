import { beforeEach, describe, expect, it } from "vitest";
import { useMemoriaStore } from "@/store/memoria";

beforeEach(() => {
  useMemoriaStore.setState({ objetos: [] });
});

describe("memoria store", () => {
  it("creates objects with origin", () => {
    const o = useMemoriaStore.getState().upsertObjeto({
      nombre: "CFE",
      tipo: "servicio",
      resumen: "Suministro eléctrico.",
      origen: "synesis",
    });
    expect(o.relaciones).toEqual([]);
    expect(useMemoriaStore.getState().objetos).toHaveLength(1);
  });

  it("upserts by name (case-insensitive) and merges relations", () => {
    const s = useMemoriaStore.getState();
    s.upsertObjeto({
      nombre: "CFE",
      tipo: "servicio",
      resumen: "v1",
      origen: "synesis",
      relaciones: [{ con: "Recibo", tipo: "emite" }],
    });
    useMemoriaStore.getState().upsertObjeto({
      nombre: "cfe",
      tipo: "servicio",
      resumen: "v2",
      origen: "synesis",
      relaciones: [
        { con: "Recibo", tipo: "emite" }, // duplicate relation
        { con: "Julio", tipo: "cobra a" },
      ],
    });
    const objetos = useMemoriaStore.getState().objetos;
    expect(objetos).toHaveLength(1);
    expect(objetos[0].resumen).toBe("v2");
    expect(objetos[0].relaciones).toHaveLength(2);
  });
});
