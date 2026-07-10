"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { GrafoCanvas } from "@/components/grafo/GrafoCanvas";
import { construirGrafo } from "@/lib/grafo";
import {
  caminoMasCorto,
  masConectadas,
  vecindario,
  CaminoGuardadoSchema,
  type CaminoGuardado,
} from "@/capacidades/caminos";
import { manifiestoVinculos } from "@/microapps/vinculos/manifest";
import { alcanceDeCaso } from "@/capacidades/casos";
import { CasoFocoChip } from "@/components/shell/CasoFocoChip";
import { dockearProducto } from "@/services/autogenes";
import { useAutogenesStore } from "@/store/autogenes";
import { useCasoFocoStore } from "@/store/casoFoco";
import { useBurstStore } from "@/store/burst";

const subscribeNoop = () => () => {};

const seccionClass =
  "font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2";
const metaClass = "font-mono text-micro tracking-[0.12em] text-frame-3";
const selectClass =
  "w-full border border-structural bg-inset px-3 py-2.5 font-mono text-small text-frame-1 focus:border-soft focus:outline-none";

/**
 * VÍNCULOS — the relation explorer. Pure walks over the substrate:
 * shortest path between two entities (every hop with its typed edge,
 * real direction and citations), neighborhoods by degree, and the
 * graph's hubs. Read-only; the canvas dims everything off-path.
 */
export function VinculosView() {
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const artefactos = useAutogenesStore((s) => s.artefactos);
  const fragmentos = useAutogenesStore((s) => s.fragmentos);
  const entidades = useAutogenesStore((s) => s.entidades);
  const relaciones = useAutogenesStore((s) => s.relaciones);
  const productos = useAutogenesStore((s) => s.productos);
  const eventos = useAutogenesStore((s) => s.eventos);
  const casos = useAutogenesStore((s) => s.casos);
  const casoActivoId = useCasoFocoStore((s) => s.casoActivoId);
  const fire = useBurstStore((s) => s.fire);

  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [guardado, setGuardado] = useState(false);

  // L·5 — case scope: paths and hubs read only the case sub-graph when
  // a case is in focus.
  const alcance = useMemo(() => {
    const caso = casos.find((c) => c.id === casoActivoId);
    return caso ? alcanceDeCaso(caso, { fragmentos, entidades, eventos }) : null;
  }, [casos, casoActivoId, fragmentos, entidades, eventos]);
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

  const ordenadas = useMemo(
    () =>
      hydrated
        ? [...entidadesV].sort((a, b) => a.nombre.localeCompare(b.nombre))
        : [],
    [hydrated, entidadesV],
  );
  const nombreDe = useMemo(
    () => new Map(entidades.map((e) => [e.id, e.nombre] as const)),
    [entidades],
  );

  const camino = useMemo(
    () =>
      hydrated && origenId && destinoId && origenId !== destinoId
        ? caminoMasCorto(origenId, destinoId, relacionesV, fragmentos, artefactos)
        : null,
    [hydrated, origenId, destinoId, relacionesV, fragmentos, artefactos],
  );

  const cercanas = useMemo(
    () =>
      hydrated && origenId && !destinoId
        ? vecindario(origenId, relacionesV, 2)
        : null,
    [hydrated, origenId, destinoId, relacionesV],
  );

  const hubs = useMemo(
    () => (hydrated ? masConectadas(entidadesV, relacionesV, 5) : []),
    [hydrated, entidadesV, relacionesV],
  );

  const grafo = useMemo(
    () =>
      hydrated
        ? construirGrafo(artefactos, fragmentos, entidadesV, relacionesV)
        : { nodos: [], enlaces: [] },
    [hydrated, artefactos, fragmentos, entidadesV, relacionesV],
  );

  const resaltados = useMemo(() => {
    if (camino) return camino.entidades;
    if (cercanas && origenId) return [origenId, ...cercanas.keys()];
    return null;
  }, [camino, cercanas, origenId]);

  const sinMaterial = hydrated && relaciones.length === 0;
  const buscando = Boolean(origenId && destinoId && origenId !== destinoId);

  // The unit's own shelf: docked caminos, newest first (E3).
  const guardados = useMemo(
    () => (hydrated ? productos.filter((p) => p.unidad === "vinculos") : []),
    [hydrated, productos],
  );
  const [abierto, setAbierto] = useState<string | null>(null);

  function guardarCamino() {
    if (!camino || guardado) return;
    const cuerpo: CaminoGuardado = {
      nombres: camino.entidades.map((id) => nombreDe.get(id) ?? id),
      pasos: camino.pasos.map((p) => ({
        tipo: p.tipo,
        saliente: p.saliente,
        citas: p.citas,
      })),
    };
    dockearProducto({
      clase: "camino",
      titulo: `${cuerpo.nombres[0]} ↔ ${cuerpo.nombres[cuerpo.nombres.length - 1]}`,
      unidad: "vinculos",
      cuerpo,
      entidades: camino.entidades,
    });
    setGuardado(true);
    fire();
  }

  return (
    <section className="flex flex-1 flex-col gap-5 py-4">
      <CasoFocoChip />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-head-sm font-bold uppercase tracking-[0.2em] text-frame-1">
          {manifiestoVinculos.nombre}
        </h1>
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
          Relaciones · sobre tu grafo de conocimiento
        </p>
        <p className="max-w-prose text-caption leading-relaxed text-frame-3">
          {manifiestoVinculos.descripcion}
        </p>
      </header>

      {sinMaterial ? (
        <div className="hud flex flex-col items-center gap-3 p-6 text-center">
          <p className="font-display text-small font-bold uppercase tracking-[0.3em] text-frame-1">
            Sin relaciones aún
          </p>
          <p className="max-w-64 text-caption leading-relaxed text-frame-3">
            Vínculos camina las relaciones de tu grafo. Extrae documentos o
            enlaza conexiones sugeridas en Autogenes; luego vuelve.
          </p>
          <Link
            href="/grafo"
            className="hud-btn border border-coral px-4 py-2 font-display text-micro font-bold uppercase tracking-[0.25em] text-coral-text"
            style={{ minHeight: "var(--touch-target)" }}
          >
            Abrir Autogenes →
          </Link>
        </div>
      ) : (
        <>
          {/* Origin / destination */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="vinculos-origen"
                className="font-mono text-micro uppercase tracking-[0.2em] text-frame-3"
              >
                Origen
              </label>
              <select
                id="vinculos-origen"
                value={origenId}
                onChange={(e) => {
                  setOrigenId(e.target.value);
                  setGuardado(false);
                }}
                className={selectClass}
                style={{ minHeight: "var(--touch-target)" }}
              >
                <option value="">Elige una entidad</option>
                {ordenadas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="vinculos-destino"
                className="font-mono text-micro uppercase tracking-[0.2em] text-frame-3"
              >
                Destino
              </label>
              <select
                id="vinculos-destino"
                value={destinoId}
                onChange={(e) => {
                  setDestinoId(e.target.value);
                  setGuardado(false);
                }}
                className={selectClass}
                style={{ minHeight: "var(--touch-target)" }}
              >
                <option value="">Sin destino · ver vecindario</option>
                {ordenadas
                  .filter((e) => e.id !== origenId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* The path */}
          {buscando ? (
            camino ? (
              <div className="hud hud-live flex flex-col gap-2 p-3">
                <p className="font-display text-micro font-bold uppercase tracking-[0.3em] text-coral-text">
                  {camino.pasos.length}{" "}
                  {camino.pasos.length === 1
                    ? "grado de separación"
                    : "grados de separación"}
                </p>
                <ol className="flex flex-col">
                  {camino.entidades.map((id, i) => (
                    <li key={id} className="flex flex-col">
                      <p className="font-display text-small font-bold uppercase tracking-[0.2em] text-frame-1">
                        {nombreDe.get(id) ?? id}
                      </p>
                      {i < camino.pasos.length ? (
                        <div className="my-1 border-l border-structural pl-3">
                          <p className="font-mono text-micro tracking-[0.15em] text-coral-text">
                            {camino.pasos[i].saliente ? "↓" : "↑"}{" "}
                            {camino.pasos[i].tipo}
                          </p>
                          {camino.pasos[i].citas.length > 0 ? (
                            <p className={metaClass}>
                              [{camino.pasos[i].citas.join("] [")}]
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={guardarCamino}
                  disabled={guardado}
                  className={
                    guardado
                      ? "hud-btn self-end border border-structural px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-frame-3"
                      : "hud-btn self-end border border-coral px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
                  }
                  style={{ minHeight: "var(--touch-target)" }}
                >
                  {guardado ? "En el grafo" : "Guardar camino"}
                </button>
              </div>
            ) : (
              <p className="border border-structural bg-contain px-3 py-2 font-mono text-micro tracking-wide text-frame-2">
                Sin camino entre esas entidades en tu grafo. Revisa las
                conexiones sugeridas en Autogenes.
              </p>
            )
          ) : null}

          {/* Neighborhood (origin only) */}
          {cercanas && origenId ? (
            <div className="flex flex-col gap-2">
              <h2 className={seccionClass}>
                Vecindario{" "}
                <span className="tnum text-coral-text">{cercanas.size}</span>
              </h2>
              {cercanas.size === 0 ? (
                <p className={metaClass}>
                  {nombreDe.get(origenId)} no tiene relaciones todavía.
                </p>
              ) : (
                [1, 2].map((d) => {
                  const enGrado = [...cercanas.entries()]
                    .filter(([, dist]) => dist === d)
                    .map(([id]) => nombreDe.get(id) ?? id);
                  if (enGrado.length === 0) return null;
                  return (
                    <p key={d} className="text-caption leading-relaxed text-frame-2">
                      <span className="tnum font-mono text-micro tracking-[0.15em] text-coral-text">
                        a {d} {d === 1 ? "salto" : "saltos"} ·{" "}
                        {enGrado.length}
                      </span>{" "}
                      — {enGrado.join(" · ")}
                    </p>
                  );
                })
              )}
            </div>
          ) : null}

          {/* Canvas with the walk highlighted */}
          {grafo.nodos.length > 0 ? (
            <div className="hud flex flex-col gap-2 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className={seccionClass}>Grafo</h2>
                <Link
                  href="/grafo"
                  className="shrink-0 font-mono text-micro uppercase tracking-[0.2em] text-coral-text"
                >
                  Editar en Autogenes →
                </Link>
              </div>
              <div className="h-72 w-full">
                <GrafoCanvas
                  nodos={grafo.nodos}
                  enlaces={grafo.enlaces}
                  seleccionado={origenId || null}
                  onSelect={(id) => {
                    if (id && nombreDe.has(id)) setOrigenId(id);
                  }}
                  resaltados={resaltados}
                />
              </div>
              <p className={metaClass}>
                {resaltados
                  ? "Lo apagado no participa en este vínculo."
                  : "Toca una entidad para fijar el origen."}
              </p>
            </div>
          ) : null}

          {/* Hubs */}
          {hubs.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className={seccionClass}>Más conectadas</h2>
              <ul className="flex flex-col gap-1.5">
                {hubs.map(({ entidad, grado }) => (
                  <li key={entidad.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOrigenId(entidad.id);
                        setDestinoId("");
                        setGuardado(false);
                      }}
                      className="flex w-full items-center gap-3 border border-structural bg-contain px-3 py-2 text-left"
                      style={{ minHeight: "var(--touch-target)" }}
                    >
                      <span className="tnum font-mono text-small font-bold text-coral-text">
                        {grado}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                          {entidad.nombre}
                        </span>
                        <span className={`block ${metaClass}`}>
                          {entidad.tipo} · toca para fijar como origen
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Docked caminos — snapshots living in the ontology (E3) */}
          {guardados.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className={seccionClass}>
                Caminos guardados{" "}
                <span className="tnum text-coral-text">{guardados.length}</span>
              </h2>
              <ul className="flex flex-col gap-1.5">
                {guardados.map((p) => {
                  const cuerpo = CaminoGuardadoSchema.safeParse(p.cuerpo);
                  const expandido = abierto === p.id && cuerpo.success;
                  return (
                    <li
                      key={p.id}
                      className="border border-structural bg-contain px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setAbierto(abierto === p.id ? null : p.id)
                        }
                        aria-expanded={expandido}
                        className="flex w-full items-center justify-between gap-3 text-left"
                        style={{ minHeight: "var(--touch-target)" }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                            {p.titulo}
                          </span>
                          <span className={`mt-0.5 block tnum ${metaClass}`}>
                            {new Date(p.createdAt).toLocaleDateString("es-MX")}{" "}
                            · {p.entidades.length} entidades
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
                          {expandido ? "Cerrar" : "Ver →"}
                        </span>
                      </button>
                      {expandido && cuerpo.success ? (
                        <ol className="mt-2 flex flex-col border-t border-structural pt-2">
                          {cuerpo.data.nombres.map((n, i) => (
                            <li key={`${p.id}-${i}`} className="flex flex-col">
                              <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                                {n}
                              </p>
                              {i < cuerpo.data.pasos.length ? (
                                <div className="my-1 border-l border-structural pl-3">
                                  <p className="font-mono text-micro tracking-[0.15em] text-coral-text">
                                    {cuerpo.data.pasos[i].saliente ? "↓" : "↑"}{" "}
                                    {cuerpo.data.pasos[i].tipo}
                                  </p>
                                  {cuerpo.data.pasos[i].citas.length > 0 ? (
                                    <p className={metaClass}>
                                      [{cuerpo.data.pasos[i].citas.join("] [")}]
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
