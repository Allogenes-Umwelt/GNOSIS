import { getCampoInfo } from "@/lib/campos";
import { construirGrafo, seedDe, type EnlaceGrafo, type NodoGrafo } from "@/lib/grafo";
import type {
  Artefacto,
  Entidad,
  Fragmento,
  Producto,
  Relacion,
} from "@/types/autogenes";
import type { Datum } from "@/types/datum";

/**
 * Unified ontology projections — pure, testable. AUTOGENES's graph is
 * the system's single knowledge layer; these functions project the
 * other sources into it at read time (no dual writes, no sync):
 * - proyectarMemoria: the graph seen as SYNESIS memory objects (the
 *   shape C2, the Panel and the kernel tools always consumed).
 * - construirOntologia: the operator's whole Umwelt as one map —
 *   nucleus, campos, datos, sources and the live entity layer.
 */

export interface ObjetoProyectado {
  id: string;
  nombre: string;
  tipo: string;
  resumen: string;
  relaciones: { con: string; tipo: string }[];
  origen: "operador" | "synesis";
  createdAt: number;
}

/** Graph → memory-object shape. Outgoing relations resolve to names. */
export function proyectarMemoria(
  entidades: Entidad[],
  relaciones: Relacion[],
): ObjetoProyectado[] {
  const nombreDe = new Map(entidades.map((e) => [e.id, e.nombre] as const));
  return entidades.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    tipo: e.tipo,
    resumen: e.resumen ?? "",
    relaciones: relaciones
      .filter((r) => r.desdeId === e.id && nombreDe.has(r.hastaId))
      .map((r) => ({ con: nombreDe.get(r.hastaId)!, tipo: r.tipo })),
    origen: e.origen,
    createdAt: e.createdAt,
  }));
}

export const NUCLEO_ID = "nucleo-operador";

/**
 * The Umwelt map: one graph for everything the operator owns. The
 * nucleus (Operador) anchors at the origin; campos with substance hang
 * from it; datos dock to their campo; artefactos tether to the nucleus;
 * the extracted entity layer rides on top via construirGrafo.
 */
export function construirOntologia(
  datos: Datum[],
  artefactos: Artefacto[],
  fragmentos: Fragmento[],
  entidades: Entidad[],
  relaciones: Relacion[],
  productos: Producto[] = [],
): { nodos: NodoGrafo[]; enlaces: EnlaceGrafo[] } {
  const base = construirGrafo(artefactos, fragmentos, entidades, relaciones);
  const nodos = [...base.nodos];
  const enlaces = [...base.enlaces];

  const vacio =
    datos.length === 0 &&
    artefactos.length === 0 &&
    entidades.length === 0 &&
    productos.length === 0;
  if (vacio) return { nodos: [], enlaces: [] };

  nodos.push({
    id: NUCLEO_ID,
    kind: "nucleo",
    etiqueta: "Operador",
    grado: 0,
    seed: 0,
    // The operator anchors the map; everything else orbits.
    fx: 0,
    fy: 0,
  });

  const camposActivos = new Set<string>([
    ...datos.map((d) => d.campo),
    ...entidades.flatMap((e) => (e.campo ? [e.campo] : [])),
  ]);
  for (const campo of [...camposActivos].sort()) {
    const id = `campo-${campo}`;
    nodos.push({
      id,
      kind: "campo",
      etiqueta: getCampoInfo(campo)?.nombre ?? campo,
      grado: 0,
      seed: seedDe(id),
    });
    enlaces.push({
      id: `ont-nucleo-${campo}`,
      source: NUCLEO_ID,
      target: id,
      kind: "cita",
      peso: 0.9,
    });
  }

  for (const d of datos) {
    nodos.push({
      id: `dato-${d.id}`,
      kind: "dato",
      etiqueta: d.etiqueta,
      grado: 0,
      seed: seedDe(d.id),
    });
    enlaces.push({
      id: `ont-dato-${d.id}`,
      source: `campo-${d.campo}`,
      target: `dato-${d.id}`,
      kind: "cita",
      peso: 0.5,
    });
  }

  // Entities tagged with a campo dock to it; sources tether to the core.
  for (const e of entidades) {
    if (e.campo && camposActivos.has(e.campo)) {
      enlaces.push({
        id: `ont-ent-${e.id}`,
        source: `campo-${e.campo}`,
        target: e.id,
        kind: "cita",
        peso: 0.4,
      });
    }
  }
  for (const a of artefactos) {
    enlaces.push({
      id: `ont-art-${a.id}`,
      source: NUCLEO_ID,
      target: a.id,
      kind: "cita",
      peso: 0.3,
    });
  }

  // Fragments — the units of provenance — paint under their source, so
  // an uploaded document visibly grows the graph with its content.
  // Capped per artefacto so a long PDF never floods the map.
  const MAX_FRAG = 8;
  const porArtefacto = new Map<string, Fragmento[]>();
  for (const f of fragmentos) {
    const lista = porArtefacto.get(f.artefactoId) ?? [];
    lista.push(f);
    porArtefacto.set(f.artefactoId, lista);
  }
  for (const a of artefactos) {
    const frags = (porArtefacto.get(a.id) ?? []).slice(0, MAX_FRAG);
    frags.forEach((f, i) => {
      const fid = `frag-${f.id}`;
      nodos.push({
        id: fid,
        kind: "fragmento",
        etiqueta: f.pagina ? `pág ${f.pagina}` : `frag ${i + 1}`,
        grado: 0,
        seed: seedDe(f.id),
      });
      enlaces.push({
        id: `ont-${fid}`,
        source: a.id,
        target: fid,
        kind: "cita",
        peso: 0.35,
      });
    });
  }

  // Products (E3): docked deliverables ride the map near the core —
  // what is docked is document. Each cites the entities it anchors to;
  // without anchors it tethers to the operator so it is never orphaned.
  const idsEntidad = new Set(entidades.map((e) => e.id));
  for (const p of productos) {
    const pid = `producto-${p.id}`;
    nodos.push({
      id: pid,
      kind: "producto",
      etiqueta: p.titulo,
      tipo: `${p.clase} · ${p.unidad}`,
      grado: 0,
      seed: seedDe(p.id),
    });
    const anclas = p.entidades.filter((id) => idsEntidad.has(id));
    if (anclas.length === 0) {
      enlaces.push({
        id: `ont-${pid}`,
        source: NUCLEO_ID,
        target: pid,
        kind: "cita",
        peso: 0.5,
      });
    }
    for (const eid of anclas.slice(0, 6)) {
      enlaces.push({
        id: `ont-${pid}-${eid}`,
        source: pid,
        target: eid,
        kind: "cita",
        peso: 0.5,
      });
    }
  }

  // Recompute degrees over the full map (drives node mass/size).
  const grados = new Map<string, number>();
  for (const l of enlaces) {
    grados.set(l.source, (grados.get(l.source) ?? 0) + 1);
    grados.set(l.target, (grados.get(l.target) ?? 0) + 1);
  }
  for (const n of nodos) n.grado = grados.get(n.id) ?? 0;

  return { nodos, enlaces };
}

/* ── O1: the Umwelt map as a TREE (circular dendrogram) ───────────── */

export interface RamaOntologia {
  id: string;
  etiqueta: string;
  kind: "nucleo" | "campo" | "dato" | "artefacto" | "fragmento" | "entidad" | "agregado";
  hijos: RamaOntologia[];
}

const MAX_HOJAS = 10;

/** Cap a leaf list honestly: keep the first N, aggregate the rest into
 *  one counted node — the count IS the data, nothing hides silently. */
function acotarHojas(
  hojas: RamaOntologia[],
  padreId: string,
  nombre: string,
): RamaOntologia[] {
  if (hojas.length <= MAX_HOJAS) return hojas;
  const resto = hojas.length - MAX_HOJAS;
  return [
    ...hojas.slice(0, MAX_HOJAS),
    {
      id: `agg-${padreId}`,
      etiqueta: `+${resto} ${nombre}`,
      kind: "agregado",
      hijos: [],
    },
  ];
}

/**
 * The ontology as a hierarchy, single-parent and deterministic:
 * Operador → campos (datos + entidades del campo) and fuentes
 * (fragmentos + entidades sin campo extraídas de esa fuente). Same node
 * ids as construirOntologia, so the existing inspector resolves them.
 */
export function arbolOntologia(
  datos: Datum[],
  artefactos: Artefacto[],
  fragmentos: Fragmento[],
  entidades: Entidad[],
): RamaOntologia | null {
  if (datos.length === 0 && artefactos.length === 0 && entidades.length === 0) {
    return null;
  }
  const artefactoDe = new Map(fragmentos.map((f) => [f.id, f.artefactoId]));
  const camposActivos = [
    ...new Set<string>([
      ...datos.map((d) => d.campo),
      ...entidades.flatMap((e) => (e.campo ? [e.campo] : [])),
    ]),
  ].sort();

  const ramaCampo = (campo: string): RamaOntologia => {
    const hojasDatos: RamaOntologia[] = datos
      .filter((d) => d.campo === campo)
      .map((d) => ({
        id: `dato-${d.id}`,
        etiqueta: d.etiqueta,
        kind: "dato" as const,
        hijos: [],
      }));
    const hojasEnt: RamaOntologia[] = entidades
      .filter((e) => e.campo === campo)
      .map((e) => ({
        id: e.id,
        etiqueta: e.nombre,
        kind: "entidad" as const,
        hijos: [],
      }));
    return {
      id: `campo-${campo}`,
      etiqueta: getCampoInfo(campo)?.nombre ?? campo,
      kind: "campo",
      hijos: [
        ...acotarHojas(hojasDatos, `campo-${campo}-datos`, "datos"),
        ...acotarHojas(hojasEnt, `campo-${campo}-ent`, "entidades"),
      ],
    };
  };

  const ramaArtefacto = (a: Artefacto): RamaOntologia => {
    const frags = fragmentos.filter((f) => f.artefactoId === a.id);
    const hojasFrag: RamaOntologia[] = frags.slice(0, 8).map((f, i) => ({
      id: `frag-${f.id}`,
      etiqueta: f.pagina ? `pág ${f.pagina}` : `frag ${i + 1}`,
      kind: "fragmento" as const,
      hijos: [],
    }));
    if (frags.length > 8) {
      hojasFrag.push({
        id: `agg-${a.id}-frags`,
        etiqueta: `+${frags.length - 8} fragmentos`,
        kind: "agregado",
        hijos: [],
      });
    }
    // Entities without campo hang under the source that evidences them.
    const hojasEnt: RamaOntologia[] = entidades
      .filter(
        (e) =>
          !e.campo &&
          e.evidencia.some((fid) => artefactoDe.get(fid) === a.id),
      )
      .map((e) => ({
        id: e.id,
        etiqueta: e.nombre,
        kind: "entidad" as const,
        hijos: [],
      }));
    return {
      id: a.id,
      etiqueta: a.nombre,
      kind: "artefacto",
      hijos: [...hojasFrag, ...acotarHojas(hojasEnt, `${a.id}-ent`, "entidades")],
    };
  };

  // Entities with no campo and no evidenced source still belong on the map.
  const sueltas: RamaOntologia[] = entidades
    .filter(
      (e) =>
        !e.campo &&
        !e.evidencia.some((fid) => artefactoDe.has(fid)),
    )
    .map((e) => ({
      id: e.id,
      etiqueta: e.nombre,
      kind: "entidad" as const,
      hijos: [],
    }));

  return {
    id: NUCLEO_ID,
    etiqueta: "Operador",
    kind: "nucleo",
    hijos: [
      ...camposActivos.map(ramaCampo),
      ...artefactos.map(ramaArtefacto),
      ...acotarHojas(sueltas, "sueltas", "entidades"),
    ],
  };
}
