"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AccionesPanel } from "@/features/autogenes/AccionesPanel";
import { BitacoraPanel } from "@/features/autogenes/BitacoraPanel";
import { CalidadPanel } from "@/features/autogenes/CalidadPanel";
import { ConexionesPanel } from "@/features/autogenes/ConexionesPanel";
import { CronologiaPanel } from "@/features/autogenes/CronologiaPanel";
import { EnriquecimientoPanel } from "@/features/autogenes/EnriquecimientoPanel";
import { ExploradorPanel } from "@/features/autogenes/ExploradorPanel";
import { FlujoSustrato } from "@/features/autogenes/FlujoSustrato";
import { OntologiaPanel } from "@/features/autogenes/OntologiaPanel";
import { ProductosPanel } from "@/features/autogenes/ProductosPanel";
import { TerritorioPanel } from "@/features/autogenes/TerritorioPanel";
import { GrafoCanvas } from "@/components/grafo/GrafoCanvas";
import { getCampoInfo } from "@/lib/campos";
import { construirConstelaciones } from "@/lib/clusters";
import { construirOntologia } from "@/lib/ontologia";
import {
  extraerGrafo,
  ingestarImagen,
  ingestarPdf,
  integrarPropuesta,
  ocrPaginasPdf,
  transcribirImagen,
} from "@/services/autogenes";
import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";
import { useDatosStore } from "@/store/datos";
import { PROVIDER_LABEL, usePreferenciasStore } from "@/store/preferencias";
import type { PropuestaGrafo } from "@/types/autogenes";
import type { RutaOcr } from "@/lib/ocr";
import { cn } from "@/lib/cn";

const MIMES_IMAGEN = ["image/png", "image/jpeg", "image/webp"];

const subscribeNoop = () => () => {};

/**
 * AUTOGENES — the knowledge substrate cockpit. Read PDFs and captures,
 * extract cited entities, geolocate, build a timeline: the whole Palantir
 * pipeline, integrated into the operator's ONE Umwelt ontology (the full
 * graph of their world). This is UMWELT's differentiator; study lives in
 * its own microapp on top of this substrate.
 */
export function AutogenesGrafo() {
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const datos = useDatosStore((s) => s.datos);
  const artefactos = useAutogenesStore((s) => s.artefactos);
  const fragmentos = useAutogenesStore((s) => s.fragmentos);
  const entidades = useAutogenesStore((s) => s.entidades);
  const relaciones = useAutogenesStore((s) => s.relaciones);
  const productos = useAutogenesStore((s) => s.productos);
  const removeArtefacto = useAutogenesStore((s) => s.removeArtefacto);

  const fire = useBurstStore((s) => s.fire);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [constelacion, setConstelacion] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [extrayendo, setExtrayendo] = useState<string | null>(null);
  const [transcribiendo, setTranscribiendo] = useState<string | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [confirmaVision, setConfirmaVision] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState<string | null>(null);
  const [progresoOcr, setProgresoOcr] = useState("");

  /** Q1: OCR the scanned pages of a PDF, entirely on device. */
  async function ocrEscaneadas(artefactoId: string) {
    setEscaneando(artefactoId);
    setError(null);
    try {
      const llenadas = await ocrPaginasPdf(artefactoId, (i, total) =>
        setProgresoOcr(`${i}/${total}`),
      );
      setError(
        llenadas > 0
          ? `${llenadas} ${llenadas === 1 ? "página vuelta citable" : "páginas vueltas citables"} por OCR local. Extrae entidades cuando quieras.`
          : "El OCR no encontró texto legible en las páginas escaneadas.",
      );
      if (llenadas > 0) fire();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "El OCR local falló. Reintenta.",
      );
    } finally {
      setEscaneando(null);
      setProgresoOcr("");
    }
  }
  const [propuesta, setPropuesta] = useState<PropuestaGrafo | null>(null);
  const [marcaEnt, setMarcaEnt] = useState<boolean[]>([]);
  const [marcaRel, setMarcaRel] = useState<boolean[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const provider = usePreferenciasStore((s) => s.provider);

  async function transcribir(artefactoId: string, ruta: RutaOcr) {
    setConfirmaVision(null);
    setTranscribiendo(artefactoId);
    setProgreso(0);
    setError(null);
    try {
      await transcribirImagen(artefactoId, ruta, setProgreso);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "La transcripción falló. Reintenta.",
      );
    } finally {
      setTranscribiendo(null);
    }
  }

  async function extraer(artefactoId: string) {
    setExtrayendo(artefactoId);
    setError(null);
    try {
      const p = await extraerGrafo(artefactoId);
      if (p.entidades.length === 0) {
        setError(
          "SYNESIS no encontró entidades citables en este documento.",
        );
      } else {
        setPropuesta(p);
        setMarcaEnt(p.entidades.map(() => true));
        setMarcaRel(p.relaciones.map(() => true));
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "La extracción falló. Reintenta.",
      );
    } finally {
      setExtrayendo(null);
    }
  }

  function integrar() {
    if (!propuesta) return;
    const aprobadas: PropuestaGrafo = {
      entidades: propuesta.entidades.filter((_, i) => marcaEnt[i]),
      relaciones: propuesta.relaciones.filter((_, i) => {
        if (!marcaRel[i]) return false;
        // A relation only survives if its endpoints are approved or
        // already live in the graph.
        const r = propuesta.relaciones[i];
        const aprobadoONuevo = (nombre: string) =>
          propuesta.entidades.some(
            (e, j) =>
              marcaEnt[j] &&
              e.nombre.toLowerCase() === nombre.trim().toLowerCase(),
          ) ||
          entidades.some(
            (e) => e.nombre.trim().toLowerCase() === nombre.trim().toLowerCase(),
          );
        return aprobadoONuevo(r.desde) && aprobadoONuevo(r.hasta);
      }),
    };
    integrarPropuesta(aprobadas);
    setPropuesta(null);
    fire();
  }

  // The full UMWELT ontology — nucleus, campos, datos, sources,
  // fragments and the extracted entity layer, all in one graph.
  const grafo = useMemo(
    () =>
      hydrated
        ? construirOntologia(
            datos,
            artefactos,
            fragmentos,
            entidades,
            relaciones,
            productos,
          )
        : { nodos: [], enlaces: [] },
    [hydrated, datos, artefactos, fragmentos, entidades, relaciones, productos],
  );

  // Constelaciones: on-device community detection, no model involved.
  const constelaciones = useMemo(
    () => (hydrated ? construirConstelaciones(entidades, relaciones) : []),
    [hydrated, entidades, relaciones],
  );
  const focoConstelacion = useMemo(() => {
    const c = constelaciones.find((x) => x.id === constelacion);
    return c ? c.miembros : null;
  }, [constelaciones, constelacion]);

  // Provenance drill-down for the selected node — covers every kind of
  // the unified ontology (nucleus, campo, dato, fragment, source, entity).
  const detalle = useMemo(() => {
    if (!sel) return null;
    if (sel === "nucleo-operador") {
      return {
        titulo: "Operador",
        meta: `${datos.length} datos · ${artefactos.length} fuentes · ${entidades.length} entidades`,
        citas: [],
      };
    }
    if (sel.startsWith("producto-")) {
      const p = productos.find((x) => `producto-${x.id}` === sel);
      if (!p) return null;
      return {
        titulo: p.titulo,
        meta: `producto · ${p.clase} · ${p.unidad} · ${new Date(p.createdAt).toLocaleDateString("es-MX")} · ${p.evidencia.length} evidencias`,
        citas: [],
      };
    }
    if (sel.startsWith("campo-")) {
      const slug = sel.slice("campo-".length);
      const n = datos.filter((d) => d.campo === slug).length;
      return {
        titulo: getCampoInfo(slug)?.nombre ?? slug,
        meta: `campo · ${n} ${n === 1 ? "dato" : "datos"}`,
        citas: [],
      };
    }
    if (sel.startsWith("dato-")) {
      const d = datos.find((x) => `dato-${x.id}` === sel);
      if (d) {
        return {
          titulo: d.etiqueta,
          meta: `dato · ${getCampoInfo(d.campo)?.nombre ?? d.campo}`,
          citas: [{ fuente: "operador", texto: d.valor }],
        };
      }
    }
    if (sel.startsWith("frag-")) {
      const f = fragmentos.find((x) => `frag-${x.id}` === sel);
      if (f) {
        const a = artefactos.find((x) => x.id === f.artefactoId);
        return {
          titulo: f.pagina ? `Página ${f.pagina}` : "Fragmento",
          meta: `fragmento · ${a?.nombre ?? "fuente"}`,
          citas: [{ fuente: a?.nombre ?? "fuente", texto: f.texto }],
        };
      }
    }
    const art = artefactos.find((a) => a.id === sel);
    if (art) {
      const frags = fragmentos.filter((f) => f.artefactoId === art.id);
      return {
        titulo: art.nombre,
        meta: `${art.kind === "imagen" ? "captura" : `documento · ${art.paginas ?? frags.length} pág`} · ${frags.length} ${frags.length === 1 ? "fragmento" : "fragmentos"}`,
        citas: frags.slice(0, 2).map((f) => ({
          fuente: art.kind === "imagen" ? "ocr" : `pág ${f.pagina ?? "—"}`,
          texto: f.texto,
        })),
      };
    }
    const ent = entidades.find((e) => e.id === sel);
    if (ent) {
      const citas = ent.evidencia
        .map((fragId) => fragmentos.find((f) => f.id === fragId))
        .filter((f): f is NonNullable<typeof f> => Boolean(f))
        .slice(0, 3)
        .map((f) => {
          const a = artefactos.find((x) => x.id === f.artefactoId);
          return {
            fuente: `${a?.nombre ?? "fuente"} · pág ${f.pagina ?? "—"}`,
            texto: f.texto,
          };
        });
      return {
        titulo: ent.nombre,
        meta: `${ent.tipo} · ${ent.origen}${ent.resumen ? ` · ${ent.resumen}` : ""}`,
        citas,
      };
    }
    return null;
  }, [sel, datos, artefactos, fragmentos, entidades, productos]);

  async function cargar(file: File) {
    const esPdf = file.name.toLowerCase().endsWith(".pdf");
    const esImagen = MIMES_IMAGEN.includes(file.type);
    if (!esPdf && !esImagen) {
      setError("Formato no soportado. Suelta un PDF o una captura PNG/JPG/WEBP.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (esImagen) {
        await ingestarImagen(file);
        return;
      }
      const { artefacto, fragmentos: frags } = await ingestarPdf(file);
      // A source with citable text extracts its entities automatically —
      // the proposal opens for review, no manual "Extraer" needed.
      if (frags.some((f) => f.texto.trim().length > 0)) {
        setBusy(false);
        await extraer(artefacto.id);
      }
    } catch {
      setError(
        esPdf
          ? "No se pudo leer el PDF. Revisa que no esté protegido."
          : "No se pudo guardar la captura. Reintenta.",
      );
    } finally {
      setBusy(false);
    }
  }

  const lista = hydrated ? artefactos : [];

  return (
    <section className="flex flex-1 flex-col gap-5 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-head-sm font-bold uppercase tracking-[0.2em] text-frame-1">
          Autogenes
        </h1>
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
          Grafo de conocimiento · Umwelt
        </p>
        <p className="max-w-prose text-caption leading-relaxed text-frame-3">
          Lee documentos y capturas, extrae entidades citadas, geolocaliza y
          ordena en el tiempo: toda la ontología de tu mundo en un grafo, con
          procedencia. Tus fuentes viven en este dispositivo.
        </p>
      </header>

      <div
        role="button"
        tabIndex={0}
        aria-label="Cargar PDF o captura al grafo"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void cargar(file);
        }}
        className={cn(
          "hud flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 px-6 py-8 text-center outline-none",
          (dragging || busy) && "hud-live border-coral",
        )}
      >
        <p className="font-display text-small font-bold uppercase tracking-[0.35em] text-frame-1">
          {busy ? "Leyendo…" : "Suelta un PDF o captura"}
        </p>
        <p className="max-w-64 text-caption leading-relaxed text-frame-3">
          Cada página o captura entra como fragmento con procedencia. Tus
          fuentes viven en este dispositivo.
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Elegir PDF o captura"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void cargar(file);
          e.target.value = "";
        }}
      />

      {error ? (
        <p className="border border-structural bg-contain px-3 py-2 font-mono text-micro tracking-wide text-frame-2">
          {error}
        </p>
      ) : null}

      {propuesta ? (
        <div className="hud hud-live flex flex-col gap-3 p-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-coral-text">
              Propuesta de Synesis
            </h2>
            <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
              {propuesta.entidades.length} ent ·{" "}
              {propuesta.relaciones.length} rel
            </span>
          </div>
          <p className="text-caption leading-relaxed text-frame-3">
            Nada entra al grafo sin tu aprobación. Cada elemento cita sus
            fragmentos fuente.
          </p>

          <ul className="flex flex-col gap-1">
            {propuesta.entidades.map((e, i) => (
              <li key={`${e.nombre}-${i}`}>
                <label className="flex cursor-pointer items-start gap-2.5 border border-structural bg-contain px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={marcaEnt[i] ?? false}
                    onChange={() =>
                      setMarcaEnt((m) => m.map((v, j) => (j === i ? !v : v)))
                    }
                    className="mt-0.5 accent-[var(--coral)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                      {e.nombre}
                    </span>
                    <span className="ml-2 font-mono text-micro tracking-[0.12em] text-frame-3">
                      {e.tipo} · {e.evidencia.length}{" "}
                      {e.evidencia.length === 1 ? "cita" : "citas"}
                    </span>
                    {e.resumen ? (
                      <span className="mt-0.5 block text-caption leading-relaxed text-frame-2">
                        {e.resumen}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {propuesta.relaciones.length > 0 ? (
            <ul className="flex flex-col gap-1 border-t border-structural pt-2">
              {propuesta.relaciones.map((r, i) => (
                <li key={`${r.desde}-${r.hasta}-${i}`}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={marcaRel[i] ?? false}
                      onChange={() =>
                        setMarcaRel((m) =>
                          m.map((v, j) => (j === i ? !v : v)),
                        )
                      }
                      className="accent-[var(--coral)]"
                    />
                    <span className="tnum min-w-0 flex-1 font-mono text-micro tracking-[0.12em] text-frame-2">
                      {r.desde}{" "}
                      <span className="text-coral-text">—{r.tipo}→</span>{" "}
                      {r.hasta}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPropuesta(null)}
              className="border border-structural px-4 py-2 font-mono text-micro uppercase tracking-[0.2em] text-frame-3"
              style={{ minHeight: "var(--touch-target)" }}
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={integrar}
              disabled={!marcaEnt.some(Boolean)}
              className={cn(
                "hud-btn px-4 py-2 font-display text-micro font-bold uppercase tracking-[0.25em]",
                marcaEnt.some(Boolean)
                  ? "bg-coral text-void"
                  : "border border-structural text-frame-3",
              )}
              style={{ minHeight: "var(--touch-target)" }}
            >
              Integrar al grafo
            </button>
          </div>
        </div>
      ) : null}

      {grafo.nodos.length > 0 ? (
        // Desktop: the investigation split — canvas fills the left pane,
        // constellations + provenance inspector pin as a right rail.
        <div className="hud flex flex-col gap-2 p-3 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-x-4">
          <div className="flex items-baseline justify-between lg:col-span-2">
            <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
              Grafo
            </h2>
            <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
              {grafo.nodos.length} nodos · {grafo.enlaces.length} enlaces
            </span>
          </div>
          <div className="h-96 w-full lg:h-[34rem]">
            <GrafoCanvas
              nodos={grafo.nodos}
              enlaces={grafo.enlaces}
              seleccionado={sel}
              onSelect={setSel}
              resaltados={focoConstelacion}
            />
          </div>
          <div className="flex min-h-0 flex-col gap-2 lg:max-h-[34rem] lg:overflow-y-auto">
          {constelaciones.length > 0 ? (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-x-visible lg:px-0">
              {constelaciones.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setConstelacion(constelacion === c.id ? null : c.id)
                  }
                  aria-pressed={constelacion === c.id}
                  className={cn(
                    "shrink-0 border px-2.5 py-1.5 font-mono text-micro uppercase tracking-[0.15em]",
                    constelacion === c.id
                      ? "hud-live border-coral text-coral-text"
                      : "border-structural text-frame-3",
                  )}
                >
                  {c.etiqueta.length > 16
                    ? `${c.etiqueta.slice(0, 15)}…`
                    : c.etiqueta}{" "}
                  · {c.miembros.length}
                </button>
              ))}
            </div>
          ) : null}
          {detalle ? (
            <div className="flex flex-col gap-1.5 border-t border-structural pt-2">
              <p className="font-display text-micro font-bold uppercase tracking-[0.25em] text-coral-text">
                {detalle.titulo}
              </p>
              <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
                {detalle.meta}
              </p>
              {detalle.citas.map((c, i) => (
                <p
                  key={i}
                  className="border-l border-structural pl-2 text-caption leading-relaxed text-frame-2"
                >
                  <span className="font-mono text-micro tracking-[0.12em] text-frame-3">
                    [{c.fuente}]{" "}
                  </span>
                  {c.texto.length > 0
                    ? c.texto.slice(0, 160) + (c.texto.length > 160 ? "…" : "")
                    : "(sin texto extraíble)"}
                </p>
              ))}
            </div>
          ) : (
            <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
              Arrastra los nodos. Toca uno para interrogar su procedencia.
            </p>
          )}
          </div>
        </div>
      ) : null}

      {hydrated ? <FlujoSustrato /> : null}

      {hydrated ? <ConexionesPanel /> : null}

      {hydrated ? <EnriquecimientoPanel /> : null}

      {hydrated ? <CalidadPanel /> : null}

      {hydrated ? <ExploradorPanel /> : null}

      {hydrated ? <OntologiaPanel /> : null}

      {hydrated ? <AccionesPanel /> : null}

      {hydrated ? <ProductosPanel /> : null}

      {hydrated ? <BitacoraPanel /> : null}

      {hydrated ? <TerritorioPanel /> : null}

      {hydrated ? <CronologiaPanel /> : null}

      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Artefactos
        </h2>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {lista.length} · {hydrated ? fragmentos.length : 0} fragmentos
        </span>
      </div>

      {lista.length === 0 ? (
        <p className="text-caption leading-relaxed text-frame-3">
          Aún no hay fuentes. Suelta un PDF o una captura para sembrar el
          grafo.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lista.map((a) => {
            const frags = fragmentos.filter((f) => f.artefactoId === a.id);
            const open = abierto === a.id;
            const sinTexto = a.kind === "imagen" && frags.length === 0;
            const ocupado = extrayendo !== null || transcribiendo !== null;
            return (
              <li
                key={a.id}
                className="border border-structural bg-contain px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => setAbierto(open ? null : a.id)}
                  aria-expanded={open}
                  className="w-full text-left"
                >
                  <p className="truncate font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                    {a.nombre}
                  </p>
                  <p className="tnum mt-0.5 font-mono text-micro tracking-[0.15em] text-frame-3">
                    {a.kind === "imagen"
                      ? `captura · ${
                          sinTexto
                            ? "sin texto aún"
                            : `${frags.length} ${frags.length === 1 ? "fragmento" : "fragmentos"}`
                        }`
                      : `${a.paginas ?? frags.length} pág · ${
                          frags.filter((f) => f.texto.trim().length > 0)
                            .length
                        } con texto citable`}
                  </p>
                </button>
                {/* Actions on their own row so nothing crowds on a phone. */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {sinTexto ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void transcribir(a.id, "local")}
                        disabled={ocupado}
                        className={cn(
                          "hud-btn border px-3 py-1.5 font-mono text-micro font-bold uppercase tracking-[0.15em]",
                          !ocupado || transcribiendo === a.id
                            ? "border-coral text-coral-text"
                            : "border-structural text-frame-3",
                        )}
                        style={{ minHeight: "var(--touch-target)" }}
                      >
                        {transcribiendo === a.id
                          ? `OCR ${Math.round(progreso * 100)}%`
                          : "OCR"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmaVision(
                            confirmaVision === a.id ? null : a.id,
                          )
                        }
                        disabled={ocupado}
                        className="border border-structural px-3 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                        style={{ minHeight: "var(--touch-target)" }}
                      >
                        Visión
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void extraer(a.id)}
                        disabled={ocupado}
                        className={cn(
                          "hud-btn border px-3 py-1.5 font-mono text-micro font-bold uppercase tracking-[0.15em]",
                          !ocupado || extrayendo === a.id
                            ? "border-coral text-coral-text"
                            : "border-structural text-frame-3",
                        )}
                        style={{ minHeight: "var(--touch-target)" }}
                      >
                        {extrayendo === a.id
                          ? "Extrayendo…"
                          : "Extraer entidades"}
                      </button>
                      {a.kind === "pdf" &&
                      frags.some((f) => f.texto.trim().length === 0) ? (
                        <button
                          type="button"
                          onClick={() => void ocrEscaneadas(a.id)}
                          disabled={ocupado}
                          className="border border-structural px-3 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-2"
                          style={{ minHeight: "var(--touch-target)" }}
                        >
                          {escaneando === a.id
                            ? `OCR pág ${progresoOcr}`
                            : `OCR ${frags.filter((f) => f.texto.trim().length === 0).length} págs`}
                        </button>
                      ) : null}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeArtefacto(a.id)}
                    aria-label={`Quitar ${a.nombre}`}
                    className="ml-auto border border-structural px-3 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                    style={{ minHeight: "var(--touch-target)" }}
                  >
                    Quitar
                  </button>
                </div>
                {confirmaVision === a.id ? (
                  <div className="mt-2 flex flex-col gap-2 border-t border-structural pt-2">
                    <p className="text-caption leading-relaxed text-frame-2">
                      La ruta Visión envía una copia reducida de esta captura a{" "}
                      <span className="text-coral-text">
                        {PROVIDER_LABEL[provider]}
                      </span>{" "}
                      para transcribirla. La imagen sale de este dispositivo.
                      La ruta OCR trabaja aquí mismo, sin enviar nada.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmaVision(null)}
                        className="border border-structural px-3 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void transcribir(a.id, "vision")}
                        className="hud-btn border border-coral px-3 py-1.5 font-mono text-micro font-bold uppercase tracking-[0.15em] text-coral-text"
                      >
                        Enviar imagen
                      </button>
                    </div>
                  </div>
                ) : null}
                {open ? (
                  <ol className="mt-2 flex flex-col gap-1.5 border-t border-structural pt-2">
                    {frags.map((f) => (
                      <li key={f.id} className="flex gap-2">
                        <span className="tnum shrink-0 font-mono text-micro text-coral-text">
                          {f.pagina ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 text-caption leading-relaxed text-frame-2">
                          {f.texto.length > 0
                            ? f.texto.slice(0, 240) +
                              (f.texto.length > 240 ? "…" : "")
                            : "(página sin texto extraíble — imagen o escaneo)"}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
