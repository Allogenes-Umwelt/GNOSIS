import { MicroappManifestSchema, type MicroappManifest } from "@/types/microapp";

/** QUALIA — the intelligence machine over the operator's own network:
 * transversal (categoria inteligencia, no campo) since O1. */
export const manifiestoSignature: MicroappManifest = MicroappManifestSchema.parse(
  {
    id: "signature",
    nombre: "Qualia",
    categoria: "inteligencia",
    nivelAutonomia: 1,
    descripcion:
      "Máquina de inteligencia: teje tus datos y fuentes en una red, la procesa sola (radar, orbe, cascada, horizonte) y todo queda citado.",
  },
);
