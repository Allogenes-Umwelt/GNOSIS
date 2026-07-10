import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import type { Campo, NivelAutonomia } from "@/types/microapp";

/**
 * Autonomy dimmer — trust earned, never assumed (concept paper §02.2).
 * One level per semantic field; every field starts at Level 1
 * (automatic actions only). Bidirectional by design.
 */

interface AutonomiaState {
  niveles: Partial<Record<Campo, NivelAutonomia>>;
  setNivel: (campo: Campo, nivel: NivelAutonomia) => void;
}

export const useAutonomiaStore = create<AutonomiaState>()(
  persist(
    (set) => ({
      niveles: {},
      setNivel: (campo, nivel) =>
        set((state) => ({ niveles: { ...state.niveles, [campo]: nivel } })),
    }),
    {
      name: "umwelt-autonomia-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);

export function nivelDe(
  niveles: Partial<Record<Campo, NivelAutonomia>>,
  campo: Campo,
): NivelAutonomia {
  return niveles[campo] ?? 1;
}
