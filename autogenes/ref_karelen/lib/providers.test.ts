import { describe, expect, it } from "vitest";
import { sanitizeForOpenAI, TOOLS } from "@/lib/providers";

/** Every object-typed node must carry `properties` — Gemini's function
 *  validator rejects object schemas without it. */
function assertObjectsHaveProperties(schema: unknown, path: string): void {
  if (!schema || typeof schema !== "object") return;
  const s = schema as Record<string, unknown>;
  if (s.type === "object") {
    expect(
      typeof s.properties === "object" && s.properties !== null,
      `${path} is an object without properties`,
    ).toBe(true);
  }
  if (s.properties && typeof s.properties === "object") {
    for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
      assertObjectsHaveProperties(v, `${path}.${k}`);
    }
  }
  if (s.items) assertObjectsHaveProperties(s.items, `${path}[]`);
}

describe("sanitizeForOpenAI", () => {
  it("adds properties to a bare object schema", () => {
    const out = sanitizeForOpenAI({ type: "object" }) as Record<string, unknown>;
    expect(out.properties).toEqual({});
  });

  it("recurses into nested object params and array items", () => {
    const out = sanitizeForOpenAI({
      type: "object",
      properties: {
        parametros: { type: "object" },
        lista: { type: "array", items: { type: "object" } },
      },
    });
    assertObjectsHaveProperties(out, "root");
  });

  it("leaves non-object schemas untouched", () => {
    expect(sanitizeForOpenAI({ type: "string" })).toEqual({ type: "string" });
  });

  it("makes every SYNESIS tool schema Gemini-safe", () => {
    for (const t of TOOLS) {
      assertObjectsHaveProperties(sanitizeForOpenAI(t.input_schema), t.name);
    }
  });

  it("flags the raw (unsanitized) free-form tool params as unsafe", () => {
    const servicio = TOOLS.find((t) => t.name === "consultar_servicio");
    const props = servicio?.input_schema.properties as
      | Record<string, { type?: string; properties?: unknown }>
      | undefined;
    // Guard: the raw param really is a bare object (the bug we fixed).
    expect(props?.parametros?.type).toBe("object");
    expect(props?.parametros?.properties).toBeUndefined();
  });
});
