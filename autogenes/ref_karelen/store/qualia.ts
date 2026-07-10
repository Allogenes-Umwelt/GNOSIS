import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import type { SnapshotQualia } from "@/capacidades/anomalias";

/**
 * QUALIA's own source store. Holds what the operator loads ("Mis fuentes",
 * origen "propia") and what connector queries bring in ("Conectores",
 * origen "conector"), category-agnostic. Each load is a `lote` (batch), so
 * concepts co-occur within their batch. Separate from the operator datos
 * store and from AUTOGENES; the studio owns it. Persisted, real data only.
 */

export type OrigenFuente = "propia" | "conector";

export interface FuenteItem {
  id: string;
  etiqueta: string;
  valor: string;
  /** Batch id — everything from one load shares it (drives co-occurrence). */
  lote: string;
  /** Where it came from — drives which source toggle shows it. */
  origen: OrigenFuente;
  createdAt: number;
}

interface Entrada {
  etiqueta: string;
  valor: string;
}

function materializar(entradas: Entrada[], lote: string, origen: OrigenFuente, base: number): FuenteItem[] {
  return entradas
    .map((e) => ({ etiqueta: e.etiqueta.trim(), valor: e.valor.trim() }))
    .filter((e) => e.etiqueta.length > 0 && e.valor.length > 0)
    .map((e, i) => ({
      id: crypto.randomUUID(),
      etiqueta: e.etiqueta,
      valor: e.valor,
      lote,
      origen,
      createdAt: base + i,
    }));
}

const MAX_SNAPSHOTS = 200;

interface QualiaState {
  fuentes: FuenteItem[];
  /** Telemetry (M0/N0): compact metric snapshots, newest first. ACTUAR
      plots this series; it is sampled automatically, so it is NOT the
      baseline. */
  snapshots: SnapshotQualia[];
  /** The operator's reference (N0): OBSERVAR measures anomalies against
      THIS, and only the operator moves it. Auto-telemetry never does. */
  base: SnapshotQualia | null;
  /** Approved semantic fusions (N3): label → canonical label. Applied at
      projection time; the stored fuentes are never rewritten. */
  fusiones: Record<string, string>;
  /** Dismissed fusion proposals (clavePar) — never re-proposed. */
  paresOmitidos: string[];
  registrarSnapshot: (s: SnapshotQualia) => void;
  /** Fix the baseline; also records it as a telemetry sample. */
  fijarBase: (s: SnapshotQualia) => void;
  fusionar: (de: string, a: string) => void;
  omitirPar: (clave: string) => void;
  /** Append one batch; returns how many entries were kept. */
  agregarLote: (entradas: Entrada[], origen?: OrigenFuente) => number;
  /** Append several batches (one lote each); returns total kept. */
  agregarLotes: (lotes: Entrada[][], origen: OrigenFuente) => number;
  /** Clear everything, or just one origen. */
  limpiar: (origen?: OrigenFuente) => void;
}

export const useQualiaStore = create<QualiaState>()(
  persist(
    (set) => ({
      fuentes: [],
      snapshots: [],
      base: null,
      fusiones: {},
      paresOmitidos: [],
      fusionar: (de, a) =>
        set((s) => {
          if (de === a) return s;
          const fusiones = { ...s.fusiones, [de]: a };
          // Re-point any fusion that targeted `de` so chains stay flat.
          for (const [k, v] of Object.entries(fusiones)) {
            if (v === de) fusiones[k] = a;
          }
          return { fusiones };
        }),
      omitirPar: (clave) =>
        set((s) => ({
          paresOmitidos: s.paresOmitidos.includes(clave)
            ? s.paresOmitidos
            : [...s.paresOmitidos, clave].slice(0, 300),
        })),
      registrarSnapshot: (snap) =>
        set((s) => ({
          snapshots: [snap, ...s.snapshots].slice(0, MAX_SNAPSHOTS),
        })),
      fijarBase: (snap) =>
        set((s) => ({
          base: snap,
          snapshots: [snap, ...s.snapshots].slice(0, MAX_SNAPSHOTS),
        })),
      agregarLote: (entradas, origen = "propia") => {
        const items = materializar(entradas, crypto.randomUUID(), origen, Date.now());
        if (items.length === 0) return 0;
        set((s) => ({ fuentes: [...items, ...s.fuentes] }));
        return items.length;
      },
      agregarLotes: (lotes, origen) => {
        const now = Date.now();
        const items = lotes.flatMap((entradas, li) =>
          materializar(entradas, crypto.randomUUID(), origen, now + li * 1000),
        );
        if (items.length === 0) return 0;
        set((s) => ({ fuentes: [...items, ...s.fuentes] }));
        return items.length;
      },
      limpiar: (origen) =>
        set((s) => ({
          fuentes: origen ? s.fuentes.filter((f) => f.origen !== origen) : [],
        })),
    }),
    {
      name: "umwelt-qualia-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
