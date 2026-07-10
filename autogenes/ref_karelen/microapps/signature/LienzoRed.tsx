"use client";

import { LienzoGrafo, type Punto } from "@/microapps/signature/LienzoGrafo";
import { gradoPonderado, type RedSig } from "@/capacidades/signature";

const MUNDO = 1000;
// Golden angle: consecutive spiral steps never align, so a phyllotaxis
// packing stays collision-free no matter the member count.
const ANGULO_AUREO = 2.399963229728653;
const PASO_ESPIRAL = 30;

/**
 * Deterministic community layout: hubs at each community center, members
 * packed on a phyllotaxis spiral (radius grows √i, so density stays
 * constant instead of stacking on rings). Community centers sit on a ring
 * whose radius grows with the widest cluster, so clusters never overlap —
 * the projector fits the world to the viewport, so scale is free.
 */
function disponerComunidad(red: RedSig, comunidad: Map<string, number>): Map<string, Punto> {
  const c = MUNDO / 2;
  const grado = gradoPonderado(red);
  const gMax = Math.max(1, ...grado.values());
  const grupos = new Map<number, string[]>();
  for (const n of red.nodos) {
    const g = comunidad.get(n.id) ?? 0;
    let lista = grupos.get(g);
    if (!lista) {
      lista = [];
      grupos.set(g, lista);
    }
    lista.push(n.id);
  }
  const comunidades = [...grupos.keys()].sort((a, b) => a - b);
  const k = comunidades.length;
  const masGrande = Math.max(1, ...[...grupos.values()].map((m) => m.length));
  const rClusterMax = PASO_ESPIRAL * Math.sqrt(masGrande);
  // Ring radius: enough that adjacent cluster disks (plus margin) clear.
  const rComunidad =
    k > 1
      ? Math.max(MUNDO * 0.3, (2 * rClusterMax + 60) / (2 * Math.sin(Math.PI / k)))
      : 0;
  const pos = new Map<string, Punto>();
  comunidades.forEach((g, ci) => {
    const ang = k > 1 ? (ci / k) * Math.PI * 2 - Math.PI / 2 : 0;
    const gx = c + Math.cos(ang) * rComunidad;
    const gy = c + Math.sin(ang) * rComunidad;
    const miembros = (grupos.get(g) ?? []).sort(
      (a, b) => (grado.get(b) ?? 0) - (grado.get(a) ?? 0),
    );
    miembros.forEach((id, mi) => {
      const r = 3.5 + Math.sqrt((grado.get(id) ?? 0) / gMax) * 8;
      if (mi === 0) {
        pos.set(id, { x: gx, y: gy, r });
        return;
      }
      const a = mi * ANGULO_AUREO + ci * 0.7;
      const rr = PASO_ESPIRAL * Math.sqrt(mi);
      pos.set(id, { x: gx + Math.cos(a) * rr, y: gy + Math.sin(a) * rr, r });
    });
  });
  return pos;
}

export function LienzoRed({
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
      posicionar={disponerComunidad}
      aria={`Red de conceptos: ${red.nodos.length} nodos en ${new Set(comunidad.values()).size} comunidades. Arrastra o pellizca para navegar.`}
    />
  );
}
