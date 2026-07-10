import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import { DatumSchema, type Datum } from "@/types/datum";
import type { Campo } from "@/types/microapp";

/**
 * Operator data store — the real substance of the Umwelt, persisted on
 * device. No mock data ever enters this store.
 */

interface DatosState {
  datos: Datum[];
  addDatum: (campo: Campo, etiqueta: string, valor: string) => Datum;
  removeDatum: (id: string) => void;
  mergeDatos: (incoming: Datum[]) => number;
}

export const useDatosStore = create<DatosState>()(
  persist(
    (set, get) => ({
      datos: [],

      addDatum: (campo, etiqueta, valor) => {
        const datum = DatumSchema.parse({
          id: crypto.randomUUID(),
          campo,
          etiqueta: etiqueta.trim(),
          valor: valor.trim(),
          createdAt: Date.now(),
        });
        set((state) => ({ datos: [datum, ...state.datos] }));
        return datum;
      },

      removeDatum: (id) =>
        set((state) => ({ datos: state.datos.filter((d) => d.id !== id) })),

      mergeDatos: (incoming) => {
        const existing = new Set(get().datos.map((d) => d.id));
        const fresh = incoming.filter((d) => !existing.has(d.id));
        if (fresh.length > 0) {
          set((state) => ({
            datos: [...fresh, ...state.datos].sort(
              (a, b) => b.createdAt - a.createdAt,
            ),
          }));
        }
        return fresh.length;
      },
    }),
    {
      name: "umwelt-datos-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
