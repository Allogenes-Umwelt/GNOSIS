import { normalizar } from "@/lib/similitud";
import { useAutogenesStore } from "@/store/autogenes";
import { useAutonomiaStore, nivelDe } from "@/store/autonomia";
import { usePlanesStore } from "@/store/planes";
import {
  PropuestaPlanSchema,
  type PasoPlan,
  type Plan,
  type ResultadoPaso,
} from "@/types/plan";

/**
 * D6 — plan governance and execution. The kernel proposes; HERE the
 * dimmer decides (a plan without campo answers to level 3 — trust is
 * earned, never assumed) and HERE every step resolves names against
 * the LIVE graph and executes through audited store actions. Steps
 * are additive only; a failed step is recorded and the plan continues.
 */

function buscarEntidad(nombre: string) {
  const q = normalizar(nombre);
  return useAutogenesStore
    .getState()
    .entidades.find(
      (e) =>
        normalizar(e.nombre) === q ||
        (e.alias ?? []).some((a) => normalizar(a) === q),
    );
}

function buscarCaso(nombre: string) {
  const q = normalizar(nombre);
  return useAutogenesStore
    .getState()
    .casos.find((c) => normalizar(c.nombre) === q);
}

function ejecutarPaso(paso: PasoPlan): ResultadoPaso["detalle"] {
  const store = useAutogenesStore.getState();
  switch (paso.op) {
    case "crear_caso": {
      const existente = buscarCaso(paso.nombre);
      if (existente) return `El caso «${existente.nombre}» ya existía; se reutiliza.`;
      store.crearCaso(paso.nombre, paso.objetivo);
      return `Caso «${paso.nombre}» abierto.`;
    }
    case "recordar": {
      const e = store.upsertEntidad({
        nombre: paso.nombre,
        tipo: paso.tipo,
        resumen: paso.resumen,
        campo: paso.campo,
        origen: "synesis",
      });
      return `Entidad ${e.nombre} en el grafo.`;
    }
    case "enlazar": {
      const desde = buscarEntidad(paso.desde);
      const hasta = buscarEntidad(paso.hasta);
      if (!desde || !hasta) {
        throw new Error(
          `No existe la entidad ${!desde ? paso.desde : paso.hasta}. El plan debía recordarla antes.`,
        );
      }
      const repetida = useAutogenesStore
        .getState()
        .relaciones.some(
          (r) =>
            ((r.desdeId === desde.id && r.hastaId === hasta.id) ||
              (r.desdeId === hasta.id && r.hastaId === desde.id)) &&
            r.tipo.toLowerCase() === paso.tipo.toLowerCase(),
        );
      if (repetida) return `La relación ya existía; nada que hacer.`;
      store.addRelacion({
        desdeId: desde.id,
        hastaId: hasta.id,
        tipo: paso.tipo,
      });
      return `${desde.nombre} —${paso.tipo}→ ${hasta.nombre}.`;
    }
    case "anexar_caso": {
      const caso = buscarCaso(paso.caso);
      if (!caso) throw new Error(`No existe el caso «${paso.caso}».`);
      const entidades = paso.entidades.map(buscarEntidad);
      const artefactos = paso.artefactos.map((n) => {
        const q = normalizar(n);
        return useAutogenesStore
          .getState()
          .artefactos.find((a) => normalizar(a.nombre) === q);
      });
      const idsE = entidades.flatMap((e) => (e ? [e.id] : []));
      const idsA = artefactos.flatMap((a) => (a ? [a.id] : []));
      store.anexarAlCaso(caso.id, { entidades: idsE, artefactos: idsA });
      const perdidos = [
        ...paso.entidades.filter((_, i) => !entidades[i]),
        ...paso.artefactos.filter((_, i) => !artefactos[i]),
      ];
      return `${idsE.length + idsA.length} miembros anexados a «${caso.nombre}».${perdidos.length > 0 ? ` Sin encontrar: ${perdidos.join(", ")}.` : ""}`;
    }
    case "nota": {
      const caso = buscarCaso(paso.caso);
      if (!caso) throw new Error(`No existe el caso «${paso.caso}».`);
      store.agregarNota(caso.id, paso.texto);
      return `Nota registrada en «${caso.nombre}».`;
    }
  }
}

/** Execute a pending plan step by step. Failures are recorded, never
 *  hidden; the plan keeps going — its operations are additive. */
export function ejecutarPlan(planId: string): ResultadoPaso[] {
  const plan = usePlanesStore.getState().planes.find((p) => p.id === planId);
  if (!plan || plan.estado !== "pendiente") return [];
  const resultados: ResultadoPaso[] = plan.pasos.map((paso, i) => {
    try {
      return { paso: i, ok: true, detalle: ejecutarPaso(paso) };
    } catch (e) {
      return {
        paso: i,
        ok: false,
        detalle: e instanceof Error ? e.message : "El paso falló.",
      };
    }
  });
  usePlanesStore.getState().resolver(planId, "ejecutado", resultados);
  return resultados;
}

export function descartarPlan(planId: string): void {
  usePlanesStore.getState().resolver(planId, "descartado");
}

export interface VeredictoPropuesta {
  ok: boolean;
  plan?: Plan;
  estado?: "ejecutado" | "pendiente";
  resultados?: ResultadoPaso[];
  error?: string;
}

/**
 * Entry point for the kernel tool: validate hard, let the dimmer
 * govern. Campo declared → its level rules; no campo → level 3.
 * Level 1 executes NOW; levels 2 and 3 park the plan for the operator
 * in the C2 panel.
 */
export function proponerPlan(input: unknown): VeredictoPropuesta {
  const parsed = PropuestaPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Plan inválido: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} — ${i.message}`)
        .join("; ")}`,
    };
  }
  const nivel = parsed.data.campo
    ? nivelDe(useAutonomiaStore.getState().niveles, parsed.data.campo)
    : 3;
  const plan = usePlanesStore.getState().proponer(parsed.data, nivel);
  if (nivel === 1) {
    const resultados = ejecutarPlan(plan.id);
    return { ok: true, plan, estado: "ejecutado", resultados };
  }
  return { ok: true, plan, estado: "pendiente" };
}
