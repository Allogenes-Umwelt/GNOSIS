"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useQualiaStore } from "@/store/qualia";
import { useAutogenesStore } from "@/store/autogenes";
import {
  detectarComunidades,
  escaleraRenorm,
  ordenarPorComunidad,
  resumenRed,
  type RedSig,
} from "@/capacidades/signature";
import {
  aplicarFusiones,
  combinarRedes,
  entradasDeProductos,
  redDesdeAutogenes,
  redDesdeFuentes,
  redDesdeLotes,
  seriesDeConectores,
  type ParteFuente,
} from "@/microapps/signature/fuentes";
import { FusionesPanel } from "@/microapps/signature/FusionesPanel";
import { construirLectura } from "@/microapps/signature/lectura";
import { construirPropuestaPlan } from "@/microapps/signature/plan";
import { proponerPlan } from "@/services/planes";
import { parsearEntradas } from "@/microapps/signature/ingesta";
import { entradasDeArchivo } from "@/microapps/signature/archivos";
import { ConectoresQualia } from "@/microapps/signature/ConectoresQualia";
import { MaquinaC2 } from "@/microapps/signature/MaquinaC2";
import { LienzoRed } from "@/microapps/signature/LienzoRed";
import { LienzoCuerdas } from "@/microapps/signature/LienzoCuerdas";
import { LienzoEspectral } from "@/microapps/signature/LienzoEspectral";
import type { EventoTemporal } from "@/microapps/signature/temporal";

type Codificacion = "red" | "cuerdas" | "espectro";

// M5: the machine is the surface; these three survive under the hood as
// drill-down instruments. Every other lens's engine lives on in
// capacidades, consumed by the machine's windows.
const VISTAS: { id: Codificacion; nombre: string }[] = [
  { id: "red", nombre: "Red" },
  { id: "cuerdas", nombre: "Cuerdas" },
  { id: "espectro", nombre: "Espectro" },
];

const RED_VACIA: RedSig = { nodos: [], enlaces: [] };

/**
 * SIGNATURE · QUALIA v2 — the intelligence machine IS the surface (M5):
 * sources on top, the four OODA windows auto-processing everything, and
 * the surviving drill-down instruments (Red, Cuerdas, Espectro) under
 * cover with the renormalization ladder and the deterministic reading.
 * Every retired lens's engine lives on in capacidades, consumed by the
 * machine's windows.
 */
export function RedTopologia() {
  const fuentes = useQualiaStore((s) => s.fuentes);
  const agregarLote = useQualiaStore((s) => s.agregarLote);
  const entidades = useAutogenesStore((s) => s.entidades);
  const relaciones = useAutogenesStore((s) => s.relaciones);
  const productos = useAutogenesStore((s) => s.productos);
  // Newest D1 audit entry (bitácora is newest-first) — auto-telemetry cue.
  const ultimaIntervencion = useAutogenesStore((s) => s.bitacora[0]?.ts ?? 0);

  const [vista, setVista] = useState<Codificacion>("red");
  const [nivel, setNivel] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [usarFuentes, setUsarFuentes] = useState(true);
  const [usarConectores, setUsarConectores] = useState(false);
  const [usarAutogenes, setUsarAutogenes] = useState(false);
  const [usarMicroapps, setUsarMicroapps] = useState(false);

  const fusiones = useQualiaStore((s) => s.fusiones);
  const personales = useMemo(
    () => aplicarFusiones(fuentes.filter((f) => f.origen !== "conector"), fusiones),
    [fuentes, fusiones],
  );
  const deConectores = useMemo(
    () => aplicarFusiones(fuentes.filter((f) => f.origen === "conector"), fusiones),
    [fuentes, fusiones],
  );

  // QUALIA's own intake: paste concepts or drop files, written in place to
  // its own store (Mis fuentes), category-agnostic. Separate from AUTOGENES;
  // nothing leaves and no document ever reaches the substrate.
  const [textoIngesta, setTextoIngesta] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [avisoIngesta, setAvisoIngesta] = useState<string | null>(null);
  const ingerir = () => {
    const n = agregarLote(parsearEntradas(textoIngesta));
    if (n > 0) {
      setTextoIngesta("");
      setAvisoIngesta(`${n} conceptos cargados.`);
    }
  };
  const ingerirArchivos = async (files: FileList) => {
    setProcesando(true);
    setAvisoIngesta(null);
    let total = 0;
    try {
      for (const file of Array.from(files)) {
        total += agregarLote(await entradasDeArchivo(file));
      }
      setAvisoIngesta(
        total > 0
          ? `${total} conceptos cargados de ${files.length} ${files.length === 1 ? "archivo" : "archivos"}.`
          : "No se hallaron conceptos legibles. Prueba texto, CSV, JSON o PDF.",
      );
    } catch {
      setAvisoIngesta("No se pudo leer el archivo. Prueba texto, CSV, JSON o PDF.");
    } finally {
      setProcesando(false);
    }
  };

  // Connector series feed the radar's FUENTES spoke (N2).
  const seriesConector = useMemo(
    () => seriesDeConectores(deConectores),
    [deConectores],
  );

  // Each source projects to a RedSig; only opted-in sources are read.
  const redFuentes = useMemo(() => redDesdeFuentes(personales), [personales]);
  const redConectores = useMemo(() => redDesdeFuentes(deConectores), [deConectores]);
  const redAutogenes = useMemo(
    () => (usarAutogenes ? redDesdeAutogenes(entidades, relaciones) : RED_VACIA),
    [usarAutogenes, entidades, relaciones],
  );
  const redMicroapps = useMemo(
    () =>
      usarMicroapps ? redDesdeLotes(entradasDeProductos(productos, entidades)) : RED_VACIA,
    [usarMicroapps, productos, entidades],
  );
  const base = useMemo(() => {
    const partes: ParteFuente[] = [];
    if (usarFuentes && redFuentes.nodos.length > 0)
      partes.push({ clave: "fuentes", red: redFuentes });
    if (usarConectores && redConectores.nodos.length > 0)
      partes.push({ clave: "conectores", red: redConectores });
    if (usarAutogenes && redAutogenes.nodos.length > 0)
      partes.push({ clave: "autogenes", red: redAutogenes });
    if (usarMicroapps && redMicroapps.nodos.length > 0)
      partes.push({ clave: "microapps", red: redMicroapps });
    return combinarRedes(partes);
  }, [
    usarFuentes,
    usarConectores,
    usarAutogenes,
    usarMicroapps,
    redFuentes,
    redConectores,
    redAutogenes,
    redMicroapps,
  ]);

  const escalera = useMemo(() => escaleraRenorm(base), [base]);
  // Auto-climb: past ~250 nodes the detail level is a hairball, so the
  // ladder starts at the first legible rung; the operator can always walk
  // back down to full detail with the escalera buttons.
  const nivelAuto = useMemo(() => {
    const i = escalera.findIndex((r) => r.nodos.length <= 250);
    return i === -1 ? escalera.length - 1 : i;
  }, [escalera]);
  const nivelSeguro = Math.min(
    Math.max(0, nivel ?? nivelAuto),
    escalera.length - 1,
  );
  const red = escalera[nivelSeguro] ?? base;
  const comunidad = useMemo(() => detectarComunidades(red), [red]);
  const orden = useMemo(() => ordenarPorComunidad(red, comunidad), [red, comunidad]);
  const resumen = useMemo(() => resumenRed(red), [red]);

  const nRegistros =
    (usarFuentes ? personales.length : 0) +
    (usarConectores ? deConectores.length : 0) +
    (usarAutogenes ? entidades.length : 0) +
    (usarMicroapps ? productos.length : 0);

  // Temporal activity — the ingesta signal (createdAt) from active sources.
  const eventosTemporales = useMemo<EventoTemporal[]>(() => {
    const ev: EventoTemporal[] = [];
    if (usarFuentes)
      for (const f of personales) ev.push({ t: f.createdAt, grupo: "Mis fuentes" });
    if (usarConectores)
      for (const f of deConectores) ev.push({ t: f.createdAt, grupo: "Conectores" });
    if (usarAutogenes)
      for (const e of entidades) ev.push({ t: e.createdAt, grupo: "Autogenes" });
    if (usarMicroapps)
      for (const p of productos) ev.push({ t: p.createdAt, grupo: "Micro-aplicativos" });
    return ev;
  }, [
    usarFuentes,
    usarConectores,
    usarAutogenes,
    usarMicroapps,
    personales,
    deConectores,
    entidades,
    productos,
  ]);
  const lectura = useMemo(
    () => construirLectura(resumen, nRegistros),
    [resumen, nRegistros],
  );

  // Decidir → Actuar: propose an additive plan from the network's structure,
  // governed by the autonomy dimmer (no campo → level 3, explicit approval).
  const [veredictoPlan, setVeredictoPlan] = useState<string | null>(null);
  const proponer = () => {
    const propuesta = construirPropuestaPlan(resumen, red);
    if (!propuesta) {
      setVeredictoPlan("Sin concentradores todavía para proponer un plan.");
      return;
    }
    const v = proponerPlan(propuesta);
    if (!v.ok) {
      setVeredictoPlan(v.error ?? "El plan no se pudo proponer.");
      return;
    }
    const nPasos = v.plan?.pasos.length ?? propuesta.pasos.length;
    if (v.estado === "ejecutado") {
      const ok = v.resultados?.filter((r) => r.ok).length ?? 0;
      setVeredictoPlan(`Plan ejecutado: ${ok} de ${nPasos} pasos aplicados al grafo.`);
    } else {
      setVeredictoPlan(
        `Plan propuesto (${nPasos} pasos) en revisión. Apruébalo en el panel C2 (dimmer de autonomía).`,
      );
    }
  };

  // Derive a valid selection: it drops itself when the node leaves the
  // current scale, so no effect is needed to keep it from dangling.
  const seleccionado =
    seleccion && red.nodos.some((n) => n.id === seleccion) ? seleccion : null;
  const setSeleccionado = setSeleccion;

  const nodoSel = seleccionado
    ? red.nodos.find((n) => n.id === seleccionado)
    : undefined;
  // Data tag for the selected node (O1): what it is, in numbers.
  const fichaSel = useMemo(() => {
    if (!nodoSel) return null;
    const vinculos = red.enlaces.filter(
      (e) => e.origen === nodoSel.id || e.destino === nodoSel.id,
    ).length;
    return {
      vinculos,
      comunidad: (comunidad.get(nodoSel.id) ?? 0) + 1,
      esPuente: resumen.puentes.some((p) => p.id === nodoSel.id),
    };
  }, [nodoSel, red, comunidad, resumen]);

  const selectorFuentes = (
    <SelectorFuentes
      usarFuentes={usarFuentes}
      usarConectores={usarConectores}
      usarAutogenes={usarAutogenes}
      usarMicroapps={usarMicroapps}
      nFuentes={redFuentes.nodos.length}
      nConectores={redConectores.nodos.length}
      nAutogenes={entidades.length}
      nMicroapps={productos.length}
      onFuentes={() => setUsarFuentes((v) => !v)}
      onConectores={() => setUsarConectores((v) => !v)}
      onAutogenes={() => setUsarAutogenes((v) => !v)}
      onMicroapps={() => setUsarMicroapps((v) => !v)}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-small font-bold uppercase tracking-[0.28em] text-frame-1">
          Estudio de recombinación
        </h2>
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
          Redes y topología · agnóstico al origen
        </p>
      </header>

      {selectorFuentes}

      <MaquinaC2
        red={red}
        resumen={resumen}
        eventos={eventosTemporales}
        ultimaIntervencion={ultimaIntervencion}
        seriesConector={seriesConector}
      />

      <CargaDatosQualia
        abierto={base.nodos.length === 0}
        texto={textoIngesta}
        procesando={procesando}
        aviso={avisoIngesta}
        onTexto={setTextoIngesta}
        onIngerir={ingerir}
        onArchivos={(files) => void ingerirArchivos(files)}
      />

      <ConectoresQualia abierto={usarConectores && deConectores.length === 0} />

      {base.nodos.length === 0 ? (
        <p className="text-caption leading-relaxed text-frame-3">
          Enciende una fuente o carga datos: cada etiqueta se vuelve un nodo,
          y comparten vínculo cuando llegan en la misma carga o comparten un
          valor. La máquina procesa el resto sola.
        </p>
      ) : (
        <details className="hud flex flex-col gap-3 p-3">
          <summary className="cursor-pointer list-none font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
            Instrumentos · red / cuerdas / espectro
          </summary>
          <div className="mt-2 flex flex-col gap-4">

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Codificación">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={vista === v.id}
            onClick={() => setVista(v.id)}
            className={cn(
              "border px-3 font-display text-micro font-bold uppercase tracking-[0.22em]",
              vista === v.id
                ? "border-coral text-coral-text"
                : "border-frame-3/40 text-frame-3",
            )}
            style={{ minHeight: "var(--touch-target)" }}
          >
            {v.nombre}
          </button>
        ))}
      </div>

      <div className="hud relative aspect-square w-full overflow-hidden p-1">
        {(() => {
          const claveVista = `${vista}:${nivelSeguro}:${red.nodos.length}:${red.nodos[0]?.id ?? ""}`;
          if (vista === "red")
            return (
              <LienzoRed
                key={claveVista}
                red={red}
                comunidad={comunidad}
                seleccionado={seleccionado}
                onSelect={setSeleccionado}
              />
            );
          if (vista === "cuerdas")
            return (
              <LienzoCuerdas
                key={claveVista}
                red={red}
                comunidad={comunidad}
                orden={orden}
                seleccionado={seleccionado}
                onSelect={setSeleccionado}
              />
            );
          return (
            <LienzoEspectral
              key={claveVista}
              red={red}
              comunidad={comunidad}
              seleccionado={seleccionado}
              onSelect={setSeleccionado}
            />
          );
        })()}
      </div>

      {/* renormalization ladder — abstraction level, not view zoom */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-mono text-micro uppercase tracking-[0.18em] text-frame-3">
            Abstracción · renormalización
          </span>
          <span className="font-mono text-caption tabular-nums text-frame-1">
            {nivelSeguro === 0 ? "detalle" : `resumen ${nivelSeguro}`}
            {nivel === null && nivelAuto > 0 ? " · auto" : ""} ·{" "}
            {red.nodos.length} nodos
          </span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setNivel(Math.max(0, nivelSeguro - 1))}
            disabled={nivelSeguro === 0}
            aria-label="Más detalle"
            className="border border-frame-3/40 px-4 font-display text-small font-bold text-frame-2 disabled:opacity-30"
            style={{ minHeight: "var(--touch-target)", minWidth: "var(--touch-target)" }}
          >
            Detalle
          </button>
          <button
            type="button"
            onClick={() => setNivel(Math.min(escalera.length - 1, nivelSeguro + 1))}
            disabled={nivelSeguro >= escalera.length - 1}
            aria-label="Más resumen"
            className="border border-coral px-4 font-display text-small font-bold text-coral-text disabled:opacity-30"
            style={{ minHeight: "var(--touch-target)", minWidth: "var(--touch-target)" }}
          >
            Resumen
          </button>
        </div>
      </div>

      {/* metrics strip */}
      <dl className="grid grid-cols-4 gap-2 border-y border-frame-3/20 py-3">
        {[
          { k: "Nodos", v: resumen.nNodos },
          { k: "Vínculos", v: resumen.nEnlaces },
          { k: "Comunidades", v: resumen.nComunidades },
          { k: "Densidad", v: `${(resumen.densidad * 100).toFixed(0)}%` },
        ].map((m) => (
          <div key={m.k} className="flex flex-col gap-0.5">
            <dt className="font-mono text-micro uppercase tracking-[0.14em] text-frame-3">
              {m.k}
            </dt>
            <dd className="font-display text-small font-bold tabular-nums text-frame-1">
              {m.v}
            </dd>
          </div>
        ))}
      </dl>

      {/* hub chips drive the shared selection */}
      {resumen.hubs.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-micro uppercase tracking-[0.18em] text-frame-3">
            Concentradores
          </span>
          <div className="flex flex-wrap gap-1.5">
            {resumen.hubs.map((hub) => (
              <button
                key={hub.id}
                type="button"
                aria-pressed={seleccionado === hub.id}
                onClick={() =>
                  setSeleccionado(seleccionado === hub.id ? null : hub.id)
                }
                className={cn(
                  "flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-micro tracking-[0.06em]",
                  seleccionado === hub.id
                    ? "border-coral text-coral-text"
                    : "border-frame-3/40 text-frame-2",
                )}
              >
                <span className="truncate max-w-40">{hub.etiqueta}</span>
                <span className="tabular-nums text-frame-3">{hub.grado}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {nodoSel && fichaSel ? (
        <div className="border-l border-coral pl-2">
          <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text">
            {nodoSel.etiqueta}
          </p>
          <p className="font-mono text-micro leading-relaxed tracking-[0.12em] text-frame-2">
            concepto · {fichaSel.vinculos}{" "}
            {fichaSel.vinculos === 1 ? "vínculo" : "vínculos"} · comunidad{" "}
            {fichaSel.comunidad}
            {typeof nodoSel.peso === "number"
              ? ` · ${nodoSel.peso} registros`
              : ""}
            {fichaSel.esPuente ? " · punto de quiebre" : ""}
          </p>
        </div>
      ) : null}

      {/* deterministic cited reading */}
      <div className="hud flex flex-col gap-2 p-3">
        <span className="font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
          Lectura
        </span>
        <ul className="flex flex-col gap-1.5">
          {lectura.map((linea, i) => (
            <li
              key={i}
              className="text-caption leading-relaxed text-frame-2 before:mr-2 before:text-coral-text before:content-['·']"
            >
              {linea}
            </li>
          ))}
        </ul>

        <p className="font-mono text-micro leading-relaxed tracking-[0.04em] text-frame-3">
          Lectura determinista. La interpretación vive arriba: Leer el
          sistema.
        </p>
      </div>

      {/* Semantic fusion proposals — N3, on-device embeddings */}
      <FusionesPanel
        etiquetas={[...personales, ...deConectores].map((f) => f.etiqueta)}
      />

      {base.nodos.length > 0 ? (
        <div className="hud flex flex-col gap-2 p-3">
          <span className="font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
            Decidir · Actuar
          </span>
          <p className="text-caption leading-relaxed text-frame-2">
            Materializa la estructura en el grafo: recordar los concentradores
            y enlazarlos, como un plan aditivo gobernado por el dimmer de
            autonomía. Los deletes nunca se delegan.
          </p>
          {veredictoPlan ? (
            <p className="font-mono text-micro leading-relaxed tracking-[0.04em] text-coral-text">
              {veredictoPlan}
            </p>
          ) : null}
          <button
            type="button"
            onClick={proponer}
            className="self-start border border-coral px-4 font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
            style={{ minHeight: "var(--touch-target)" }}
          >
            Proponer plan
          </button>
        </div>
      ) : null}
          </div>
        </details>
      )}
    </div>
  );
}


/**
 * The four QUALIA sources, all wired: Mis fuentes (what the operator
 * loaded), Conectores (open-service queries), Autogenes (opt-in, read-only)
 * and Micro-aplicativos (the units' Productos E3, read-only). Toggle any
 * combination; the network recombines them.
 */
function SelectorFuentes({
  usarFuentes,
  usarConectores,
  usarAutogenes,
  usarMicroapps,
  nFuentes,
  nConectores,
  nAutogenes,
  nMicroapps,
  onFuentes,
  onConectores,
  onAutogenes,
  onMicroapps,
}: {
  usarFuentes: boolean;
  usarConectores: boolean;
  usarAutogenes: boolean;
  usarMicroapps: boolean;
  nFuentes: number;
  nConectores: number;
  nAutogenes: number;
  nMicroapps: number;
  onFuentes: () => void;
  onConectores: () => void;
  onAutogenes: () => void;
  onMicroapps: () => void;
}) {
  const chip = (activo: boolean) =>
    cn(
      "flex items-center gap-1.5 border px-2.5 py-2 font-mono text-micro uppercase tracking-[0.12em]",
      activo ? "border-coral text-coral-text" : "border-frame-3/40 text-frame-3",
    );
  const boton = (
    activo: boolean,
    onClick: () => void,
    nombre: string,
    n: number,
  ) => (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={chip(activo)}
      style={{ minHeight: "var(--touch-target)" }}
    >
      <span>{nombre}</span>
      <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );
  const lecturaGrafo = usarAutogenes || usarMicroapps;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
        Fuentes
      </span>
      <div className="flex flex-wrap gap-1.5">
        {boton(usarFuentes, onFuentes, "Mis fuentes", nFuentes)}
        {boton(usarConectores, onConectores, "Conectores", nConectores)}
        {boton(usarAutogenes, onAutogenes, "Autogenes", nAutogenes)}
        {boton(usarMicroapps, onMicroapps, "Micro-aplicativos", nMicroapps)}
      </div>
      {lecturaGrafo ? (
        <p className="font-mono text-micro leading-relaxed tracking-[0.04em] text-frame-3">
          Lectura del grafo, solo lectura. El sustrato no se modifica.
        </p>
      ) : null}
    </div>
  );
}

const CAMPO_INPUT =
  "border border-frame-3/40 bg-transparent px-3 font-mono text-caption text-frame-1 placeholder:text-frame-3";


/**
 * QUALIA's data intake — category-agnostic. The operator pastes concepts
 * or drops files (their own personal sources); both write to the Mis
 * fuentes store as one batch. Nothing asks for a category and nothing
 * reaches the substrate. Opens when the studio is empty.
 */
function CargaDatosQualia({
  abierto,
  texto,
  procesando,
  aviso,
  onTexto,
  onIngerir,
  onArchivos,
}: {
  abierto: boolean;
  texto: string;
  procesando: boolean;
  aviso: string | null;
  onTexto: (v: string) => void;
  onIngerir: () => void;
  onArchivos: (files: FileList) => void;
}) {
  return (
    <details open={abierto} className="hud flex flex-col gap-3 p-3">
      <summary className="cursor-pointer list-none font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
        Carga de Datos Qualia
      </summary>

      <div className="flex flex-col gap-2">
        <textarea
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          placeholder={"Un concepto por línea. Ej:\nRFC: AAA010101AAA\nRégimen: 601"}
          aria-label="Conceptos a cargar"
          rows={4}
          className={cn(CAMPO_INPUT, "resize-y py-2 leading-relaxed")}
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onIngerir}
            disabled={texto.trim().length === 0 || procesando}
            className="flex-1 border border-coral px-4 font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text disabled:opacity-30"
            style={{ minHeight: "var(--touch-target)" }}
          >
            Cargar texto
          </button>
          <label
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center border border-frame-3/40 px-4 text-center font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-2",
              procesando && "opacity-30",
            )}
            style={{ minHeight: "var(--touch-target)" }}
          >
            {procesando ? "Leyendo…" : "Subir archivo"}
            <input
              type="file"
              multiple
              accept=".txt,.md,.csv,.tsv,.json,.pdf,text/plain,text/csv,application/json,application/pdf"
              disabled={procesando}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0)
                  onArchivos(e.target.files);
                e.target.value = "";
              }}
              className="sr-only"
            />
          </label>
        </div>
        {aviso ? (
          <p className="font-mono text-micro leading-relaxed tracking-[0.04em] text-coral-text">
            {aviso}
          </p>
        ) : null}
        <p className="font-mono text-micro leading-relaxed tracking-[0.04em] text-frame-3">
          Sin categoría: tus fuentes personales (texto, CSV, JSON o PDF) se
          quedan en Qualia, nunca en el sustrato.
        </p>
      </div>
    </details>
  );
}
