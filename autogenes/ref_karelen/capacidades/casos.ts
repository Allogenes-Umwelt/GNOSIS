import { normalizar } from "@/lib/similitud";
import { formatearFechaEs } from "@/lib/fechas";
import type { Informe } from "@/capacidades/informe";
import type {
  Artefacto,
  Caso,
  Entidad,
  Evento,
  Fragmento,
  Producto,
} from "@/types/autogenes";

/**
 * CASOS capability (D3) — pure projection of one investigation file.
 * A caso only anchors ids; everything here derives LIVE from the
 * graph: dead anchors resolve to nothing, and the case cronología is
 * every dated event touching a member entity (by name/alias) or dated
 * by a member source's fragments — each with its citations.
 */

export interface HitoCaso {
  eventoId: string;
  iso: string;
  fecha: string;
  titulo: string;
  citas: string[];
  /** Fragment ids backing the event — provenance for derived products. */
  evidencia: string[];
}

export interface ResumenCaso {
  caso: Caso;
  entidades: Entidad[];
  artefactos: Artefacto[];
  productos: Producto[];
  cronologia: HitoCaso[];
}

export function resumenCaso(
  caso: Caso,
  g: {
    artefactos: Artefacto[];
    fragmentos: Fragmento[];
    entidades: Entidad[];
    eventos: Evento[];
    productos: Producto[];
  },
): ResumenCaso {
  const entidades = caso.entidades.flatMap((id) => {
    const e = g.entidades.find((x) => x.id === id);
    return e ? [e] : [];
  });
  const artefactos = caso.artefactos.flatMap((id) => {
    const a = g.artefactos.find((x) => x.id === id);
    return a ? [a] : [];
  });
  const productos = caso.productos.flatMap((id) => {
    const p = g.productos.find((x) => x.id === id);
    return p ? [p] : [];
  });

  const nombres = new Set(
    entidades.flatMap((e) => [e.nombre, ...(e.alias ?? [])]).map(normalizar),
  );
  const fragmentosDelCaso = new Set(
    g.fragmentos
      .filter((f) => caso.artefactos.includes(f.artefactoId))
      .map((f) => f.id),
  );
  const fragmentoPorId = new Map(g.fragmentos.map((f) => [f.id, f] as const));
  const artefactoPorId = new Map(g.artefactos.map((a) => [a.id, a] as const));

  const cronologia: HitoCaso[] = g.eventos
    .filter(
      (ev) =>
        ev.entidades.some((n) => nombres.has(normalizar(n))) ||
        ev.evidencia.some((id) => fragmentosDelCaso.has(id)),
    )
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((ev) => ({
      eventoId: ev.id,
      evidencia: ev.evidencia,
      iso: ev.fecha,
      fecha: formatearFechaEs(ev.fecha, ev.precision),
      titulo: ev.titulo,
      citas: [
        ...new Set(
          ev.evidencia.flatMap((id) => {
            const f = fragmentoPorId.get(id);
            if (!f) return [];
            const fuente =
              artefactoPorId.get(f.artefactoId)?.nombre ?? "fuente";
            return [`${fuente}${f.pagina ? ` · pág ${f.pagina}` : ""}`];
          }),
        ),
      ],
    }));

  return { caso, entidades, artefactos, productos, cronologia };
}

/* ── L·3: plantillas de caso — checklists deterministas por trámite ── */

export interface PlantillaCaso {
  id: string;
  nombre: string;
  objetivo: string;
  /** Checklist seeded as operator notes; delete one when it is done. */
  lista: string[];
}

export const PLANTILLAS_CASO: PlantillaCaso[] = [
  {
    id: "tramite",
    nombre: "Trámite / gestión",
    objetivo: "Completar el trámite con constancia documental",
    lista: [
      "Pendiente: reunir requisitos y documentos base",
      "Pendiente: identificar dependencia, plazo y costo",
      "Pendiente: presentar solicitud y guardar acuse",
      "Pendiente: dar seguimiento hasta resolución",
      "Pendiente: archivar constancia final en el caso",
    ],
  },
  {
    id: "reclamo",
    nombre: "Reclamo / siniestro",
    objetivo: "Resolver el reclamo con la aseguradora o proveedor",
    lista: [
      "Pendiente: cargar póliza o contrato al caso",
      "Pendiente: documentar el hecho con evidencia fechada",
      "Pendiente: levantar el reclamo y anotar folio",
      "Pendiente: registrar cada respuesta y su fecha",
      "Pendiente: cerrar con el finiquito o resolución",
    ],
  },
  {
    id: "contrato",
    nombre: "Contrato / arrendamiento",
    objetivo: "Controlar vigencia, pagos y obligaciones del contrato",
    lista: [
      "Pendiente: cargar el contrato firmado al caso",
      "Pendiente: extraer partes, montos y fechas clave",
      "Pendiente: registrar vencimientos como eventos",
      "Pendiente: anotar renovación o terminación",
    ],
  },
  {
    id: "libre",
    nombre: "Investigación libre",
    objetivo: "",
    lista: [
      "Pendiente: definir la pregunta que guía el caso",
      "Pendiente: anclar fuentes y entidades relevantes",
      "Pendiente: revisar cronología y vínculos derivados",
    ],
  },
];

/* ── L·3: cierre con informe — snapshot determinista del caso ──────── */

/**
 * Deterministic closing report: what the case anchored, what happened and
 * what the operator noted — every point citing the REAL fragment ids the
 * graph already holds. No model involved; valid by construction against
 * InformeSchema (callers dock it as a Producto).
 */
export function informeDeCierre(resumen: ResumenCaso): {
  informe: Informe;
  evidencia: string[];
  entidades: string[];
} {
  const secciones: Informe["secciones"] = [];

  if ((resumen.caso.objetivo ?? "").trim().length > 0) {
    secciones.push({
      encabezado: "Objetivo",
      puntos: [
        {
          texto: (resumen.caso.objetivo ?? "").trim().slice(0, 320),
          evidencia: [],
          entidades: [],
        },
      ],
    });
  }

  if (resumen.entidades.length > 0) {
    secciones.push({
      encabezado: "Entidades del caso",
      puntos: resumen.entidades.slice(0, 8).map((e) => ({
        texto: `${e.nombre} — ${e.tipo}${e.resumen ? `: ${e.resumen}` : ""}`.slice(0, 320),
        evidencia: e.evidencia.slice(0, 4),
        entidades: [e.nombre],
      })),
    });
  }

  if (resumen.cronologia.length > 0) {
    secciones.push({
      encabezado: "Cronología",
      puntos: resumen.cronologia.slice(0, 8).map((h) => ({
        texto: `${h.fecha} — ${h.titulo}`.slice(0, 320),
        evidencia: h.evidencia.slice(0, 4),
        entidades: [],
      })),
    });
  }

  if (resumen.caso.notas.length > 0) {
    secciones.push({
      encabezado: "Notas del operador",
      puntos: resumen.caso.notas.slice(0, 8).map((n) => ({
        texto: n.texto.slice(0, 320),
        evidencia: [],
        entidades: [],
      })),
    });
  }

  const informe: Informe = {
    titulo: `Cierre · ${resumen.caso.nombre}`.slice(0, 120),
    secciones: secciones.slice(0, 6),
  };
  const evidencia = [
    ...new Set(
      secciones.flatMap((s) => s.puntos.flatMap((p) => p.evidencia)),
    ),
  ];
  return {
    informe,
    evidencia,
    entidades: resumen.caso.entidades,
  };
}

/* ── L·5: alcance por caso — el subgrafo que un caso activo delimita ── */

export interface AlcanceCaso {
  entidadIds: Set<string>;
  artefactoIds: Set<string>;
  fragmentoIds: Set<string>;
  eventoIds: Set<string>;
}

/**
 * The sub-graph an active case delimits, with the SAME membership rules
 * the case chronology already uses: anchored entities and sources; their
 * fragments; and events that name an anchored entity (or alias) or cite
 * a case fragment. Pure — capability surfaces filter their inputs with
 * these sets when a case is in focus.
 */
export function alcanceDeCaso(
  caso: Caso,
  g: {
    fragmentos: Fragmento[];
    entidades: Entidad[];
    eventos: Evento[];
  },
): AlcanceCaso {
  const entidadIds = new Set(caso.entidades);
  const artefactoIds = new Set(caso.artefactos);
  const fragmentoIds = new Set(
    g.fragmentos.filter((f) => artefactoIds.has(f.artefactoId)).map((f) => f.id),
  );
  const nombres = new Set(
    g.entidades
      .filter((e) => entidadIds.has(e.id))
      .flatMap((e) => [e.nombre, ...(e.alias ?? [])])
      .map(normalizar),
  );
  const eventoIds = new Set(
    g.eventos
      .filter(
        (ev) =>
          ev.entidades.some((n) => nombres.has(normalizar(n))) ||
          ev.evidencia.some((id) => fragmentoIds.has(id)),
      )
      .map((ev) => ev.id),
  );
  return { entidadIds, artefactoIds, fragmentoIds, eventoIds };
}
