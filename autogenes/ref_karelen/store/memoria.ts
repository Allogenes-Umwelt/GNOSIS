import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import {
  ObjetoMemoriaSchema,
  type ObjetoMemoria,
  type Relacion,
} from "@/types/memoria";

/**
 * SYNESIS memory store — persisted on device. Upserts merge by name so
 * repeated mentions refine one object instead of duplicating it.
 */

interface MemoriaState {
  objetos: ObjetoMemoria[];
  upsertObjeto: (
    entrada: Omit<ObjetoMemoria, "id" | "createdAt" | "relaciones"> & {
      relaciones?: Relacion[];
    },
  ) => ObjetoMemoria;
  removeObjeto: (id: string) => void;
  clear: () => void;
}

function mergeRelaciones(a: Relacion[], b: Relacion[]): Relacion[] {
  const seen = new Set(a.map((r) => `${r.con}::${r.tipo}`));
  return [...a, ...b.filter((r) => !seen.has(`${r.con}::${r.tipo}`))];
}

export const useMemoriaStore = create<MemoriaState>()(
  persist(
    (set, get) => ({
      objetos: [],

      upsertObjeto: (entrada) => {
        const existing = get().objetos.find(
          (o) => o.nombre.toLowerCase() === entrada.nombre.toLowerCase(),
        );
        if (existing) {
          const updated: ObjetoMemoria = {
            ...existing,
            tipo: entrada.tipo,
            resumen: entrada.resumen,
            relaciones: mergeRelaciones(
              existing.relaciones,
              entrada.relaciones ?? [],
            ),
          };
          set((state) => ({
            objetos: state.objetos.map((o) =>
              o.id === existing.id ? updated : o,
            ),
          }));
          return updated;
        }
        const objeto = ObjetoMemoriaSchema.parse({
          id: crypto.randomUUID(),
          nombre: entrada.nombre.trim(),
          tipo: entrada.tipo,
          resumen: entrada.resumen.trim(),
          relaciones: entrada.relaciones ?? [],
          origen: entrada.origen,
          createdAt: Date.now(),
        });
        set((state) => ({ objetos: [objeto, ...state.objetos] }));
        return objeto;
      },

      removeObjeto: (id) =>
        set((state) => ({
          objetos: state.objetos.filter((o) => o.id !== id),
        })),

      clear: () => set({ objetos: [] }),
    }),
    {
      name: "umwelt-memoria-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
