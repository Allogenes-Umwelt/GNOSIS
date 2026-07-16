import { describe, expect, it } from "vitest";
import { serieTemporal } from "@/microapps/signature/temporal";

describe("serieTemporal", () => {
  it("bins events across buckets and counts per group", () => {
    const s = serieTemporal(
      [
        { t: 0, grupo: "a" },
        { t: 100, grupo: "a" },
        { t: 100, grupo: "b" },
      ],
      10,
    );
    expect(s.t0).toBe(0);
    expect(s.t1).toBe(100);
    expect(s.grupos).toEqual(["a", "b"]);
    // first event in bucket 0, the two at t1 in the last bucket
    expect(s.cubetas[0].total).toBe(1);
    expect(s.cubetas[9].total).toBe(2);
    expect(s.cubetas[9].cuenta.get("b")).toBe(1);
    expect(s.maxTotal).toBe(2);
  });

  it("returns an empty series for no events", () => {
    expect(serieTemporal([]).cubetas).toHaveLength(0);
  });

  it("keeps a single-instant series inside one span without dividing by zero", () => {
    const s = serieTemporal([
      { t: 5, grupo: "x" },
      { t: 5, grupo: "x" },
    ]);
    expect(s.maxTotal).toBe(2);
    expect(s.cubetas.reduce((n, c) => n + c.total, 0)).toBe(2);
  });
});
