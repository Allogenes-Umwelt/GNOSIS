import { manifiestoCobranza } from "@/microapps/cobranza/manifest";
import { manifiestoCuadre } from "@/microapps/cuadre/manifest";
import { manifiestoCuantoMeToca } from "@/microapps/cuanto-me-toca/manifest";
import { manifiestoDossier } from "@/microapps/dossier/manifest";
import { manifiestoFlujo } from "@/microapps/flujo/manifest";
import { manifiestoMandado } from "@/microapps/mandado/manifest";
import { manifiestoRadar } from "@/microapps/radar/manifest";
import { manifiestoSignature } from "@/microapps/signature/manifest";
import { manifiestoSintesis } from "@/microapps/sintesis/manifest";
import { manifiestoVinculos } from "@/microapps/vinculos/manifest";
import type { Campo, MicroappManifest } from "@/types/microapp";

/**
 * Fleet registry — the canvas discovers funnels here. The shell never
 * changes when a unit docks: one manifest line here, one component line
 * in componentes.ts.
 */
export const microapps: readonly MicroappManifest[] = [
  manifiestoRadar,
  manifiestoDossier,
  manifiestoVinculos,
  manifiestoSintesis,
  manifiestoSignature,
  manifiestoCobranza,
  manifiestoCuadre,
  manifiestoCuantoMeToca,
  manifiestoFlujo,
  manifiestoMandado,
];

export function getMicroapp(id: string): MicroappManifest | undefined {
  return microapps.find((m) => m.id === id);
}

/** Units able to act on cargo docked into a campo (ingesta recommender). */
export function sugerirUnidades(campo: Campo): readonly MicroappManifest[] {
  return microapps.filter((m) => m.campo === campo);
}
