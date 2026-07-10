"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ajustar,
  conAlfa,
  fuenteMono,
  marcoSinanju,
  paleta,
} from "@/microapps/signature/lienzo";
import {
  centralidadVectorPropio,
  detectarComunidades,
  type RedSig,
} from "@/capacidades/signature";

/**
 * ORIENTAR · Orbe Gravitacional (M2, fixed in O1) — a projected 3-D
 * orbital system at a FIXED angle. Mass IS eigenvector centrality (how
 * much a node connects to what connects); orbit radius IS rank (heavier
 * = closer to the core); orbital plane IS community. The heaviest
 * bodies render as coral monoliths — live intelligence; the rest are
 * documented grey. Fully static: the geometry IS the reading (Q audit
 * removed the float — no motion without information).
 */

const ANGULO_ORO = Math.PI * (3 - Math.sqrt(5));
const ANGULO_REPOSO = -0.5;
const FOCAL = 3;

interface Cuerpo {
  id: string;
  etiqueta: string;
  masa: number;
  rango: number;
  /** Orbit radius, normalized to [0,1]. */
  r: number;
  /** Community → orbital-plane inclination (radians). */
  inclinacion: number;
  /** Position angle along its orbit (radians, deterministic). */
  fase: number;
  comunidad: number;
}

function inclinacionDe(comunidad: number): number {
  // Six distinct orbital planes, fanned symmetrically around the ecliptic.
  return ((comunidad % 6) / 6) * Math.PI * 0.42 - Math.PI * 0.21;
}

export function LienzoOrbe({
  red,
  seleccionado,
  onSelect,
}: {
  red: RedSig;
  seleccionado: string | null;
  onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Projected body positions for tap resolution.
  const posRef = useRef<{ x: number; y: number; id: string }[]>([]);

  // Deterministic orbital layout: rank by mass, plane by community,
  // golden-angle phase inside each plane so bodies never stack.
  const { cuerpos, planos } = useMemo(() => {
    const masas = centralidadVectorPropio(red);
    const comunidades = detectarComunidades(red);
    const etiquetaPorId = new Map(red.nodos.map((n) => [n.id, n.etiqueta]));
    const orden = [...masas].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    );
    const contadorPlano = new Map<number, number>();
    const lista: Cuerpo[] = orden.map(([id, masa], rango) => {
      const comunidad = comunidades.get(id) ?? 0;
      const k = contadorPlano.get(comunidad) ?? 0;
      contadorPlano.set(comunidad, k + 1);
      return {
        id,
        etiqueta: etiquetaPorId.get(id) ?? id,
        masa,
        rango,
        r:
          orden.length === 1
            ? 0
            : 0.16 + 0.84 * (rango / (orden.length - 1)),
        inclinacion: inclinacionDe(comunidad),
        fase: (comunidad % 6) * 0.7 + k * ANGULO_ORO,
        comunidad,
      };
    });
    return { cuerpos: lista, planos: [...contadorPlano.keys()] };
  }, [red]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;

    // World (normalized orbit space) → camera space under rotation theta.
    const girar = (
      r: number,
      fase: number,
      inclinacion: number,
      theta: number,
    ): { x: number; y: number; z: number } => {
      const x0 = Math.cos(fase) * r;
      const z0 = Math.sin(fase) * r;
      const y = z0 * Math.sin(inclinacion);
      const z1 = z0 * Math.cos(inclinacion);
      return {
        x: x0 * Math.cos(theta) + z1 * Math.sin(theta),
        y,
        z: -x0 * Math.sin(theta) + z1 * Math.cos(theta),
      };
    };

    const dibujar = () => {
      const l = ajustar(cv);
      if (!l) return;
      const { ctx, w, h } = l;
      const pal = paleta();
      const mono = fuenteMono();
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.36;
      const theta = ANGULO_REPOSO;

      ctx.clearRect(0, 0, w, h);
      marcoSinanju(ctx, w, h, pal.coral);

      const proy = (p: { x: number; y: number; z: number }) => {
        const s = FOCAL / (FOCAL + p.z);
        return {
          sx: cx + p.x * R * s,
          sy: cy + p.y * R * s,
          s,
          z: p.z,
        };
      };

      // Orbital planes (community bands): faint sampled great circles.
      const comunidadSel =
        cuerpos.find((c) => c.id === seleccionado)?.comunidad ?? null;
      for (const plano of planos.slice(0, 6)) {
        const inclinacion = inclinacionDe(plano);
        const esSel = comunidadSel !== null && plano === comunidadSel;
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const fase = (i / 64) * Math.PI * 2;
          const { sx, sy } = proy(girar(1, fase, inclinacion, theta));
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = esSel
          ? conAlfa(pal.coral, 0.22)
          : conAlfa(pal.debil, 0.14);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Core marker: the barycenter, quiet.
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = conAlfa(pal.fuerte, 0.5);
      ctx.fill();

      // Bodies, painter's order (far first).
      posRef.current = [];
      const dibujables = cuerpos
        .map((c) => ({ c, ...proy(girar(c.r, c.fase, c.inclinacion, theta)) }))
        .sort((a, b) => b.z - a.z);
      ctx.font = `600 9px ${mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const d of dibujables) {
        const { c, sx, sy, s, z } = d;
        posRef.current.push({ x: sx, y: sy, id: c.id });
        // Depth cue: nearer bodies read stronger.
        const alfa = 0.35 + 0.65 * Math.max(0, Math.min(1, (1 - z) / 2));
        const esSel = seleccionado === c.id;
        const esMonolito = c.rango < 3 && c.masa > 0;
        if (esMonolito) {
          // The monolith: a vertical slab, live coral, mass-scaled.
          const ancho = (3 + 5 * c.masa) * s;
          const alto = (10 + 22 * c.masa) * s;
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, alto);
          glow.addColorStop(0, conAlfa(pal.coral, 0.35 * alfa));
          glow.addColorStop(1, conAlfa(pal.coral, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(sx, sy, alto, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = conAlfa(pal.coral, esSel ? 1 : 0.85 * alfa);
          ctx.fillRect(sx - ancho / 2, sy - alto / 2, ancho, alto);
          ctx.fillStyle = conAlfa(pal.fuerte, alfa);
          ctx.fillText(c.etiqueta.slice(0, 14), sx, sy - alto / 2 - 5);
        } else {
          const radio = (1.5 + 3 * c.masa) * s;
          ctx.beginPath();
          ctx.arc(sx, sy, radio, 0, Math.PI * 2);
          ctx.fillStyle = esSel
            ? pal.coral
            : conAlfa(pal.media, alfa);
          ctx.fill();
          if (esSel) {
            ctx.fillStyle = conAlfa(pal.fuerte, 0.9);
            ctx.fillText(c.etiqueta.slice(0, 14), sx, sy - radio - 5);
          }
        }
        if (esSel) {
          ctx.beginPath();
          ctx.arc(sx, sy, 12 * s + 4, 0, Math.PI * 2);
          ctx.strokeStyle = conAlfa(pal.coral, 0.6);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    };

    dibujar();
    const ro = new ResizeObserver(dibujar);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [cuerpos, planos, seleccionado]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let mejor: string | null = null;
    let mejorD = 26 ** 2;
    for (const p of posRef.current) {
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < mejorD) {
        mejorD = d;
        mejor = p.id;
      }
    }
    onSelect(mejor);
  };

  const principal = cuerpos[0];
  return (
    <canvas
      ref={ref}
      onPointerUp={onTap}
      role="img"
      aria-label={
        cuerpos.length === 0
          ? "Orbe gravitacional: sin red todavía"
          : `Orbe gravitacional: ${cuerpos.length} conceptos ordenados por centralidad; el monolito principal es ${principal.etiqueta}. Toca un cuerpo para ver por qué pesa.`
      }
      className="h-full w-full touch-none"
    />
  );
}
