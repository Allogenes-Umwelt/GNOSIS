import { getBlob, putBlob } from "@/lib/blobs";
import { muestrearFragmentos } from "@/lib/estudio";
import {
  confianzaFicha,
  parsearCandidatosFicha,
  type CandidatoFicha,
} from "@/lib/enriquecimiento";
import { fusionarPropuestas, partirFragmentos } from "@/lib/extraccion";
import type { EventoSaneado } from "@/lib/fechas";
import { parsearCandidatosLugar, type CandidatoLugar } from "@/lib/geo";
import {
  comprimirParaBoveda,
  normalizarOrientacion,
  reducirImagen,
} from "@/lib/imagen";
import { ocrLocal, type RutaOcr } from "@/lib/ocr";
import { analizarTablaOTexto } from "@/lib/pipelines/csv";
import { detectarPipeline } from "@/lib/pipelines/registry";
import { leerXlsx } from "@/lib/xlsx";
import type { ResultadoPipeline } from "@/types/pipeline";
import {
  tipoRelacionDe,
  validarExtremosRelacion,
  validarPropiedades,
} from "@/lib/tipado";
import { useAutogenesStore } from "@/store/autogenes";
import { useMemoriaStore } from "@/store/memoria";
import { usePreferenciasStore } from "@/store/preferencias";
import type {
  Artefacto,
  ClaseProducto,
  Entidad,
  Fragmento,
  GeoPunto,
  PreguntaQuiz,
  Producto,
  PropuestaGrafo,
  PuntoResumen,
  TipoEntidad,
} from "@/types/autogenes";
import type { Campo } from "@/types/microapp";

/**
 * AUTOGENES service — the sole gateway for getting sources into the
 * graph. Today it runs entirely on device (pdf.js + tesseract.js in the
 * browser; the vision OCR route is the one opt-in exception). When a
 * backend lands, only this module's body changes; every caller keeps
 * calling `ingestarPdf` / `ingestarImagen` / `ingestarTexto` unchanged.
 */

export interface Ingesta {
  artefacto: Artefacto;
  fragmentos: Fragmento[];
}

/** Extract one text fragment per PDF page, store the blob, graph it. */
export async function ingestarPdf(file: File): Promise<Ingesta> {
  // Legacy build: the modern build calls Map.prototype.getOrInsertComputed
  // (a not-yet-shipped V8 method) during render, which stalls; the legacy
  // build ships the core-js polyfill for it, so it runs everywhere.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Worker served from our own origin (public/, copied on prebuild).
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const textos: { texto: string; pagina: number }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const texto = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    textos.push({ texto, pagina: p });
  }

  const blobKey = `pdf-${crypto.randomUUID()}`;
  await putBlob(blobKey, file);

  const store = useAutogenesStore.getState();
  const artefacto = store.addArtefacto({
    kind: "pdf",
    nombre: file.name,
    paginas: doc.numPages,
    blobKey,
  });
  const fragmentos = store.addFragmentos(artefacto.id, textos);
  return { artefacto, fragmentos };
}

/**
 * Ingest a screenshot/photo: vault the blob, dock the artefacto with NO
 * fragments yet — text arrives via `transcribirImagen` (OCR router).
 */
export async function ingestarImagen(file: File): Promise<Ingesta> {
  const blobKey = `img-${crypto.randomUUID()}`;
  // Vault the compressed copy (EXIF baked in, ≤2000px, ~10× lighter);
  // the operator keeps the original in their gallery.
  await putBlob(blobKey, await comprimirParaBoveda(file));
  const store = useAutogenesStore.getState();
  const artefacto = store.addArtefacto({
    kind: "imagen",
    nombre: file.name,
    blobKey,
  });
  return { artefacto, fragmentos: [] };
}

/**
 * OCR router: turn an imagen artefacto into citable fragmentos.
 * - "local": tesseract.js fully on device — the image never leaves.
 * - "vision": the active SYNESIS model transcribes; requires the
 *   operator's explicit opt-in upstream because the image travels.
 */
export async function transcribirImagen(
  artefactoId: string,
  ruta: RutaOcr,
  onProgreso?: (p: number) => void,
): Promise<Fragmento[]> {
  const store = useAutogenesStore.getState();
  const artefacto = store.artefactos.find((a) => a.id === artefactoId);
  if (!artefacto || artefacto.kind !== "imagen" || !artefacto.blobKey) {
    throw new Error("Captura no encontrada.");
  }
  const blob = await getBlob(artefacto.blobKey);
  if (!blob) {
    throw new Error("La imagen ya no está en este dispositivo. Cárgala de nuevo.");
  }

  let texto: string;
  if (ruta === "local") {
    // Tesseract ignores EXIF — normalize orientation before OCR.
    texto = await ocrLocal(await normalizarOrientacion(blob), onProgreso);
  } else {
    const { provider, claves } = usePreferenciasStore.getState();
    const reducida = await reducirImagen(blob);
    const res = await fetch("/api/autogenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modo: "transcripcion",
        provider,
        clave: claves[provider] || undefined,
        nombre: artefacto.nombre,
        imagen: reducida.base64,
        mime: reducida.mime,
      }),
    });
    const json: unknown = await res.json();
    if (!res.ok) {
      const err =
        typeof json === "object" && json !== null && "error" in json
          ? String((json as { error: unknown }).error)
          : "La transcripción falló.";
      throw new Error(err);
    }
    texto = (json as { texto: string }).texto;
  }

  const limpio = texto.trim();
  if (!limpio) {
    throw new Error(
      "No se encontró texto legible. Prueba la ruta Visión o una imagen más nítida.",
    );
  }
  return store.addFragmentos(artefactoId, [{ texto: limpio }]);
}

/** Ingest raw text/notes as a single-fragment artefacto. */
export function ingestarTexto(texto: string, nombre = "Nota"): Ingesta {
  const store = useAutogenesStore.getState();
  const artefacto = store.addArtefacto({ kind: "nota", nombre });
  const fragmentos = store.addFragmentos(artefacto.id, [
    { texto: texto.trim() },
  ]);
  return { artefacto, fragmentos };
}

/**
 * Chunk free text into citable pieces: paragraphs (blank-line separated)
 * grouped up to a size cap, so each fragment is a coherent, separately
 * cite-able passage. An over-long paragraph is hard-split. Pure.
 */
export function partirTexto(texto: string, max = 1400): string[] {
  const parrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const trozos: string[] = [];
  let actual = "";
  const empujar = () => {
    if (actual.trim().length > 0) trozos.push(actual.trim());
    actual = "";
  };
  for (const p of parrafos) {
    if (p.length > max) {
      empujar();
      for (let i = 0; i < p.length; i += max) trozos.push(p.slice(i, i + max));
      continue;
    }
    if (actual.length + p.length + 2 > max) empujar();
    actual = actual ? `${actual}\n\n${p}` : p;
  }
  empujar();
  return trozos;
}

/**
 * D4 (text): a .txt/.md file docks as a "nota" artefacto whose paragraphs
 * become citable fragments — so free text builds the graph exactly like a
 * PDF (extractable, searchable, cited), not a flat operator dato.
 */
export async function ingestarArchivoTexto(file: File): Promise<Ingesta> {
  const texto = (await file.text()).trim();
  if (texto.length === 0) {
    throw new Error("El archivo de texto está vacío.");
  }
  const trozos = partirTexto(texto);
  const store = useAutogenesStore.getState();
  const artefacto = store.addArtefacto({ kind: "nota", nombre: file.name });
  const fragmentos = store.addFragmentos(
    artefacto.id,
    trozos.map((t, i) => ({ texto: t, pagina: i + 1 })),
  );
  return { artefacto, fragmentos };
}

/* ── A1: cited extraction ─────────────────────────────────────────── */

/**
 * Run the extraction pass(es) for one artefacto through the active
 * SYNESIS provider. Returns a merged, provenance-sanitized proposal for
 * operator review — NOTHING is written to the graph here.
 */
export async function extraerGrafo(
  artefactoId: string,
): Promise<PropuestaGrafo> {
  const { artefactos, fragmentos, entidades } = useAutogenesStore.getState();
  const artefacto = artefactos.find((a) => a.id === artefactoId);
  if (!artefacto) throw new Error("Artefacto no encontrado.");

  const propios = fragmentos.filter((f) => f.artefactoId === artefactoId);
  const pases = partirFragmentos(propios);
  if (pases.length === 0) {
    throw new Error(
      "Esta fuente aún no tiene texto citable. Si es una captura, pásala por OCR local o Visión primero.",
    );
  }

  const { provider, claves } = usePreferenciasStore.getState();
  const existentes = entidades.map((e) => e.nombre);

  let acumulada: PropuestaGrafo = { entidades: [], relaciones: [] };
  for (const pase of pases) {
    const res = await fetch("/api/autogenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        clave: claves[provider] || undefined,
        artefacto: artefacto.nombre,
        fragmentos: pase,
        existentes: [
          ...existentes,
          ...acumulada.entidades.map((e) => e.nombre),
        ].slice(0, 200),
      }),
    });
    const json: unknown = await res.json();
    if (!res.ok) {
      const err =
        typeof json === "object" && json !== null && "error" in json
          ? String((json as { error: unknown }).error)
          : "La extracción falló.";
      throw new Error(err);
    }
    const { propuesta } = json as { propuesta: PropuestaGrafo };
    acumulada = fusionarPropuestas(acumulada, propuesta);
  }
  return acumulada;
}

/* ── A4: study modules ────────────────────────────────────────────── */

async function pedirEstudio<T>(
  modo: "quiz" | "resumen" | "cronologia",
  artefactoId: string,
  llave: "preguntas" | "puntos" | "eventos",
): Promise<T> {
  const { artefactos, fragmentos } = useAutogenesStore.getState();
  const artefacto = artefactos.find((a) => a.id === artefactoId);
  if (!artefacto) throw new Error("Artefacto no encontrado.");

  const muestra = muestrearFragmentos(
    fragmentos.filter((f) => f.artefactoId === artefactoId),
  );
  if (muestra.length === 0) {
    throw new Error(
      "Esta fuente aún no tiene texto citable. Si es una captura, pásala por OCR local o Visión primero.",
    );
  }

  const { provider, claves } = usePreferenciasStore.getState();
  const res = await fetch("/api/autogenes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modo,
      provider,
      clave: claves[provider] || undefined,
      artefacto: artefacto.nombre,
      fragmentos: muestra,
    }),
  });
  const json: unknown = await res.json();
  if (!res.ok) {
    const err =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : "La generación falló.";
    throw new Error(err);
  }
  return (json as Record<string, T>)[llave];
}

/**
 * Quiz from evidence — every question cites the fragmentos that answer
 * it. Long sources are sampled evenly (single pass), not read in full.
 */
export function generarQuiz(artefactoId: string): Promise<PreguntaQuiz[]> {
  return pedirEstudio<PreguntaQuiz[]>("quiz", artefactoId, "preguntas");
}

/** Cited summary — every point carries the fragmentos that back it. */
export function generarResumen(artefactoId: string): Promise<PuntoResumen[]> {
  return pedirEstudio<PuntoResumen[]>("resumen", artefactoId, "puntos");
}

/**
 * Dated events, cited — the time primitive. Returns a normalized,
 * provenance-clean proposal for operator review; nothing persists here.
 */
export function generarCronologia(
  artefactoId: string,
): Promise<EventoSaneado[]> {
  return pedirEstudio<EventoSaneado[]>("cronologia", artefactoId, "eventos");
}

/** Persist the operator-approved events into the timeline. */
export function integrarCronologia(eventos: EventoSaneado[]): number {
  useAutogenesStore.getState().addEventos(
    eventos.map((e) => ({
      titulo: e.titulo,
      fecha: e.fecha,
      precision: e.precision,
      entidades: e.entidades,
      evidencia: e.evidencia,
      origen: "synesis" as const,
    })),
  );
  return eventos.length;
}

/* ── B4: geo — geocode fixes through the connector gateway ────────── */

/**
 * Geocode a place name via the OSM connector (Nominatim behind our own
 * allowlisted gateway — CSP stays self-only). Returns up to 5 validated
 * candidates for the operator to pick from; nothing is fixed here.
 */
export async function buscarLugar(nombre: string): Promise<CandidatoLugar[]> {
  const res = await fetch("/api/conector", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conector: "osm",
      consulta: "buscar_lugar",
      parametros: { consulta: nombre },
    }),
  });
  const json: unknown = await res.json();
  if (!res.ok) {
    const err =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : "La geocodificación falló.";
    throw new Error(err);
  }
  return parsearCandidatosLugar(json);
}

/** Fix the operator-confirmed coordinates on an entity (or clear them). */
export function ubicarEntidad(
  entidadId: string,
  geo: GeoPunto | undefined,
): void {
  useAutogenesStore.getState().setGeoEntidad(entidadId, geo);
}

/* ── Q1: on-device OCR for scanned pages inside PDFs ──────────────── */

/**
 * Render every text-less page of a PDF to a canvas and OCR it with the
 * LOCAL Tesseract route (nothing leaves the device). Filled pages
 * become citable fragments with their original page number — the
 * provenance chain is untouched. Returns how many pages gained text.
 */
export async function ocrPaginasPdf(
  artefactoId: string,
  onProgreso?: (pagina: number, total: number) => void,
): Promise<number> {
  const store = useAutogenesStore.getState();
  const artefacto = store.artefactos.find((a) => a.id === artefactoId);
  if (!artefacto?.blobKey) throw new Error("La fuente no tiene PDF guardado.");
  const vacios = store.fragmentos.filter(
    (f) => f.artefactoId === artefactoId && f.texto.trim().length === 0,
  );
  if (vacios.length === 0) return 0;
  const blob = await getBlob(artefacto.blobKey);
  if (!blob) throw new Error("El PDF ya no está en la bóveda del dispositivo.");

  // Legacy build (see ingestarPdf): render needs the getOrInsertComputed
  // polyfill the modern build omits.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
  }).promise;

  let llenadas = 0;
  for (let i = 0; i < vacios.length; i++) {
    const frag = vacios[i];
    if (!frag.pagina || frag.pagina > doc.numPages) continue;
    onProgreso?.(i + 1, vacios.length);
    const page = await doc.getPage(frag.pagina);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    // pdf.js v5: pass `canvas` ONLY — supplying canvasContext alongside a
    // canvas stalls the render promise forever.
    await page.render({ canvas, viewport }).promise;
    const imagen = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/png"),
    );
    if (!imagen) continue;
    const texto = (await ocrLocal(imagen)).trim();
    if (texto.length > 0) {
      useAutogenesStore.getState().setTextoFragmento(frag.id, texto);
      llenadas++;
    }
  }
  return llenadas;
}

/**
 * E3 write gate: units dock their products into the ontology THROUGH the
 * service layer, never by reaching into the store. Same contract as the
 * store action; this is the seam future validation/audit hooks attach to.
 */
export function dockearProducto(p: {
  clase: ClaseProducto;
  titulo: string;
  unidad: string;
  cuerpo: unknown;
  entidades?: string[];
  evidencia?: string[];
}): Producto {
  return useAutogenesStore.getState().dockearProducto(p);
}

export interface IntervencionOperador {
  ts: number;
  accion: string;
  detalle: string;
}

/**
 * Read-only view of the D1 audit log for ACTUAR's event horizon: every
 * operator intervention with its timestamp. Views consume this through
 * the service gateway; the bitácora itself is never mutated from here.
 */
export function intervencionesOperador(): IntervencionOperador[] {
  return useAutogenesStore
    .getState()
    .bitacora.map(({ ts, accion, detalle }) => ({ ts, accion, detalle }));
}

/* ── D4: structured-source pipelines — local, deterministic ───────── */

export interface ResumenEstructurado {
  artefacto: Artefacto;
  pipeline: string;
  fragmentos: number;
  entidades: number;
  eventos: number;
}

/**
 * Run a file through its detected pipeline and dock the result with
 * full lineage: the file becomes an artefacto, the pipeline's output
 * becomes fragmentos, and every entity/event cites the REAL fragment
 * ids it came from — indices are resolved here, so a pipeline cannot
 * fabricate provenance. No network, no model.
 */
export async function ingestarEstructurado(
  file: File,
): Promise<ResumenEstructurado> {
  const contenido = await file.text();
  const pipeline = detectarPipeline(file.name, contenido);
  if (!pipeline) {
    throw new Error(
      "Ningún pipeline reconoce este archivo. Cárgalo como dato manual.",
    );
  }
  return dockearResultado(
    file.name,
    pipeline.nombre,
    pipeline.procesar(file.name, contenido),
  );
}

/**
 * D4 (XLSX): a spreadsheet is a table from another wrapper. Read EVERY
 * sheet on device (zero deps, no network); each sheet is analyzed as a
 * dated-amount ledger when it fits, else docked as a generic citable
 * table — so a whole multi-sheet workbook (a financial model, not just a
 * bank statement) lands in the graph. All sheets fold into ONE source,
 * each fragment tagged with its sheet, through the same provenance
 * resolution as CSV.
 */
export async function ingestarHojaCalculo(
  file: File,
): Promise<ResumenEstructurado> {
  const hojas = await leerXlsx(await file.arrayBuffer());
  const fragmentos: ResultadoPipeline["fragmentos"] = [];
  for (const hoja of hojas) {
    let r: ResultadoPipeline;
    try {
      r = analizarTablaOTexto(hoja.nombre, hoja.filas);
    } catch {
      continue; // empty sheet — nothing to dock
    }
    for (const f of r.fragmentos) {
      fragmentos.push({
        texto: `[${hoja.nombre}]\n${f.texto}`,
        pagina: fragmentos.length + 1,
      });
    }
  }
  if (fragmentos.length === 0) {
    throw new Error("El libro no tiene hojas con datos legibles.");
  }
  // Ledger/generic tables emit no entities/events, so combining is a plain
  // fragment concatenation — provenance stays clean.
  return dockearResultado(file.name, "Libro XLSX", {
    fragmentos,
    entidades: [],
    eventos: [],
  });
}

/**
 * Shared docking for structured sources: the file becomes an artefacto,
 * the pipeline output becomes fragmentos, and every entity/event cites the
 * REAL fragment ids — indices are resolved HERE, so a pipeline cannot
 * fabricate provenance, and provenance-less nodes are skipped.
 */
function dockearResultado(
  nombreFuente: string,
  pipelineNombre: string,
  resultado: ResultadoPipeline,
): ResumenEstructurado {
  const store = useAutogenesStore.getState();
  const artefacto = store.addArtefacto({
    kind: "estructurado",
    nombre: nombreFuente,
  });
  const frags = store.addFragmentos(artefacto.id, resultado.fragmentos);
  const idsDe = (indices: number[]) =>
    indices
      .map((i) => frags[i]?.id)
      .filter((id): id is string => Boolean(id));

  let entidadesDock = 0;
  for (const e of resultado.entidades) {
    const evidencia = idsDe(e.fragmentos);
    if (evidencia.length === 0) continue;
    store.upsertEntidad({
      nombre: e.nombre,
      tipo: e.tipo,
      resumen: e.resumen,
      origen: "synesis",
      evidencia,
    });
    entidadesDock++;
  }
  const eventosDock = resultado.eventos
    .map((ev) => ({
      titulo: ev.titulo,
      fecha: ev.fecha,
      precision: ev.precision,
      entidades: ev.entidades,
      evidencia: idsDe(ev.fragmentos),
      origen: "synesis" as const,
    }))
    .filter((ev) => ev.evidencia.length > 0);
  if (eventosDock.length > 0) {
    store.addEventos(eventosDock);
  }
  return {
    artefacto,
    pipeline: pipelineNombre,
    fragmentos: frags.length,
    entidades: entidadesDock,
    eventos: eventosDock.length,
  };
}

/* ── Q3: operator curation — manual graph editing ─────────────────── */

/** Create an entity by hand — operator-declared, origen is provenance. */
export function crearEntidadManual(e: {
  nombre: string;
  tipo: TipoEntidad;
  resumen?: string;
  campo?: Campo;
}): Entidad {
  return useAutogenesStore.getState().upsertEntidad({
    nombre: e.nombre,
    tipo: e.tipo,
    resumen: e.resumen?.trim() || undefined,
    campo: e.campo,
    origen: "operador",
  });
}

/**
 * Edit an entity's fields. A rename keeps the old name as alias so
 * retrieval, events and case cronologías keep matching.
 */
export function editarEntidad(
  id: string,
  cambios: { nombre?: string; tipo?: TipoEntidad; resumen?: string; campo?: Campo },
): void {
  const actual = useAutogenesStore
    .getState()
    .entidades.find((e) => e.id === id);
  if (!actual) return;
  const nuevoNombre = cambios.nombre?.trim();
  const renombrada =
    nuevoNombre &&
    nuevoNombre.toLowerCase() !== actual.nombre.trim().toLowerCase();
  useAutogenesStore.getState().updateEntidad(id, {
    ...(nuevoNombre ? { nombre: nuevoNombre } : {}),
    ...(cambios.tipo ? { tipo: cambios.tipo } : {}),
    resumen: cambios.resumen?.trim() || actual.resumen,
    campo: cambios.campo ?? actual.campo,
    ...(renombrada
      ? {
          alias: [
            ...new Set([...(actual.alias ?? []), actual.nombre]),
          ].filter((a) => a.toLowerCase() !== nuevoNombre.toLowerCase()),
        }
      : {}),
  });
}

/** Cut one relation — operator verdict, audited and undoable. */
export function cortarRelacion(id: string): void {
  useAutogenesStore.getState().removeRelacion(id);
}

/* ── D2: operator ontology — typed entities ───────────────────────── */

/**
 * Type an entity with an operator type, validating values against the
 * type's property defs. Returns the errors instead of writing anything
 * when validation fails. Passing subtipo=undefined clears the typing.
 */
export function asignarSubtipo(
  entidadId: string,
  subtipo: string | undefined,
  crudas: Record<string, string>,
): { ok: boolean; errores: string[] } {
  const store = useAutogenesStore.getState();
  if (!subtipo) {
    store.setSubtipoEntidad(entidadId, undefined, {});
    return { ok: true, errores: [] };
  }
  const tipo = store.tiposOperador.find((t) => t.id === subtipo);
  if (!tipo) return { ok: false, errores: ["Ese tipo ya no existe."] };
  const veredicto = validarPropiedades(tipo, crudas);
  if (!veredicto.ok) return { ok: false, errores: veredicto.errores };
  store.setSubtipoEntidad(entidadId, subtipo, veredicto.propiedades);
  return { ok: true, errores: [] };
}

/**
 * Operator Action (L·6, Foundry Actions): one validated write — create an
 * entity of an operator TYPE with its D2 properties, optionally linked to
 * an existing entity through a catalog-validated relation. Everything is
 * validated BEFORE anything writes: an Action either lands whole or not
 * at all.
 */
export function ejecutarAccion(entrada: {
  tipoId: string;
  nombre: string;
  propiedades: Record<string, string>;
  enlace?: { destinoId: string; tipo: string };
}): { ok: true; entidad: Entidad } | { ok: false; errores: string[] } {
  const store = useAutogenesStore.getState();
  const errores: string[] = [];

  const tipo = store.tiposOperador.find((t) => t.id === entrada.tipoId);
  if (!tipo) return { ok: false, errores: ["Ese tipo ya no existe."] };
  if (entrada.nombre.trim().length === 0) {
    errores.push("Ponle nombre al registro.");
  }
  const veredicto = validarPropiedades(tipo, entrada.propiedades);
  if (!veredicto.ok) errores.push(...veredicto.errores);

  let destino: Entidad | undefined;
  if (entrada.enlace) {
    destino = store.entidades.find((e) => e.id === entrada.enlace?.destinoId);
    if (!destino) {
      errores.push("La entidad destino ya no existe.");
    } else {
      const cat = tipoRelacionDe(store.tiposRelacion, entrada.enlace.tipo);
      if (cat) {
        const error = validarExtremosRelacion(
          cat,
          { nombre: entrada.nombre.trim(), tipo: tipo.base },
          destino,
        );
        if (error) errores.push(error);
      }
    }
  }
  if (errores.length > 0) return { ok: false, errores };

  const entidad = store.upsertEntidad({
    nombre: entrada.nombre.trim(),
    tipo: tipo.base,
    origen: "operador",
  });
  store.setSubtipoEntidad(entidad.id, tipo.id, veredicto.propiedades);
  if (entrada.enlace && destino) {
    store.addRelacion({
      desdeId: entidad.id,
      hastaId: destino.id,
      tipo: entrada.enlace.tipo.trim(),
    });
  }
  return { ok: true, entidad };
}

/* ── C4: connector-driven enrichment (HITL) ───────────────────────── */

/**
 * Look an entity up in Wikidata through the allowlisted gateway (the
 * only place the name travels to). Returns candidate fichas for the
 * operator to adjudicate; nothing is applied here.
 */
export async function buscarFicha(nombre: string): Promise<CandidatoFicha[]> {
  const res = await fetch("/api/conector", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conector: "wikidata",
      consulta: "buscar_entidad",
      parametros: { consulta: nombre },
    }),
  });
  const json: unknown = await res.json();
  if (!res.ok) {
    const err =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : "La búsqueda de ficha falló.";
    throw new Error(err);
  }
  return parsearCandidatosFicha(json);
}

/** Apply the ficha the operator approved: summary + label as alias. */
export function aplicarFicha(entidadId: string, ficha: CandidatoFicha): void {
  useAutogenesStore.getState().enriquecerEntidad(entidadId, {
    resumen: ficha.descripcion,
    alias: ficha.nombre ? [ficha.nombre] : undefined,
  });
}

export interface FichaLote {
  entidadId: string;
  nombre: string;
  ficha: CandidatoFicha;
  confianza: number;
}

/**
 * Batch enrichment (N3): look up several LINKABLE entities in Wikidata
 * (sequential, shared-server etiquette), score each best candidate with
 * the deterministic confidence, and return proposals ≥ 0.5 for the
 * operator to adjudicate. Nothing is applied here; personas never
 * travel (the caller filters with candidatosLote).
 */
export async function buscarFichasLote(
  objetivos: { id: string; nombre: string }[],
): Promise<{ resultados: FichaLote[]; errores: string[] }> {
  const resultados: FichaLote[] = [];
  const errores: string[] = [];
  for (const o of objetivos) {
    try {
      const candidatos = await buscarFicha(o.nombre);
      let mejor: { ficha: CandidatoFicha; confianza: number } | null = null;
      for (const c of candidatos) {
        const conf = confianzaFicha(o.nombre, c);
        if (!mejor || conf > mejor.confianza) mejor = { ficha: c, confianza: conf };
      }
      if (mejor && mejor.confianza >= 0.5) {
        resultados.push({
          entidadId: o.id,
          nombre: o.nombre,
          ficha: mejor.ficha,
          confianza: mejor.confianza,
        });
      }
    } catch (e) {
      errores.push(
        `${o.nombre}: ${e instanceof Error ? e.message : "la búsqueda falló"}`,
      );
    }
  }
  return { resultados, errores };
}

/* ── B2: entity resolution — SYNESIS adjudicates the ambiguous ────── */

export interface VeredictoAdjudicacion {
  mismo: boolean;
  confianza: number;
  razon: string;
}

/**
 * Ask the active SYNESIS model whether two entities name the same
 * real-world thing. Sends names, types, summaries and up to two cited
 * fragment excerpts per entity — nothing else leaves the device.
 */
export async function adjudicarPar(
  aId: string,
  bId: string,
): Promise<VeredictoAdjudicacion> {
  const { entidades, fragmentos } = useAutogenesStore.getState();
  const a = entidades.find((e) => e.id === aId);
  const b = entidades.find((e) => e.id === bId);
  if (!a || !b) throw new Error("Entidad no encontrada.");

  const perfil = (e: Entidad) => ({
    nombre: e.nombre,
    tipo: e.tipo,
    resumen: e.resumen,
    contextos: e.evidencia
      .map((id) => fragmentos.find((f) => f.id === id))
      .filter((f): f is Fragmento => Boolean(f))
      .slice(0, 2)
      .map((f) => f.texto.slice(0, 380)),
  });

  const { provider, claves } = usePreferenciasStore.getState();
  const res = await fetch("/api/autogenes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modo: "adjudicacion",
      provider,
      clave: claves[provider] || undefined,
      a: perfil(a),
      b: perfil(b),
    }),
  });
  const json: unknown = await res.json();
  if (!res.ok) {
    const err =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : "La adjudicación falló.";
    throw new Error(err);
  }
  return (json as { veredicto: VeredictoAdjudicacion }).veredicto;
}

/* ── B1: unified ontology — the graph IS the memory ──────────────── */

/**
 * Remember one entity (and its named relations) in the graph. This is
 * what SYNESIS's recordar_objeto executes now; relation targets that
 * don't exist yet dock as stubs so the thread is never lost. Duplicate
 * relations (same endpoints + type) collapse.
 */
export function recordarEnGrafo(entrada: {
  nombre: string;
  tipo: TipoEntidad;
  resumen?: string;
  campo?: Campo;
  origen: "operador" | "synesis";
  relaciones?: { con: string; tipo: string }[];
}): Entidad {
  const store = useAutogenesStore.getState();
  const entidad = store.upsertEntidad({
    nombre: entrada.nombre,
    tipo: entrada.tipo,
    resumen: entrada.resumen,
    campo: entrada.campo,
    origen: entrada.origen,
  });
  for (const r of entrada.relaciones ?? []) {
    const clave = r.con.trim().toLowerCase();
    if (clave.length === 0 || clave === entidad.nombre.toLowerCase()) continue;
    const estado = useAutogenesStore.getState();
    // Resolve by name OR alias — an entity reachable only through an
    // absorbed alias must not spawn a duplicate stub.
    const destino =
      estado.entidades.find(
        (e) =>
          e.nombre.trim().toLowerCase() === clave ||
          (e.alias ?? []).some((a) => a.trim().toLowerCase() === clave),
      ) ??
      estado.upsertEntidad({
        nombre: r.con.trim(),
        tipo: "otro",
        origen: entrada.origen,
      });
    const duplicada = useAutogenesStore
      .getState()
      .relaciones.some(
        (x) =>
          x.desdeId === entidad.id &&
          x.hastaId === destino.id &&
          x.tipo.toLowerCase() === r.tipo.toLowerCase(),
      );
    if (!duplicada) {
      estado.addRelacion({ desdeId: entidad.id, hastaId: destino.id, tipo: r.tipo });
    }
  }
  return entidad;
}

/**
 * One-time convergence: pour the legacy SYNESIS memory store into the
 * graph, then clear it. Idempotent — an empty legacy store is a no-op.
 */
export function migrarMemoriaAlGrafo(): number {
  const { objetos } = useMemoriaStore.getState();
  if (objetos.length === 0) return 0;
  // Two passes: entities first so relations resolve without stubs
  // shadowing real objects.
  for (const o of objetos) {
    recordarEnGrafo({
      nombre: o.nombre,
      tipo: o.tipo,
      resumen: o.resumen,
      origen: o.origen,
    });
  }
  for (const o of objetos) {
    recordarEnGrafo({
      nombre: o.nombre,
      tipo: o.tipo,
      resumen: o.resumen,
      origen: o.origen,
      relaciones: o.relaciones,
    });
  }
  useMemoriaStore.getState().clear();
  return objetos.length;
}

/**
 * Integrate the operator-approved subset into the graph: entities first
 * (upsert by name), then relations resolved name → id. The only door
 * from proposal to graph.
 */
export function integrarPropuesta(propuesta: PropuestaGrafo): {
  entidades: number;
  relaciones: number;
} {
  const store = useAutogenesStore.getState();
  for (const e of propuesta.entidades) {
    store.upsertEntidad({
      nombre: e.nombre,
      tipo: e.tipo,
      resumen: e.resumen,
      origen: "synesis",
      evidencia: e.evidencia,
    });
  }
  const porNombre = new Map(
    useAutogenesStore
      .getState()
      .entidades.map((e) => [e.nombre.trim().toLowerCase(), e.id] as const),
  );
  let relaciones = 0;
  for (const r of propuesta.relaciones) {
    const desdeId = porNombre.get(r.desde.trim().toLowerCase());
    const hastaId = porNombre.get(r.hasta.trim().toLowerCase());
    if (!desdeId || !hastaId || desdeId === hastaId) continue;
    store.addRelacion({
      desdeId,
      hastaId,
      tipo: r.tipo,
      peso: r.peso,
      evidencia: r.evidencia,
    });
    relaciones++;
  }
  return { entidades: propuesta.entidades.length, relaciones };
}
