"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { oportunidadesFicha } from "@/lib/enriquecimiento";
import { proponerConexiones } from "@/lib/inferencia";
import { proponerFusiones } from "@/lib/resolucion";
import { manifiestoRadar } from "@/microapps/radar/manifest";
import {
  diasDesde,
  etiquetaDias,
  fuentesFrias,
  proximosVencimientos,
  HORIZONTE_DIAS,
  RESPALDO_UMBRAL_DIAS,
} from "@/capacidades/senales";
import { alcanceDeCaso } from "@/capacidades/casos";
import { CasoFocoChip } from "@/components/shell/CasoFocoChip";
import { useAutogenesStore } from "@/store/autogenes";
import { useCasoFocoStore } from "@/store/casoFoco";
import { useDatosStore } from "@/store/datos";
import { usePreferenciasStore } from "@/store/preferencias";

const subscribeNoop = () => () => {};

const seccionClass =
  "font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2";
const metaClass = "font-mono text-micro tracking-[0.12em] text-frame-3";
const filaClass =
  "flex items-center gap-3 border border-structural bg-contain px-3 py-2";
const accionClass =
  "shrink-0 font-mono text-micro font-bold uppercase tracking-[0.2em] text-coral-text";

/**
 * RADAR — the attention instrument. It rides ON the substrate: pure
 * signal reads (dated events, adjudication queues, cold sources,
 * backup age), each row pointing at the surface where the operator
 * acts. It computes nothing speculative and writes nothing.
 */
export function RadarView() {
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
  const eventos = useAutogenesStore((s) => s.eventos);
  const paresDescartados = useAutogenesStore((s) => s.paresDescartados);
  const casos = useAutogenesStore((s) => s.casos);
  const casoActivoId = useCasoFocoStore((s) => s.casoActivoId);
  const lastExport = usePreferenciasStore((s) => s.lastExport);

  // One clock per visit — signals stay stable while the view is open.
  const [ahora] = useState(() => Date.now());

  // L·5 — case scope: with a case in focus the radar reads only its
  // sub-graph; without one, the whole Umwelt as always.
  const alcance = useMemo(() => {
    const caso = casos.find((c) => c.id === casoActivoId);
    return caso ? alcanceDeCaso(caso, { fragmentos, entidades, eventos }) : null;
  }, [casos, casoActivoId, fragmentos, entidades, eventos]);
  const eventosV = useMemo(
    () => (alcance ? eventos.filter((e) => alcance.eventoIds.has(e.id)) : eventos),
    [alcance, eventos],
  );
  const artefactosV = useMemo(
    () => (alcance ? artefactos.filter((a) => alcance.artefactoIds.has(a.id)) : artefactos),
    [alcance, artefactos],
  );
  const entidadesV = useMemo(
    () => (alcance ? entidades.filter((e) => alcance.entidadIds.has(e.id)) : entidades),
    [alcance, entidades],
  );
  const relacionesV = useMemo(
    () =>
      alcance
        ? relaciones.filter(
            (r) => alcance.entidadIds.has(r.desdeId) && alcance.entidadIds.has(r.hastaId),
          )
        : relaciones,
    [alcance, relaciones],
  );

  const vencimientos = useMemo(
    () =>
      hydrated
        ? proximosVencimientos(eventosV, fragmentos, artefactos, ahora)
        : [],
    [hydrated, eventosV, fragmentos, artefactos, ahora],
  );

  const colas = useMemo(() => {
    if (!hydrated) return [];
    const descartadas = new Set(paresDescartados);
    const n = {
      conexiones: proponerConexiones(
        { artefactos: artefactosV, fragmentos, entidades: entidadesV, relaciones: relacionesV, eventos: eventosV },
        descartadas,
      ).length,
      fichas: oportunidadesFicha(entidadesV, descartadas).length,
      lugares: entidadesV.filter((e) => e.tipo === "lugar" && !e.geo).length,
      fusiones: proponerFusiones(entidadesV, relacionesV, descartadas).length,
    };
    return [
      {
        id: "conexiones",
        cuenta: n.conexiones,
        etiqueta: "conexiones sugeridas",
        href: "/grafo",
      },
      { id: "fichas", cuenta: n.fichas, etiqueta: "fichas por enriquecer", href: "/grafo" },
      { id: "lugares", cuenta: n.lugares, etiqueta: "lugares sin ubicar", href: "/grafo" },
      { id: "fusiones", cuenta: n.fusiones, etiqueta: "fusiones propuestas", href: "/synesis" },
    ].filter((c) => c.cuenta > 0);
  }, [hydrated, artefactosV, fragmentos, entidadesV, relacionesV, eventosV, paresDescartados]);

  const frias = useMemo(
    () => (hydrated ? fuentesFrias(artefactosV, fragmentos, entidadesV) : []),
    [hydrated, artefactosV, fragmentos, entidadesV],
  );

  const hayMaterial =
    hydrated && (datos.length > 0 || artefactos.length > 0);
  const respaldoDias = lastExport !== null ? diasDesde(lastExport, ahora) : null;
  const respaldoVencido =
    hayMaterial &&
    (respaldoDias === null || respaldoDias > RESPALDO_UMBRAL_DIAS);

  const enSilencio =
    hydrated &&
    vencimientos.length === 0 &&
    colas.length === 0 &&
    frias.length === 0 &&
    !respaldoVencido;

  return (
    <section className="flex flex-1 flex-col gap-5 py-4">
      <CasoFocoChip />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-head-sm font-bold uppercase tracking-[0.2em] text-frame-1">
          {manifiestoRadar.nombre}
        </h1>
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
          Atención · sobre tu grafo de conocimiento
        </p>
        <p className="max-w-prose text-caption leading-relaxed text-frame-3">
          {manifiestoRadar.descripcion}
        </p>
      </header>

      {!hayMaterial ? (
        <div className="hud flex flex-col items-center gap-3 p-6 text-center">
          <p className="font-display text-small font-bold uppercase tracking-[0.3em] text-frame-1">
            Sin material aún
          </p>
          <p className="max-w-64 text-caption leading-relaxed text-frame-3">
            Radar vigila lo que ya vive en tu Umwelt. Carga documentos o
            datos en Ingesta; luego vuelve.
          </p>
          <Link
            href="/ingesta"
            className="hud-btn border border-coral px-4 py-2 font-display text-micro font-bold uppercase tracking-[0.25em] text-coral-text"
            style={{ minHeight: "var(--touch-target)" }}
          >
            Abrir Ingesta →
          </Link>
        </div>
      ) : enSilencio ? (
        <div className="hud flex flex-col items-center gap-2 p-6 text-center">
          <p className="font-display text-small font-bold uppercase tracking-[0.3em] text-frame-1">
            Radar en silencio
          </p>
          <p className="max-w-64 text-caption leading-relaxed text-frame-3">
            Sin vencimientos en {HORIZONTE_DIAS} días, sin colas pendientes
            y respaldo al día.
          </p>
        </div>
      ) : (
        <>
          {/* Vencimientos — from the cited cronología */}
          <div className="flex flex-col gap-2">
            <h2 className={seccionClass}>
              Vencimientos{" "}
              <span className="tnum text-coral-text">
                {vencimientos.length}
              </span>
            </h2>
            {vencimientos.length === 0 ? (
              <p className={metaClass}>
                Sin eventos fechados en los próximos {HORIZONTE_DIAS} días.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {vencimientos.slice(0, 10).map((v) => (
                  <li key={v.eventoId} className={filaClass}>
                    <div className="min-w-0 flex-1">
                      <p className="tnum font-mono text-micro font-bold tracking-[0.15em] text-coral-text">
                        {v.fechaTexto} · {etiquetaDias(v.enDias)}
                      </p>
                      <p className="text-caption leading-relaxed text-frame-2">
                        {v.titulo}
                      </p>
                      {v.citas.length > 0 ? (
                        <p className={metaClass}>[{v.citas.join("] [")}]</p>
                      ) : null}
                    </div>
                    <Link href="/grafo" className={accionClass}>
                      Abrir →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Colas por adjudicar */}
          {colas.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className={seccionClass}>Por adjudicar</h2>
              <ul className="flex flex-col gap-1.5">
                {colas.map((c) => (
                  <li key={c.id} className={filaClass}>
                    <p className="min-w-0 flex-1 font-mono text-small text-frame-1">
                      <span className="tnum font-bold text-coral-text">
                        {c.cuenta}
                      </span>{" "}
                      {c.etiqueta}
                    </p>
                    <Link href={c.href} className={accionClass}>
                      Resolver →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Fuentes frías */}
          {frias.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className={seccionClass}>
                Fuentes frías{" "}
                <span className="tnum text-coral-text">{frias.length}</span>
              </h2>
              <ul className="flex flex-col gap-1.5">
                {frias.map((f) => (
                  <li key={f.artefactoId} className={filaClass}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-small text-frame-1">
                        {f.nombre}
                      </p>
                      <p className={metaClass}>
                        {f.estado === "ocr-pendiente"
                          ? "sin texto citable · pásala por OCR"
                          : "sin entidades extraídas"}
                      </p>
                    </div>
                    <Link href="/grafo" className={accionClass}>
                      Procesar →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Respaldo */}
          <div className="flex flex-col gap-2">
            <h2 className={seccionClass}>Respaldo</h2>
            <div className={filaClass}>
              <p className="min-w-0 flex-1 font-mono text-small text-frame-1">
                {respaldoDias === null
                  ? "Nunca has exportado tu Umwelt."
                  : respaldoDias === 0
                    ? "Exportado hoy."
                    : `Último respaldo hace ${respaldoDias} ${respaldoDias === 1 ? "día" : "días"}.`}
                {respaldoVencido ? (
                  <span className="text-coral-text"> Exporta tu JSON.</span>
                ) : null}
              </p>
              <Link href="/ingesta" className={accionClass}>
                Exportar →
              </Link>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
