import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import type { Plan, ResultadoPaso } from "@/types/plan";
import type { NivelAutonomia } from "@/types/microapp";
import type { PropuestaPlan } from "@/types/plan";

/**
 * Plan proposals (D6) — the kernel's pending/settled multi-step plans.
 * Proposals are transient governance state, not knowledge: they do NOT
 * travel in export bundles. Execution itself mutates the AUTOGENES
 * store, which audits every operation in the bitácora.
 */

const MAX_PLANES = 30;

interface PlanesState {
  planes: Plan[];
  proponer: (propuesta: PropuestaPlan, nivel: NivelAutonomia) => Plan;
  resolver: (
    id: string,
    estado: "ejecutado" | "descartado",
    resultados?: ResultadoPaso[],
  ) => void;
  clear: () => void;
}

export const usePlanesStore = create<PlanesState>()(
  persist(
    (set) => ({
      planes: [],

      proponer: (propuesta, nivel) => {
        const plan: Plan = {
          id: crypto.randomUUID(),
          objetivo: propuesta.objetivo,
          campo: propuesta.campo,
          pasos: propuesta.pasos,
          nivel,
          estado: "pendiente",
          resultados: [],
          createdAt: Date.now(),
        };
        set((s) => ({ planes: [plan, ...s.planes].slice(0, MAX_PLANES) }));
        return plan;
      },

      resolver: (id, estado, resultados) =>
        set((s) => ({
          planes: s.planes.map((p) =>
            p.id === id
              ? {
                  ...p,
                  estado,
                  resultados: resultados ?? p.resultados,
                  resueltoEn: Date.now(),
                }
              : p,
          ),
        })),

      clear: () => set({ planes: [] }),
    }),
    {
      name: "umwelt-planes-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
