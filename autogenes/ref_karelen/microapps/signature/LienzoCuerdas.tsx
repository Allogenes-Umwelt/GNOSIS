"use client";

import { useEffect, useRef } from "react";
import {
  ajustar,
  conAlfa,
  fuenteMono,
  marcoSinanju,
  paleta,
  proyector,
  reticula,
} from "@/microapps/signature/lienzo";
import { useNavegable } from "@/microapps/signature/navegable";
import { ControlesZoom } from "@/microapps/signature/ControlesZoom";
import { type RedSig } from "@/capacidades/signature";

const R = 400; // ring radius in world units, centred at the origin

/**
 * Chord render — nodes on a world ring in community order, edges bowing to
 * the centre. Navigable (pan / wheel / pinch) and framed to content, so a
 * dense ring can be zoomed and read instead of collapsing to a blur.
 */
export function LienzoCuerdas({
  red,
  comunidad,
  orden,
  seleccionado,
  onSelect,
}: {
  red: RedSig;
  comunidad: Map<string, number>;
  orden: string[];
  seleccionado: string | null;
  onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const centroRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const nav = useNavegable();
  const { vista } = nav;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dibujar = () => {
      const l = ajustar(cv);
      if (!l) return;
      const { ctx, w, h } = l;
      const pal = paleta();
      const mono = fuenteMono();
      ctx.clearRect(0, 0, w, h);
      reticula(ctx, w, h, pal.debil);
      marcoSinanju(ctx, w, h, pal.coral);

      const n = orden.length;
      if (n === 0) return;
      const { p } = proyector(w, h, { minX: -R, minY: -R, maxX: R, maxY: R }, vista, 60);
      const [cx, cy] = p(0, 0);
      centroRef.current = { x: cx, y: cy };

      const ang = new Map<string, number>();
      const scr = new Map<string, [number, number]>();
      orden.forEach((id, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        ang.set(id, a);
        scr.set(id, p(Math.cos(a) * R, Math.sin(a) * R));
      });

      // community sector ticks
      let previa: number | undefined;
      orden.forEach((id, i) => {
        const c = comunidad.get(id);
        if (c !== previa) {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n;
          const [x0, y0] = p(Math.cos(a) * R * 1.04, Math.sin(a) * R * 1.04);
          const [x1, y1] = p(Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.strokeStyle = conAlfa(pal.debil, 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
          previa = c;
        }
      });

      for (const e of red.enlaces) {
        const A = scr.get(e.origen);
        const B = scr.get(e.destino);
        if (!A || !B) continue;
        const toca = seleccionado != null && (e.origen === seleccionado || e.destino === seleccionado);
        let color = pal.media;
        let alfa = 0.14;
        if (seleccionado != null) {
          color = toca ? pal.coral : pal.debil;
          alfa = toca ? 0.52 : 0.04;
        }
        ctx.beginPath();
        ctx.moveTo(A[0], A[1]);
        ctx.quadraticCurveTo(cx, cy, B[0], B[1]);
        ctx.strokeStyle = conAlfa(color, alfa);
        ctx.lineWidth = 0.6 + Math.min(e.peso, 6) * 0.3;
        ctx.stroke();
      }

      const vecinos = new Set<string>();
      if (seleccionado) {
        for (const e of red.enlaces) {
          if (e.origen === seleccionado) vecinos.add(e.destino);
          if (e.destino === seleccionado) vecinos.add(e.origen);
        }
      }
      for (const id of orden) {
        const s = scr.get(id);
        if (!s) continue;
        const esSel = id === seleccionado;
        const esVec = vecinos.has(id);
        const activo = seleccionado == null || esSel || esVec;
        ctx.beginPath();
        ctx.arc(s[0], s[1], esSel ? 4.6 : 2.8, 0, Math.PI * 2);
        ctx.fillStyle = conAlfa(esSel || esVec ? pal.coral : pal.media, activo ? 0.92 : 0.2);
        ctx.fill();
      }

      if (seleccionado) {
        const a = ang.get(seleccionado);
        const node = red.nodos.find((x) => x.id === seleccionado);
        const s = scr.get(seleccionado);
        if (a !== undefined && node && s) {
          ctx.font = `700 11px ${mono}`;
          ctx.textBaseline = "middle";
          ctx.textAlign = Math.cos(a) >= 0 ? "left" : "right";
          const off = Math.cos(a) >= 0 ? 8 : -8;
          const ancho = ctx.measureText(node.etiqueta).width;
          ctx.fillStyle = "rgba(0,0,0,0.32)";
          ctx.fillRect(s[0] + off - (off < 0 ? ancho : 0) - 2, s[1] - 7, ancho + 4, 14);
          ctx.fillStyle = pal.coral;
          ctx.fillText(node.etiqueta, s[0] + off, s[1]);
        }
      }
    };
    dibujar();
    const ro = new ResizeObserver(dibujar);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [red, comunidad, orden, seleccionado, vista]);

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const movido = nav.movidoRef.current;
    nav.handlers.onPointerUp(e);
    if (movido) return;
    const n = orden.length;
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { x: cx, y: cy } = centroRef.current;
    let a = Math.atan2(y - cy, x - cx) + Math.PI / 2;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.round((a / (Math.PI * 2)) * n) % n;
    const id = orden[idx];
    onSelect(id === seleccionado ? null : id);
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
        onPointerUp={onUp}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        role="img"
        aria-label={`Diagrama de cuerdas: ${red.nodos.length} conceptos. Arrastra o pellizca para navegar; toca el anillo para aislar vínculos.`}
      />
      <ControlesZoom onZoom={nav.zoomBoton} onFit={nav.reset} />
    </div>
  );
}
