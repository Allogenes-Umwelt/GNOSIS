import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";

/**
 * Semantic-search opt-in state (F2a). Off by default: the operator decides
 * when the device loads the 112 MB model and builds the index, like the map
 * tiles. `construido` gates whether the omnibox uses the hybrid lane. The
 * vectors themselves live in idb-keyval (see services/semantica), not here.
 */
interface SemanticaState {
  activa: boolean;
  construido: boolean;
  conteo: number;
  setActiva: (v: boolean) => void;
  marcarConstruido: (conteo: number) => void;
  invalidar: () => void;
}

export const useSemanticaStore = create<SemanticaState>()(
  persist(
    (set) => ({
      activa: false,
      construido: false,
      conteo: 0,
      setActiva: (activa) => set({ activa }),
      marcarConstruido: (conteo) => set({ construido: true, conteo }),
      invalidar: () => set({ construido: false, conteo: 0 }),
    }),
    {
      name: "umwelt-semantica-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
