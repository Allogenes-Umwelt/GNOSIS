import { InformeSchema, type Informe } from "@/capacidades/informe";
import type { Narrativa } from "@/microapps/signature/narrativa";

/**
 * Dock QUALIA's reading as an informe-class Producto (E3): the studio's
 * deliverable docks into the ONE graph for other units to consume through
 * it. The deterministic structure is the ground truth; the SYNESIS reading
 * layers on top. When a cited concept resolves to a real graph entity (its
 * node id was namespaced "autogenes::<id>"), the point cites that entity —
 * so provenance flows back into the substrate.
 */

const RE_ENTIDAD = /^autogenes::(.+)$/;

/** The graph entity id behind a concepto clave, if it came from Autogenes. */
export function entidadDeConcepto(concepto: string): string | null {
  const m = concepto.match(RE_ENTIDAD);
  return m ? m[1] : null;
}

export interface InformeCitado {
  informe: Informe;
  /** Entity ids the informe cites — the Producto's graph anchor. */
  entidades: string[];
}

export function narrativaAInforme(
  narrativa: Narrativa,
  lecturaDeterminista: string[],
  titulo: string,
  etiquetaDe: (concepto: string) => string,
): InformeCitado {
  const entidades = new Set<string>();
  const secciones: {
    encabezado: string;
    puntos: { texto: string; evidencia: string[]; entidades: string[] }[];
  }[] = [
    {
      encabezado: "Panorama",
      puntos: [{ texto: narrativa.panorama, evidencia: [], entidades: [] }],
    },
  ];

  if (lecturaDeterminista.length > 0) {
    secciones.push({
      encabezado: "Estructura",
      puntos: lecturaDeterminista
        .slice(0, 8)
        .map((t) => ({ texto: t, evidencia: [], entidades: [] })),
    });
  }

  if (narrativa.lecturas.length > 0) {
    secciones.push({
      encabezado: "Lecturas",
      puntos: narrativa.lecturas.slice(0, 8).map((l) => {
        const ent = entidadDeConcepto(l.concepto);
        if (ent) entidades.add(ent);
        return {
          texto: `${etiquetaDe(l.concepto)}: ${l.lectura}`,
          evidencia: [],
          entidades: ent ? [ent] : [],
        };
      }),
    });
  }

  if (narrativa.observaciones.length > 0) {
    secciones.push({
      encabezado: "Observaciones",
      puntos: narrativa.observaciones
        .slice(0, 8)
        .map((o) => ({ texto: o, evidencia: [], entidades: [] })),
    });
  }

  return {
    informe: InformeSchema.parse({ titulo, secciones }),
    entidades: [...entidades],
  };
}
