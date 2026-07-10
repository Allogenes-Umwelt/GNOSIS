"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ajustar,
  boundsDe,
  conAlfa,
  fuenteMono,
  marcoSinanju,
  paleta,
  proyector,
  reticula,
} from "@/microapps/signature/lienzo";
import { useNavegable } from "@/microapps/signature/navegable";
import { ControlesZoom } from "@/microapps/signature/ControlesZoom";
import { gradoPonderado, type RedSig } from "@/capacidades/signature";

export interface Punto {
  x: number;
  y: number;
  r: number;
}

/**
 * Generic navigable network scatter — edges, glow nodes, always-on labels,
 * selection and Sinanju framing. The world layout is injected, so the same
 * render serves the community view and the spectral embedding.
 */
export function LienzoGrafo({
  red,
  comunidad,
  seleccionado,
  onSelect,
  posicionar,
  aria,
}: {
  red: RedSig;
  comunidad: Map<string, number>;
  seleccionado: string | null;
  onSelect: (id: string | null) => void;
  posicionar: (red: RedSig, comunidad: Map<string, number>) => Map<string, Punto>;
  aria: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<Map<string, Punto>>(new Map());
  const nav = useNavegable();
  const { vista } = nav;

  // World layout and degree depend only on the network — memoized so a
  // pan/zoom frame never reruns the engine (spectral embedding included);
  // the draw effect only projects.
  const layout = useMemo(
    () => posicionar(red, comunidad),
    [posicionar, red, comunidad],
  );
  const caja = useMemo(() => boundsDe(layout.values()), [layout]);
  const grados = useMemo(() => gradoPonderado(red), [red]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dibujar = () => {
      const l = ajustar(cv);
      if (!l) return;
      const { ctx, w, h } = l;
      const pal = paleta();
      const mono = fuenteMono();
      const grado = grados;
      const gMax = Math.max(1, ...grado.values());

      ctx.clearRect(0, 0, w, h);
      reticula(ctx, w, h, pal.debil);
      marcoSinanju(ctx, w, h, pal.coral);

      const { p } = proyector(w, h, caja, vista);
      const screenPos = new Map<string, Punto>();
      for (const [id, q] of layout) {
        const [sx, sy] = p(q.x, q.y);
        screenPos.set(id, { x: sx, y: sy, r: q.r });
      }
      posRef.current = screenPos;

      const vecinos = new Set<string>();
      if (seleccionado) {
        for (const e of red.enlaces) {
          if (e.origen === seleccionado) vecinos.add(e.destino);
          if (e.destino === seleccionado) vecinos.add(e.origen);
        }
      }

      // Edge thinning: past ~600 edges, sub-threshold weights only add ink.
      // Deterministic cutoff (sorted copy); selection always shows its edges.
      let pesoMin = 0;
      if (red.enlaces.length > 600) {
        const pesos = red.enlaces.map((e) => e.peso).sort((a, b) => b - a);
        pesoMin = pesos[599];
      }
      for (const e of red.enlaces) {
        const A = screenPos.get(e.origen);
        const B = screenPos.get(e.destino);
        if (!A || !B) continue;
        const toca = seleccionado != null && (e.origen === seleccionado || e.destino === seleccionado);
        if (!toca && e.peso < pesoMin) continue;
        // Viewport culling: both endpoints far off-screen → skip.
        const fuera = (P: Punto) =>
          P.x < -80 || P.x > w + 80 || P.y < -80 || P.y > h + 80;
        if (fuera(A) && fuera(B)) continue;
        const misma = comunidad.get(e.origen) === comunidad.get(e.destino);
        let color = misma ? pal.media : pal.debil;
        let alfa = misma ? 0.16 : 0.09;
        let lw = 0.6 + Math.min(e.peso, 6) * 0.26;
        if (seleccionado != null) {
          if (toca) {
            color = pal.coral;
            alfa = 0.55;
            lw = 1.1 + Math.min(e.peso, 6) * 0.45;
          } else {
            alfa = 0.04;
            lw = 0.6;
          }
        }
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2;
        const nx = -(B.y - A.y);
        const ny = B.x - A.x;
        const len = Math.hypot(nx, ny) || 1;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.quadraticCurveTo(mx + (nx / len) * len * 0.12, my + (ny / len) * len * 0.12, B.x, B.y);
        ctx.strokeStyle = conAlfa(color, alfa);
        ctx.lineWidth = lw;
        ctx.stroke();
      }

      for (const n of red.nodos) {
        const q = screenPos.get(n.id);
        if (!q) continue;
        const esSel = n.id === seleccionado;
        const esVec = vecinos.has(n.id);
        const activo = seleccionado == null || esSel || esVec;
        const vivo = esSel || esVec;
        const base = vivo ? pal.coral : pal.media;
        const glow = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r * 3.4);
        glow.addColorStop(0, conAlfa(base, activo ? 0.5 : 0.1));
        glow.addColorStop(1, conAlfa(base, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r * 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fillStyle = conAlfa(base, esSel ? 0.98 : activo ? 0.66 : 0.16);
        ctx.fill();
        ctx.lineWidth = esSel ? 1.8 : 1;
        ctx.strokeStyle = conAlfa(vivo ? pal.coral : pal.fuerte, activo ? 0.85 : 0.16);
        ctx.stroke();
        if (esSel) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = conAlfa(pal.coral, 0.45);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      ctx.font = `600 10px ${mono}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      // Greedy label placement: highest-priority first (selection, then
      // neighbors, then degree), skipping any label whose box overlaps one
      // already drawn — no more overpainted label soup.
      const ocupados: { x: number; y: number; w: number; h: number }[] = [];
      const choca = (x: number, y: number, bw: number, bh: number) =>
        ocupados.some(
          (o) => x < o.x + o.w && x + bw > o.x && y < o.y + o.h && y + bh > o.y,
        );
      const candidatos = [...red.nodos].sort((a, b) => {
        const pa = a.id === seleccionado ? 2 : vecinos.has(a.id) ? 1 : 0;
        const pb = b.id === seleccionado ? 2 : vecinos.has(b.id) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return (grado.get(b.id) ?? 0) - (grado.get(a.id) ?? 0);
      });
      for (const n of candidatos) {
        const q = screenPos.get(n.id);
        if (!q) continue;
        if (q.x < -40 || q.x > w + 40 || q.y < -20 || q.y > h + 20) continue;
        const esSel = n.id === seleccionado;
        const esVec = vecinos.has(n.id);
        const relevante = esSel || esVec || (grado.get(n.id) ?? 0) >= gMax * 0.28;
        if (seleccionado != null && !esSel && !esVec) continue;
        if (seleccionado == null && !relevante) continue;
        const txt = n.etiqueta.length > 22 ? `${n.etiqueta.slice(0, 21)}…` : n.etiqueta;
        const tx = q.x + q.r + 5;
        const ancho = ctx.measureText(txt).width;
        if (!esSel && choca(tx - 2, q.y - 8, ancho + 4, 16)) continue;
        ocupados.push({ x: tx - 2, y: q.y - 8, w: ancho + 4, h: 16 });
        ctx.fillStyle = "rgba(0,0,0,0.32)";
        ctx.fillRect(tx - 2, q.y - 7, ancho + 4, 14);
        ctx.fillStyle = esSel || esVec ? pal.coral : pal.fuerte;
        ctx.fillText(txt, tx, q.y);
      }
    };
    dibujar();
    const ro = new ResizeObserver(dibujar);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [red, comunidad, seleccionado, vista, layout, caja, grados]);

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const movido = nav.movidoRef.current;
    nav.handlers.onPointerUp(e);
    if (movido) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let mejorId: string | null = null;
    let mejorD = Number.POSITIVE_INFINITY;
    let mejorR = 0;
    for (const [id, q] of posRef.current) {
      const d = (q.x - sx) ** 2 + (q.y - sy) ** 2;
      if (d < mejorD) {
        mejorD = d;
        mejorId = id;
        mejorR = q.r;
      }
    }
    const hit = mejorId && mejorD <= (mejorR + 12) ** 2 ? mejorId : null;
    onSelect(hit === seleccionado ? null : hit);
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
        aria-label={aria}
      />
      <ControlesZoom onZoom={nav.zoomBoton} onFit={nav.reset} />
    </div>
  );
}
