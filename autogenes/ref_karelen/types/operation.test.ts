import { describe, expect, it } from "vitest";
import { formatOperationCode, OperationSchema } from "@/types/operation";

describe("formatOperationCode", () => {
  it("pads to four digits", () => {
    expect(formatOperationCode(1)).toBe("UMW-OP-0001");
    expect(formatOperationCode(42)).toBe("UMW-OP-0042");
    expect(formatOperationCode(12345)).toBe("UMW-OP-12345");
  });
});

describe("OperationSchema", () => {
  it("accepts a valid operation", () => {
    const result = OperationSchema.safeParse({
      id: "abc",
      code: "UMW-OP-0007",
      kind: "consulta",
      title: "Consulta de prueba",
      source: "synesis",
      createdAt: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed codes", () => {
    const result = OperationSchema.safeParse({
      id: "abc",
      code: "OP-7",
      kind: "nota",
      title: "x",
      source: "operador",
      createdAt: 1000,
    });
    expect(result.success).toBe(false);
  });
});
