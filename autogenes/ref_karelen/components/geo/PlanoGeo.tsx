"use client";

import { useEffect, useRef } from "react";
import {
  agruparEnPantalla,
  encuadrar,
  pasoGraticula,
  type CumuloPantalla,
} from "@/lib/geo";
import { cn } from "@/lib/cn";

/** Fixes within this many screen px collapse into one count-badged marker. */
const RADIO_CUMULO = 24;

/**
 * The territory plane — substrate canvas for geocoded entities. Web
 * Mercator over a Gestell graticule: grey grid (the Frame), coastline
 * and Mexican state outlines (borrowed vector geometry, fully offline —
 * zero network), coral diamond fixes (live intelligence), mono labels.
 * Static render — no loop, reduced-motion safe by construction. The
 * detailed tile map (MapaTerritorio) is the opt-in sibling.
 */

export interface PuntoPlano {
  id: string;
  etiqueta: string;
  lat: number;
  lon: number;
}

type Anillo = [number, number][]; // [lon, lat]

interface GeoJsonMinimo {
  features: {
    geometry:
      | { type: "Polygon"; coordinates: Anillo[] }
      | { type: "MultiPolygon"; coordinates: Anillo[][] };
  }[];
}

function extraerAnillos(g: GeoJsonMinimo): Anillo[] {
  const anillos: Anillo[] = [];
  for (const f of g.features) {
    if (f.geometry.type === "Polygon") anillos.push(...f.geometry.coordinates);
    else for (const poli of f.geometry.coordinates) anillos.push(...poli);
  }
  return anillos;
}

// Loaded once per session, only when a plane actually renders.
let contornosPromise: Promise<{ mundo: Anillo[]; estados: Anillo[] }> | null =
  null;
function cargarContornos() {
  if (!contornosPromise) {
    contornosPromise = Promise.all([
      import("@/components/geo/worldLand.json"),
      import("@/components/geo/mexicoStates.json"),
    ]).then(([mundo, estados]) => ({
      mundo: extraerAnillos(mundo.default as unknown as GeoJsonMinimo),
      estados: extraerAnillos(estados.default as unknown as GeoJsonMinimo),
    }));
  }
  return contornosPromise;
}

export function PlanoGeo({
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const puntosRef = useRef(puntos);
  const selRef = useRef(seleccionado);
  const onSelectRef = useRef(onSelect);
  const cumulosRef = useRef<CumuloPantalla[]>([]);
  const contornosRef = useRef<{ mundo: Anillo[]; estados: Anillo[] } | null>(
    null,
  );

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    puntosRef.current = puntos;
    selRef.current = seleccionado;

    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) return;

    const css = getComputedStyle(document.documentElement);
    const coral = css.getPropertyValue("--coral").trim() || "#ff0066";
    const tintaTenue =
      css.getPropertyValue("--viz-ink-3").trim() || "rgb(250 250 248 / 0.3)";
    const textoFuerte =
      css.getPropertyValue("--frame-text-strong").trim() || "#fafaf8";
    const textoMeta = css.getPropertyValue("--text-3").trim() || "#aaaaaa";
    const monoFont = (css.getPropertyValue("--font-mono").trim() ||
      "monospace") as string;

    function dibujar() {
      const rect = parent!.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      const encuadre = encuadrar(puntosRef.current, w, h);
      if (!encuadre) {
        // No points → clear clusters so a tap can't hit a vanished fix.
        cumulosRef.current = [];
        return;
      }
      const { aPantalla, latMin, latMax, lonMin, lonMax } = encuadre;

      // Land + state outlines — anchored geometry, drawn offline. The
      // world polygon is coarse (110 vertices): honest only at
      // continental scale, so it hides when zoomed into a region.
      const contornos = contornosRef.current;
      const span = Math.max(latMax - latMin, lonMax - lonMin);
      if (contornos) {
        const trazarAnillos = (anillos: Anillo[], alpha: number) => {
          ctx!.strokeStyle = tintaTenue;
          ctx!.globalAlpha = alpha;
          ctx!.lineWidth = 0.6;
          for (const anillo of anillos) {
            ctx!.beginPath();
            anillo.forEach(([lon, lat], i) => {
              const [x, y] = aPantalla(lat, lon);
              if (i === 0) ctx!.moveTo(x, y);
              else ctx!.lineTo(x, y);
            });
            ctx!.closePath();
            ctx!.stroke();
          }
          ctx!.globalAlpha = 1;
        };
        if (span > 40) trazarAnillos(contornos.mundo, 0.9);
        trazarAnillos(contornos.estados, 0.5);
      }

      // Graticule — the Frame. Straight lines are exact in Mercator.
      const paso = pasoGraticula(
        Math.max(latMax - latMin, lonMax - lonMin),
      );
      ctx!.strokeStyle = tintaTenue;
      ctx!.fillStyle = textoMeta;
      ctx!.font = `8px ${monoFont}`;
      ctx!.lineWidth = 0.5;
      const dec = paso < 1 ? 2 : 0;
      for (
        let lon = Math.ceil(lonMin / paso) * paso;
        lon <= lonMax;
        lon += paso
      ) {
        const [x0, y0] = aPantalla(latMax, lon);
        const [x1, y1] = aPantalla(latMin, lon);
        ctx!.beginPath();
        ctx!.moveTo(x0, y0);
        ctx!.lineTo(x1, y1);
        ctx!.stroke();
        ctx!.textAlign = "left";
        ctx!.fillText(`${lon.toFixed(dec)}°`, x0 + 2, h - 4);
      }
      for (
        let lat = Math.ceil(latMin / paso) * paso;
        lat <= latMax;
        lat += paso
      ) {
        const [x0, y0] = aPantalla(lat, lonMin);
        const [x1, y1] = aPantalla(lat, lonMax);
        ctx!.beginPath();
        ctx!.moveTo(x0, y0);
        ctx!.lineTo(x1, y1);
        ctx!.stroke();
        ctx!.textAlign = "left";
        ctx!.fillText(`${lat.toFixed(dec)}°`, 4, y0 - 2);
      }

      // Fixes — the Coral. Overlapping fixes cluster into one count-badged
      // marker so dense zones stay legible; lone fixes draw as before.
      const proyectados = puntosRef.current.map((p) => {
        const [x, y] = aPantalla(p.lat, p.lon);
        return { id: p.id, x, y };
      });
      const nombreDe = new Map(
        puntosRef.current.map((p) => [p.id, p.etiqueta] as const),
      );
      const cumulos = agruparEnPantalla(proyectados, RADIO_CUMULO);
      cumulosRef.current = cumulos;

      const dibujarRombo = (x: number, y: number, r: number, esSel: boolean) => {
        ctx!.save();
        ctx!.translate(x, y);
        ctx!.rotate(Math.PI / 4);
        ctx!.strokeStyle = coral;
        ctx!.globalAlpha = esSel ? 0.35 : 0.18;
        ctx!.lineWidth = 5;
        ctx!.strokeRect(-r / 2, -r / 2, r, r);
        ctx!.globalAlpha = esSel ? 1 : 0.85;
        ctx!.lineWidth = 1.2;
        ctx!.strokeRect(-r / 2, -r / 2, r, r);
        ctx!.restore();
        ctx!.globalAlpha = 1;
      };

      for (const c of cumulos) {
        const solo = c.ids.length === 1;
        const idSel = c.ids.find((id) => id === selRef.current) ?? null;
        const esSel = idSel !== null;
        const r = solo ? (esSel ? 7 : 5.5) : esSel ? 9 : 8;
        dibujarRombo(c.x, c.y, r, esSel);

        if (solo) {
          // apex tick
          ctx!.beginPath();
          ctx!.arc(c.x, c.y, 1.2, 0, Math.PI * 2);
          ctx!.fillStyle = coral;
          ctx!.fill();
          const nombre = nombreDe.get(c.ids[0]) ?? "";
          const texto =
            nombre.length > 18 ? `${nombre.slice(0, 17)}…` : nombre;
          ctx!.font = `${esSel ? 9.5 : 8.5}px ${monoFont}`;
          ctx!.textAlign = "center";
          ctx!.fillStyle = esSel ? textoFuerte : textoMeta;
          ctx!.fillText(texto.toUpperCase(), c.x, c.y + r + 12);
        } else {
          // Count badge in the diamond; label reads the selected member
          // when one is active, else how many fixes are stacked here.
          ctx!.font = `bold 9px ${monoFont}`;
          ctx!.textAlign = "center";
          ctx!.textBaseline = "middle";
          ctx!.fillStyle = coral;
          ctx!.fillText(String(c.ids.length), c.x, c.y);
          ctx!.textBaseline = "alphabetic";
          const nombreSel = idSel ? (nombreDe.get(idSel) ?? "") : "";
          const etiqueta = esSel
            ? nombreSel.length > 16
              ? `${nombreSel.slice(0, 15)}…`
              : nombreSel
            : `${c.ids.length} lugares`;
          ctx!.font = `${esSel ? 9.5 : 8.5}px ${monoFont}`;
          ctx!.fillStyle = esSel ? textoFuerte : textoMeta;
          ctx!.fillText(etiqueta.toUpperCase(), c.x, c.y + r + 12);
        }
      }
    }

    dibujar();
    let vivo = true;
    void cargarContornos().then((c) => {
      if (!vivo) return;
      contornosRef.current = c;
      dibujar();
    });
    const ro = new ResizeObserver(dibujar);
    ro.observe(parent);

    function onTap(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      let mejor: CumuloPantalla | null = null;
      let md = 24 * 24;
      for (const c of cumulosRef.current) {
        const d = (c.x - sx) ** 2 + (c.y - sy) ** 2;
        if (d < md) {
          md = d;
          mejor = c;
        }
      }
      if (!mejor) {
        onSelectRef.current(null);
        return;
      }
      if (mejor.ids.length === 1) {
        onSelectRef.current(
          selRef.current === mejor.ids[0] ? null : mejor.ids[0],
        );
        return;
      }
      // A stacked cluster: each tap steps to the next member, then clears —
      // so a dense zone can be walked without a zoom the local plane lacks.
      const idx = mejor.ids.indexOf(selRef.current ?? "");
      const siguiente =
        idx < 0
          ? mejor.ids[0]
          : idx + 1 < mejor.ids.length
            ? mejor.ids[idx + 1]
            : null;
      onSelectRef.current(siguiente);
    }
    canvas.addEventListener("pointerup", onTap);

    return () => {
      vivo = false;
      ro.disconnect();
      canvas.removeEventListener("pointerup", onTap);
    };
  }, [puntos, seleccionado]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("h-full w-full touch-none", className)}
      role="img"
      aria-label={`Plano territorial: ${puntos.length} ${puntos.length === 1 ? "lugar ubicado" : "lugares ubicados"}. Toca un punto para inspeccionarlo.`}
    />
  );
}
