import { describe, expect, it } from "vitest";
import { CAMPOS_INFO, getCampoInfo, sugerirCampo } from "@/lib/campos";

describe("campos catalog", () => {
  it("holds the 13 semantic fields", () => {
    expect(CAMPOS_INFO).toHaveLength(13);
    expect(getCampoInfo("fiscal")?.num).toBe("02");
    expect(getCampoInfo("inexistente")).toBeUndefined();
  });
});

describe("sugerirCampo", () => {
  it("routes utility receipts to hogar", () => {
    expect(sugerirCampo("Recibo CFE junio, tarifa 1C")).toBe("hogar");
  });

  it("routes tax content to fiscal", () => {
    expect(sugerirCampo("Constancia del SAT con RFC XAXX010101000")).toBe(
      "fiscal",
    );
  });

  it("routes fines to automotriz", () => {
    expect(sugerirCampo("Multa por estacionarse, placa ABC-123")).toBe(
      "automotriz",
    );
  });

  it("returns null when nothing matches", () => {
    expect(sugerirCampo("texto sin señales")).toBeNull();
  });
});
