import { z } from "zod";
import type {
  Artefacto,
  Entidad,
  Fragmento,
  Relacion,
} from "@/types/autogenes";

/**
 * VÍNCULOS graph walks — pure, deterministic algorithms over the
 * relation layer. Edges are walked in both directions (a connection is
 * a connection), but every step reports the edge's REAL direction and
 * type, with its citations resolved. No path, no claim.
 */

export interface PasoCamino {
  /** The entity this step arrives at. */
  hastaId: string;
  tipo: string;
  /** True if the stored edge points in the walking direction. */
  saliente: boolean;
  citas: string[];
}

export interface Camino {
  /** Entity ids from origin to destination, inclusive. */
  entidades: string[];
  /** One step per hop: pasos[i] connects entidades[i] → entidades[i+1]. */
  pasos: PasoCamino[];
}

function resolverCitas(
  evidencia: string[],
  fragmentos: Fragmento[],
  artefactos: Artefacto[],
): string[] {
  const fragmentoPorId = new Map(fragmentos.map((f) => [f.id, f] as const));
  const artefactoPorId = new Map(artefactos.map((a) => [a.id, a] as const));
  return [
    ...new Set(
      evidencia.flatMap((id) => {
        const f = fragmentoPorId.get(id);
        if (!f) return [];
        const fuente = artefactoPorId.get(f.artefactoId)?.nombre ?? "fuente";
        return [`${fuente}${f.pagina ? ` · pág ${f.pagina}` : ""}`];
      }),
    ),
  ];
}

function adyacencia(relaciones: Relacion[]): Map<string, Relacion[]> {
  const ady = new Map<string, Relacion[]>();
  const anotar = (id: string, r: Relacion) => {
    const lista = ady.get(id);
    if (lista) lista.push(r);
    else ady.set(id, [r]);
  };
  for (const r of relaciones) {
    anotar(r.desdeId, r);
    anotar(r.hastaId, r);
  }
  return ady;
}

/** BFS shortest path (fewest hops); ties resolved by relation order —
 *  deterministic. Returns null when no path connects the two. */
export function caminoMasCorto(
  desdeId: string,
  hastaId: string,
  relaciones: Relacion[],
  fragmentos: Fragmento[],
  artefactos: Artefacto[],
): Camino | null {
  if (desdeId === hastaId) return { entidades: [desdeId], pasos: [] };
  const ady = adyacencia(relaciones);
  const previo = new Map<string, { id: string; r: Relacion }>();
  const visitados = new Set([desdeId]);
  let frontera = [desdeId];

  while (frontera.length > 0 && !previo.has(hastaId)) {
    const siguiente: string[] = [];
    for (const actual of frontera) {
      for (const r of ady.get(actual) ?? []) {
        const otro = r.desdeId === actual ? r.hastaId : r.desdeId;
        if (visitados.has(otro)) continue;
        visitados.add(otro);
        previo.set(otro, { id: actual, r });
        siguiente.push(otro);
      }
    }
    frontera = siguiente;
  }
  if (!previo.has(hastaId)) return null;

  const entidades = [hastaId];
  const pasos: PasoCamino[] = [];
  let cursor = hastaId;
  while (cursor !== desdeId) {
    const { id, r } = previo.get(cursor)!;
    pasos.unshift({
      hastaId: cursor,
      tipo: r.tipo,
      saliente: r.desdeId === id,
      citas: resolverCitas(r.evidencia, fragmentos, artefactos),
    });
    entidades.unshift(id);
    cursor = id;
  }
  return { entidades, pasos };
}

/** Entities within `profundidad` hops, mapped to their distance. */
export function vecindario(
  entidadId: string,
  relaciones: Relacion[],
  profundidad = 2,
): Map<string, number> {
  const ady = adyacencia(relaciones);
  const distancia = new Map<string, number>([[entidadId, 0]]);
  let frontera = [entidadId];
  for (let d = 1; d <= profundidad && frontera.length > 0; d++) {
    const siguiente: string[] = [];
    for (const actual of frontera) {
      for (const r of ady.get(actual) ?? []) {
        const otro = r.desdeId === actual ? r.hastaId : r.desdeId;
        if (distancia.has(otro)) continue;
        distancia.set(otro, d);
        siguiente.push(otro);
      }
    }
    frontera = siguiente;
  }
  distancia.delete(entidadId);
  return distancia;
}

/** A saved path product (E3): a SNAPSHOT with names and citations
 *  resolved at save time — it survives later graph edits verbatim. */
export const CaminoGuardadoSchema = z.object({
  nombres: z.array(z.string().min(1)).min(2),
  pasos: z.array(
    z.object({
      tipo: z.string().min(1),
      saliente: z.boolean(),
      citas: z.array(z.string()).default([]),
    }),
  ),
});
export type CaminoGuardado = z.infer<typeof CaminoGuardadoSchema>;

export interface NodoConectado {
  entidad: Entidad;
  grado: number;
}

/** Degree ranking — the graph's hubs. Ties keep entity order. */
export function masConectadas(
  entidades: Entidad[],
  relaciones: Relacion[],
  n = 5,
): NodoConectado[] {
  const grado = new Map<string, number>();
  for (const r of relaciones) {
    grado.set(r.desdeId, (grado.get(r.desdeId) ?? 0) + 1);
    grado.set(r.hastaId, (grado.get(r.hastaId) ?? 0) + 1);
  }
  return entidades
    .map((entidad) => ({ entidad, grado: grado.get(entidad.id) ?? 0 }))
    .filter((x) => x.grado > 0)
    .sort((a, b) => b.grado - a.grado)
    .slice(0, n);
}
