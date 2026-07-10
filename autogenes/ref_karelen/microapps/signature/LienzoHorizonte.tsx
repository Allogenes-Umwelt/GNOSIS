"use client";

import { useEffect, useRef, useState } from "react";
import {
  ajustar,
  conAlfa,
  fuenteMono,
  marcoSinanju,
  paleta,
  reticula,
} from "@/microapps/signature/lienzo";
import { useVisible } from "@/microapps/signature/useVisible";
import type { Horizonte, LineaIntervencion } from "@/capacidades/horizonte";

/**
 * ACTUAR · Horizonte de Eventos (M4) — a longitudinal oscilloscope over
 * the operator's own telemetry. Waves = sampled metrics (conceptos,
 * vínculos) from the qualia snapshots; vertical coral lines = operator
 * interventions from the D1 audit log; tapping a line surfaces the
 * measured before/after delta. Samples are drawn as dots because that is
 * what they are — nothing between samples is invented. The scanline is
 * chrome only (skipped under reduced motion).
 */

const MARGEN = 30;

export function LienzoHorizonte({
  horizonte,
  seleccionada,
  onSelect,
}: {
  horizonte: Horizonte;
  seleccionada: LineaIntervencion | null;
  onSelect: (l: LineaIntervencion | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Lazy init (SSR-safe); the effect only listens for changes.
  const [reducido, setReducido] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const faseRef = useRef(0);
  const visible = useVisible(ref);
  // Intervention-line x positions for tap resolution.
  const posRef = useRef<{ x: number; linea: LineaIntervencion }[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducido(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let raf = 0;

    const dibujar = () => {
      const l = ajustar(cv);
      if (!l) return;
      const { ctx, w, h } = l;
      const pal = paleta();
      const mono = fuenteMono();
      const { puntos, lineas, t0, t1 } = horizonte;
      const ancho = Math.max(t1 - t0, 1);
      const x = (ts: number) =>
        MARGEN + ((ts - t0) / ancho) * (w - MARGEN * 2);
      const y = (v: number, max: number) =>
        h - MARGEN - (v / max) * (h - MARGEN * 2);

      ctx.clearRect(0, 0, w, h);
      reticula(ctx, w, h, pal.debil);
      marcoSinanju(ctx, w, h, pal.coral);

      // Traces: conceptos (strong ink) and vínculos (medium ink), each
      // normalized to its own max — sampled dots joined by thin lines.
      const trazas: {
        valor: (p: (typeof puntos)[number]) => number;
        max: number;
        tinta: string;
      }[] = [
        { valor: (p) => p.nNodos, max: horizonte.maxNodos, tinta: pal.fuerte },
        {
          valor: (p) => p.nEnlaces,
          max: horizonte.maxEnlaces,
          tinta: pal.media,
        },
      ];
      for (const t of trazas) {
        ctx.beginPath();
        puntos.forEach((p, i) => {
          const px = x(p.ts);
          const py = y(t.valor(p), t.max);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = conAlfa(t.tinta, 0.7);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        for (const p of puntos) {
          ctx.beginPath();
          ctx.arc(x(p.ts), y(t.valor(p), t.max), 2.5, 0, Math.PI * 2);
          ctx.fillStyle = t.tinta;
          ctx.fill();
        }
      }

      // Intervention lines: the operator's marks on time.
      posRef.current = [];
      for (const linea of lineas) {
        const px = x(linea.ts);
        posRef.current.push({ x: px, linea });
        const esSel =
          seleccionada !== null &&
          seleccionada.ts === linea.ts &&
          seleccionada.accion === linea.accion;
        ctx.beginPath();
        ctx.moveTo(px, MARGEN - 6);
        ctx.lineTo(px, h - MARGEN + 6);
        ctx.strokeStyle = conAlfa(pal.coral, esSel ? 0.95 : 0.45);
        ctx.lineWidth = esSel ? 1.8 : 1;
        ctx.stroke();
        // Crest tick, Sinanju-style.
        ctx.beginPath();
        ctx.moveTo(px - 3, MARGEN - 6);
        ctx.lineTo(px + 3, MARGEN - 6);
        ctx.strokeStyle = conAlfa(pal.coral, esSel ? 1 : 0.6);
        ctx.stroke();
      }

      // Scanline: chrome only, paused while out of view.
      if (!reducido && visible) {
        faseRef.current = (faseRef.current + 0.0035) % 1;
        const sx = MARGEN + faseRef.current * (w - MARGEN * 2);
        const grad = ctx.createLinearGradient(sx - 14, 0, sx, 0);
        grad.addColorStop(0, conAlfa(pal.coral, 0));
        grad.addColorStop(1, conAlfa(pal.coral, 0.1));
        ctx.fillStyle = grad;
        ctx.fillRect(sx - 14, MARGEN, 14, h - MARGEN * 2);
      }

      // Legend + time bounds, honest and monospaced.
      ctx.font = `600 9px ${mono}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillStyle = pal.fuerte;
      ctx.fillText("● conceptos", MARGEN, 10);
      ctx.fillStyle = pal.media;
      ctx.fillText("● vínculos", MARGEN + 74, 10);
      ctx.textBaseline = "bottom";
      ctx.fillStyle = conAlfa(pal.media, 0.9);
      ctx.fillText(new Date(t0).toLocaleDateString("es-MX"), MARGEN, h - 8);
      ctx.textAlign = "right";
      ctx.fillText(
        new Date(t1).toLocaleDateString("es-MX"),
        w - MARGEN,
        h - 8,
      );

      if (!reducido && visible) raf = requestAnimationFrame(dibujar);
    };

    dibujar();
    const ro = new ResizeObserver(dibujar);
    ro.observe(cv);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [horizonte, seleccionada, reducido, visible]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    let mejor: LineaIntervencion | null = null;
    let mejorD = 18;
    for (const p of posRef.current) {
      const d = Math.abs(p.x - sx);
      if (d < mejorD) {
        mejorD = d;
        mejor = p.linea;
      }
    }
    onSelect(mejor);
  };

  return (
    <canvas
      ref={ref}
      onPointerUp={onTap}
      role="img"
      aria-label={
        horizonte.lineas.length === 0
          ? `Horizonte de eventos: ${horizonte.puntos.length} referencias de telemetría, sin intervenciones en la ventana.`
          : `Horizonte de eventos: ${horizonte.puntos.length} referencias y ${horizonte.lineas.length} ${horizonte.lineas.length === 1 ? "intervención" : "intervenciones"}. Toca una línea para su delta.`
      }
      className="h-full w-full touch-none"
    />
  );
}
