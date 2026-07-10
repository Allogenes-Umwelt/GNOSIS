import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import type {
  Artefacto,
  Caso,
  ClaseProducto,
  TipoOperador,
  TipoRelacion,
  PropiedadDef,
  FiltroVista,
  VistaGuardada,
  Entidad,
  Evento,
  Fragmento,
  GeoPunto,
  Grafo,
  KindArtefacto,
  PrecisionFecha,
  Producto,
  Relacion,
  TipoEntidad,
} from "@/types/autogenes";
import type { Campo } from "@/types/microapp";

/**
 * AUTOGENES graph store — artefactos + fragmentos + entidades +
 * relaciones, persisted on device. Provenance is enforced by the actions:
 * fragmentos belong to an artefacto; removing an artefacto cascades its
 * fragmentos and prunes them from every entity/relation's evidence.
 *
 * D1 — bitácora: every mutation appends an audit entry (persisted,
 * capped, never rewritten — not even by undo). Before each BURST of
 * mutations a structural snapshot is pushed (cheap: immutable array
 * refs; bursts within 1s coalesce so one extraction = one undo step).
 * Undo restores the graph slices only; it lives in memory — a reload
 * keeps the audit but drops the undo stack.
 */

export interface EntradaBitacora {
  id: string;
  ts: number;
  accion: string;
  detalle: string;
}

interface SnapshotGrafo {
  artefactos: Artefacto[];
  fragmentos: Fragmento[];
  entidades: Entidad[];
  relaciones: Relacion[];
  eventos: Evento[];
  productos: Producto[];
  casos: Caso[];
  tiposOperador: TipoOperador[];
  tiposRelacion: TipoRelacion[];
  vistas: VistaGuardada[];
  paresDescartados: string[];
}

const MAX_BITACORA = 500;
const MAX_PILA = 20;
const VENTANA_COALESCENCIA_MS = 1000;

// Session-scoped undo stack — deliberately OUTSIDE persisted state.
let pila: SnapshotGrafo[] = [];
let ultimaCaptura = 0;

interface AutogenesState {
  artefactos: Artefacto[];
  fragmentos: Fragmento[];
  entidades: Entidad[];
  relaciones: Relacion[];
  eventos: Evento[];
  productos: Producto[];

  addArtefacto: (meta: {
    kind: KindArtefacto;
    nombre: string;
    paginas?: number;
    blobKey?: string;
  }) => Artefacto;
  addFragmentos: (
    artefactoId: string,
    items: { texto: string; pagina?: number }[],
  ) => Fragmento[];
  /** Fill a fragment's text (on-device OCR of a scanned page — Q1). */
  setTextoFragmento: (id: string, texto: string) => void;
  upsertEntidad: (e: {
    nombre: string;
    tipo: TipoEntidad;
    resumen?: string;
    campo?: Campo;
    origen: "operador" | "synesis";
    evidencia?: string[];
  }) => Entidad;
  addRelacion: (r: {
    desdeId: string;
    hastaId: string;
    tipo: string;
    peso?: number;
    evidencia?: string[];
  }) => Relacion;
  /** Operator curation (Q3): edit an entity's own fields in place. */
  updateEntidad: (
    id: string,
    cambios: Partial<Pick<Entidad, "nombre" | "tipo" | "resumen" | "campo" | "alias">>,
  ) => void;
  removeRelacion: (id: string) => void;
  addEventos: (
    items: {
      titulo: string;
      fecha: string;
      precision: PrecisionFecha;
      entidades?: string[];
      evidencia: string[];
      origen: "operador" | "synesis";
    }[],
  ) => Evento[];
  removeEvento: (id: string) => void;
  /** Dock a unit's deliverable back into the ontology (E3). */
  dockearProducto: (p: {
    clase: ClaseProducto;
    titulo: string;
    unidad: string;
    cuerpo: unknown;
    entidades?: string[];
    evidencia?: string[];
  }) => Producto;
  removeProducto: (id: string) => void;
  /** Fix (or clear) an entity's coordinates — HITL-confirmed upstream. */
  setGeoEntidad: (id: string, geo: GeoPunto | undefined) => void;
  /** Apply an operator-approved enrichment: summary and/or extra alias. */
  enriquecerEntidad: (
    id: string,
    ficha: { resumen?: string; alias?: string[] },
  ) => void;
  removeArtefacto: (id: string) => void;
  removeEntidad: (id: string) => void;
  /** Import-merge a bundled graph: unknown ids dock, existing ids stay. */
  mergeGrafo: (g: Grafo) => number;
  /**
   * Resolve two entities into one: evidence and aliases union, relations
   * repoint, the absorbed name survives as alias. Returns the survivor.
   */
  fusionarEntidades: (ganadorId: string, perdedorId: string) => Entidad | null;
  /** Pairs the operator ruled out — resolution never proposes them again. */
  paresDescartados: string[];
  descartarPar: (clave: string) => void;
  /** Operator ontology (D2): typed templates over the base enum. */
  tiposOperador: TipoOperador[];
  crearTipoOperador: (t: {
    nombre: string;
    base: TipoEntidad;
    propiedades: PropiedadDef[];
  }) => TipoOperador;
  removeTipoOperador: (id: string) => void;
  /** Operator relation catalog (D2b): typed edges with declared ends. */
  tiposRelacion: TipoRelacion[];
  crearTipoRelacion: (t: {
    nombre: string;
    desde: TipoEntidad;
    hasta: TipoEntidad;
  }) => TipoRelacion;
  removeTipoRelacion: (id: string) => void;
  /** Set (or clear) an entity's operator type + VALIDATED properties. */
  setSubtipoEntidad: (
    entidadId: string,
    subtipo: string | undefined,
    propiedades: Record<string, string>,
  ) => void;
  /** Saved views (D5): named questions over the entity layer. */
  vistas: VistaGuardada[];
  guardarVista: (nombre: string, filtro: FiltroVista) => VistaGuardada;
  removeVista: (id: string) => void;
  /** Investigation files (D3): anchors + notes; content derives live. */
  casos: Caso[];
  crearCaso: (nombre: string, objetivo?: string) => Caso;
  setEstadoCaso: (id: string, estado: Caso["estado"]) => void;
  removeCaso: (id: string) => void;
  /** Attach/detach graph members by id — idempotent. */
  anexarAlCaso: (
    id: string,
    miembros: Partial<Pick<Caso, "entidades" | "artefactos" | "productos">>,
  ) => void;
  desanexarDelCaso: (
    id: string,
    miembros: Partial<Pick<Caso, "entidades" | "artefactos" | "productos">>,
  ) => void;
  agregarNota: (casoId: string, texto: string) => void;
  quitarNota: (casoId: string, notaId: string) => void;
  /** Append-only audit trail (D1). Newest first. */
  bitacora: EntradaBitacora[];
  /** Undo steps available this session. */
  deshacerDisponibles: number;
  /** Restore the graph to before the last mutation burst. */
  deshacer: () => boolean;
  clear: () => void;
}

export const useAutogenesStore = create<AutogenesState>()(
  persist(
    (set, get) => {
      /** Push an undo snapshot unless we're inside the same burst. */
      const capturar = () => {
        const ahora = Date.now();
        if (ahora - ultimaCaptura > VENTANA_COALESCENCIA_MS) {
          const s = get();
          pila.push({
            artefactos: s.artefactos,
            fragmentos: s.fragmentos,
            entidades: s.entidades,
            relaciones: s.relaciones,
            eventos: s.eventos,
            productos: s.productos,
            casos: s.casos,
            tiposOperador: s.tiposOperador,
            tiposRelacion: s.tiposRelacion,
            vistas: s.vistas,
            paresDescartados: s.paresDescartados,
          });
          if (pila.length > MAX_PILA) pila.shift();
          // Throttle from the last SNAPSHOT, not the last action — else a
          // stream of sub-window mutations resets the window forever and
          // collapses the whole session into one undo step.
          ultimaCaptura = ahora;
        }
      };
      /** Append to the audit trail. Never rewritten, never rolled back. */
      const registrar = (accion: string, detalle: string) =>
        set((s) => ({
          bitacora: [
            { id: crypto.randomUUID(), ts: Date.now(), accion, detalle },
            ...s.bitacora,
          ].slice(0, MAX_BITACORA),
          deshacerDisponibles: pila.length,
        }));

      return {
      artefactos: [],
      fragmentos: [],
      entidades: [],
      relaciones: [],
      eventos: [],
      productos: [],
      casos: [],
      tiposOperador: [],
      tiposRelacion: [],
      vistas: [],
      paresDescartados: [],
      bitacora: [],
      deshacerDisponibles: 0,

      addArtefacto: (meta) => {
        capturar();
        const artefacto: Artefacto = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          ...meta,
        };
        set((s) => ({ artefactos: [artefacto, ...s.artefactos] }));
        registrar("dockear-fuente", `Fuente dockeada: ${artefacto.nombre}`);
        return artefacto;
      },

      addFragmentos: (artefactoId, items) => {
        capturar();
        const nuevos: Fragmento[] = items.map((it) => ({
          id: crypto.randomUUID(),
          artefactoId,
          pagina: it.pagina,
          texto: it.texto,
          createdAt: Date.now(),
        }));
        set((s) => ({ fragmentos: [...s.fragmentos, ...nuevos] }));
        registrar(
          "fragmentar",
          `${nuevos.length} ${nuevos.length === 1 ? "fragmento citable" : "fragmentos citables"}`,
        );
        return nuevos;
      },

      setTextoFragmento: (id, texto) => {
        capturar();
        const f = get().fragmentos.find((x) => x.id === id);
        set((s) => ({
          fragmentos: s.fragmentos.map((x) =>
            x.id === id ? { ...x, texto } : x,
          ),
        }));
        registrar(
          "ocr",
          `Página ${f?.pagina ?? "?"} vuelta citable por OCR local`,
        );
      },

      upsertEntidad: (e) => {
        capturar();
        const clave = e.nombre.trim().toLowerCase();
        // A fused-away name keeps resolving to its survivor via alias.
        const existente = get().entidades.find(
          (x) =>
            x.nombre.trim().toLowerCase() === clave ||
            (x.alias ?? []).some((a) => a.trim().toLowerCase() === clave),
        );
        if (existente) {
          // Additive law (D6): an extracted/plan write ("synesis") may
          // ENRICH an operator-curated entity (union its evidence) but
          // must not OVERWRITE the operator's own tipo/resumen/campo —
          // otherwise a nivel-1 auto-plan silently clobbers curation.
          // Operator edits and synesis-over-synesis refine as before.
          const protegido =
            existente.origen === "operador" && e.origen === "synesis";
          const merged: Entidad = {
            ...existente,
            tipo: protegido ? existente.tipo : e.tipo,
            resumen: protegido
              ? existente.resumen
              : (e.resumen ?? existente.resumen),
            campo: protegido ? existente.campo : (e.campo ?? existente.campo),
            evidencia: Array.from(
              new Set([...existente.evidencia, ...(e.evidencia ?? [])]),
            ),
          };
          set((s) => ({
            entidades: s.entidades.map((x) =>
              x.id === existente.id ? merged : x,
            ),
          }));
          registrar("entidad", `Entidad actualizada: ${merged.nombre}`);
          return merged;
        }
        const entidad: Entidad = {
          id: crypto.randomUUID(),
          nombre: e.nombre.trim(),
          tipo: e.tipo,
          resumen: e.resumen,
          campo: e.campo,
          origen: e.origen,
          evidencia: e.evidencia ?? [],
          createdAt: Date.now(),
        };
        set((s) => ({ entidades: [...s.entidades, entidad] }));
        registrar("entidad", `Entidad ${entidad.nombre} (${entidad.origen})`);
        return entidad;
      },

      addRelacion: (r) => {
        capturar();
        const relacion: Relacion = {
          id: crypto.randomUUID(),
          desdeId: r.desdeId,
          hastaId: r.hastaId,
          tipo: r.tipo,
          peso: r.peso ?? 0.5,
          evidencia: r.evidencia ?? [],
          createdAt: Date.now(),
        };
        set((s) => ({ relaciones: [...s.relaciones, relacion] }));
        registrar("relacion", `Relación: ${relacion.tipo}`);
        return relacion;
      },

      updateEntidad: (id, cambios) => {
        capturar();
        const nombre = get().entidades.find((e) => e.id === id)?.nombre;
        set((s) => ({
          entidades: s.entidades.map((e) =>
            e.id === id ? { ...e, ...cambios } : e,
          ),
        }));
        registrar(
          "editar-entidad",
          `Entidad editada por el operador: ${cambios.nombre ?? nombre ?? "entidad"}`,
        );
      },

      removeRelacion: (id) => {
        capturar();
        const tipo = get().relaciones.find((r) => r.id === id)?.tipo ?? "";
        set((s) => ({
          relaciones: s.relaciones.filter((r) => r.id !== id),
        }));
        registrar("cortar-relacion", `Relación cortada: ${tipo}`);
      },

      addEventos: (items) => {
        capturar();
        const nuevos: Evento[] = items.map((it) => ({
          id: crypto.randomUUID(),
          titulo: it.titulo,
          fecha: it.fecha,
          precision: it.precision,
          entidades: it.entidades ?? [],
          evidencia: it.evidencia,
          origen: it.origen,
          createdAt: Date.now(),
        }));
        set((s) => ({ eventos: [...s.eventos, ...nuevos] }));
        registrar(
          "eventos",
          `${nuevos.length} ${nuevos.length === 1 ? "evento fechado" : "eventos fechados"}`,
        );
        return nuevos;
      },

      removeEvento: (id) => {
        capturar();
        set((s) => ({ eventos: s.eventos.filter((e) => e.id !== id) }));
        registrar("quitar-evento", "Evento eliminado");
      },

      dockearProducto: (p) => {
        capturar();
        const producto: Producto = {
          id: crypto.randomUUID(),
          clase: p.clase,
          titulo: p.titulo,
          unidad: p.unidad,
          cuerpo: p.cuerpo,
          entidades: p.entidades ?? [],
          evidencia: p.evidencia ?? [],
          createdAt: Date.now(),
        };
        set((s) => ({ productos: [producto, ...s.productos] }));
        registrar(
          "producto",
          `Producto ${producto.clase} dockeado: ${producto.titulo}`,
        );
        return producto;
      },

      removeProducto: (id) => {
        capturar();
        set((s) => ({
          productos: s.productos.filter((p) => p.id !== id),
          casos: s.casos.map((c) => ({
            ...c,
            productos: c.productos.filter((x) => x !== id),
          })),
        }));
        registrar("quitar-producto", "Producto eliminado");
      },

      setGeoEntidad: (id, geo) => {
        capturar();
        set((s) => ({
          entidades: s.entidades.map((e) =>
            e.id === id ? { ...e, geo } : e,
          ),
        }));
        registrar(
          "geo",
          geo ? "Coordenadas fijadas" : "Coordenadas retiradas",
        );
      },

      enriquecerEntidad: (id, ficha) => {
        capturar();
        set((s) => ({
          entidades: s.entidades.map((e) => {
            if (e.id !== id) return e;
            const propios = new Set(
              [e.nombre, ...(e.alias ?? [])].map((n) =>
                n.trim().toLowerCase(),
              ),
            );
            const nuevos = (ficha.alias ?? []).filter(
              (a) => a.trim().length > 0 && !propios.has(a.trim().toLowerCase()),
            );
            return {
              ...e,
              resumen: ficha.resumen?.trim() || e.resumen,
              alias:
                nuevos.length > 0
                  ? [...(e.alias ?? []), ...nuevos]
                  : e.alias,
            };
          }),
        }));
        registrar("enriquecer", "Ficha aplicada a entidad");
      },

      removeArtefacto: (id) => {
        capturar();
        const nombre =
          get().artefactos.find((a) => a.id === id)?.nombre ?? "fuente";
        set((s) => {
          const muertos = new Set(
            s.fragmentos.filter((f) => f.artefactoId === id).map((f) => f.id),
          );
          const podar = (ev: string[]) => ev.filter((x) => !muertos.has(x));
          // An extracted entity whose entire evidence dies loses its right
          // to exist — the provenance law: a "synesis" entity must cite
          // fragmentos (mirrors the eventos rule below). Operator entities
          // carry their origen as provenance, so they survive.
          const entidades = s.entidades.map((e) => ({
            ...e,
            evidencia: podar(e.evidencia),
          }));
          const eliminadas = new Set(
            entidades
              .filter((e) => e.origen === "synesis" && e.evidencia.length === 0)
              .map((e) => e.id),
          );
          return {
            artefactos: s.artefactos.filter((a) => a.id !== id),
            fragmentos: s.fragmentos.filter((f) => f.artefactoId !== id),
            entidades: entidades.filter((e) => !eliminadas.has(e.id)),
            // Relations touching an eliminated entity are dangling — drop
            // them. A relation that CITED evidence and lost all of it dies
            // too (provenance law); one that never carried evidence is
            // operator-declared and survives.
            relaciones: s.relaciones
              .map((r) => ({
                rel: { ...r, evidencia: podar(r.evidencia) },
                citaba: r.evidencia.length > 0,
              }))
              .filter(
                ({ rel, citaba }) =>
                  !eliminadas.has(rel.desdeId) &&
                  !eliminadas.has(rel.hastaId) &&
                  (!citaba || rel.evidencia.length > 0),
              )
              .map(({ rel }) => rel),
            // An extracted event whose entire evidence dies loses its
            // right to exist — the provenance law applies to time too.
            eventos: s.eventos
              .map((e) => ({ ...e, evidencia: podar(e.evidencia) }))
              .filter((e) => e.origen !== "synesis" || e.evidencia.length > 0),
            // Products are operator deliverables (snapshots): their
            // evidence prunes and dead entity anchors drop, but the
            // product survives.
            productos: s.productos.map((p) => ({
              ...p,
              evidencia: podar(p.evidencia),
              entidades: p.entidades.filter((x) => !eliminadas.has(x)),
            })),
            // Cases anchor by id — dead artefacto and entity anchors prune.
            casos: s.casos.map((c) => ({
              ...c,
              artefactos: c.artefactos.filter((x) => x !== id),
              entidades: c.entidades.filter((x) => !eliminadas.has(x)),
            })),
          };
        });
        registrar(
          "quitar-fuente",
          `Fuente eliminada con cascada: ${nombre}`,
        );
      },

      removeEntidad: (id) => {
        capturar();
        const entidad = get().entidades.find((e) => e.id === id);
        const nombre = entidad?.nombre ?? "entidad";
        // Events anchor entities by NAME (as extracted) — prune the removed
        // entity's name and aliases so it stops pulling events into casos.
        const nombres = new Set(
          entidad ? [entidad.nombre, ...(entidad.alias ?? [])] : [],
        );
        set((s) => ({
          entidades: s.entidades.filter((e) => e.id !== id),
          relaciones: s.relaciones.filter(
            (r) => r.desdeId !== id && r.hastaId !== id,
          ),
          eventos: s.eventos.map((ev) => ({
            ...ev,
            entidades: ev.entidades.filter((n) => !nombres.has(n)),
          })),
          // Cases and products both anchor entities by id — prune both.
          casos: s.casos.map((c) => ({
            ...c,
            entidades: c.entidades.filter((x) => x !== id),
          })),
          productos: s.productos.map((p) => ({
            ...p,
            entidades: p.entidades.filter((x) => x !== id),
          })),
        }));
        registrar("quitar-entidad", `Entidad eliminada: ${nombre}`);
      },

      mergeGrafo: (g) => {
        capturar();
        let nuevos = 0;
        set((s) => {
          const idsA = new Set(s.artefactos.map((x) => x.id));
          const idsF = new Set(s.fragmentos.map((x) => x.id));
          const idsE = new Set(s.entidades.map((x) => x.id));
          const idsR = new Set(s.relaciones.map((x) => x.id));
          const idsV = new Set(s.eventos.map((x) => x.id));
          const idsP = new Set(s.productos.map((x) => x.id));
          const idsC = new Set(s.casos.map((x) => x.id));
          const idsT = new Set(s.tiposOperador.map((x) => x.id));
          const tiposOperador = (g.tiposOperador ?? []).filter(
            (x) => !idsT.has(x.id),
          );
          const idsTR = new Set(s.tiposRelacion.map((x) => x.id));
          const tiposRelacion = (g.tiposRelacion ?? []).filter(
            (x) => !idsTR.has(x.id),
          );
          const idsVi = new Set(s.vistas.map((x) => x.id));
          const vistas = (g.vistas ?? []).filter((x) => !idsVi.has(x.id));
          const artefactos = g.artefactos.filter((x) => !idsA.has(x.id));
          const fragmentos = g.fragmentos.filter((x) => !idsF.has(x.id));
          // Import is a door into the graph like any other: incoming
          // evidence is sanitized against REAL fragment ids (existing ∪
          // imported), and synesis items that end up citing nothing are
          // dropped — a corrupt bundle cannot fabricate provenance.
          const idsFTodos = new Set([
            ...idsF,
            ...g.fragmentos.map((x) => x.id),
          ]);
          const sanear = (ev: string[]) => ev.filter((x) => idsFTodos.has(x));
          const entidades = g.entidades
            .filter((x) => !idsE.has(x.id))
            .map((x) => ({ ...x, evidencia: sanear(x.evidencia) }))
            .filter((x) => x.origen !== "synesis" || x.evidencia.length > 0);
          const relaciones = g.relaciones
            .filter((x) => !idsR.has(x.id))
            .map((x) => ({ ...x, evidencia: sanear(x.evidencia) }));
          const eventos = (g.eventos ?? [])
            .filter((x) => !idsV.has(x.id))
            .map((x) => ({ ...x, evidencia: sanear(x.evidencia) }))
            .filter((x) => x.origen !== "synesis" || x.evidencia.length > 0);
          const productos = (g.productos ?? [])
            .filter((x) => !idsP.has(x.id))
            .map((x) => ({ ...x, evidencia: sanear(x.evidencia) }));
          const casos = (g.casos ?? []).filter((x) => !idsC.has(x.id));
          // Same-id entities: the other device may carry evidence/aliases
          // this one lacks — union them instead of silently discarding.
          const porId = new Map(g.entidades.map((x) => [x.id, x] as const));
          const existentes = s.entidades.map((mia) => {
            const otra = porId.get(mia.id);
            if (!otra) return mia;
            const evidencia = [
              ...new Set([...mia.evidencia, ...sanear(otra.evidencia)]),
            ];
            const alias = [
              ...new Set([...(mia.alias ?? []), ...(otra.alias ?? [])]),
            ];
            return {
              ...mia,
              evidencia,
              alias: alias.length > 0 ? alias : undefined,
              resumen: mia.resumen ?? otra.resumen,
              campo: mia.campo ?? otra.campo,
              geo: mia.geo ?? otra.geo,
            };
          });
          nuevos =
            artefactos.length +
            fragmentos.length +
            entidades.length +
            relaciones.length +
            eventos.length +
            productos.length +
            casos.length +
            tiposOperador.length +
            tiposRelacion.length +
            vistas.length;
          return {
            artefactos: [...artefactos, ...s.artefactos],
            fragmentos: [...s.fragmentos, ...fragmentos],
            entidades: [...existentes, ...entidades],
            relaciones: [...s.relaciones, ...relaciones],
            eventos: [...s.eventos, ...eventos],
            productos: [...productos, ...s.productos],
            casos: [...casos, ...s.casos],
            tiposOperador: [...tiposOperador, ...s.tiposOperador],
            tiposRelacion: [...tiposRelacion, ...s.tiposRelacion],
            vistas: [...vistas, ...s.vistas],
          };
        });
        registrar(
          "importar",
          `Grafo importado: ${nuevos} ${nuevos === 1 ? "elemento nuevo" : "elementos nuevos"}`,
        );
        return nuevos;
      },

      fusionarEntidades: (ganadorId, perdedorId) => {
        const s = get();
        const ganador = s.entidades.find((e) => e.id === ganadorId);
        const perdedor = s.entidades.find((e) => e.id === perdedorId);
        if (!ganador || !perdedor || ganadorId === perdedorId) return null;
        capturar();

        const fusionado: Entidad = {
          ...ganador,
          resumen: ganador.resumen ?? perdedor.resumen,
          campo: ganador.campo ?? perdedor.campo,
          geo: ganador.geo ?? perdedor.geo,
          evidencia: Array.from(
            new Set([...ganador.evidencia, ...perdedor.evidencia]),
          ),
          alias: Array.from(
            new Set(
              [
                ...(ganador.alias ?? []),
                ...(perdedor.alias ?? []),
                perdedor.nombre,
              ].filter(
                (a) => a.trim().toLowerCase() !== ganador.nombre.trim().toLowerCase(),
              ),
            ),
          ),
        };

        // Repoint relations, drop self-loops, collapse duplicate triples.
        const vistas = new Set<string>();
        const relaciones: Relacion[] = [];
        for (const r of s.relaciones) {
          const desdeId = r.desdeId === perdedorId ? ganadorId : r.desdeId;
          const hastaId = r.hastaId === perdedorId ? ganadorId : r.hastaId;
          if (desdeId === hastaId) continue;
          const triple = `${desdeId}|${hastaId}|${r.tipo.toLowerCase()}`;
          if (vistas.has(triple)) continue;
          vistas.add(triple);
          relaciones.push({ ...r, desdeId, hastaId });
        }

        // Cases and products anchor entities by id — repoint the loser to
        // the winner so the fused entity SURVIVES in them instead of being
        // silently dropped by id-lookup (armarCaso/sintesis flatMap).
        const repuntar = (ids: string[]) => [
          ...new Set(ids.map((x) => (x === perdedorId ? ganadorId : x))),
        ];
        set({
          entidades: s.entidades
            .filter((e) => e.id !== perdedorId)
            .map((e) => (e.id === ganadorId ? fusionado : e)),
          relaciones,
          casos: s.casos.map((c) => ({ ...c, entidades: repuntar(c.entidades) })),
          productos: s.productos.map((p) => ({
            ...p,
            entidades: repuntar(p.entidades),
          })),
        });
        registrar(
          "fusion",
          `Fusión: ${ganador.nombre} absorbe a ${perdedor.nombre}`,
        );
        return fusionado;
      },

      guardarVista: (nombre, filtro) => {
        capturar();
        const vista: VistaGuardada = {
          id: crypto.randomUUID(),
          nombre: nombre.trim(),
          filtro,
          createdAt: Date.now(),
        };
        set((s) => ({ vistas: [vista, ...s.vistas] }));
        registrar("vista", `Vista guardada: ${vista.nombre}`);
        return vista;
      },

      removeVista: (id) => {
        capturar();
        set((s) => ({ vistas: s.vistas.filter((v) => v.id !== id) }));
        registrar("quitar-vista", "Vista eliminada");
      },

      crearTipoOperador: (t) => {
        capturar();
        const tipo: TipoOperador = {
          id: crypto.randomUUID(),
          nombre: t.nombre.trim(),
          base: t.base,
          propiedades: t.propiedades,
          createdAt: Date.now(),
        };
        set((s) => ({ tiposOperador: [tipo, ...s.tiposOperador] }));
        registrar("tipo", `Tipo del operador creado: ${tipo.nombre}`);
        return tipo;
      },

      removeTipoOperador: (id) => {
        capturar();
        const nombre =
          get().tiposOperador.find((t) => t.id === id)?.nombre ?? "tipo";
        set((s) => ({
          tiposOperador: s.tiposOperador.filter((t) => t.id !== id),
          // Typed entities lose the dangling subtype AND its values.
          entidades: s.entidades.map((e) =>
            e.subtipo === id
              ? { ...e, subtipo: undefined, propiedades: undefined }
              : e,
          ),
        }));
        registrar("quitar-tipo", `Tipo eliminado: ${nombre} (entidades destipadas)`);
      },

      crearTipoRelacion: (entrada) => {
        capturar();
        const tipo: TipoRelacion = {
          id: crypto.randomUUID(),
          nombre: entrada.nombre.trim(),
          desde: entrada.desde,
          hasta: entrada.hasta,
          createdAt: Date.now(),
        };
        set((s) => ({ tiposRelacion: [tipo, ...s.tiposRelacion] }));
        registrar(
          "tipo-relacion",
          `Tipo de relación creado: ${tipo.nombre} (${tipo.desde} → ${tipo.hasta})`,
        );
        return tipo;
      },

      removeTipoRelacion: (id) => {
        capturar();
        const nombre =
          get().tiposRelacion.find((t) => t.id === id)?.nombre ?? "tipo";
        // Existing relations keep their free-string tipo — the catalog
        // governs future links, it never rewrites history.
        set((s) => ({
          tiposRelacion: s.tiposRelacion.filter((t) => t.id !== id),
        }));
        registrar("quitar-tipo-relacion", `Tipo de relación eliminado: ${nombre}`);
      },

      setSubtipoEntidad: (entidadId, subtipo, propiedades) => {
        capturar();
        set((s) => ({
          entidades: s.entidades.map((e) =>
            e.id === entidadId
              ? {
                  ...e,
                  subtipo,
                  propiedades: subtipo ? propiedades : undefined,
                }
              : e,
          ),
        }));
        registrar(
          "tipificar",
          subtipo ? "Entidad tipificada" : "Tipo retirado de la entidad",
        );
      },

      crearCaso: (nombre, objetivo) => {
        capturar();
        const caso: Caso = {
          id: crypto.randomUUID(),
          nombre: nombre.trim(),
          objetivo: objetivo?.trim() || undefined,
          estado: "abierto",
          entidades: [],
          artefactos: [],
          productos: [],
          notas: [],
          createdAt: Date.now(),
        };
        set((s) => ({ casos: [caso, ...s.casos] }));
        registrar("caso", `Caso abierto: ${caso.nombre}`);
        return caso;
      },

      setEstadoCaso: (id, estado) => {
        capturar();
        set((s) => ({
          casos: s.casos.map((c) =>
            c.id === id
              ? {
                  ...c,
                  estado,
                  cerradoEn: estado === "cerrado" ? Date.now() : undefined,
                }
              : c,
          ),
        }));
        registrar(
          "caso",
          estado === "cerrado" ? "Caso cerrado" : "Caso reabierto",
        );
      },

      removeCaso: (id) => {
        capturar();
        const nombre = get().casos.find((c) => c.id === id)?.nombre ?? "caso";
        set((s) => ({ casos: s.casos.filter((c) => c.id !== id) }));
        registrar("quitar-caso", `Caso eliminado: ${nombre}`);
      },

      anexarAlCaso: (id, miembros) => {
        capturar();
        set((s) => ({
          casos: s.casos.map((c) =>
            c.id === id
              ? {
                  ...c,
                  entidades: [
                    ...new Set([...c.entidades, ...(miembros.entidades ?? [])]),
                  ],
                  artefactos: [
                    ...new Set([
                      ...c.artefactos,
                      ...(miembros.artefactos ?? []),
                    ]),
                  ],
                  productos: [
                    ...new Set([...c.productos, ...(miembros.productos ?? [])]),
                  ],
                }
              : c,
          ),
        }));
        registrar("caso", "Miembro anexado al caso");
      },

      desanexarDelCaso: (id, miembros) => {
        capturar();
        const fuera = {
          entidades: new Set(miembros.entidades ?? []),
          artefactos: new Set(miembros.artefactos ?? []),
          productos: new Set(miembros.productos ?? []),
        };
        set((s) => ({
          casos: s.casos.map((c) =>
            c.id === id
              ? {
                  ...c,
                  entidades: c.entidades.filter((x) => !fuera.entidades.has(x)),
                  artefactos: c.artefactos.filter(
                    (x) => !fuera.artefactos.has(x),
                  ),
                  productos: c.productos.filter((x) => !fuera.productos.has(x)),
                }
              : c,
          ),
        }));
        registrar("caso", "Miembro desanexado del caso");
      },

      agregarNota: (casoId, texto) => {
        if (texto.trim().length === 0) return;
        capturar();
        set((s) => ({
          casos: s.casos.map((c) =>
            c.id === casoId
              ? {
                  ...c,
                  notas: [
                    {
                      id: crypto.randomUUID(),
                      texto: texto.trim(),
                      createdAt: Date.now(),
                    },
                    ...c.notas,
                  ],
                }
              : c,
          ),
        }));
        registrar("nota", "Nota agregada al caso");
      },

      quitarNota: (casoId, notaId) => {
        capturar();
        set((s) => ({
          casos: s.casos.map((c) =>
            c.id === casoId
              ? { ...c, notas: c.notas.filter((n) => n.id !== notaId) }
              : c,
          ),
        }));
        registrar("nota", "Nota eliminada del caso");
      },

      descartarPar: (clave) => {
        if (get().paresDescartados.includes(clave)) return;
        capturar();
        set((s) => ({
          paresDescartados: [...s.paresDescartados, clave],
        }));
        registrar("descartar", "Propuesta descartada por el operador");
      },

      deshacer: () => {
        const previo = pila.pop();
        if (!previo) return false;
        // Restore graph slices only — the audit trail is immutable.
        set((s) => ({
          ...previo,
          deshacerDisponibles: pila.length,
          bitacora: [
            {
              id: crypto.randomUUID(),
              ts: Date.now(),
              accion: "deshacer",
              detalle: "Última operación revertida",
            },
            ...s.bitacora,
          ].slice(0, MAX_BITACORA),
        }));
        ultimaCaptura = 0;
        return true;
      },

      // The one explicit nuke: graph, audit and undo history all go —
      // the bitácora carries names, so privacy wins over convenience.
      clear: () => {
        pila = [];
        ultimaCaptura = 0;
        set({
          artefactos: [],
          fragmentos: [],
          entidades: [],
          relaciones: [],
          eventos: [],
          productos: [],
          casos: [],
          tiposOperador: [],
          tiposRelacion: [],
          vistas: [],
          paresDescartados: [],
          bitacora: [],
          deshacerDisponibles: 0,
        });
      },
      };
    },
    {
      name: "umwelt-autogenes-v1",
      storage: createJSONStorage(() => idbStorage),
      // The undo stack is session-scoped; never persist its counter.
      partialize: (s) =>
        Object.fromEntries(
          Object.entries(s).filter(([k]) => k !== "deshacerDisponibles"),
        ) as AutogenesState,
    },
  ),
);
