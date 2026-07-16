import { describe, expect, it } from "vitest";
import {
  catalogoParaTools,
  conectores,
  getConector,
} from "@/conectores/registry";
import { ConectorManifestSchema } from "@/types/conector";

describe("conectores registry", () => {
  it("every manifest validates against the contract", () => {
    for (const c of conectores) {
      expect(() => ConectorManifestSchema.parse(c.manifest)).not.toThrow();
    }
  });

  it("connector ids are unique", () => {
    const ids = conectores.map((c) => c.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("consulta ids are unique within each connector", () => {
    for (const c of conectores) {
      const ids = c.manifest.consultas.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("token connectors declare an env fallback", () => {
    for (const c of conectores) {
      if (c.manifest.acceso === "token") {
        expect(c.manifest.envToken).toBeTruthy();
      }
    }
  });

  it("getConector resolves registered ids and rejects unknown ones", () => {
    expect(getConector("banxico")?.manifest.nombre).toBe("Banxico SIE");
    expect(getConector("no-existe")).toBeUndefined();
  });

  it("catalog lists every connector and consulta for the tool prompt", () => {
    const catalogo = catalogoParaTools();
    for (const c of conectores) {
      expect(catalogo).toContain(`- ${c.manifest.id} (`);
      for (const q of c.manifest.consultas) {
        expect(catalogo).toContain(q.id);
      }
    }
  });

  it("unknown consultas fail with an operator-facing error", async () => {
    const frankfurter = getConector("frankfurter");
    await expect(
      frankfurter?.invoke("no_existe", {}, {}),
    ).rejects.toThrow("Consulta desconocida");
  });

  it("banxico without token fails pointing to C2", async () => {
    const banxico = getConector("banxico");
    await expect(
      banxico?.invoke("tipo_de_cambio", {}, {}),
    ).rejects.toThrow("token");
  });
});
