"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { IntakeBay } from "@/features/ingesta/IntakeBay";
import Link from "next/link";
import { buscarEnUmwelt } from "@/lib/busqueda";
import { drenarCompartidos } from "@/lib/compartido";
import { CAMPOS_INFO, getCampoInfo, sugerirCampo } from "@/lib/campos";
import { arbolOntologia } from "@/lib/ontologia";
import { DendrogramaCanvas } from "@/features/ingesta/DendrogramaCanvas";
import { construirCorpus, recuperar } from "@/lib/recuperacion";
import { sugerirUnidades } from "@/microapps/registry";
import { EXTENSIONES_ESTRUCTURADAS } from "@/lib/pipelines/registry";
import {
  extraerGrafo,
  ingestarArchivoTexto,
  ingestarEstructurado,
  ingestarHojaCalculo,
  ingestarImagen,
  ingestarPdf,
  integrarPropuesta,
} from "@/services/autogenes";
import {
  construirBundleActual,
  downloadBundle,
  parseBundle,
} from "@/services/bundle";
import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";
import { useCanvasStore } from "@/store/canvas";
import { useDatosStore } from "@/store/datos";
import { usePreferenciasStore } from "@/store/preferencias";
import type { Campo } from "@/types/microapp";
import { cn } from "@/lib/cn";

const subscribeNoop = () => () => {};

const inputClass =
  "w-full border border-structural bg-inset px-3 py-2.5 font-mono text-small text-frame-1 placeholder:text-frame-3 focus:border-soft focus:outline-none";
const labelClass =
  "font-mono text-micro uppercase tracking-[0.2em] text-frame-3";

interface PendingCargo {
  contenido: string;
  etiqueta: string;
  campo: Campo | null;
}

function autoLabel(text: string, sourceName?: string): string {
  if (sourceName) return sourceName;
  const firstLine = text.trim().split("\n")[0] ?? "";
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}…` : firstLine;
}

/**
 * Ingesta — one universal mouth. Cargo enters the bay (drop/paste/type),
 * the system proposes a campo, the operator docks it with one tap.
 * UMWELT bundles auto-import. Manual entry survives, folded away.
 */
export function IngestaView() {
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const datos = useDatosStore((s) => s.datos);
  const addDatum = useDatosStore((s) => s.addDatum);
  const removeDatum = useDatosStore((s) => s.removeDatum);
  const mergeDatos = useDatosStore((s) => s.mergeDatos);
  const registerDato = useCanvasStore((s) => s.registerDato);
  const mergeOperations = useCanvasStore((s) => s.mergeOperations);
  const fire = useBurstStore((s) => s.fire);
  const markExport = usePreferenciasStore((s) => s.markExport);

  const artefactos = useAutogenesStore((s) => s.artefactos);
  const fragmentos = useAutogenesStore((s) => s.fragmentos);
  const entidades = useAutogenesStore((s) => s.entidades);
  const eventos = useAutogenesStore((s) => s.eventos);
  const mergeGrafo = useAutogenesStore((s) => s.mergeGrafo);

  const [pending, setPending] = useState<PendingCargo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [docLink, setDocLink] = useState(false);
  const [extrayendo, setExtrayendo] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [consulta, setConsulta] = useState("");

  // Cross-search: exact hits first (ids, aliases), then BM25-ranked
  // related passages — the retrieval router's two lanes, both cited.
  const hits = useMemo(
    () =>
      hydrated && consulta.trim().length >= 2
        ? buscarEnUmwelt(consulta, { datos, artefactos, fragmentos, entidades })
        : [],
    [hydrated, consulta, datos, artefactos, fragmentos, entidades],
  );
  const relacionados = useMemo(() => {
    if (!hydrated || consulta.trim().length < 2) return [];
    const exactos = new Set(hits.map((h) => h.id));
    return recuperar(
      consulta,
      construirCorpus(datos, artefactos, fragmentos, entidades, eventos),
      6,
    ).filter((r) => !exactos.has(r.id));
  }, [hydrated, consulta, hits, datos, artefactos, fragmentos, entidades, eventos]);

  // The Umwelt map as a hierarchy (O1): circular dendrogram, not a
  // second graph — QUALIA and /grafo already own the network view.
  const arbol = useMemo(
    () =>
      hydrated
        ? arbolOntologia(datos, artefactos, fragmentos, entidades)
        : null,
    [hydrated, datos, artefactos, fragmentos, entidades],
  );

  const detalleMapa = useMemo(() => {
    if (!sel) return null;
    if (sel.startsWith("dato-")) {
      const d = datos.find((x) => `dato-${x.id}` === sel);
      if (!d) return null;
      return {
        titulo: d.etiqueta,
        meta: `dato · ${getCampoInfo(d.campo)?.nombre ?? d.campo}`,
        texto: d.valor,
      };
    }
    if (sel.startsWith("campo-")) {
      const slug = sel.slice("campo-".length);
      const n = datos.filter((x) => x.campo === slug).length;
      return {
        titulo: getCampoInfo(slug)?.nombre ?? slug,
        meta: `campo · ${n} ${n === 1 ? "dato" : "datos"}`,
        texto: null,
      };
    }
    if (sel.startsWith("frag-")) {
      const f = fragmentos.find((x) => `frag-${x.id}` === sel);
      if (!f) return null;
      const a = artefactos.find((x) => x.id === f.artefactoId);
      return {
        titulo: f.pagina ? `Página ${f.pagina}` : "Fragmento",
        meta: `fragmento · ${a?.nombre ?? "fuente"}`,
        texto: f.texto.trim().length > 0 ? f.texto : "(sin texto extraíble)",
      };
    }
    const art = artefactos.find((a) => a.id === sel);
    if (art) {
      const n = fragmentos.filter((f) => f.artefactoId === art.id).length;
      return {
        titulo: art.nombre,
        meta: `fuente · ${n} ${n === 1 ? "fragmento" : "fragmentos"}`,
        texto: null,
      };
    }
    const ent = entidades.find((e) => e.id === sel);
    if (ent) {
      return {
        titulo: ent.nombre,
        meta: `${ent.tipo} · ${ent.origen}${ent.campo ? ` · ${getCampoInfo(ent.campo)?.nombre ?? ent.campo}` : ""}`,
        texto: ent.resumen ?? null,
      };
    }
    return null;
  }, [sel, datos, artefactos, fragmentos, entidades]);

  /**
   * Auto-extract entities into the UMWELT graph right after a source with
   * citable text docks — the operator shouldn't have to trigger it. The
   * server sanitizes against real fragment ids, so auto-integration stays
   * provenance-clean; everything is editable in /grafo.
   */
  async function autoExtraer(artefactoId: string, nombre: string) {
    setExtrayendo(true);
    try {
      const prop = await extraerGrafo(artefactoId);
      if (prop.entidades.length === 0) {
        setNotice(`${nombre} en el grafo. Sin entidades citables extraídas.`);
        return;
      }
      const { entidades: ne, relaciones: nr } = integrarPropuesta(prop);
      fire();
      setNotice(
        `${nombre}: ${ne} ${ne === 1 ? "entidad" : "entidades"}${nr > 0 ? ` y ${nr} ${nr === 1 ? "relación" : "relaciones"}` : ""} al grafo.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setNotice(
        /enlace|llave/i.test(msg)
          ? `${nombre} en el grafo. Configura tu llave en C2 para extraer entidades automáticamente.`
          : `${nombre} en el grafo. Extracción automática sin respuesta; reintenta en el grafo.`,
      );
    } finally {
      setExtrayendo(false);
    }
  }

  async function cargarDocumento(file: File) {
    setNotice(null);
    setDocLink(false);
    // Structured sources go through their deterministic pipeline (D4):
    // no model, full lineage, one undoable step in the bitácora. XLSX is
    // read on device and analyzed through the same table path as CSV.
    const esHoja = /\.(xlsx|xlsm)$/i.test(file.name);
    if (esHoja || EXTENSIONES_ESTRUCTURADAS.test(file.name)) {
      try {
        const r = esHoja
          ? await ingestarHojaCalculo(file)
          : await ingestarEstructurado(file);
        registerDato(
          `Fuente dockeada: ${r.artefacto.nombre}`,
          `Pipeline ${r.pipeline}: ${r.fragmentos} fragmentos, ${r.entidades} entidades, ${r.eventos} eventos.`,
        );
        fire();
        setDocLink(true);
        setNotice(
          `${r.pipeline}: ${r.fragmentos} ${r.fragmentos === 1 ? "fragmento" : "fragmentos"}${r.entidades > 0 ? `, ${r.entidades} ${r.entidades === 1 ? "entidad" : "entidades"}` : ""}${r.eventos > 0 ? `, ${r.eventos} ${r.eventos === 1 ? "evento" : "eventos"}` : ""} al grafo.`,
        );
      } catch (e) {
        setNotice(
          e instanceof Error
            ? e.message
            : "El pipeline no pudo leer el archivo.",
        );
      }
      return;
    }
    try {
      const nombre = file.name.toLowerCase();
      const esPdf = nombre.endsWith(".pdf");
      const esTexto = /\.(txt|md|markdown)$/i.test(nombre);
      const { artefacto, fragmentos: frags } = esPdf
        ? await ingestarPdf(file)
        : esTexto
          ? await ingestarArchivoTexto(file)
          : await ingestarImagen(file);
      registerDato(
        `Fuente dockeada: ${artefacto.nombre}`,
        `Artefacto ${artefacto.kind} en el grafo AUTOGENES. ${frags.length} ${frags.length === 1 ? "fragmento citable" : "fragmentos citables"}.`,
      );
      fire();
      setDocLink(true);
      // PDFs arrive with text fragments → extract entities automatically.
      // Captures have none yet (they need OCR first, done in /grafo).
      const citables = frags.filter((f) => f.texto.trim().length > 0).length;
      if (citables > 0) {
        setNotice(
          citables < frags.length
            ? `${artefacto.nombre}: ${citables} de ${frags.length} páginas con texto citable (las demás son imagen, sin texto extraíble). Extrayendo entidades…`
            : `${artefacto.nombre} en el grafo. Extrayendo entidades…`,
        );
        await autoExtraer(artefacto.id, artefacto.nombre);
      } else {
        setNotice(
          `${artefacto.nombre} en el grafo. Pásala por OCR en el grafo para volverla citable.`,
        );
      }
    } catch {
      setDocLink(false);
      setNotice("No se pudo leer el documento. Revisa que no esté dañado.");
    }
  }

  // manual entry (secondary path)
  const [mCampo, setMCampo] = useState<Campo>("fiscal");
  const [mEtiqueta, setMEtiqueta] = useState("");
  const [mValor, setMValor] = useState("");

  function handleIntake(text: string, sourceName?: string) {
    setNotice(null);
    setDocLink(false);
    const parsed = parseBundle(text);
    if (parsed.ok) {
      const nd = mergeDatos(parsed.bundle.datos);
      const no = mergeOperations(parsed.bundle.operations);
      const ng = parsed.bundle.grafo ? mergeGrafo(parsed.bundle.grafo) : 0;
      fire();
      setPending(null);
      setNotice(
        `Importación completa: ${nd} ${nd === 1 ? "dato nuevo" : "datos nuevos"}, ${no} ${no === 1 ? "operación nueva" : "operaciones nuevas"}${ng > 0 ? `, ${ng} ${ng === 1 ? "elemento nuevo" : "elementos nuevos"} del grafo` : ""}.`,
      );
      return;
    }
    setPending({
      contenido: text.trim(),
      etiqueta: autoLabel(text, sourceName),
      campo: sugerirCampo(text),
    });
  }

  // Share-target inbox: whatever the OS share sheet delivered while the
  // app was closed drains here, through the same intake routes.
  const drenado = useRef(false);
  useEffect(() => {
    if (drenado.current) return;
    drenado.current = true;
    void (async () => {
      const items = await drenarCompartidos();
      for (const it of items) {
        if (it.clase === "archivo") {
          await cargarDocumento(new File([it.blob], it.nombre, { type: it.tipo }));
        } else {
          handleIntake(it.texto, "compartido");
        }
      }
    })();
  });

  function dockPending() {
    if (!pending || !pending.campo || pending.etiqueta.trim().length === 0)
      return;
    const datum = addDatum(pending.campo, pending.etiqueta, pending.contenido);
    registerDato(
      `Dato ingresado: ${datum.etiqueta}`,
      `Campo ${getCampoInfo(datum.campo)?.nombre ?? datum.campo}. Cargado por el operador vía carga de datos.`,
    );
    fire();
    setPending(null);
    setNotice(null);
  }

  function saveManual() {
    if (mEtiqueta.trim().length === 0 || mValor.trim().length === 0) return;
    const datum = addDatum(mCampo, mEtiqueta, mValor);
    registerDato(
      `Dato ingresado: ${datum.etiqueta}`,
      `Campo ${getCampoInfo(mCampo)?.nombre ?? mCampo}. Registro manual del operador.`,
    );
    fire();
    setMEtiqueta("");
    setMValor("");
  }

  const camposConDatos = CAMPOS_INFO.filter((c) =>
    datos.some((d) => d.campo === c.slug),
  );

  return (
    <section className="flex flex-1 flex-col gap-4 py-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-sub-head font-bold uppercase tracking-[0.3em] text-frame-1">
          Ingesta
        </h1>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {hydrated ? datos.length : 0}{" "}
          {hydrated && datos.length === 1 ? "dato" : "datos"}
        </span>
      </header>

      {pending ? (
        /* Docking review — one confirmation, not a form */
        <div className="hud hud-live flex flex-col gap-3 p-3">
          <p className="font-display text-micro font-bold uppercase tracking-[0.35em] text-coral-text">
            Carga recibida
          </p>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap border border-structural bg-inset px-3 py-2 font-mono text-micro leading-relaxed text-frame-2">
            {pending.contenido}
          </pre>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dock-etiqueta" className={labelClass}>
              Etiqueta
            </label>
            <input
              id="dock-etiqueta"
              type="text"
              value={pending.etiqueta}
              onChange={(e) =>
                setPending({ ...pending, etiqueta: e.target.value })
              }
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>
              Campo{" "}
              {pending.campo ? (
                <span className="text-coral-text">· sugerido</span>
              ) : (
                "· elige uno"
              )}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CAMPOS_INFO.map((c) => {
                const selected = pending.campo === c.slug;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setPending({ ...pending, campo: c.slug })}
                    className={cn(
                      "border px-3 py-2 font-display text-micro font-bold uppercase tracking-[0.25em]",
                      selected
                        ? "border-coral text-coral-text"
                        : "border-structural text-frame-2",
                    )}
                  >
                    {c.nombre}
                  </button>
                );
              })}
            </div>
          </div>
          {pending.campo && sugerirUnidades(pending.campo).length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className={labelClass}>
                Unidades sugeridas{" "}
                <span className="text-coral-text">
                  · pueden ejecutar con esta carga
                </span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {sugerirUnidades(pending.campo).map((u) => (
                  <Link
                    key={u.id}
                    href={`/u/${u.id}`}
                    className="hud-btn border border-coral px-3 py-2 font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
                  >
                    {u.nombre}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="border border-structural px-4 py-2 font-mono text-micro uppercase tracking-[0.2em] text-frame-3"
              style={{ minHeight: "var(--touch-target)" }}
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={dockPending}
              disabled={!pending.campo || pending.etiqueta.trim().length === 0}
              className={cn(
                "hud-btn px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em]",
                pending.campo && pending.etiqueta.trim().length > 0
                  ? "bg-coral text-void"
                  : "border border-structural text-frame-3",
              )}
              style={{ minHeight: "var(--touch-target)" }}
            >
              Dockear dato
            </button>
          </div>
        </div>
      ) : (
        <IntakeBay
          onIntake={handleIntake}
          onFile={(file) => void cargarDocumento(file)}
        />
      )}

      {notice ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 border bg-inset px-3 py-2",
            extrayendo ? "hud-live border-coral" : "border-structural",
          )}
        >
          <p className="font-mono text-micro tracking-wide text-frame-2">
            {notice}
          </p>
          {docLink ? (
            <Link
              href="/grafo"
              className="shrink-0 font-mono text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
            >
              Abrir →
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Cross-search — always cited */}
      {hydrated && arbol !== null ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="busqueda-umwelt" className="sr-only">
            Buscar en tu Umwelt
          </label>
          <input
            id="busqueda-umwelt"
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="¿Dónde aparece…?"
            className={inputClass}
            style={{ minHeight: "var(--touch-target)" }}
          />
          {consulta.trim().length >= 2 ? (
            hits.length === 0 ? (
              <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
                Sin apariciones de “{consulta.trim()}” en tu Umwelt.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {hits.map((h) => (
                  <li
                    key={`${h.clase}-${h.id}`}
                    className="border border-structural bg-contain px-3 py-2"
                  >
                    {h.clase === "entidad" ? (
                      <button
                        type="button"
                        onClick={() => setSel(h.id)}
                        className="w-full text-left"
                      >
                        <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text">
                          {h.titulo}
                        </p>
                        <p className="mt-0.5 font-mono text-micro tracking-[0.12em] text-frame-3">
                          {h.detalle} · tócala para verla en el mapa
                        </p>
                      </button>
                    ) : (
                      <>
                        <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                          {h.titulo}
                          <span className="ml-2 font-mono font-normal tracking-[0.15em] text-frame-3">
                            {h.clase}
                          </span>
                        </p>
                        <p className="mt-0.5 text-caption leading-relaxed text-frame-2">
                          {h.clase === "fragmento" ? (
                            <span className="mr-1 font-mono text-micro tracking-[0.12em] text-frame-3">
                              [{h.cita}]
                            </span>
                          ) : null}
                          {h.detalle}
                        </p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {consulta.trim().length >= 2 && relacionados.length > 0 ? (
            <>
              <p className="font-mono text-micro uppercase tracking-[0.25em] text-frame-3">
                Relacionados
              </p>
              <ul className="flex flex-col gap-1.5">
                {relacionados.map((r) => (
                  <li
                    key={`rel-${r.clase}-${r.id}`}
                    className="border border-structural bg-contain px-3 py-2"
                  >
                    <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                      {r.titulo}
                      <span className="ml-2 font-mono font-normal tracking-[0.15em] text-frame-3">
                        {r.clase}
                      </span>
                    </p>
                    <p className="mt-0.5 text-caption leading-relaxed text-frame-2">
                      <span className="mr-1 font-mono text-micro tracking-[0.12em] text-frame-3">
                        [{r.cita}]
                      </span>
                      {r.extracto}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {/* The Umwelt map — the ontology as the hierarchy it IS */}
      {arbol !== null ? (
        // Desktop: canvas left, inspector as a right rail (same split as /grafo).
        <div className="hud flex flex-col gap-2 p-3 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-x-4">
          <div className="flex items-baseline justify-between gap-2 lg:col-span-2">
            <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
              Mapa del Umwelt
            </h2>
            <Link
              href="/grafo"
              className="shrink-0 font-mono text-micro uppercase tracking-[0.2em] text-coral-text"
            >
              Abrir grafo →
            </Link>
          </div>
          <p className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3 lg:col-span-2">
            centro → campos y fuentes → datos, fragmentos y entidades
          </p>
          <div className="h-80 w-full lg:h-[30rem]">
            <DendrogramaCanvas
              raiz={arbol}
              seleccionado={sel}
              onSelect={setSel}
            />
          </div>
          {detalleMapa ? (
            <div className="flex flex-col gap-1 border-t border-structural pt-2">
              <p className="font-display text-micro font-bold uppercase tracking-[0.25em] text-coral-text">
                {detalleMapa.titulo}
              </p>
              <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
                {detalleMapa.meta}
              </p>
              {detalleMapa.texto ? (
                <p className="tnum border-l border-structural pl-2 font-mono text-small leading-relaxed text-frame-1">
                  {detalleMapa.texto.length > 200
                    ? `${detalleMapa.texto.slice(0, 200)}…`
                    : detalleMapa.texto}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
              Tu mundo operativo en un grafo. Toca un nodo para inspeccionarlo.
            </p>
          )}
        </div>
      ) : null}

      {/* Portability */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            downloadBundle(construirBundleActual());
            markExport();
          }}
          className="flex-1 border border-structural px-3 py-2 font-mono text-micro uppercase tracking-[0.2em] text-frame-2"
          style={{ minHeight: "var(--touch-target)" }}
        >
          Exportar JSON
        </button>
        <p className="flex-1 text-center font-mono text-micro uppercase tracking-[0.15em] text-frame-3">
          Importa soltando el JSON en la carga
        </p>
      </div>

      {/* Manual entry — secondary, folded */}
      <details className="border border-structural bg-contain">
        <summary
          className="cursor-pointer list-none px-3 py-3 font-mono text-micro uppercase tracking-[0.25em] text-frame-3"
          style={{ minHeight: "var(--touch-target)" }}
        >
          ▸ Registro manual
        </summary>
        <div className="flex flex-col gap-3 border-t border-structural p-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="m-campo" className={labelClass}>
              Campo
            </label>
            <select
              id="m-campo"
              value={mCampo}
              onChange={(e) => setMCampo(e.target.value as Campo)}
              className={inputClass}
              style={{ minHeight: "var(--touch-target)" }}
            >
              {CAMPOS_INFO.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.num} · {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="m-etiqueta" className={labelClass}>
              Etiqueta
            </label>
            <input
              id="m-etiqueta"
              type="text"
              value={mEtiqueta}
              onChange={(e) => setMEtiqueta(e.target.value)}
              placeholder="RFC, No. de servicio CFE, póliza…"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="m-valor" className={labelClass}>
              Valor
            </label>
            <textarea
              id="m-valor"
              value={mValor}
              onChange={(e) => setMValor(e.target.value)}
              rows={2}
              placeholder="El dato tal como es"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={saveManual}
            disabled={
              mEtiqueta.trim().length === 0 || mValor.trim().length === 0
            }
            className={cn(
              "px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em]",
              mEtiqueta.trim().length > 0 && mValor.trim().length > 0
                ? "bg-coral text-void"
                : "border border-structural text-frame-3",
            )}
            style={{ minHeight: "var(--touch-target)" }}
          >
            Guardar dato
          </button>
        </div>
      </details>

      {/* Data by campo */}
      {hydrated && camposConDatos.length > 0 ? (
        <div className="flex flex-col gap-4">
          {camposConDatos.map((c) => (
            <div key={c.slug}>
              <h2 className="mb-2 font-display text-caption font-bold uppercase tracking-[0.35em] text-frame-2">
                <span className="text-coral-text">{c.num}</span> · {c.nombre}
              </h2>
              <ul className="flex flex-col gap-1.5">
                {datos
                  .filter((d) => d.campo === c.slug)
                  .map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 border border-structural bg-contain px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-micro uppercase tracking-[0.15em] text-frame-3">
                          {d.etiqueta}
                        </p>
                        <p className="tnum truncate font-mono text-small text-frame-1">
                          {d.valor}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDatum(d.id)}
                        aria-label={`Eliminar dato ${d.etiqueta}`}
                        className="shrink-0 border border-structural px-2.5 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                      >
                        Eliminar
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
