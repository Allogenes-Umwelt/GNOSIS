import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";

/**
 * Operator preferences — active SYNESIS provider and device-local API
 * keys. Keys live ONLY in this device's storage and travel exclusively
 * to the app's own /api/synesis route, never to third parties directly.
 */

export const PROVIDERS = [
  "anthropic",
  "gemini",
  "deepseek",
  "openrouter",
] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Claude",
  gemini: "Gemini",
  deepseek: "DeepSeek V4",
  openrouter: "OpenRouter",
};

export type CamposVista = "cubos" | "lista";

interface PreferenciasState {
  provider: Provider;
  claves: Partial<Record<Provider, string>>;
  /** Device-local tokens for service connectors, keyed by connector id. */
  clavesServicio: Partial<Record<string, string>>;
  lastExport: number | null;
  camposVista: CamposVista;
  /**
   * Detailed-map opt-in: tile requests reveal the viewed area to the
   * tile host (OpenFreeMap). Off by default; the local plane needs no
   * network at all.
   */
  tilesRemotos: boolean;
  setProvider: (p: Provider) => void;
  setClave: (p: Provider, clave: string) => void;
  setClaveServicio: (conector: string, clave: string) => void;
  markExport: () => void;
  setCamposVista: (v: CamposVista) => void;
  setTilesRemotos: (v: boolean) => void;
}

export const usePreferenciasStore = create<PreferenciasState>()(
  persist(
    (set) => ({
      provider: "anthropic",
      claves: {},
      clavesServicio: {},
      lastExport: null,
      camposVista: "cubos",
      tilesRemotos: false,
      setProvider: (provider) => set({ provider }),
      setCamposVista: (camposVista) => set({ camposVista }),
      setTilesRemotos: (tilesRemotos) => set({ tilesRemotos }),
      setClave: (p, clave) =>
        set((state) => ({
          claves: { ...state.claves, [p]: clave.trim() },
        })),
      setClaveServicio: (conector, clave) =>
        set((state) => ({
          clavesServicio: { ...state.clavesServicio, [conector]: clave.trim() },
        })),
      markExport: () => set({ lastExport: Date.now() }),
    }),
    {
      name: "umwelt-preferencias-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
