import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import {
  idMovimiento,
  type EstadoBanco,
  type MovimientoBanco,
  type SucursalBanco,
} from "@/lib/banco/bbva";

/**
 * FLUJO store (P1) — the operator's statement archive: load one or a
 * thousand, movements dedupe by their stable id so re-importing a month
 * never double-counts. Balances and the verification verdict are kept
 * per statement; the engines run over the union. On device, exportable,
 * real data only.
 */

export interface EstadoGuardado {
  id: string;
  periodo: { desde: string; hasta: string } | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  cuadra: boolean;
  nMovimientos: number;
  sucursal: SucursalBanco | null;
  cargadoEn: number;
}

interface FlujoState {
  estados: EstadoGuardado[];
  movimientos: MovimientoBanco[];
  /** Merge a parsed statement; returns how many movements were new. */
  cargarEstado: (e: EstadoBanco, sucursal: SucursalBanco | null) => number;
  quitarEstado: (id: string) => void;
  limpiar: () => void;
}

const idEstado = (e: EstadoBanco): string =>
  e.periodo ? `${e.periodo.desde}|${e.periodo.hasta}` : `sin-periodo-${e.movimientos.length}`;

export const useFlujoStore = create<FlujoState>()(
  persist(
    (set, get) => ({
      estados: [],
      movimientos: [],
      cargarEstado: (e, sucursal) => {
        const vistos = new Set(get().movimientos.map(idMovimiento));
        const nuevos = e.movimientos.filter((m) => !vistos.has(idMovimiento(m)));
        const id = idEstado(e);
        const guardado: EstadoGuardado = {
          id,
          periodo: e.periodo,
          saldoInicial: e.saldoInicial,
          saldoFinal: e.saldoFinal,
          cuadra: e.cuadra,
          nMovimientos: e.movimientos.length,
          sucursal,
          cargadoEn: Date.now(),
        };
        set((s) => ({
          estados: [guardado, ...s.estados.filter((x) => x.id !== id)].sort(
            (a, b) => ((a.periodo?.desde ?? "") < (b.periodo?.desde ?? "") ? 1 : -1),
          ),
          movimientos: [...s.movimientos, ...nuevos].sort((a, b) =>
            a.fecha < b.fecha ? -1 : 1,
          ),
        }));
        return nuevos.length;
      },
      quitarEstado: (id) =>
        set((s) => {
          const estado = s.estados.find((x) => x.id === id);
          if (!estado?.periodo) {
            return { estados: s.estados.filter((x) => x.id !== id) };
          }
          const { desde, hasta } = estado.periodo;
          return {
            estados: s.estados.filter((x) => x.id !== id),
            movimientos: s.movimientos.filter(
              (m) => m.fecha < desde || m.fecha > hasta,
            ),
          };
        }),
      limpiar: () => set({ estados: [], movimientos: [] }),
    }),
    {
      name: "umwelt-flujo-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
