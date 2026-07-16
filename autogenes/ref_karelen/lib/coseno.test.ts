import { describe, it, expect } from "vitest";
import { coseno, topKcoseno } from "@/lib/coseno";

describe("coseno (F2a)", () => {
  it("vectores idénticos dan ~1", () => {
    const v = [0.6, 0.8];
    expect(coseno(v, v)).toBeCloseTo(1, 5);
  });

  it("vectores ortogonales dan ~0", () => {
    expect(coseno([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("topKcoseno ordena por cercanía y respeta k", () => {
    const q = [1, 0];
    const docs = [
      { id: "lejos", vector: [0, 1] },
      { id: "cerca", vector: [0.9, 0.1] },
      { id: "medio", vector: [0.6, 0.4] },
    ];
    const top = topKcoseno(q, docs, 2);
    expect(top.map((t) => t.id)).toEqual(["cerca", "medio"]);
  });
});
