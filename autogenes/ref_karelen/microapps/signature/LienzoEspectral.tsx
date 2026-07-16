"use client";

import { LienzoGrafo, type Punto } from "@/microapps/signature/LienzoGrafo";
import {
  embeddingEspectral,
  gradoPonderado,
  type RedSig,
} from "@/capacidades/signature";

/**
 * Spectral embedding view — nodes laid out by the graph Laplacian's Fiedler
 * pair, so topological neighbours sit close and separations open along the
 * axes. The manifold of the concept network, read as geometry.
 */
function disponerEspectral(red: RedSig): Map<string, Punto> {
  const emb = embeddingEspectral(red);
  const grado = gradoPonderado(red);
  const gMax = Math.max(1, ...grado.values());
  const pos = new Map<string, Punto>();
  for (const [id, q] of emb) {
    pos.set(id, {
      x: q.x,
      y: q.y,
      r: 3.5 + Math.sqrt((grado.get(id) ?? 0) / gMax) * 8,
    });
  }
  return pos;
}

export function LienzoEspectral({
  red,
  comunidad,
  seleccionado,
  onSelect,
}: {
  red: RedSig;
  comunidad: Map<string, number>;
  seleccionado: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <LienzoGrafo
      red={red}
      comunidad={comunidad}
      seleccionado={seleccionado}
      onSelect={onSelect}
      posicionar={disponerEspectral}
      aria={`Embedding espectral: ${red.nodos.length} conceptos por su geometría de Laplaciano. Arrastra o pellizca para navegar.`}
    />
  );
}
