import { formatearFechaEs } from "@/lib/fechas";
import { clavePar } from "@/lib/resolucion";
import { normalizar } from "@/lib/similitud";
import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
  Relacion,
} from "@/types/autogenes";

/**
 * C1 — graph inference. Deterministic, explainable signals that propose
 * connections the extraction pass didn't assert: two entities co-cited
 * in the same fragment, or sharing a dated event. Nothing is written
 * here — the operator adjudicates in /grafo (HITL), and every proposal
 * carries the evidence it would dock with. No signal, no proposal.
 */

export interface ConexionSugerida {
  aId: string;
  bId: string;
  aNombre: string;
  bNombre: string;
  /** Why, in operator words — one line per signal. */
  motivos: string[];
  /** Resolved citations for display. */
  citas: string[];
  /** Fragment ids the relation would dock with on acceptance. */
  evidencia: string[];
  peso: number;
}

/** Discard key — prefixed so it never collides with resolution pairs. */
export function claveConexion(aId: string, bId: string): string {
  return `inf:${clavePar(aId, bId)}`;
}

const MAX_PROPUESTAS = 12;

interface Acumulado {
  a: Entidad;
  b: Entidad;
  motivos: string[];
  citas: Set<string>;
  evidencia: Set<string>;
  senales: number;
  fragmentosCompartidos: number;
}

export function proponerConexiones(
  g: {
    artefactos: Artefacto[];
    fragmentos: Fragmento[];
    entidades: Entidad[];
    relaciones: Relacion[];
    eventos: Evento[];
  },
  descartadas: Set<string>,
): ConexionSugerida[] {
  const conectadas = new Set(
    g.relaciones.map((r) => clavePar(r.desdeId, r.hastaId)),
  );
  const elegible = (a: Entidad, b: Entidad) =>
    a.id !== b.id &&
    !conectadas.has(clavePar(a.id, b.id)) &&
    !descartadas.has(claveConexion(a.id, b.id));

  const artefactoPorId = new Map(g.artefactos.map((x) => [x.id, x] as const));
  const citaDe = (f: Fragmento) => {
    const fuente = artefactoPorId.get(f.artefactoId)?.nombre ?? "fuente";
    return `${fuente}${f.pagina ? ` · pág ${f.pagina}` : ""}`;
  };

  const pares = new Map<string, Acumulado>();
  const acumular = (a: Entidad, b: Entidad): Acumulado => {
    const clave = clavePar(a.id, b.id);
    let acc = pares.get(clave);
    if (!acc) {
      acc = {
        a,
        b,
        motivos: [],
        citas: new Set(),
        evidencia: new Set(),
        senales: 0,
        fragmentosCompartidos: 0,
      };
      pares.set(clave, acc);
    }
    return acc;
  };

  // Signal 1 — co-citation: both entities drawn from the same fragment.
  const porFragmento = new Map<string, Entidad[]>();
  for (const e of g.entidades) {
    for (const fid of e.evidencia) {
      const lista = porFragmento.get(fid);
      if (lista) lista.push(e);
      else porFragmento.set(fid, [e]);
    }
  }
  for (const f of g.fragmentos) {
    const citadas = porFragmento.get(f.id);
    if (!citadas || citadas.length < 2) continue;
    for (let i = 0; i < citadas.length; i++) {
      for (let j = i + 1; j < citadas.length; j++) {
        if (!elegible(citadas[i], citadas[j])) continue;
        const acc = acumular(citadas[i], citadas[j]);
        if (acc.fragmentosCompartidos === 0) acc.senales++;
        acc.fragmentosCompartidos++;
        acc.evidencia.add(f.id);
        acc.citas.add(citaDe(f));
      }
    }
  }
  for (const acc of pares.values()) {
    if (acc.fragmentosCompartidos > 0) {
      acc.motivos.push(
        acc.fragmentosCompartidos === 1
          ? "co-citadas en el mismo fragmento"
          : `co-citadas en ${acc.fragmentosCompartidos} fragmentos`,
      );
    }
  }

  // Signal 2 — shared dated event (matched by name or alias).
  const nombresDe = (e: Entidad) =>
    [e.nombre, ...(e.alias ?? [])].map(normalizar);
  for (const ev of g.eventos) {
    if (ev.entidades.length < 2) continue;
    const menciones = new Set(ev.entidades.map(normalizar));
    const presentes = g.entidades.filter((e) =>
      nombresDe(e).some((n) => menciones.has(n)),
    );
    for (let i = 0; i < presentes.length; i++) {
      for (let j = i + 1; j < presentes.length; j++) {
        if (!elegible(presentes[i], presentes[j])) continue;
        const acc = acumular(presentes[i], presentes[j]);
        acc.senales++;
        acc.motivos.push(
          `comparten el evento “${ev.titulo}” (${formatearFechaEs(ev.fecha, ev.precision)})`,
        );
        for (const fid of ev.evidencia) {
          // Only dock fragments that still exist — an accepted connection
          // must never cite a fragment the operator has since deleted
          // (provenance law). Add to evidencia and citas together.
          const f = g.fragmentos.find((x) => x.id === fid);
          if (!f) continue;
          acc.evidencia.add(fid);
          acc.citas.add(citaDe(f));
        }
      }
    }
  }

  return [...pares.values()]
    .filter((acc) => acc.motivos.length > 0)
    .map((acc) => ({
      aId: acc.a.id,
      bId: acc.b.id,
      aNombre: acc.a.nombre,
      bNombre: acc.b.nombre,
      motivos: acc.motivos,
      citas: [...acc.citas],
      evidencia: [...acc.evidencia],
      // Base 0.35; extra shared fragments and extra signals corroborate.
      peso: Math.min(
        0.85,
        0.35 +
          0.15 * Math.max(0, acc.fragmentosCompartidos - 1) +
          0.15 * (acc.senales - 1) +
          (acc.fragmentosCompartidos > 0 ? 0.05 : 0),
      ),
    }))
    .sort((a, b) => b.peso - a.peso)
    .slice(0, MAX_PROPUESTAS);
}
