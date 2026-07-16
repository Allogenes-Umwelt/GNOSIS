"use client";

import { useEffect, useMemo, useState } from "react";
import {
  desviacionFuentes,
  detectarAnomalias,
  quiebreRitmo,
  rafagaActividad,
  tomarSnapshot,
  type Anomalia,
} from "@/capacidades/anomalias";
import { simularCaida, simularEnlace } from "@/capacidades/cascada";
import {
  construirHorizonte,
  type LineaIntervencion,
} from "@/capacidades/horizonte";
import {
  centralidadVectorPropio,
  contribucionesCentralidad,
  type RedSig,
  type ResumenRed,
} from "@/capacidades/signature";
import { LienzoCascada } from "@/microapps/signature/LienzoCascada";
import { LienzoHorizonte } from "@/microapps/signature/LienzoHorizonte";
import { LienzoOrbe } from "@/microapps/signature/LienzoOrbe";
import {
  DETECTORES_TERRENO,
  LienzoTerreno,
} from "@/microapps/signature/LienzoTerreno";
import {
  construirDigestoMaquina,
  NarrativaSchema,
  type DigestoRed,
  type Narrativa,
} from "@/microapps/signature/narrativa";
import { construirPropuestaEnlace } from "@/microapps/signature/plan";
import { narrativaAInforme } from "@/microapps/signature/producto";
import { serieTemporal, type EventoTemporal } from "@/microapps/signature/temporal";
import {
  dockearProducto,
  intervencionesOperador,
} from "@/services/autogenes";
import { proponerPlan } from "@/services/planes";
import { usePreferenciasStore } from "@/store/preferencias";
import { useQualiaStore } from "@/store/qualia";

const metaClass = "font-mono text-micro tracking-[0.12em] text-frame-3";

/**
 * QUALIA v2 · the intelligence machine (M1) — four monumental OODA
 * windows, auto-processed, few buttons. OBSERVAR is live (the radar);
 * ORIENTAR / DECIDIR / ACTUAR show their real deterministic headlines
 * until their full instruments land (M2–M4). Every number is engine
 * output; every finding explains itself on tap. CERO snake oil.
 */
export function MaquinaC2({
  red,
  resumen,
  eventos,
  ultimaIntervencion,
  seriesConector,
}: {
  red: RedSig;
  resumen: ResumenRed;
  eventos: EventoTemporal[];
  /** Timestamp of the newest D1 audit entry — drives auto-telemetry. */
  ultimaIntervencion: number;
  /** Numeric series accumulated from connector queries (FUENTES spoke). */
  seriesConector: { etiqueta: string; valores: number[] }[];
}) {
  const snapshots = useQualiaStore((s) => s.snapshots);
  const registrarSnapshot = useQualiaStore((s) => s.registrarSnapshot);
  const fijarBaseStore = useQualiaStore((s) => s.fijarBase);
  const base = useQualiaStore((s) => s.base);
  const [sel, setSel] = useState<Anomalia | null>(null);
  const [leyenda, setLeyenda] = useState(false);
  const [cuerpoSel, setCuerpoSel] = useState<string | null>(null);
  const [modoCascada, setModoCascada] = useState<"caida" | "enlace">("caida");
  const [selCascada, setSelCascada] = useState<string[]>([]);
  const [veredictoEnlace, setVeredictoEnlace] = useState<string | null>(null);
  const [lineaSel, setLineaSel] = useState<LineaIntervencion | null>(null);
  const [generandoParte, setGenerandoParte] = useState(false);
  const [errorParte, setErrorParte] = useState<string | null>(null);
  const [parte, setParte] = useState<Narrativa | null>(null);
  const [digestoParte, setDigestoParte] = useState<DigestoRed | null>(null);
  const [avisoDockParte, setAvisoDockParte] = useState<string | null>(null);

  // Auto-telemetry (N0): sample a snapshot when the operator intervened
  // (new D1 audit entry) or the structure changed and the last sample is
  // stale. The baseline never moves here — only fijarBase moves it.
  useEffect(() => {
    if (resumen.nNodos === 0) return;
    const ultimo = snapshots[0] ?? null;
    const cambio =
      !ultimo ||
      ultimo.nNodos !== resumen.nNodos ||
      ultimo.nEnlaces !== resumen.nEnlaces;
    const intervino = ultimo !== null && ultimaIntervencion > ultimo.ts;
    const rancio = !ultimo || Date.now() - ultimo.ts > 60_000;
    if (intervino || (cambio && rancio)) {
      registrarSnapshot(tomarSnapshot(resumen, Date.now()));
    }
  }, [resumen, ultimaIntervencion, snapshots, registrarSnapshot]);

  const anomalias = useMemo(() => {
    const lista: Anomalia[] = base ? detectarAnomalias(resumen, base) : [];
    // Activity burst and rhythm break ride their own spokes — classical
    // statistics over the operator's own series, no baseline needed.
    const serie = serieTemporal(eventos, 28).cubetas.map((c) => c.total);
    const r = rafagaActividad(serie);
    if (r.esRafaga) {
      lista.push({
        detector: "rafaga",
        titulo: "Ráfaga de actividad",
        detalle: `La última ventana carga ${r.z.toFixed(1)} desviaciones por encima de tu ritmo previo.`,
        severidad: Math.max(0, Math.min(1, r.z / 4)),
        clave: "anom-rafaga",
      });
    }
    const q = quiebreRitmo(serie);
    if (q.esQuiebre) {
      lista.push({
        detector: "ritmo",
        titulo: "Tu ritmo de actividad se rompió",
        detalle: `Traías un periodo de ~${q.lag} intervalos (autocorrelación ${q.antes.toFixed(2)}); en la ventana reciente cayó a ${q.ahora.toFixed(2)}.`,
        severidad: Math.max(0, Math.min(1, q.antes - q.ahora)),
        clave: "anom-ritmo",
      });
    }
    lista.push(...desviacionFuentes(seriesConector));
    return lista;
  }, [resumen, base, eventos, seriesConector]);

  // ORIENTAR: masses by eigenvector centrality + tap-to-explain.
  const masas = useMemo(() => centralidadVectorPropio(red), [red]);
  const monolitos = useMemo(() => {
    const etiqueta = new Map(red.nodos.map((n) => [n.id, n.etiqueta]));
    return [...masas]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 3)
      .map(([id, masa]) => ({ id, etiqueta: etiqueta.get(id) ?? id, masa }));
  }, [red, masas]);
  const porQue = useMemo(
    () => (cuerpoSel ? contribucionesCentralidad(red, cuerpoSel) : []),
    [red, cuerpoSel],
  );
  const cuerpoSelInfo = useMemo(() => {
    if (!cuerpoSel) return null;
    const nodo = red.nodos.find((n) => n.id === cuerpoSel);
    if (!nodo) return null;
    return { etiqueta: nodo.etiqueta, masa: masas.get(cuerpoSel) ?? 0 };
  }, [red, cuerpoSel, masas]);
  // Honesty (N0): in a dense, even network every mass is ~equal — a
  // podium there would be theater. Say it plainly instead.
  const sinJerarquia = useMemo(() => {
    if (masas.size < 4) return false;
    const vals = [...masas.values()];
    return Math.max(...vals) - Math.min(...vals) < 0.05;
  }, [masas]);

  // DECIDIR: validated selection + in-memory what-if via the cascade
  // engines. The selection drops itself when a node leaves the network.
  const selValida = useMemo(
    () => selCascada.filter((id) => red.nodos.some((n) => n.id === id)),
    [selCascada, red],
  );
  const impactoCaida = useMemo(
    () =>
      modoCascada === "caida" && selValida.length >= 1
        ? simularCaida(red, selValida[0])
        : null,
    [red, modoCascada, selValida],
  );
  const impactoEnlace = useMemo(
    () =>
      modoCascada === "enlace" && selValida.length === 2
        ? simularEnlace(red, selValida[0], selValida[1])
        : null,
    [red, modoCascada, selValida],
  );
  const etiquetaDe = (id: string) =>
    red.nodos.find((n) => n.id === id)?.etiqueta ?? id;

  const tapCascada = (id: string | null) => {
    setVeredictoEnlace(null);
    if (!id) {
      setSelCascada([]);
      return;
    }
    setSelCascada((prev) => {
      if (modoCascada === "caida") return [id];
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [id];
      return [...prev, id];
    });
  };

  const cambiarModo = (m: "caida" | "enlace") => {
    setModoCascada(m);
    setSelCascada([]);
    setVeredictoEnlace(null);
  };

  // Inductive hand-off: making the simulated link real goes through the
  // additive-plan gate under the autonomy dimmer. Deletes never leave here.
  const proponerEnlace = () => {
    if (selValida.length !== 2) return;
    const propuesta = construirPropuestaEnlace(red, selValida[0], selValida[1]);
    if (!propuesta) {
      setVeredictoEnlace("El enlace no se pudo proponer: conceptos inválidos.");
      return;
    }
    const v = proponerPlan(propuesta);
    if (!v.ok) {
      setVeredictoEnlace(v.error ?? "El plan no se pudo proponer.");
      return;
    }
    const nPasos = v.plan?.pasos.length ?? propuesta.pasos.length;
    setVeredictoEnlace(
      v.estado === "ejecutado"
        ? `Plan ejecutado: ${v.resultados?.filter((r) => r.ok).length ?? 0} de ${nPasos} pasos aplicados al grafo.`
        : `Plan propuesto (${nPasos} pasos) en revisión. Apruébalo en el panel C2 (dimmer de autonomía).`,
    );
  };

  // ACTUAR headline: last measured delta between snapshots.
  const delta = useMemo(() => {
    if (snapshots.length < 2) return null;
    const [ult, prev] = snapshots;
    return {
      nodos: ult.nNodos - prev.nNodos,
      enlaces: ult.nEnlaces - prev.nEnlaces,
    };
  }, [snapshots]);

  // ACTUAR: the event horizon — sampled telemetry plus the operator's
  // interventions from the D1 audit log, read through the service gateway.
  const horizonte = useMemo(
    () => construirHorizonte(snapshots, intervencionesOperador()),
    [snapshots],
  );

  const fijarBase = () => {
    fijarBaseStore(tomarSnapshot(resumen, Date.now()));
    setSel(null);
    setLineaSel(null);
  };

  const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n));

  // The command report: SYNESIS narrates the four windows' digest — the
  // same sanitized contract as every narrative; nothing outside it cites.
  const leerSistema = async () => {
    setGenerandoParte(true);
    setErrorParte(null);
    setAvisoDockParte(null);
    try {
      const digesto = construirDigestoMaquina({
        resumen,
        anomalias: anomalias.map((a) => ({
          clave: a.clave,
          titulo: a.titulo,
          severidad: a.severidad,
        })),
        monolitos,
        nReferencias: snapshots.length,
        delta,
      });
      setDigestoParte(digesto);
      const { provider, claves } = usePreferenciasStore.getState();
      const res = await fetch("/api/u/qualia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          clave: claves[provider] || undefined,
          digesto,
        }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ?? "La lectura falló. Reintenta.",
        );
      }
      setParte(
        NarrativaSchema.parse((json as { narrativa: unknown }).narrativa),
      );
    } catch (e) {
      setErrorParte(
        e instanceof Error ? e.message : "La lectura falló. Reintenta.",
      );
      setParte(null);
    } finally {
      setGenerandoParte(false);
    }
  };

  const etiquetaClave = (c: string) =>
    digestoParte?.conceptos.find((x) => x.clave === c)?.etiqueta ??
    digestoParte?.metricas.find((m) => m.clave === c)?.etiqueta ??
    c;

  const dockearParte = () => {
    if (!parte) return;
    const lineasOoda = [
      `Observar: ${anomalias.length} ${anomalias.length === 1 ? "desviación" : "desviaciones"} contra la línea base${base ? ` del ${new Date(base.ts).toLocaleDateString("es-MX")}` : " (sin fijar)"}.`,
      monolitos.length === 0
        ? "Orientar: sin red que orientar."
        : sinJerarquia
          ? "Orientar: red densa y pareja, sin jerarquía clara."
          : `Orientar: monolito principal «${monolitos[0].etiqueta}» por centralidad.`,
      `Decidir: ${resumen.puentes.length} ${resumen.puentes.length === 1 ? "punto" : "puntos"} de quiebre en la estructura.`,
      `Actuar: ${snapshots.length} ${snapshots.length === 1 ? "referencia" : "referencias"} de telemetría${delta ? `; último delta ${conSigno(delta.nodos)} conceptos, ${conSigno(delta.enlaces)} vínculos` : ""}.`,
    ];
    const { informe, entidades } = narrativaAInforme(
      parte,
      lineasOoda,
      `Parte de mando · ${resumen.nNodos} conceptos`,
      etiquetaClave,
    );
    dockearProducto({
      clase: "informe",
      titulo: informe.titulo,
      unidad: "signature",
      cuerpo: informe,
      entidades,
    });
    setAvisoDockParte(
      entidades.length > 0
        ? `Parte dockeado al grafo, citando ${entidades.length} ${entidades.length === 1 ? "entidad" : "entidades"}.`
        : "Parte dockeado al grafo como Producto.",
    );
  };

  const ventana = (
    fase: string,
    nombre: string,
    contenido: React.ReactNode,
    viva = false,
  ) => (
    <section
      className={
        viva
          ? "hud hud-live flex flex-col gap-2 border-coral p-3"
          : "hud flex flex-col gap-2 p-3"
      }
    >
      <header className="flex items-baseline justify-between">
        <h3 className="font-display text-micro font-bold uppercase tracking-[0.3em] text-coral-text">
          {fase}
        </h3>
        <span className="font-mono text-micro uppercase tracking-[0.15em] text-frame-3">
          {nombre}
        </span>
      </header>
      {contenido}
    </section>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-small font-bold uppercase tracking-[0.35em] text-frame-1">
          Máquina de inteligencia
        </h2>
        <span className={metaClass}>procesado automático · todo citado</span>
      </div>

      <button
        type="button"
        onClick={() => void leerSistema()}
        disabled={generandoParte || resumen.nNodos === 0}
        className="hud-btn border border-coral px-4 py-3 font-display text-small font-bold uppercase tracking-[0.3em] text-coral-text disabled:border-structural disabled:text-frame-3"
        style={{ minHeight: "var(--touch-target)" }}
      >
        {generandoParte ? "Leyendo el sistema" : "Leer el sistema"}
      </button>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {ventana(
          "Observar",
          "Terreno de anomalías",
          <>
            <div className="relative aspect-square w-full">
              <LienzoTerreno
                anomalias={anomalias}
                onSelect={setSel}
                seleccionada={sel}
              />
              {/* The legend: nine detectors, one plain line each. */}
              <button
                type="button"
                onClick={() => setLeyenda((v) => !v)}
                aria-expanded={leyenda}
                aria-label="Qué vigila cada palabra del terreno"
                className={
                  leyenda
                    ? "absolute right-2 top-2 border border-coral px-3 py-1.5 font-mono text-micro font-bold text-coral-text"
                    : "absolute right-2 top-2 border border-structural px-3 py-1.5 font-mono text-micro font-bold text-frame-3"
                }
                style={{ minHeight: "var(--touch-target)", minWidth: "var(--touch-target)" }}
              >
                ?
              </button>
            </div>
            {leyenda ? (
              <div className="flex flex-col gap-1 border-l border-coral pl-2">
                <p className="font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
                  plano gris = tu normalidad · loma = desviación contra tu
                  línea base · 0–1 = severidad · toca la cresta para el porqué
                </p>
                {DETECTORES_TERRENO.map((d) => (
                  <p key={d.id} className="text-caption leading-relaxed text-frame-2">
                    <span className="font-mono font-bold text-coral-text">
                      {d.etiqueta}
                    </span>{" "}
                    — {d.definicion}
                  </p>
                ))}
              </div>
            ) : null}
            {sel ? (
              <div className="border-l border-coral pl-2">
                <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text">
                  {sel.titulo}
                </p>
                <p className="text-caption leading-relaxed text-frame-2">
                  {sel.detalle}
                </p>
              </div>
            ) : base ? (
              <p className={metaClass}>
                {anomalias.length === 0
                  ? `Sin desviaciones contra tu referencia del ${new Date(base.ts).toLocaleDateString("es-MX")}.`
                  : `${anomalias.length} ${anomalias.length === 1 ? "desviación" : "desviaciones"} contra tu referencia. Toca una cresta para el porqué.`}
              </p>
            ) : (
              <p className={metaClass}>
                Aún no hay línea base: fija una para que el terreno tenga contra
                qué medir.
              </p>
            )}
            <button
              type="button"
              onClick={fijarBase}
              disabled={resumen.nNodos === 0}
              className="hud-btn self-start border border-structural px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-frame-2 disabled:text-frame-3"
              style={{ minHeight: "var(--touch-target)" }}
            >
              {base ? "Actualizar referencia" : "Fijar línea base"}
            </button>
          </>,
          anomalias.length > 0,
        )}

        {ventana(
          "Orientar",
          "Orbe gravitacional",
          monolitos.length > 0 ? (
            <>
              <div className="aspect-square w-full">
                <LienzoOrbe
                  red={red}
                  seleccionado={cuerpoSel}
                  onSelect={setCuerpoSel}
                />
              </div>
              {cuerpoSelInfo ? (
                <div className="border-l border-coral pl-2">
                  <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text">
                    {cuerpoSelInfo.etiqueta}
                    <span className="tnum"> · masa {cuerpoSelInfo.masa.toFixed(2)}</span>
                  </p>
                  <p className="text-caption leading-relaxed text-frame-2">
                    {porQue.length > 0
                      ? `Pesa porque conecta con ${porQue
                          .map((c) => `«${c.etiqueta}» (masa ${c.masa.toFixed(2)})`)
                          .join(", ")}. La masa es la suma ponderada de las masas vecinas.`
                      : "No tiene vínculos: su masa es la mínima del sistema."}
                  </p>
                </div>
              ) : sinJerarquia ? (
                <p className={metaClass}>
                  Red densa y pareja: sin jerarquía clara todavía — todos los
                  conceptos pesan casi lo mismo. El orbe la muestra tal cual;
                  con más fuentes la estructura se separa.
                </p>
              ) : (
                <p className={metaClass}>
                  Monolito principal: «{monolitos[0].etiqueta}». Masa = cuánto
                  te conecta a lo que conecta · órbita = rango · plano =
                  comunidad. Toca un cuerpo para ver por qué pesa.
                </p>
              )}
            </>
          ) : (
            <p className={metaClass}>Sin red todavía: carga fuentes arriba.</p>
          ),
        )}

        {ventana(
          "Decidir",
          "Cascada de bifurcación",
          resumen.nNodos > 0 ? (
            <>
              <div className="flex gap-2" role="group" aria-label="Modo de simulación">
                {(["caida", "enlace"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => cambiarModo(m)}
                    aria-pressed={m === modoCascada}
                    className={
                      m === modoCascada
                        ? "hud-btn border border-coral px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
                        : "hud-btn border border-structural px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-frame-3"
                    }
                    style={{ minHeight: "var(--touch-target)" }}
                  >
                    {m === "caida" ? "Simular caída" : "Simular enlace"}
                  </button>
                ))}
              </div>
              <div className="aspect-square w-full">
                <LienzoCascada
                  red={red}
                  modo={modoCascada}
                  seleccion={selValida}
                  resaltados={
                    impactoCaida?.desconectados.map((d) => d.id) ?? []
                  }
                  onTap={tapCascada}
                />
              </div>
              {impactoCaida ? (
                <div className="border-l border-coral pl-2">
                  <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text">
                    Si cae «{etiquetaDe(selValida[0])}»
                  </p>
                  <p className="text-caption leading-relaxed text-frame-2">
                    {impactoCaida.relacionesCaidas}{" "}
                    {impactoCaida.relacionesCaidas === 1
                      ? "vínculo cae"
                      : "vínculos caen"}{" "}
                    · islas {impactoCaida.islasAntes}→
                    {impactoCaida.islasDespues} · cargaba el{" "}
                    {(impactoCaida.pesoEstructural * 100).toFixed(0)} por
                    ciento de la estructura
                    {impactoCaida.desconectados.length > 0
                      ? ` · quedan sueltos: ${impactoCaida.desconectados
                          .map((d) => `«${d.etiqueta}»`)
                          .join(", ")}`
                      : ""}
                    . Simulación en memoria de tu propia red — nada se
                    escribe.
                  </p>
                </div>
              ) : impactoEnlace ? (
                <>
                  <div className="border-l border-coral pl-2">
                    <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text">
                      Enlazar «{etiquetaDe(selValida[0])}» con «
                      {etiquetaDe(selValida[1])}»
                    </p>
                    <p className="text-caption leading-relaxed text-frame-2">
                      {impactoEnlace.fusionaIslas
                        ? `Fusiona islas: ${impactoEnlace.islasAntes}→${impactoEnlace.islasDespues}`
                        : "No fusiona islas"}{" "}
                      ·{" "}
                      {impactoEnlace.saltosAntes === null
                        ? "sin camino previo, ahora 1 salto"
                        : `saltos ${impactoEnlace.saltosAntes}→1`}{" "}
                      · acerca {impactoEnlace.acercados}{" "}
                      {impactoEnlace.acercados === 1
                        ? "concepto"
                        : "conceptos"}
                      . Simulación en memoria — hacerlo real pasa por el plan
                      aditivo bajo el dimmer.
                    </p>
                  </div>
                  {veredictoEnlace ? (
                    <p className={metaClass}>{veredictoEnlace}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={proponerEnlace}
                      className="hud-btn self-start border border-structural px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-frame-2"
                      style={{ minHeight: "var(--touch-target)" }}
                    >
                      Proponer enlace
                    </button>
                  )}
                </>
              ) : (
                <p className={metaClass}>
                  {modoCascada === "caida"
                    ? resumen.puentes.length > 0
                      ? `Candidatos: ${resumen.puentes
                          .map((p) => `«${p.etiqueta}»`)
                          .join(", ")} — puntos de quiebre. Toca un concepto y el pulso muestra qué se desconecta si cae.`
                      : "Toca un concepto: el pulso muestra qué se desconecta si cae. Nada se escribe."
                    : selValida.length === 1
                      ? `«${etiquetaDe(selValida[0])}» fijado. Toca el segundo concepto.`
                      : "Toca dos conceptos para simular un vínculo nuevo."}
                </p>
              )}
            </>
          ) : (
            <p className={metaClass}>Sin red todavía: carga fuentes arriba.</p>
          ),
          selValida.length > 0,
        )}

        {ventana(
          "Actuar",
          "Horizonte de eventos",
          horizonte && horizonte.puntos.length >= 2 ? (
            <>
              <div className="aspect-[2/1] w-full">
                <LienzoHorizonte
                  horizonte={horizonte}
                  seleccionada={lineaSel}
                  onSelect={setLineaSel}
                />
              </div>
              {lineaSel ? (
                <div className="border-l border-coral pl-2">
                  <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text">
                    {lineaSel.accion} ·{" "}
                    {new Date(lineaSel.ts).toLocaleDateString("es-MX")}
                  </p>
                  <p className="text-caption leading-relaxed text-frame-2">
                    {lineaSel.detalle}
                    {lineaSel.delta
                      ? ` — delta medido alrededor: ${conSigno(lineaSel.delta.nodos)} conceptos, ${conSigno(lineaSel.delta.enlaces)} vínculos.`
                      : " — aún sin muestra posterior: fija otra referencia para medir el después."}
                  </p>
                </div>
              ) : (
                <p className={metaClass}>
                  {snapshots.length} referencias
                  {delta
                    ? ` · último delta ${conSigno(delta.nodos)} conceptos, ${conSigno(delta.enlaces)} vínculos`
                    : ""}
                  {horizonte.lineas.length > 0
                    ? ` · ${horizonte.lineas.length} ${horizonte.lineas.length === 1 ? "intervención en la ventana — tócala" : "intervenciones en la ventana — toca una"} para su delta.`
                    : " · tus intervenciones aparecerán como líneas verticales."}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="tnum font-mono text-head-sm font-bold text-frame-1">
                {snapshots.length}
              </p>
              <p className={metaClass}>
                {snapshots.length === 1
                  ? "referencia de telemetría registrada"
                  : "referencias de telemetría registradas"}
                {snapshots.length > 0
                  ? " · fija otra referencia y el osciloscopio dibuja tu primera onda"
                  : " · cada referencia fijada alimenta el osciloscopio"}
              </p>
            </>
          ),
        )}
      </div>

      {parte !== null || errorParte !== null ? (
        <section className="hud flex flex-col gap-2 border-coral p-3">
          <header className="flex items-baseline justify-between">
            <h3 className="font-display text-micro font-bold uppercase tracking-[0.3em] text-coral-text">
              Parte de mando
            </h3>
            <span className={metaClass}>synesis · citado · dockeable</span>
          </header>
          {errorParte ? (
            <p className="text-caption leading-relaxed text-frame-2">
              {errorParte}
            </p>
          ) : parte ? (
            <>
              <p className="text-caption leading-relaxed text-frame-1">
                {parte.panorama}
              </p>
              {parte.lecturas.map((l) => (
                <p
                  key={l.concepto}
                  className="border-l border-structural pl-2 text-caption leading-relaxed text-frame-2"
                >
                  <span className="font-mono text-micro uppercase tracking-[0.12em] text-coral-text">
                    {etiquetaClave(l.concepto)}
                  </span>{" "}
                  — {l.lectura}
                </p>
              ))}
              {parte.observaciones.map((o) => (
                <p key={o} className={metaClass}>
                  {o}
                </p>
              ))}
              {avisoDockParte ? (
                <p className={metaClass}>{avisoDockParte}</p>
              ) : (
                <button
                  type="button"
                  onClick={dockearParte}
                  className="hud-btn self-start border border-structural px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-frame-2"
                  style={{ minHeight: "var(--touch-target)" }}
                >
                  Dockear parte
                </button>
              )}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
