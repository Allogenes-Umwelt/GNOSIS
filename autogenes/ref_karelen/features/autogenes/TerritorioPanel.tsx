"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { PlanoGeo } from "@/components/geo/PlanoGeo";
import type { CandidatoLugar } from "@/lib/geo";
import { buscarLugar, ubicarEntidad } from "@/services/autogenes";
import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";
import { usePreferenciasStore } from "@/store/preferencias";
import { cn } from "@/lib/cn";

// MapLibre + the 48-layer Gestell style load ONLY after tile opt-in.
const MapaTerritorio = dynamic(
  () =>
    import("@/components/geo/MapaTerritorio").then((m) => m.MapaTerritorio),
  {
    ssr: false,
    loading: () => (
      <p className="flex h-full items-center justify-center font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
        Cargando mapa…
      </p>
    ),
  },
);

/**
 * TERRITORIO (B4/B4b) — the geo primitive made operable. Entities of
 * the world (tipo lugar) get geocoded through the OSM connector; the
 * operator picks the right candidate (HITL — a name can mean many
 * places) and the fix lands on the plane. Two renders: the local
 * Mercator plane (no network, default) and the detailed BARBELO-styled
 * map (OpenFreeMap tiles, explicit opt-in — tiles reveal the viewed
 * area). Nothing is located and nothing leaves without confirmation.
 */
export function TerritorioPanel() {
  const entidades = useAutogenesStore((s) => s.entidades);
  const fire = useBurstStore((s) => s.fire);
  const tilesRemotos = usePreferenciasStore((s) => s.tilesRemotos);
  const setTilesRemotos = usePreferenciasStore((s) => s.setTilesRemotos);
  const [confirmaTiles, setConfirmaTiles] = useState(false);

  const lugares = useMemo(
    () => entidades.filter((e) => e.tipo === "lugar" || e.geo),
    [entidades],
  );
  const ubicados = useMemo(() => lugares.filter((e) => e.geo), [lugares]);
  const puntos = useMemo(
    () =>
      ubicados.flatMap((e) =>
        e.geo
          ? [{ id: e.id, etiqueta: e.nombre, lat: e.geo.lat, lon: e.geo.lon }]
          : [],
      ),
    [ubicados],
  );

  const [sel, setSel] = useState<string | null>(null);
  const [buscando, setBuscando] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<{
    entidadId: string;
    lista: CandidatoLugar[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ubicar(entidadId: string, nombre: string) {
    setBuscando(entidadId);
    setError(null);
    setCandidatos(null);
    try {
      const lista = await buscarLugar(nombre);
      if (lista.length === 0) {
        setError(
          `Sin coordenadas para “${nombre}”. Reformula con ciudad y estado.`,
        );
      } else {
        setCandidatos({ entidadId, lista });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "La geocodificación falló. Reintenta.",
      );
    } finally {
      setBuscando(null);
    }
  }

  if (lugares.length === 0) return null;

  const detalle = sel ? ubicados.find((e) => e.id === sel) : null;

  return (
    <div className="hud flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Territorio
        </h2>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {ubicados.length} / {lugares.length}{" "}
          {lugares.length === 1 ? "lugar" : "lugares"}
        </span>
      </div>

      {ubicados.length > 0 ? (
        <>
          <div className="h-72 w-full">
            {tilesRemotos ? (
              <MapaTerritorio
                puntos={puntos}
                seleccionado={sel}
                onSelect={setSel}
              />
            ) : (
              <PlanoGeo
                puntos={puntos}
                seleccionado={sel}
                onSelect={setSel}
              />
            )}
          </div>

          {tilesRemotos ? (
            <button
              type="button"
              onClick={() => setTilesRemotos(false)}
              className="self-end border border-structural px-3 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
            >
              Usar plano local
            </button>
          ) : confirmaTiles ? (
            <div className="flex flex-col gap-2 border-t border-structural pt-2">
              <p className="text-caption leading-relaxed text-frame-2">
                El mapa detallado pide los tiles a{" "}
                <span className="text-coral-text">OpenFreeMap</span>: la zona
                que mires sale de este dispositivo hacia ese servicio. El
                plano local no envía nada.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmaTiles(false)}
                  className="border border-structural px-3 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTilesRemotos(true);
                    setConfirmaTiles(false);
                  }}
                  className="hud-btn border border-coral px-3 py-1.5 font-mono text-micro font-bold uppercase tracking-[0.15em] text-coral-text"
                >
                  Activar mapa
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmaTiles(true)}
              className="self-end border border-structural px-3 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
            >
              Mapa detallado
            </button>
          )}
        </>
      ) : (
        <p className="text-caption leading-relaxed text-frame-3">
          Hay lugares en tu grafo sin coordenadas. Ubícalos para verlos en el
          plano.
        </p>
      )}

      {detalle?.geo ? (
        <div className="flex flex-col gap-1 border-t border-structural pt-2">
          <p className="font-display text-micro font-bold uppercase tracking-[0.25em] text-coral-text">
            {detalle.nombre}
          </p>
          <p className="tnum font-mono text-micro tracking-[0.12em] text-frame-3">
            {detalle.geo.lat.toFixed(5)}, {detalle.geo.lon.toFixed(5)}
            {detalle.resumen ? ` · ${detalle.resumen}` : ""}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="border border-structural bg-contain px-3 py-2 font-mono text-micro tracking-wide text-frame-2">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {lugares.map((e) => (
          <li
            key={e.id}
            className="border border-structural bg-contain px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                  {e.nombre}
                </p>
                <p className="tnum mt-0.5 font-mono text-micro tracking-[0.15em] text-frame-3">
                  {e.geo
                    ? `${e.geo.lat.toFixed(4)}, ${e.geo.lon.toFixed(4)}`
                    : "sin coordenadas"}
                </p>
              </div>
              {e.geo ? (
                <button
                  type="button"
                  onClick={() => {
                    ubicarEntidad(e.id, undefined);
                    if (sel === e.id) setSel(null);
                  }}
                  className="shrink-0 border border-structural px-2.5 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                >
                  Soltar pin
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void ubicar(e.id, e.nombre)}
                  disabled={buscando !== null}
                  className={cn(
                    "hud-btn shrink-0 border px-2.5 py-1.5 font-mono text-micro font-bold uppercase tracking-[0.15em]",
                    buscando === null || buscando === e.id
                      ? "border-coral text-coral-text"
                      : "border-structural text-frame-3",
                  )}
                >
                  {buscando === e.id ? "Buscando…" : "Ubicar"}
                </button>
              )}
            </div>

            {candidatos?.entidadId === e.id ? (
              <div className="mt-2 flex flex-col gap-1.5 border-t border-structural pt-2">
                <p className="font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
                  Elige la ubicación correcta:
                </p>
                {candidatos.lista.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      ubicarEntidad(e.id, { lat: c.lat, lon: c.lon });
                      setCandidatos(null);
                      setSel(e.id);
                      fire();
                    }}
                    className="border border-structural px-3 py-2 text-left text-caption leading-relaxed text-frame-2"
                    style={{ minHeight: "var(--touch-target)" }}
                  >
                    <span className="tnum mr-2 font-mono text-micro text-coral-text">
                      {c.lat.toFixed(3)}, {c.lon.toFixed(3)}
                    </span>
                    {c.nombre.length > 90
                      ? `${c.nombre.slice(0, 89)}…`
                      : c.nombre}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCandidatos(null)}
                  className="self-end border border-structural px-3 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                >
                  Cancelar
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
