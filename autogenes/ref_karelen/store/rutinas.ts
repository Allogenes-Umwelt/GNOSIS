import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";

/**
 * A0 — deterministic routines: recurring connector queries the operator
 * declares once ("FIX cada mañana"). No model anywhere: a routine is
 * {conector, consulta, parámetros, frecuencia} executed by the runner
 * when due, its result feeding the QUALIA connector sources (and with
 * them the FUENTES spoke). Config is operator-owned; deleting a routine
 * here is the operator acting directly, not a delegated delete.
 */

export interface Rutina {
  id: string;
  conector: string;
  consulta: string;
  parametros: Record<string, string>;
  frecuenciaHoras: number;
  activa: boolean;
  ultimaEjecucion: number | null;
  ultimoError: string | null;
  createdAt: number;
}

const MAX_RUTINAS = 20;

interface RutinasState {
  rutinas: Rutina[];
  crear: (
    r: Pick<Rutina, "conector" | "consulta" | "parametros" | "frecuenciaHoras">,
  ) => Rutina | null;
  alternar: (id: string) => void;
  eliminar: (id: string) => void;
  marcarEjecucion: (id: string, ts: number, error: string | null) => void;
}

export const useRutinasStore = create<RutinasState>()(
  persist(
    (set, get) => ({
      rutinas: [],
      crear: (r) => {
        if (get().rutinas.length >= MAX_RUTINAS) return null;
        const rutina: Rutina = {
          id: crypto.randomUUID(),
          ...r,
          activa: true,
          ultimaEjecucion: null,
          ultimoError: null,
          createdAt: Date.now(),
        };
        set((s) => ({ rutinas: [rutina, ...s.rutinas] }));
        return rutina;
      },
      alternar: (id) =>
        set((s) => ({
          rutinas: s.rutinas.map((r) =>
            r.id === id ? { ...r, activa: !r.activa } : r,
          ),
        })),
      eliminar: (id) =>
        set((s) => ({ rutinas: s.rutinas.filter((r) => r.id !== id) })),
      marcarEjecucion: (id, ts, error) =>
        set((s) => ({
          rutinas: s.rutinas.map((r) =>
            r.id === id
              ? { ...r, ultimaEjecucion: ts, ultimoError: error }
              : r,
          ),
        })),
    }),
    {
      name: "umwelt-rutinas-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
