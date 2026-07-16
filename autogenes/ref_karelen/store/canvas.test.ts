import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasStore } from "@/store/canvas";

beforeEach(() => {
  useCanvasStore.setState({ seq: 0, operations: [] });
});

describe("canvas store", () => {
  it("registers sequential codes and prepends", () => {
    const a = useCanvasStore.getState().registerNote("primera");
    const b = useCanvasStore.getState().registerDato("segunda", "detalle");
    expect(a.code).toBe("UMW-OP-0001");
    expect(b.code).toBe("UMW-OP-0002");
    expect(b.kind).toBe("dato");
    expect(useCanvasStore.getState().operations[0].id).toBe(b.id);
  });

  it("registers consultas with synesis source", () => {
    const op = useCanvasStore.getState().registerConsulta("q", "respuesta");
    expect(op.source).toBe("synesis");
    expect(op.kind).toBe("consulta");
    expect(op.detail).toBe("respuesta");
  });

  it("merge dedupes by id and advances seq past imported codes", () => {
    const local = useCanvasStore.getState().registerNote("local");
    const added = useCanvasStore.getState().mergeOperations([
      local, // duplicate — must be ignored
      {
        id: "ext-1",
        code: "UMW-OP-0009",
        kind: "nota",
        title: "importada",
        source: "operador",
        createdAt: Date.now(),
      },
    ]);
    expect(added).toBe(1);
    expect(useCanvasStore.getState().operations).toHaveLength(2);
    const next = useCanvasStore.getState().registerNote("después");
    expect(next.code).toBe("UMW-OP-0010");
  });
});
