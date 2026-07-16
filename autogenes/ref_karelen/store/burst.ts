import { create } from "zustand";

/**
 * Burst signal — a Kojima-style particle flash fired whenever energy
 * moves through the system (data loading, autonomy dimmer changes).
 * Ephemeral: never persisted.
 */

interface BurstState {
  seq: number;
  fire: () => void;
}

export const useBurstStore = create<BurstState>()((set) => ({
  seq: 0,
  fire: () => set((s) => ({ seq: s.seq + 1 })),
}));
