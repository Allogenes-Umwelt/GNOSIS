"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ajustar,
  conAlfa,
  fuenteMono,
  marcoSinanju,
  paleta,
} from "@/microapps/signature/lienzo";
import type { Anomalia } from "@/capacidades/anomalias";

/**
 * OBSERVAR · Terreno de Anomalías (O1, replaces the polar radar) — the
 * Frame as an isometric mesh. At rest it lies flat and grey: that IS
 * the reading (no deviations against the baseline). Where a detector
 * fired, the mesh bulges coral: crest height IS the measured severity,
 * and every crest is a data node — permanent tag (detector · severity)
 * and tap-to-explain. Nine fixed epicenters, one per detector, marked
 * with quiet dots so the geography is learnable. Fully static: no
 * sweep, no rotation — the deformation is the information.
 */

export const DETECTORES_TERRENO = [
  {
    id: "hub-nuevo",
    etiqueta: "HUBS",
    definicion:
      "Concentrador nuevo: una entidad acumula muchas más conexiones que antes.",
  },
  {
    id: "exponente",
    etiqueta: "LEY",
    definicion:
      "La distribución de conectividad (power law) cambió de régimen en todo el grafo.",
  },
  {
    id: "puente-nuevo",
    etiqueta: "PUENTES+",
    definicion:
      "Apareció un puente crítico: el único camino entre dos regiones de tu red.",
  },
  {
    id: "puente-caido",
    etiqueta: "PUENTES−",
    definicion: "Algo que era puente crítico dejó de serlo.",
  },
  {
    id: "islas",
    etiqueta: "ISLAS",
    definicion:
      "Cambió el número de fragmentos desconectados: tu grafo se partió o se fusionó.",
  },
  {
    id: "densidad",
    etiqueta: "TEJIDO",
    definicion:
      "La densidad de enlaces se apretó o se aflojó contra tu mediana histórica.",
  },
  {
    id: "rafaga",
    etiqueta: "RÁFAGA",
    definicion:
      "Actividad en ráfagas: mucho en poco tiempo frente a tu cadencia usual.",
  },
  {
    id: "ritmo",
    etiqueta: "RITMO",
    definicion:
      "Tu cadencia se quebró: la autocorrelación de tu actividad dejó de parecerse a sí misma.",
  },
  {
    id: "fuente",
    etiqueta: "FUENTES",
    definicion:
      "Una serie de tus conectores se desvió más de 2σ de su comportamiento (piso 1%).",
  },
] as const;

// 3×3 epicenter grid in world coords [-1,1]².
const EPICENTROS = DETECTORES_TERRENO.map((d, i) => ({
  ...d,
  x: ((i % 3) - 1) * 0.62,
  z: (Math.floor(i / 3) - 1) * 0.62,
}));

const COLS = 19;
const FILAS = 19;
const SIGMA2 = 2 * 0.16 * 0.16;

interface Cresta {
  x: number;
  z: number;
  altura: number;
  a: Anomalia;
}

export function LienzoTerreno({
  anomalias,
  onSelect,
  seleccionada,
}: {
  anomalias: Anomalia[];
  onSelect: (a: Anomalia | null) => void;
  seleccionada: Anomalia | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Crest screen positions for tap resolution.
  const posRef = useRef<{ x: number; y: number; a: Anomalia }[]>([]);

  // One crest per finding at its detector's epicenter (deterministic fan
  // when a detector holds several findings).
  const crestas = useMemo<Cresta[]>(() => {
    const porDetector = new Map<string, Anomalia[]>();
    for (const a of anomalias) {
      const lista = porDetector.get(a.detector) ?? [];
      lista.push(a);
      porDetector.set(a.detector, lista);
    }
    const lista: Cresta[] = [];
    for (const e of EPICENTROS) {
      const halladas = porDetector.get(e.id) ?? [];
      halladas.forEach((a, k) => {
        const abanico = (k - (halladas.length - 1) / 2) * 0.18;
        lista.push({
          x: e.x + abanico,
          z: e.z + (k % 2 === 0 ? 0 : 0.12),
          altura: 0.15 + 0.85 * a.severidad,
          a,
        });
      });
    }
    return lista;
  }, [anomalias]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;

    const dibujar = () => {
      const l = ajustar(cv);
      if (!l) return;
      const { ctx, w, h } = l;
      const pal = paleta();
      const mono = fuenteMono();
      const cx = w / 2;
      const cy = h * 0.56;
      const A = Math.min(w, h) * 0.36;
      const B = A * 0.5;
      const H = Math.min(w, h) * 0.34;

      const altura = (x: number, z: number): number => {
        let s = 0;
        for (const c of crestas) {
          const d2 = (x - c.x) ** 2 + (z - c.z) ** 2;
          s += c.altura * Math.exp(-d2 / SIGMA2);
        }
        return Math.min(1.2, s);
      };

      const proy = (x: number, z: number, y: number): [number, number] => [
        cx + (x - z) * A,
        cy + (x + z) * B - y * H,
      ];

      ctx.clearRect(0, 0, w, h);
      marcoSinanju(ctx, w, h, pal.coral);

      // Vertex grid, precomputed once per draw.
      const V: { sx: number; sy: number; y: number }[][] = [];
      for (let i = 0; i < COLS; i++) {
        V[i] = [];
        for (let j = 0; j < FILAS; j++) {
          const x = (i / (COLS - 1)) * 2 - 1;
          const z = (j / (FILAS - 1)) * 2 - 1;
          const y = altura(x, z);
          const [sx, sy] = proy(x, z, y);
          V[i][j] = { sx, sy, y };
        }
      }

      // Mesh lines, far rows first (painter): grey chassis, coral where
      // the terrain lifts — the psychoframe wakes where the anomaly lives.
      const segmento = (
        a: { sx: number; sy: number; y: number },
        b: { sx: number; sy: number; y: number },
      ) => {
        const nivel = (a.y + b.y) / 2;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = conAlfa(pal.debil, 0.22);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (nivel > 0.04) {
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.strokeStyle = conAlfa(pal.coral, Math.min(0.85, nivel));
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      };
      for (let j = 0; j < FILAS; j++) {
        for (let i = 0; i < COLS - 1; i++) segmento(V[i][j], V[i + 1][j]);
      }
      for (let i = 0; i < COLS; i++) {
        for (let j = 0; j < FILAS - 1; j++) segmento(V[i][j], V[i][j + 1]);
      }

      // Quiet epicenters: the nine detectors at rest — learnable geography.
      const activos = new Set(crestas.map((c) => c.a.detector));
      ctx.font = `600 9px ${mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const e of EPICENTROS) {
        if (activos.has(e.id)) continue;
        const [sx, sy] = proy(e.x, e.z, altura(e.x, e.z));
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = conAlfa(pal.media, 0.55);
        ctx.fill();
        ctx.fillStyle = conAlfa(pal.media, 0.4);
        ctx.fillText(e.etiqueta, sx, sy + 4);
      }

      // Crests: data nodes — apex dot, permanent tag, tap target.
      posRef.current = [];
      ctx.textBaseline = "bottom";
      for (const c of crestas) {
        const [sx, sy] = proy(c.x, c.z, altura(c.x, c.z));
        posRef.current.push({ x: sx, y: sy, a: c.a });
        const esSel = seleccionada?.clave === c.a.clave;
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16);
        glow.addColorStop(0, conAlfa(pal.coral, esSel ? 0.7 : 0.4));
        glow.addColorStop(1, conAlfa(pal.coral, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, esSel ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = pal.coral;
        ctx.fill();
        if (esSel) {
          ctx.beginPath();
          ctx.arc(sx, sy, 9, 0, Math.PI * 2);
          ctx.strokeStyle = conAlfa(pal.coral, 0.6);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        const etiqueta =
          DETECTORES_TERRENO.find((d) => d.id === c.a.detector)?.etiqueta ??
          c.a.detector.toUpperCase();
        const txt = `${etiqueta} ${c.a.severidad.toFixed(2)}`;
        // Clamp the tag inside the canvas so edge crests keep their name.
        const medio = ctx.measureText(txt).width / 2;
        const tx = Math.max(12 + medio, Math.min(w - 12 - medio, sx));
        ctx.fillStyle = esSel ? pal.fuerte : conAlfa(pal.fuerte, 0.9);
        ctx.fillText(txt, tx, sy - 8);
      }

      // Base line of the reading, honest and tiny.
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = conAlfa(pal.media, 0.8);
      ctx.fillText(
        crestas.length === 0
          ? "terreno plano · sin desviaciones"
          : `${crestas.length} ${crestas.length === 1 ? "deformación" : "deformaciones"} · altura = severidad`,
        14,
        h - 12,
      );
    };

    dibujar();
    const ro = new ResizeObserver(dibujar);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [crestas, seleccionada]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let mejor: Anomalia | null = null;
    let mejorD = 28 ** 2;
    for (const p of posRef.current) {
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < mejorD) {
        mejorD = d;
        mejor = p.a;
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
        anomalias.length === 0
          ? "Terreno de anomalías: plano — sin desviaciones contra tu línea base"
          : `Terreno de anomalías: ${anomalias.length} ${anomalias.length === 1 ? "deformación" : "deformaciones"}; la altura es la severidad medida. Toca una cresta para ver el porqué.`
      }
      className="h-full w-full touch-none"
    />
  );
}
