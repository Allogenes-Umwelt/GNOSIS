import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idMovimiento, type MovimientoBanco } from "@/lib/banco/bbva";
import { claveComprobante } from "@/capacidades/finanzas";
import type { MetadataCfdi } from "@/lib/cfdi/metadata";
import { RegistroCfdiSchema, type ComprobanteCfdi, type RegistroCfdi } from "@/lib/cfdi/tipos";
import { idbStorage } from "@/lib/idb-storage";

export type MovimientoGuardado = MovimientoBanco & { id: string };

/**
 * COBRANZA store — the operator's CFDI corpus, persisted on device. Records
 * are deduplicated by fiscal key (timbre UUID, or a composite when
 * unstamped), so re-importing the same file or ZIP never double-counts. The
 * operator RFC is an optional override; when null the engine infers it. No
 * mock data ever enters this store; every figure the dashboard shows is
 * derived from these records, never dual-written.
 */

interface EntradaImport {
  comprobante: ComprobanteCfdi;
  archivo?: string;
}

interface CobranzaState {
  registros: RegistroCfdi[];
  /** Explicit operator RFC; null lets the engine infer it. */
  rfcOperador: string | null;
  /** UUID → cancellation status, from imported SAT Metadata. */
  metadata: Record<string, MetadataCfdi>;
  /** Imported bank movements. */
  movimientos: MovimientoGuardado[];
  /** Confirmed reconciliations: bank movement id → CFDI clave. */
  conciliaciones: Record<string, string>;
  importar: (nuevos: EntradaImport[]) => number;
  importarMetadata: (entradas: MetadataCfdi[]) => number;
  importarMovimientos: (movs: MovimientoBanco[]) => number;
  confirmarConciliacion: (id: string, clave: string) => void;
  quitarConciliacion: (id: string) => void;
  limpiarBanco: () => void;
  fijarRfcOperador: (rfc: string | null) => void;
  olvidar: (clave: string) => void;
  limpiar: () => void;
}

export const useCobranzaStore = create<CobranzaState>()(
  persist(
    (set, get) => ({
      registros: [],
      rfcOperador: null,
      metadata: {},
      movimientos: [],
      conciliaciones: {},

      importar: (nuevos) => {
        const vistas = new Set(get().registros.map((r) => r.clave));
        const frescos: RegistroCfdi[] = [];
        for (const { comprobante, archivo } of nuevos) {
          const clave = claveComprobante(comprobante);
          if (vistas.has(clave)) continue;
          vistas.add(clave);
          frescos.push(
            RegistroCfdiSchema.parse({
              clave,
              comprobante,
              archivo,
              importadoEn: Date.now(),
            }),
          );
        }
        if (frescos.length > 0) {
          set((state) => ({ registros: [...frescos, ...state.registros] }));
        }
        return frescos.length;
      },

      importarMetadata: (entradas) => {
        if (entradas.length === 0) return 0;
        set((state) => {
          const metadata = { ...state.metadata };
          for (const e of entradas) metadata[e.uuid.toUpperCase()] = e;
          return { metadata };
        });
        return entradas.length;
      },

      importarMovimientos: (movs) => {
        const vistos = new Set(get().movimientos.map((m) => m.id));
        const frescos: MovimientoGuardado[] = [];
        for (const m of movs) {
          const id = idMovimiento(m);
          if (vistos.has(id)) continue;
          vistos.add(id);
          frescos.push({ ...m, id });
        }
        if (frescos.length > 0) {
          set((state) => ({
            movimientos: [...state.movimientos, ...frescos].sort((a, b) =>
              a.fecha.localeCompare(b.fecha),
            ),
          }));
        }
        return frescos.length;
      },

      confirmarConciliacion: (id, clave) =>
        set((state) => ({ conciliaciones: { ...state.conciliaciones, [id]: clave } })),

      quitarConciliacion: (id) =>
        set((state) => {
          const conciliaciones = { ...state.conciliaciones };
          delete conciliaciones[id];
          return { conciliaciones };
        }),

      limpiarBanco: () => set({ movimientos: [], conciliaciones: {} }),

      fijarRfcOperador: (rfc) =>
        set({ rfcOperador: rfc && rfc.trim() ? rfc.trim().toUpperCase() : null }),

      olvidar: (clave) =>
        set((state) => ({
          registros: state.registros.filter((r) => r.clave !== clave),
        })),

      limpiar: () =>
        set({ registros: [], rfcOperador: null, metadata: {}, movimientos: [], conciliaciones: {} }),
    }),
    {
      name: "umwelt-cobranza-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
