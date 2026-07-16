import { describe, expect, it } from "vitest";
import { buildBundle, parseBundle } from "@/services/bundle";

const datum = {
  id: "d1",
  campo: "hogar" as const,
  etiqueta: "No. servicio CFE",
  valor: "123456789012",
  createdAt: 1000,
};

const operation = {
  id: "o1",
  code: "UMW-OP-0001",
  kind: "dato" as const,
  title: "Dato ingresado",
  source: "operador" as const,
  createdAt: 1000,
};

describe("bundle service", () => {
  it("round-trips build → parse", () => {
    const bundle = buildBundle([datum], [operation]);
    const parsed = parseBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.bundle.datos).toHaveLength(1);
      expect(parsed.bundle.operations[0].code).toBe("UMW-OP-0001");
    }
  });

  it("rejects non-JSON with a stated reason", () => {
    const parsed = parseBundle("{esto no es json");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("JSON");
  });

  it("rejects foreign JSON shapes", () => {
    const parsed = parseBundle(JSON.stringify({ cualquier: "cosa" }));
    expect(parsed.ok).toBe(false);
  });
});
