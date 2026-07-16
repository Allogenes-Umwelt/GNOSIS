import { create } from "zustand";

/**
 * Cross-route focus handoff — a one-shot channel so a search hit can tell
 * the destination view WHICH object to open. Deliberately NOT persisted
 * and NOT in the URL: it's a transient intent consumed once on arrival,
 * then cleared. The omnibox writes it before navigating; the Dossier
 * reads and clears it on mount.
 */
interface FocoState {
  /** Raw entity id the destination should select, or null. */
  entidad: string | null;
  enfocarEntidad: (id: string) => void;
  consumir: () => void;
}

export const useFocoStore = create<FocoState>((set) => ({
  entidad: null,
  enfocarEntidad: (id) => set({ entidad: id }),
  consumir: () => set({ entidad: null }),
}));
