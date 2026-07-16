import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";

/**
 * "Tu base" — the operator's own backup/sync server (F1). URL and token are
 * device-local, like the SYNESIS keys, and travel only to that server. The
 * passphrase is NOT here: it stays in memory, entered per session (F0).
 */
interface BaseState {
  url: string;
  token: string;
  /** Label this device stores its backups under. */
  dispositivo: string;
  ultimoRespaldo: number | null;
  setUrl: (url: string) => void;
  setToken: (token: string) => void;
  setDispositivo: (dispositivo: string) => void;
  markRespaldo: () => void;
}

export const useBaseStore = create<BaseState>()(
  persist(
    (set) => ({
      url: "",
      token: "",
      dispositivo: "telefono",
      ultimoRespaldo: null,
      setUrl: (url) => set({ url: url.trim() }),
      setToken: (token) => set({ token: token.trim() }),
      setDispositivo: (dispositivo) => set({ dispositivo: dispositivo.trim() }),
      markRespaldo: () => set({ ultimoRespaldo: Date.now() }),
    }),
    {
      name: "umwelt-base-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
