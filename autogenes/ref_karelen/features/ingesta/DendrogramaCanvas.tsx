"use client";

import { useEffect, useMemo, useRef } from "react";
import type { RamaOntologia } from "@/lib/ontologia";

/**
 * Circular dendrogram of the Umwelt (O1) — the ontology drawn as what it
 * IS: a hierarchy. Operador at the center, campos and fuentes on the
 * first ring, datos/fragmentos/entidades on the leaf ring; angular span
 * is proportional to subtree size, so a heavy campo visibly weighs.
 * Distinct from the QUALIA network on purpose. Every node is a data
 * node: tap resolves it in the inspector below; leaf labels declutter
 * by available arc, never by decoration. Static — no motion.
 */

interface NodoRadial {
  id: string;
  etiqueta: string;
  kind: RamaOntologia["kind"];
  depth: number;
  angulo: number;
  radio: number; // normalized 0..1
  padre: string | null;
  hojas: number;
}

function aplanar(raiz: RamaOntologia): NodoRadial[] {
  // Leaf slots first: each leaf takes one equal angular slot, internal
  // nodes center on their children — the classic tidy cluster layout.
  const nodos: NodoRadial[] = [];
  let cursor = 0;
  let profundidadMax = 1;

  const medir = (r: RamaOntologia, d: number): number => {
    profundidadMax = Math.max(profundidadMax, d);
    return r.hijos.length === 0
      ? 1
      : r.hijos.reduce((s, h) => s + medir(h, d + 1), 0);
  };
  const totalHojas = Math.max(1, medir(raiz, 0));

  const colocar = (
    r: RamaOntologia,
    d: number,
    padre: string | null,
  ): { angulo: number; hojas: number } => {
    if (r.hijos.length === 0) {
      const angulo = ((cursor + 0.5) / totalHojas) * Math.PI * 2;
      cursor += 1;
      nodos.push({
        id: r.id,
        etiqueta: r.etiqueta,
        kind: r.kind,
        depth: d,
        angulo,
        radio: 1,
        padre,
        hojas: 1,
      });
      return { angulo, hojas: 1 };
    }
    const medidas = r.hijos.map((h) => colocar(h, d + 1, r.id));
    const hojas = medidas.reduce((s, m) => s + m.hojas, 0);
    // Circular mean via vector sum keeps the parent inside its fan.
    const sx = medidas.reduce((s, m) => s + Math.cos(m.angulo) * m.hojas, 0);
    const sy = medidas.reduce((s, m) => s + Math.sin(m.angulo) * m.hojas, 0);
    const angulo = Math.atan2(sy, sx);
    nodos.push({
      id: r.id,
      etiqueta: r.etiqueta,
      kind: r.kind,
      depth: d,
      angulo,
      radio: d === 0 ? 0 : d / profundidadMax,
      padre,
      hojas,
    });
    return { angulo, hojas };
  };
  colocar(raiz, 0, null);
  return nodos;
}

function leerVar(nombre: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(nombre)
    .trim();
}

function conAlfa(color: string, a: number): string {
  const c = color.trim();
  if (c.startsWith("#")) {
    let hx = c.slice(1);
    if (hx.length === 3) hx = hx.split("").map((x) => x + x).join("");
    const n = Number.parseInt(hx, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const nums = c.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${a})`;
  }
  return c;
}

export function DendrogramaCanvas({
  raiz,
  seleccionado,
  onSelect,
}: {
  raiz: RamaOntologia;
  seleccionado: string | null;
  onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<{ x: number; y: number; id: string }[]>([]);

  const nodos = useMemo(() => aplanar(raiz), [raiz]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;

    const dibujar = () => {
      const rect = cv.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(rect.width * dpr);
      cv.height = Math.round(rect.height * dpr);
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;

      const coral = leerVar("--coral") || "#ff0066";
      const fuerte = leerVar("--viz-ink-1") || "rgb(250 250 248 / 0.82)";
      const media = leerVar("--viz-ink-2") || "rgb(250 250 248 / 0.55)";
      const debil = leerVar("--viz-ink-3") || "rgb(250 250 248 / 0.3)";
      const mono = leerVar("--font-mono") || "monospace";

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.36;
      const punto = (n: NodoRadial): [number, number] => [
        cx + Math.cos(n.angulo) * n.radio * R,
        cy + Math.sin(n.angulo) * n.radio * R,
      ];

      ctx.clearRect(0, 0, w, h);

      const porId = new Map(nodos.map((n) => [n.id, n] as const));

      // Links: radial curves parent → child (control point on the
      // child's angle at the parent's radius — the dendrogram elbow).
      for (const n of nodos) {
        if (!n.padre) continue;
        const p = porId.get(n.padre);
        if (!p) continue;
        const [x1, y1] = punto(p);
        const [x2, y2] = punto(n);
        const rm = p.radio * R;
        const cxp = cx + Math.cos(n.angulo) * rm;
        const cyp = cy + Math.sin(n.angulo) * rm;
        const vivo = n.kind === "entidad";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cxp, cyp, x2, y2);
        ctx.strokeStyle = vivo ? conAlfa(coral, 0.3) : conAlfa(debil, 0.3);
        ctx.lineWidth = n.depth === 1 ? 1.2 : 1;
        ctx.stroke();
      }

      // Nodes + labels. Leaf labels declutter by available arc length.
      posRef.current = [];
      const hojasTotales = nodos.filter((n) => n.radio === 1).length;
      const arcoHoja = (Math.PI * 2 * R) / Math.max(1, hojasTotales);
      const etiquetarHojas = arcoHoja > 13;
      ctx.font = `600 9px ${mono}`;

      for (const n of nodos) {
        const [x, y] = punto(n);
        posRef.current.push({ x, y, id: n.id });
        const esSel = n.id === seleccionado;
        const vivo = n.kind === "entidad" || n.kind === "nucleo";
        const r =
          n.kind === "nucleo"
            ? 5
            : n.depth === 1
              ? 3.5
              : n.kind === "agregado"
                ? 2
                : 2.5;
        ctx.beginPath();
        ctx.arc(x, y, esSel ? r + 1.5 : r, 0, Math.PI * 2);
        ctx.fillStyle = esSel
          ? coral
          : vivo
            ? conAlfa(coral, 0.85)
            : conAlfa(media, 0.85);
        ctx.fill();
        if (esSel) {
          ctx.beginPath();
          ctx.arc(x, y, r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = conAlfa(coral, 0.55);
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        const esHoja = n.radio === 1;
        const mostrar =
          esSel ||
          n.kind === "nucleo" ||
          n.depth === 1 ||
          (esHoja && etiquetarHojas);
        if (!mostrar) continue;
        const txt =
          n.etiqueta.length > 18 ? `${n.etiqueta.slice(0, 17)}…` : n.etiqueta;
        ctx.save();
        if (n.kind === "nucleo") {
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = fuerte;
          ctx.fillText(txt, x, y - 8);
        } else {
          // Rotate along the radius, flipped on the left half for reading.
          const izquierda =
            n.angulo > Math.PI / 2 && n.angulo < (3 * Math.PI) / 2;
          ctx.translate(x, y);
          ctx.rotate(izquierda ? n.angulo + Math.PI : n.angulo);
          ctx.textAlign = izquierda ? "right" : "left";
          ctx.textBaseline = "middle";
          ctx.fillStyle = esSel
            ? coral
            : n.kind === "entidad"
              ? conAlfa(coral, 0.9)
              : n.depth === 1
                ? fuerte
                : conAlfa(media, 0.9);
          ctx.fillText(txt, izquierda ? -(r + 5) : r + 5, 0);
        }
        ctx.restore();
      }
    };

    dibujar();
    const ro = new ResizeObserver(dibujar);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [nodos, seleccionado]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let mejor: string | null = null;
    let mejorD = 22 ** 2;
    for (const p of posRef.current) {
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < mejorD) {
        mejorD = d;
        mejor = p.id;
      }
    }
    onSelect(mejor === seleccionado ? null : mejor);
  };

  return (
    <canvas
      ref={ref}
      onPointerUp={onTap}
      role="img"
      aria-label={`Dendrograma del Umwelt: ${nodos.length} nodos en anillos por jerarquía (Operador al centro, campos y fuentes, luego datos, fragmentos y entidades). Toca un nodo para inspeccionarlo.`}
      className="h-full w-full touch-none"
    />
  );
}
