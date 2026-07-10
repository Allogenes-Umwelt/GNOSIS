import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import type { RegistroQqp } from "@/lib/qqp/parse";

/**
 * MANDADO store — the operator's shopping list, location and the
 * Profeco rows that back the comparison. Only rows matching the list
 * are kept (the weekly QQP file is huge; IndexedDB is not a data lake),
 * so changing the list invites a reload — the UI says so honestly.
 */

export interface UbicacionMandado {
  lat: number;
  lon: number;
  etiqueta: string;
}

interface MandadoState {
  lista: string[];
  ubicacion: UbicacionMandado | null;
  registros: RegistroQqp[];
  /** When and from which file/source the rows were loaded. */
  cargadoEn: number | null;
  fuente: string | null;
  radioKm: number;
  agregarProducto: (termino: string) => void;
  quitarProducto: (termino: string) => void;
  fijarUbicacion: (u: UbicacionMandado | null) => void;
  fijarRadio: (km: number) => void;
  cargarRegistros: (rows: RegistroQqp[], fuente: string) => void;
  limpiarRegistros: () => void;
}

const MAX_REGISTROS = 20_000;

export const useMandadoStore = create<MandadoState>()(
  persist(
    (set) => ({
      lista: [],
      ubicacion: null,
      registros: [],
      cargadoEn: null,
      fuente: null,
      radioKm: 5,
      agregarProducto: (termino) =>
        set((s) => {
          const t = termino.trim();
          if (t.length === 0 || s.lista.some((x) => x.toLowerCase() === t.toLowerCase()))
            return s;
          return { lista: [...s.lista, t].slice(0, 30) };
        }),
      quitarProducto: (termino) =>
        set((s) => ({ lista: s.lista.filter((x) => x !== termino) })),
      fijarUbicacion: (ubicacion) => set({ ubicacion }),
      fijarRadio: (km) =>
        set({ radioKm: Number.isFinite(km) && km > 0 ? Math.min(km, 50) : 5 }),
      cargarRegistros: (rows, fuente) =>
        set({
          registros: rows.slice(0, MAX_REGISTROS),
          cargadoEn: Date.now(),
          fuente,
        }),
      limpiarRegistros: () =>
        set({ registros: [], cargadoEn: null, fuente: null }),
    }),
    {
      name: "umwelt-mandado-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
