import { beforeEach, describe, expect, it } from "vitest";
import { ejecutarPlan, proponerPlan } from "@/services/planes";
import { useAutogenesStore } from "@/store/autogenes";
import { useAutonomiaStore } from "@/store/autonomia";
import { usePlanesStore } from "@/store/planes";

describe("planes (D6)", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
    usePlanesStore.getState().clear();
    useAutonomiaStore.setState({ niveles: {} });
  });

  it("rejects malformed proposals with operator-words errors", () => {
    const v = proponerPlan({ objetivo: "x", pasos: [{ op: "borrar_todo" }] });
    expect(v.ok).toBe(false);
    expect(v.error).toContain("Plan inválido");
    expect(usePlanesStore.getState().planes).toHaveLength(0);
  });

  it("a plan without campo answers to level 3 and stays pending", () => {
    const v = proponerPlan({
      objetivo: "Abrir expediente",
      pasos: [{ op: "crear_caso", nombre: "Renovación" }],
    });
    expect(v.ok).toBe(true);
    expect(v.estado).toBe("pendiente");
    expect(v.plan?.nivel).toBe(3);
    // Nothing touched the graph yet.
    expect(useAutogenesStore.getState().casos).toHaveLength(0);
  });

  it("campo at level 1 auto-executes; the dimmer governs, not the model", () => {
    // fiscal defaults to level 1 (automatic) in the dimmer.
    const v = proponerPlan({
      objetivo: "Registrar autoridad",
      campo: "fiscal",
      pasos: [
        { op: "recordar", nombre: "SAT", tipo: "organizacion", resumen: "Autoridad fiscal." },
      ],
    });
    expect(v.estado).toBe("ejecutado");
    expect(v.resultados?.[0].ok).toBe(true);
    expect(
      useAutogenesStore.getState().entidades.map((e) => e.nombre),
    ).toEqual(["SAT"]);
  });

  it("raising the dimmer to 3 parks even campo plans", () => {
    useAutonomiaStore.getState().setNivel("fiscal", 3);
    const v = proponerPlan({
      objetivo: "Registrar autoridad",
      campo: "fiscal",
      pasos: [
        { op: "recordar", nombre: "SAT", tipo: "organizacion", resumen: "Autoridad." },
      ],
    });
    expect(v.estado).toBe("pendiente");
    expect(useAutogenesStore.getState().entidades).toHaveLength(0);
  });

  it("executes step by step: names resolve live, failures recorded, plan continues", () => {
    const v = proponerPlan({
      objetivo: "Caso de renta",
      pasos: [
        { op: "crear_caso", nombre: "Renta 2026", objetivo: "¿Renuevo?" },
        { op: "recordar", nombre: "ACME", tipo: "organizacion", resumen: "Arrendadora." },
        { op: "recordar", nombre: "Julio", tipo: "persona", resumen: "Operador." },
        { op: "enlazar", desde: "acme", hasta: "JULIO", tipo: "arrienda a" },
        { op: "enlazar", desde: "ACME", hasta: "FANTASMA", tipo: "paga a" },
        { op: "anexar_caso", caso: "renta 2026", entidades: ["ACME", "NADIE"] },
        { op: "nota", caso: "Renta 2026", texto: "Revisar antes de junio." },
      ],
    });
    const resultados = ejecutarPlan(v.plan!.id);
    expect(resultados.map((r) => r.ok)).toEqual([
      true, true, true, true, false, true, true,
    ]);
    expect(resultados[4].detalle).toContain("FANTASMA");
    expect(resultados[5].detalle).toContain("Sin encontrar: NADIE");

    const s = useAutogenesStore.getState();
    expect(s.casos[0].nombre).toBe("Renta 2026");
    expect(s.casos[0].entidades).toHaveLength(1);
    expect(s.casos[0].notas[0].texto).toBe("Revisar antes de junio.");
    expect(s.relaciones).toHaveLength(1);
    // Everything the plan did is in the audit trail.
    expect(s.bitacora.some((e) => e.accion === "caso")).toBe(true);
    // The plan settles as ejecutado and cannot run twice.
    expect(ejecutarPlan(v.plan!.id)).toHaveLength(0);
  });

  it("enlazar is idempotent against existing relations", () => {
    proponerPlan({
      objetivo: "a",
      campo: "fiscal",
      pasos: [
        { op: "recordar", nombre: "A", tipo: "concepto", resumen: "a" },
        { op: "recordar", nombre: "B", tipo: "concepto", resumen: "b" },
        { op: "enlazar", desde: "A", hasta: "B", tipo: "liga" },
        { op: "enlazar", desde: "B", hasta: "A", tipo: "LIGA" },
      ],
    });
    expect(useAutogenesStore.getState().relaciones).toHaveLength(1);
  });
});
