import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";

/**
 * Case scope (L·5) — the active investigation. When set, the capability
 * surfaces (Radar, Vínculos, Síntesis) narrow their inputs to the case's
 * anchors instead of the whole Umwelt. Persisted: an investigation stays
 * in focus across routes and reloads until the operator releases it.
 */
interface CasoFocoState {
  casoActivoId: string | null;
  enfocarCaso: (id: string) => void;
  soltarCaso: () => void;
}

export const useCasoFocoStore = create<CasoFocoState>()(
  persist(
    (set) => ({
      casoActivoId: null,
      enfocarCaso: (id) => set({ casoActivoId: id }),
      soltarCaso: () => set({ casoActivoId: null }),
    }),
    {
      name: "umwelt-caso-foco-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
