import { beforeEach, describe, expect, it } from "vitest";
import { ejecutarAccion } from "@/services/autogenes";
import { useAutogenesStore } from "@/store/autogenes";

describe("ejecutarAccion (L·6)", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
  });

  it("valida TODO antes de escribir: una acción inválida no deja rastro", () => {
    const s = useAutogenesStore.getState();
    const tipo = s.crearTipoOperador({
      nombre: "Pago",
      base: "documento",
      propiedades: [
        { clave: "monto", etiqueta: "Monto", tipo: "numero", requerida: true },
      ],
    });
    const antes = useAutogenesStore.getState().entidades.length;
    const r = ejecutarAccion({
      tipoId: tipo.id,
      nombre: "Pago julio",
      propiedades: { monto: "no-es-numero" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(" ")).toContain("Monto");
    expect(useAutogenesStore.getState().entidades.length).toBe(antes);
  });

  it("una acción válida crea la entidad tipada y su enlace validado por catálogo", () => {
    const s = useAutogenesStore.getState();
    const tipo = s.crearTipoOperador({
      nombre: "Pago",
      base: "documento",
      propiedades: [
        { clave: "monto", etiqueta: "Monto", tipo: "numero", requerida: true },
      ],
    });
    s.crearTipoRelacion({ nombre: "pagado a", desde: "documento", hasta: "persona" });
    const casero = s.upsertEntidad({
      nombre: "Casero",
      tipo: "persona",
      origen: "operador",
    });

    const r = ejecutarAccion({
      tipoId: tipo.id,
      nombre: "Pago julio",
      propiedades: { monto: "$1,500" },
      enlace: { destinoId: casero.id, tipo: "pagado a" },
    });
    expect(r.ok).toBe(true);
    const st = useAutogenesStore.getState();
    const pago = st.entidades.find((e) => e.nombre === "Pago julio");
    expect(pago?.subtipo).toBe(tipo.id);
    expect(pago?.propiedades?.monto).toBe("1500");
    expect(
      st.relaciones.some(
        (x) => x.desdeId === pago?.id && x.hastaId === casero.id && x.tipo === "pagado a",
      ),
    ).toBe(true);
  });

  it("un enlace que viola el catálogo bloquea la acción completa", () => {
    const s = useAutogenesStore.getState();
    const tipo = s.crearTipoOperador({
      nombre: "Pago",
      base: "documento",
      propiedades: [
        { clave: "monto", etiqueta: "Monto", tipo: "numero", requerida: true },
      ],
    });
    // El catálogo exige documento → persona; el destino será organización.
    s.crearTipoRelacion({ nombre: "pagado a", desde: "documento", hasta: "persona" });
    const org = s.upsertEntidad({
      nombre: "GNP",
      tipo: "organizacion",
      origen: "operador",
    });
    const r = ejecutarAccion({
      tipoId: tipo.id,
      nombre: "Pago julio",
      propiedades: { monto: "1500" },
      enlace: { destinoId: org.id, tipo: "pagado a" },
    });
    expect(r.ok).toBe(false);
    expect(
      useAutogenesStore.getState().entidades.some((e) => e.nombre === "Pago julio"),
    ).toBe(false);
  });
});
