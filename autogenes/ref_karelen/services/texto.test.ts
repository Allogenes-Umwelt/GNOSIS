import { describe, expect, it } from "vitest";
import { partirTexto } from "@/services/autogenes";

describe("partirTexto", () => {
  it("keeps short text as a single fragment", () => {
    expect(partirTexto("Una nota breve.")).toEqual(["Una nota breve."]);
  });

  it("groups paragraphs up to the size cap, splitting on blank lines", () => {
    const p = "a".repeat(800);
    const q = "b".repeat(800);
    const trozos = partirTexto(`${p}\n\n${q}`, 1400);
    // 800 + 800 > 1400 → two fragments, one per paragraph
    expect(trozos).toEqual([p, q]);
  });

  it("hard-splits a single over-long paragraph", () => {
    const largo = "x".repeat(3000);
    const trozos = partirTexto(largo, 1400);
    expect(trozos.length).toBe(3); // 1400 + 1400 + 200
    expect(trozos.join("")).toBe(largo);
  });

  it("drops empty paragraphs and trims, grouping what fits", () => {
    // Multiple blank lines collapse to a paragraph break; both fit the cap
    // so they group into one trimmed fragment with no empty pieces.
    expect(partirTexto("  uno  \n\n\n\n  dos  ")).toEqual(["uno\n\ndos"]);
  });
});
