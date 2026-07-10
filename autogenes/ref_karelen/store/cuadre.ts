import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";

/**
 * CUADRE store — the only inputs the engine cannot derive from the
 * corpus: the coeficiente de utilidad from the operator's last annual
 * return (Art. 14, fracc. I, LISR). Everything else (RFC, sixth digit,
 * amounts) comes from real data already on device.
 */

interface CuadreState {
  /** Coeficiente de utilidad, e.g. 0.1234; null = not captured. */
  coeficienteUtilidad: number | null;
  fijarCoeficiente: (cu: number | null) => void;
}

export const useCuadreStore = create<CuadreState>()(
  persist(
    (set) => ({
      coeficienteUtilidad: null,
      fijarCoeficiente: (cu) =>
        set({
          coeficienteUtilidad:
            cu !== null && Number.isFinite(cu) && cu > 0 && cu < 1 ? cu : null,
        }),
    }),
    {
      name: "umwelt-cuadre-v1",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
