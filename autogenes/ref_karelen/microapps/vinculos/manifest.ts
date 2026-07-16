import { MicroappManifestSchema, type MicroappManifest } from "@/types/microapp";

/** VÍNCULOS — relation explorer riding on the AUTOGENES substrate. */
export const manifiestoVinculos: MicroappManifest = MicroappManifestSchema.parse(
  {
    id: "vinculos",
    nombre: "Vínculos",
    categoria: "inteligencia",
    nivelAutonomia: 1,
    descripcion:
      "Cómo se conecta tu mundo: el camino más corto entre dos entidades con cada salto citado, vecindarios por grados y los nodos más conectados.",
  },
);
