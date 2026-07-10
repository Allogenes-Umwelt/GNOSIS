import { MicroappManifestSchema, type MicroappManifest } from "@/types/microapp";

/** RADAR — the attention instrument riding on the AUTOGENES substrate. */
export const manifiestoRadar: MicroappManifest = MicroappManifestSchema.parse(
  {
    id: "radar",
    nombre: "Radar",
    categoria: "inteligencia",
    nivelAutonomia: 1,
    descripcion:
      "Lo que requiere tu atención ahora: vencimientos citados de tu cronología, colas por adjudicar, fuentes sin procesar y el estado de tu respaldo.",
  },
);
