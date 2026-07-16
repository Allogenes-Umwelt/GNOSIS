import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import {
  formatOperationCode,
  OperationSchema,
  type Operation,
  type OperationKind,
} from "@/types/operation";
import type { ResultadoUniversal } from "@/types/resultado";

/**
 * Canvas store — the operator's real record, persisted on device
 * (localStorage). No mock data ever enters this store.
 */

interface CanvasState {
  seq: number;
  operations: Operation[];
  registerNote: (title: string) => Operation;
  registerDato: (title: string, detail?: string) => Operation;
  registerConsulta: (title: string, detail: string) => Operation;
  /** Dock a universal instrument to the canvas (A: dashboards inline). */
  registerInstrumento: (
    title: string,
    resultado: ResultadoUniversal,
  ) => Operation;
  removeOperation: (id: string) => void;
  mergeOperations: (incoming: Operation[]) => number;
}

function codeNumber(code: string): number {
  const n = Number(code.replace("UMW-OP-", ""));
  return Number.isFinite(n) ? n : 0;
}

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => {
      const register = (
        kind: OperationKind,
        title: string,
        detail?: string,
        source: Operation["source"] = "operador",
        resultado?: ResultadoUniversal,
      ): Operation => {
        const nextSeq = get().seq + 1;
        const operation = OperationSchema.parse({
          id: crypto.randomUUID(),
          code: formatOperationCode(nextSeq),
          kind,
          title: title.trim(),
          detail,
          resultado,
          source,
          createdAt: Date.now(),
        });
        set((state) => ({
          seq: nextSeq,
          operations: [operation, ...state.operations],
        }));
        return operation;
      };

      return {
        seq: 0,
        operations: [],

        registerNote: (title) => register("nota", title),
        registerDato: (title, detail) => register("dato", title, detail),
        registerConsulta: (title, detail) =>
          register("consulta", title, detail, "synesis"),
        registerInstrumento: (title, resultado) =>
          register("instrumento", title, undefined, "synesis", resultado),

        removeOperation: (id) =>
          set((state) => ({
            operations: state.operations.filter((op) => op.id !== id),
          })),

        mergeOperations: (incoming) => {
          const existing = new Set(get().operations.map((op) => op.id));
          const fresh = incoming.filter((op) => !existing.has(op.id));
          if (fresh.length > 0) {
            set((state) => {
              const operations = [...fresh, ...state.operations].sort(
                (a, b) => b.createdAt - a.createdAt,
              );
              const maxCode = operations.reduce(
                (max, op) => Math.max(max, codeNumber(op.code)),
                state.seq,
              );
              return { operations, seq: maxCode };
            });
          }
          return fresh.length;
        },
      };
    },
    {
      name: "umwelt-canvas-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
