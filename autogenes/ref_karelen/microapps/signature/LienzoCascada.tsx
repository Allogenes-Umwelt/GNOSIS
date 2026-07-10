"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ajustar,
  boundsDe,
  conAlfa,
  fuenteMono,
  marcoSinanju,
  paleta,
  proyector,
} from "@/microapps/signature/lienzo";
import {
  embeddingEspectral,
  type RedSig,
} from "@/capacidades/signature";
import { ondaDesde } from "@/capacidades/cascada";
import { useNavegable } from "@/microapps/signature/navegable";
import { ControlesZoom } from "@/microapps/signature/ControlesZoom";

/**
 * DECIDIR · Cascada de Bifurcación (M3) — the what-if as fiber optics.
 * The network lies as dark fibers over its spectral embedding; picking a
 * node sends a light pulse outward along the REAL BFS wavefront computed
 * by the cascade engine — the animation IS the computation, one ring per
 * step. Destructive mode shows what dies if the node falls; inductive
 * mode lights the simulated new link first. The pulse runs once and
 * resolves to a static lit state (reduced motion starts there). Nothing
 * here writes: it is simulation of the operator's own graph in memory.
 */

const MS_POR_PASO = 450;

export function LienzoCascada({
  red,
  modo,
  seleccion,
  resaltados,
  onTap,
}: {
  red: RedSig;
  modo: "caida" | "enlace";
  seleccion: string[];
  /** Ids to flag in the resolved state (e.g. orphaned nodes). */
  resaltados: string[];
  onTap: (id: string | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Lazy init (SSR-safe); the effect only listens for changes.
  const [reducido, setReducido] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const inicioRef = useRef(0);
  const nav = useNavegable();
  const { vista } = nav;
  // Node screen positions for tap resolution.
  const posRef = useRef<{ x: number; y: number; id: string }[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducido(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const posiciones = useMemo(() => embeddingEspectral(red), [red]);

  // The pulse's wavefront: rings of node ids from the cascade engine.
  const ondas = useMemo(() => {
    if (modo === "caida" && seleccion.length >= 1)
      return ondaDesde(red, seleccion[0]);
    if (modo === "enlace" && seleccion.length === 2) {
      const conEnlace: RedSig = {
        nodos: red.nodos,
        enlaces: [
          ...red.enlaces,
          { origen: seleccion[0], destino: seleccion[1], peso: 1 },
        ],
      };
      return ondaDesde(conEnlace, seleccion[0], 4);
    }
    return [];
  }, [red, modo, seleccion]);

  const anilloDe = useMemo(() => {
    const m = new Map<string, number>();
    ondas.forEach((anillo, k) => anillo.forEach((id) => m.set(id, k)));
    return m;
  }, [ondas]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let raf = 0;
    inicioRef.current = performance.now();

    const dibujar = () => {
      const l = ajustar(cv);
      if (!l) return;
      const { ctx, w, h } = l;
      const pal = paleta();
      const mono = fuenteMono();

      // The pulse progress in rings; resolved = past the last ring.
      const pasoMax = ondas.length + 0.5;
      const paso = reducido
        ? pasoMax
        : Math.min(
            pasoMax,
            (performance.now() - inicioRef.current) / MS_POR_PASO,
          );
      const resuelto = paso >= pasoMax;

      ctx.clearRect(0, 0, w, h);
      marcoSinanju(ctx, w, h, pal.coral);

      // Project the spectral embedding through the shared navigable
      // viewport (O1): drag to pan, pinch/wheel to zoom, fit to center.
      const caja = boundsDe(posiciones.values());
      const proj = proyector(w, h, caja, vista, 34);
      const p = (id: string): [number, number] | null => {
        const q = posiciones.get(id);
        if (!q) return null;
        return proj.p(q.x, q.y);
      };

      const origen = seleccion[0] ?? null;
      const caido = modo === "caida" ? origen : null;
      const resaltar = new Set(resaltados);

      // Fibers: dark channels; a fiber lights coral while the pulse
      // crosses between its rings; dead fibers fade in the resolved state.
      for (const e of red.enlaces) {
        const a = p(e.origen);
        const b = p(e.destino);
        if (!a || !b) continue;
        const muerta =
          caido !== null && (e.origen === caido || e.destino === caido);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = conAlfa(pal.debil, muerta && resuelto ? 0.06 : 0.2);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (ondas.length > 0 && !muerta) {
          const ka = anilloDe.get(e.origen);
          const kb = anilloDe.get(e.destino);
          if (ka !== undefined && kb !== undefined && Math.abs(ka - kb) === 1) {
            const k = Math.max(ka, kb);
            const brillo = resuelto
              ? 0.22
              : Math.max(0, 1 - Math.abs(paso - k)) * 0.7;
            if (brillo > 0.01) {
              ctx.beginPath();
              ctx.moveTo(a[0], a[1]);
              ctx.lineTo(b[0], b[1]);
              ctx.strokeStyle = conAlfa(pal.coral, brillo);
              ctx.lineWidth = 1.4;
              ctx.stroke();
            }
          }
        }
      }

      // The simulated link: a live fiber that pulses first (ring 0 → 1).
      if (modo === "enlace" && seleccion.length === 2) {
        const a = p(seleccion[0]);
        const b = p(seleccion[1]);
        if (a && b) {
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = conAlfa(pal.coral, resuelto ? 0.9 : 0.55);
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.setLineDash([]);
          if (!resuelto && paso <= 1) {
            const t = Math.max(0, Math.min(1, paso));
            const x = a[0] + (b[0] - a[0]) * t;
            const y = a[1] + (b[1] - a[1]) * t;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = pal.coral;
            ctx.fill();
          }
        }
      }

      // Nodes: grey until the pulse reaches their ring, then lit.
      posRef.current = [];
      ctx.font = `600 9px ${mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const n of red.nodos) {
        const q = p(n.id);
        if (!q) continue;
        const [x, y] = q;
        posRef.current.push({ x, y, id: n.id });
        const k = anilloDe.get(n.id);
        const alcanzado = k !== undefined && paso >= k;
        const esSel = seleccion.includes(n.id);
        const esCaido = caido === n.id;
        const esHuerfano = resuelto && resaltar.has(n.id);

        if (alcanzado && !esCaido) {
          const brillo = resuelto
            ? 0.35
            : Math.max(0.35, 1 - (paso - (k ?? 0)) * 0.4);
          const glow = ctx.createRadialGradient(x, y, 0, x, y, 11);
          glow.addColorStop(0, conAlfa(pal.coral, 0.5 * brillo));
          glow.addColorStop(1, conAlfa(pal.coral, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, esSel ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = esSel
          ? pal.coral
          : alcanzado
            ? conAlfa(pal.coral, 0.75)
            : conAlfa(pal.media, 0.8);
        ctx.fill();

        if (esCaido) {
          // The fallen node: crossed out, honestly dead.
          ctx.strokeStyle = pal.coral;
          ctx.lineWidth = 1.6;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(x - 6, y - 6 * s);
            ctx.lineTo(x + 6, y + 6 * s);
            ctx.stroke();
          }
        }
        if (esHuerfano) {
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = conAlfa(pal.coral, 0.7);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Labels for every node, greedy anti-collision (O1): selection and
      // orphans first, then wavefront, then the rest — a label only drops
      // when its box would overlap one already placed.
      const ocupados: { x: number; y: number; w: number; h: number }[] = [];
      const choca = (bx: number, by: number, bw: number, bh: number) =>
        ocupados.some(
          (o) => bx < o.x + o.w && bx + bw > o.x && by < o.y + o.h && by + bh > o.y,
        );
      const prioridad = (id: string): number =>
        seleccion.includes(id)
          ? 3
          : resuelto && resaltar.has(id)
            ? 2
            : anilloDe.has(id)
              ? 1
              : 0;
      const candidatos = [...red.nodos].sort(
        (a, b) => prioridad(b.id) - prioridad(a.id),
      );
      for (const n of candidatos) {
        const q = p(n.id);
        if (!q) continue;
        const [x, y] = q;
        if (x < -40 || x > w + 40 || y < -20 || y > h + 20) continue;
        const esSel = seleccion.includes(n.id);
        const txt = n.etiqueta.length > 16 ? `${n.etiqueta.slice(0, 15)}…` : n.etiqueta;
        const ancho = ctx.measureText(txt).width;
        if (!esSel && choca(x - ancho / 2 - 2, y - 22, ancho + 4, 15)) continue;
        ocupados.push({ x: x - ancho / 2 - 2, y: y - 22, w: ancho + 4, h: 15 });
        ctx.fillStyle = "rgba(0,0,0,0.32)";
        ctx.fillRect(x - ancho / 2 - 2, y - 21, ancho + 4, 13);
        ctx.fillStyle = esSel ? pal.fuerte : conAlfa(pal.media, 0.9);
        ctx.fillText(txt, x, y - 8);
      }

      if (!reducido && !resuelto) raf = requestAnimationFrame(dibujar);
    };

    dibujar();
    const ro = new ResizeObserver(dibujar);
    ro.observe(cv);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [red, posiciones, ondas, anilloDe, modo, seleccion, resaltados, reducido, vista]);

  const onTapCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const movido = nav.movidoRef.current;
    nav.handlers.onPointerUp(e);
    if (movido) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let mejor: string | null = null;
    let mejorD = 26 ** 2;
    for (const q of posRef.current) {
      const d = (q.x - sx) ** 2 + (q.y - sy) ** 2;
      if (d < mejorD) {
        mejorD = d;
        mejor = q.id;
      }
    }
    onTap(mejor);
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={(el) => {
          ref.current = el;
          nav.refWheel(el);
        }}
        onPointerDown={nav.handlers.onPointerDown}
        onPointerMove={nav.handlers.onPointerMove}
        onPointerCancel={nav.handlers.onPointerCancel}
        onPointerUp={onTapCanvas}
        role="img"
        aria-label={
          red.nodos.length === 0
            ? "Cascada de bifurcación: sin red todavía"
            : modo === "caida"
              ? "Cascada de bifurcación, modo caída: toca un concepto y el pulso muestra qué se desconecta si cae. Arrastra o pellizca para navegar."
              : "Cascada de bifurcación, modo enlace: toca dos conceptos para simular un vínculo nuevo. Arrastra o pellizca para navegar."
        }
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />
      <ControlesZoom onZoom={nav.zoomBoton} onFit={nav.reset} />
    </div>
  );
}
