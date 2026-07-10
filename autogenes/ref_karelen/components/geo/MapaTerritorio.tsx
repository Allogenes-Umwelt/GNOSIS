"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import estiloGestell from "@/components/geo/gestell-dark.json";
import type { PuntoPlano } from "@/components/geo/PlanoGeo";
import { cn } from "@/lib/cn";

/**
 * Detailed territory map — the BARBELO/TELOS Gestell-dark MapLibre style
 * ported verbatim (48 layers over OpenFreeMap vector tiles). Renders
 * ONLY after the operator's explicit opt-in: every tile request reveals
 * the viewed area to the tile host. Pins ride as our own coral layer on
 * top; the analytic deck (BARBELO) docks here later.
 */

const FUENTE_PINS = "umwelt-pins";

function aGeoJson(puntos: PuntoPlano[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: puntos.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { id: p.id, etiqueta: p.etiqueta },
    })),
  };
}

export function MapaTerritorio({
  puntos,
  seleccionado,
  onSelect,
  className,
}: {
  puntos: PuntoPlano[];
  seleccionado: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  const contRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const listoRef = useRef(false);
  const puntosRef = useRef(puntos);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = contRef.current;
    if (!container) return;
    const css = getComputedStyle(document.documentElement);
    const coral = css.getPropertyValue("--coral").trim() || "#ff0066";
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const map = new maplibregl.Map({
      container,
      style: estiloGestell as unknown as StyleSpecification,
      center: [-99.1332, 19.4326],
      zoom: 4.4,
      minZoom: 0.8,
      maxZoom: 18,
      // North-up map: no accidental rotation on a phone.
      dragRotate: false,
      // OSM/ODbL credit stays visible, folded to a corner tick.
      attributionControl: { compact: true },
      fadeDuration: reduce ? 0 : 300,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    map.on("load", () => {
      listoRef.current = true;
      map.addSource(FUENTE_PINS, {
        type: "geojson",
        data: aGeoJson(puntosRef.current),
      });
      map.addLayer({
        id: "pins-halo",
        type: "circle",
        source: FUENTE_PINS,
        paint: {
          "circle-radius": 10,
          "circle-color": coral,
          "circle-opacity": 0.16,
        },
      });
      map.addLayer({
        id: "pins-core",
        type: "circle",
        source: FUENTE_PINS,
        paint: {
          "circle-radius": 4,
          "circle-color": coral,
          "circle-stroke-width": 1.2,
          "circle-stroke-color": coral,
          "circle-opacity": 0.9,
        },
      });
      encuadrar(map, puntosRef.current, reduce);
    });

    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["pins-core", "pins-halo"],
      });
      const id = hits[0]?.properties?.id;
      onSelectRef.current(typeof id === "string" ? id : null);
    });

    return () => {
      listoRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Pins follow the graph reactively; the basemap never re-initializes.
  useEffect(() => {
    puntosRef.current = puntos;
    const map = mapRef.current;
    if (!map || !listoRef.current) return;
    const fuente = map.getSource(FUENTE_PINS) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (fuente) {
      fuente.setData(aGeoJson(puntos));
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      encuadrar(map, puntos, reduce);
    }
  }, [puntos]);

  // Selection pulse: widen the selected pin's halo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listoRef.current || !map.getLayer("pins-halo")) return;
    map.setPaintProperty("pins-halo", "circle-radius", [
      "case",
      ["==", ["get", "id"], seleccionado ?? ""],
      16,
      10,
    ]);
    map.setPaintProperty("pins-halo", "circle-opacity", [
      "case",
      ["==", ["get", "id"], seleccionado ?? ""],
      0.35,
      0.16,
    ]);
  }, [seleccionado]);

  return (
    <div
      ref={contRef}
      className={cn("h-full w-full", className)}
      role="img"
      aria-label={`Mapa territorial detallado: ${puntos.length} ${puntos.length === 1 ? "lugar ubicado" : "lugares ubicados"}.`}
    />
  );
}

function encuadrar(
  map: maplibregl.Map,
  puntos: PuntoPlano[],
  reduce: boolean,
): void {
  if (puntos.length === 0) return;
  if (puntos.length === 1) {
    map.jumpTo({ center: [puntos[0].lon, puntos[0].lat], zoom: 11 });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const p of puntos) bounds.extend([p.lon, p.lat]);
  map.fitBounds(bounds, {
    padding: 48,
    maxZoom: 13,
    animate: !reduce,
    duration: 480,
  });
}
