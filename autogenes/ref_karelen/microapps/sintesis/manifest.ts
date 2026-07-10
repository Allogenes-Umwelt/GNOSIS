import { MicroappManifestSchema, type MicroappManifest } from "@/types/microapp";

/** SÍNTESIS — cited executive reports riding on the AUTOGENES substrate. */
export const manifiestoSintesis: MicroappManifest = MicroappManifestSchema.parse(
  {
    id: "sintesis",
    nombre: "Síntesis",
    categoria: "inteligencia",
    nivelAutonomia: 2,
    descripcion:
      "El informe ejecutivo de tu situación, generado desde tu grafo de conocimiento: cada afirmación con su cita a tus fuentes o a tu grafo.",
  },
);
