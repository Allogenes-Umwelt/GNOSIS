"use client";

import { useEffect, useRef } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceX,
  forceY,
  forceSimulation,
  type Simulation,
} from "d3-force";
import type { EnlaceGrafo, NodoGrafo } from "@/lib/grafo";
import { cn } from "@/lib/cn";

/**
 * The substrate graph canvas — d3-force physics under a hand-rolled
 * laser render. Ontology made visible: Frame kinds (nucleo, campo,
 * dato, artefacto) are anchored grey hexes — documentation; entidades
 * are Coral (living faceted shards, Sinanju geometry). Cita edges stay
 * grey; relacion edges burn coral. Drag a node, pan the void,
 * pinch/wheel to zoom, tap to interrogate.
 */

interface EnlaceSim extends Omit<EnlaceGrafo, "source" | "target"> {
  source: string | NodoGrafo;
  target: string | NodoGrafo;
}

/**
 * Concentric layout ring per kind — the anti-hairball. The ontology's
 * hierarchy becomes geometry: operator core at the center, campos
 * around it, sources and datos next, provenance fragments behind them,
 * the living entity layer on the outer orbit. Graphs missing some
 * kinds (study/vinculos views) keep whatever rings they have.
 */
function anilloDe(n: NodoGrafo): number {
  switch (n.kind) {
    case "nucleo":
      return 0;
    case "campo":
      return 95;
    case "producto":
      return 130;
    case "dato":
      return 165;
    case "artefacto":
      return 185;
    case "fragmento":
      return 260;
    default:
      return 330;
  }
}

function radioDe(n: NodoGrafo): number {
  switch (n.kind) {
    case "nucleo":
      return 21;
    case "campo":
      return 11;
    case "producto":
      return 12;
    case "dato":
      return 6;
    case "fragmento":
      return 5;
    case "artefacto":
      return 15;
    default:
      return 8 + 2.4 * Math.sqrt(n.grado);
  }
}

/** Sinanju shard: elongated faceted kite, oriented by the node's seed. */
function trazarShard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  seed: number,
): void {
  const cos = Math.cos(seed);
  const sin = Math.sin(seed);
  const p = (dx: number, dy: number): [number, number] => [
    x + dx * cos - dy * sin,
    y + dx * sin + dy * cos,
  ];
  const tip = p(r * 1.7, 0);
  const s1 = p(r * 0.12, r * 0.62);
  const tail = p(-r * 1.15, r * 0.1);
  const s2 = p(-r * 0.05, -r * 0.58);
  ctx.beginPath();
  ctx.moveTo(...tip);
  ctx.lineTo(...s1);
  ctx.lineTo(...tail);
  ctx.lineTo(...s2);
  ctx.closePath();
}

function trazarHex(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function GrafoCanvas({
  nodos,
  enlaces,
  seleccionado,
  onSelect,
  resaltados = null,
  className,
}: {
  nodos: NodoGrafo[];
  enlaces: EnlaceGrafo[];
  seleccionado: string | null;
  onSelect: (id: string | null) => void;
  /** Constellation focus: these node ids burn, everything else recedes. */
  resaltados?: string[] | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<NodoGrafo, EnlaceSim> | null>(null);
  const nodosRef = useRef<NodoGrafo[]>([]);
  const enlacesRef = useRef<EnlaceSim[]>([]);
  const selRef = useRef<string | null>(seleccionado);
  const resRef = useRef<Set<string> | null>(null);
  const vecinosRef = useRef<Map<string, Set<string>>>(new Map());
  const onSelectRef = useRef(onSelect);

  const propsRef = useRef<{ nodos: NodoGrafo[]; enlaces: EnlaceGrafo[] }>({
    nodos: [],
    enlaces: [],
  });

  useEffect(() => {
    selRef.current = seleccionado;
  }, [seleccionado]);
  useEffect(() => {
    resRef.current = resaltados ? new Set(resaltados) : null;
  }, [resaltados]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    propsRef.current = { nodos, enlaces };
    // Reconcile non-structural field changes (rename, grado, kind, peso)
    // onto the LIVE sim objects in place, preserving positions — the
    // rebuild effect only fires when the id-signature changes, so without
    // this a label edit would never show until a node is added/removed.
    const nodoPorId = new Map(nodos.map((n) => [n.id, n] as const));
    for (const vivo of nodosRef.current) {
      const fresco = nodoPorId.get(vivo.id);
      if (!fresco) continue;
      vivo.etiqueta = fresco.etiqueta;
      vivo.kind = fresco.kind;
      vivo.grado = fresco.grado;
      vivo.seed = fresco.seed;
    }
    const enlacePorId = new Map(enlaces.map((l) => [l.id, l] as const));
    for (const vivo of enlacesRef.current) {
      const fresco = enlacePorId.get(vivo.id);
      if (!fresco) continue;
      vivo.kind = fresco.kind;
      vivo.peso = fresco.peso;
    }
  }, [nodos, enlaces]);

  // Rebuild the simulation only when the graph's SHAPE changes (id
  // signature), preserving the positions of nodes that survive.
  const firma = `${nodos.map((n) => n.id).join(",")}|${enlaces
    .map((l) => l.id)
    .join(",")}`;

  useEffect(() => {
    const previas = new Map(
      nodosRef.current.map((n) => [n.id, { x: n.x, y: n.y }]),
    );
    const copiaNodos: NodoGrafo[] = propsRef.current.nodos.map((n) => ({
      ...n,
      ...(previas.get(n.id) ?? {}),
    }));
    const copiaEnlaces: EnlaceSim[] = propsRef.current.enlaces.map((l) => ({
      ...l,
    }));
    nodosRef.current = copiaNodos;
    enlacesRef.current = copiaEnlaces;

    // Neighborhood map for tap-to-focus (selection dims non-neighbors).
    const vecinos = new Map<string, Set<string>>();
    const anotar = (a: string, b: string) => {
      if (!vecinos.has(a)) vecinos.set(a, new Set());
      vecinos.get(a)!.add(b);
    };
    for (const l of propsRef.current.enlaces) {
      anotar(l.source, l.target);
      anotar(l.target, l.source);
    }
    vecinosRef.current = vecinos;

    const kindDe = (v: string | NodoGrafo) =>
      typeof v === "string" ? "" : v.kind;
    const sim = forceSimulation<NodoGrafo>(copiaNodos)
      .force(
        "link",
        forceLink<NodoGrafo, EnlaceSim>(copiaEnlaces)
          .id((d) => d.id)
          // Provenance tethers stay short; live relations get room.
          .distance((l) =>
            kindDe(l.source) === "fragmento" || kindDe(l.target) === "fragmento"
              ? 46
              : l.kind === "cita"
                ? 78
                : 96,
          )
          .strength((l) => 0.2 + l.peso * 0.3),
      )
      .force(
        "carga",
        forceManyBody<NodoGrafo>()
          // Hubs push harder than leaves; local range keeps the layout
          // from exploding globally (and is much cheaper on phones).
          .strength((n) => -120 - 34 * Math.sqrt((n as NodoGrafo).grado + 1))
          .distanceMax(340),
      )
      // The hierarchy as geometry — each kind seeks its orbit.
      .force(
        "anillo",
        forceRadial<NodoGrafo>((n) => anilloDe(n), 0, 0).strength(0.16),
      )
      .force("x", forceX<NodoGrafo>(0).strength(0.02))
      .force("y", forceY<NodoGrafo>(0).strength(0.025))
      .force(
        "colision",
        forceCollide<NodoGrafo>().radius((n) => radioDe(n) + 11),
      )
      .stop();
    simRef.current?.stop();
    simRef.current = sim;
    sim.alpha(1);

    return () => {
      sim.stop();
    };
  }, [firma]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) return;

    const css = getComputedStyle(document.documentElement);
    const coral = css.getPropertyValue("--coral").trim() || "#ff0066";
    const coralHilo =
      css.getPropertyValue("--coral-thread").trim() || "rgb(255 0 102 / 0.3)";
    const tinta =
      css.getPropertyValue("--viz-ink-2").trim() || "rgb(250 250 248 / 0.55)";
    const tintaTenue =
      css.getPropertyValue("--viz-ink-3").trim() || "rgb(250 250 248 / 0.3)";
    const fondo = css.getPropertyValue("--surface-contain").trim() || "#050505";
    const textoFuerte =
      css.getPropertyValue("--frame-text-strong").trim() || "#fafaf8";
    const textoMeta = css.getPropertyValue("--text-3").trim() || "#aaaaaa";
    const monoFont = (css.getPropertyValue("--font-mono").trim() ||
      "monospace") as string;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let w = 0;
    let h = 0;
    function resize() {
      const rect = parent!.getBoundingClientRect();
      w = Math.round(rect.width);
      h = Math.round(rect.height);
      if (w === 0 || h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    // View transform: world (sim) → screen. World origin at box center.
    const vista = { k: 1, tx: 0, ty: 0 };

    function aMundo(sx: number, sy: number): [number, number] {
      return [
        (sx - w / 2 - vista.tx) / vista.k,
        (sy - h / 2 - vista.ty) / vista.k,
      ];
    }

    function golpea(sx: number, sy: number): NodoGrafo | null {
      const [mx, my] = aMundo(sx, sy);
      let mejor: NodoGrafo | null = null;
      let md = Infinity;
      for (const n of nodosRef.current) {
        const d = (n.x! - mx) ** 2 + (n.y! - my) ** 2;
        const alcance = Math.max(radioDe(n) * 1.9, 22 / vista.k);
        if (d < alcance * alcance && d < md) {
          md = d;
          mejor = n;
        }
      }
      return mejor;
    }

    // ── Interaction: drag node / pan void / pinch zoom / tap select ──
    const punteros = new Map<number, { x: number; y: number }>();
    let arrastrando: NodoGrafo | null = null;
    let panBase: { tx: number; ty: number; x: number; y: number } | null = null;
    let pinchBase: { d: number; k: number } | null = null;
    let downPos: { x: number; y: number } | null = null;

    function local(e: PointerEvent): [number, number] {
      const r = canvas!.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    function onDown(e: PointerEvent) {
      canvas!.setPointerCapture(e.pointerId);
      const [sx, sy] = local(e);
      punteros.set(e.pointerId, { x: sx, y: sy });
      if (punteros.size === 2) {
        const [p1, p2] = [...punteros.values()];
        pinchBase = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), k: vista.k };
        arrastrando = null;
        panBase = null;
        // Entering a pinch invalidates the first finger's tap — else a
        // finger lifting near where the other went down toggles selection.
        downPos = null;
        return;
      }
      downPos = { x: sx, y: sy };
      const hit = golpea(sx, sy);
      if (hit) {
        arrastrando = hit;
        hit.fx = hit.x;
        hit.fy = hit.y;
        simRef.current?.alpha(Math.max(simRef.current.alpha(), 0.3));
      } else {
        panBase = { tx: vista.tx, ty: vista.ty, x: sx, y: sy };
      }
    }

    function onMove(e: PointerEvent) {
      if (!punteros.has(e.pointerId)) return;
      const [sx, sy] = local(e);
      punteros.set(e.pointerId, { x: sx, y: sy });
      if (punteros.size === 2 && pinchBase) {
        const [p1, p2] = [...punteros.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        vista.k = Math.min(3, Math.max(0.35, (pinchBase.k * d) / pinchBase.d));
        return;
      }
      if (arrastrando) {
        const [mx, my] = aMundo(sx, sy);
        arrastrando.fx = mx;
        arrastrando.fy = my;
        simRef.current?.alpha(Math.max(simRef.current.alpha(), 0.25));
      } else if (panBase) {
        vista.tx = panBase.tx + (sx - panBase.x);
        vista.ty = panBase.ty + (sy - panBase.y);
      }
    }

    function onUp(e: PointerEvent) {
      const [sx, sy] = local(e);
      punteros.delete(e.pointerId);
      if (punteros.size < 2) pinchBase = null;
      const fueTap =
        downPos && Math.hypot(sx - downPos.x, sy - downPos.y) < 6;
      if (arrastrando) {
        arrastrando.fx = null;
        arrastrando.fy = null;
      }
      if (fueTap) {
        const hit = golpea(sx, sy);
        onSelectRef.current(
          hit ? (selRef.current === hit.id ? null : hit.id) : null,
        );
      }
      arrastrando = null;
      panBase = null;
      downPos = null;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      vista.k = Math.min(3, Math.max(0.35, vista.k * factor));
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // ── Render ────────────────────────────────────────────────────────
    let vivo = true;
    let t = 0;

    function dibujar() {
      const dpr = window.devicePixelRatio || 1;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);
      ctx!.setTransform(
        dpr * vista.k,
        0,
        0,
        dpr * vista.k,
        dpr * (w / 2 + vista.tx),
        dpr * (h / 2 + vista.ty),
      );

      const sel = selRef.current;
      // Focus: explicit constellation (resaltados) wins; otherwise a
      // selection focuses its own neighborhood — tap = interrogate,
      // and the hairball recedes around the answer.
      let foco = resRef.current;
      if (!foco && sel) {
        const cerca = vecinosRef.current.get(sel);
        if (cerca && cerca.size > 0) foco = new Set([sel, ...cerca]);
      }

      // Edges: grey citas (documentation), coral relaciones (live).
      for (const l of enlacesRef.current) {
        const s = l.source as NodoGrafo;
        const tn = l.target as NodoGrafo;
        if (typeof s === "string" || typeof tn === "string") continue;
        const tocaSel = sel !== null && (s.id === sel || tn.id === sel);
        const esCoral = l.kind === "relacion";
        const dim = foco && !(foco.has(s.id) && foco.has(tn.id)) ? 0.15 : 1;
        // halo
        ctx!.beginPath();
        ctx!.moveTo(s.x!, s.y!);
        ctx!.lineTo(tn.x!, tn.y!);
        ctx!.strokeStyle = esCoral ? coralHilo : tintaTenue;
        ctx!.globalAlpha = ((tocaSel ? 0.65 : 0.3) * l.peso + 0.12) * dim;
        ctx!.lineWidth = 3 / vista.k;
        ctx!.stroke();
        // core laser
        ctx!.strokeStyle = esCoral ? coral : tinta;
        ctx!.globalAlpha = (tocaSel ? 0.95 : 0.26 + l.peso * 0.26) * dim;
        ctx!.lineWidth = (tocaSel ? 1.4 : 0.8) / vista.k;
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;

      // Nodes
      for (const n of nodosRef.current) {
        const r = radioDe(n);
        const esSel = sel === n.id;
        const enFoco = foco !== null && foco.has(n.id);
        const dim = foco && !enFoco ? 0.2 : 1;
        const pulso =
          (esSel || enFoco) && !reduce ? 1 + 0.06 * Math.sin(t / 12) : 1;

        if (n.kind !== "entidad") {
          trazarHex(ctx!, n.x!, n.y!, r * pulso);
          ctx!.fillStyle = fondo;
          ctx!.globalAlpha = dim;
          ctx!.fill();
          ctx!.strokeStyle = tintaTenue;
          ctx!.lineWidth = 3.2 / vista.k;
          ctx!.stroke();
          ctx!.strokeStyle = esSel ? textoFuerte : tinta;
          ctx!.lineWidth = 1.1 / vista.k;
          ctx!.stroke();
          if (n.kind === "nucleo") {
            // second ring — the operator's core is doubly framed
            trazarHex(ctx!, n.x!, n.y!, r * pulso * 0.68);
            ctx!.strokeStyle = tinta;
            ctx!.lineWidth = 0.8 / vista.k;
            ctx!.stroke();
          } else if (n.kind !== "dato" && n.kind !== "fragmento") {
            // inner facets — the matrix (datos/fragmentos stay plain)
            ctx!.beginPath();
            for (let i = 0; i < 3; i++) {
              const a = (Math.PI / 3) * (i * 2) - Math.PI / 2;
              ctx!.moveTo(n.x!, n.y!);
              ctx!.lineTo(
                n.x! + r * 0.82 * Math.cos(a),
                n.y! + r * 0.82 * Math.sin(a),
              );
            }
            ctx!.strokeStyle = tintaTenue;
            ctx!.lineWidth = 0.7 / vista.k;
            ctx!.stroke();
          }
          ctx!.globalAlpha = 1;
        } else {
          trazarShard(ctx!, n.x!, n.y!, r * pulso, n.seed);
          ctx!.fillStyle = fondo;
          ctx!.globalAlpha = dim;
          ctx!.fill();
          // coral halo then laser edge
          ctx!.strokeStyle = coral;
          ctx!.globalAlpha = (esSel || enFoco ? 0.35 : 0.16) * dim;
          ctx!.lineWidth = 4.5 / vista.k;
          ctx!.stroke();
          ctx!.globalAlpha = (esSel || enFoco ? 1 : 0.85) * dim;
          ctx!.lineWidth = 1.2 / vista.k;
          ctx!.stroke();
          // facet line + apex sensor
          const cos = Math.cos(n.seed);
          const sin = Math.sin(n.seed);
          ctx!.beginPath();
          ctx!.moveTo(n.x! + r * 1.7 * cos, n.y! + r * 1.7 * sin);
          ctx!.lineTo(n.x! - r * 1.15 * cos, n.y! - r * 1.15 * sin);
          ctx!.strokeStyle = coral;
          ctx!.globalAlpha = 0.3 * dim;
          ctx!.lineWidth = 0.7 / vista.k;
          ctx!.stroke();
          ctx!.globalAlpha = dim;
          ctx!.beginPath();
          ctx!.arc(
            n.x! + r * 1.7 * cos,
            n.y! + r * 1.7 * sin,
            1.6 / vista.k,
            0,
            2 * Math.PI,
          );
          ctx!.fillStyle = coral;
          ctx!.fill();
          ctx!.globalAlpha = 1;
        }

        // Labels, pruned to fight noise: frame anchors always; entities
        // when zoomed in or focused; fragments/datos only when they ARE
        // the answer (selected/focused) or under heavy zoom.
        const etiquetaFija =
          n.kind === "artefacto" ||
          n.kind === "nucleo" ||
          n.kind === "campo" ||
          n.kind === "producto";
        const esRuido = n.kind === "fragmento" || n.kind === "dato";
        const muestraEtiqueta =
          etiquetaFija ||
          esSel ||
          enFoco ||
          (esRuido ? vista.k > 1.6 : vista.k > 0.95);
        if (muestraEtiqueta) {
          const texto =
            n.etiqueta.length > 18
              ? `${n.etiqueta.slice(0, 17)}…`
              : n.etiqueta;
          ctx!.font = `${(esSel ? 9.5 : 8.5) / vista.k}px ${monoFont}`;
          ctx!.textAlign = "center";
          ctx!.fillStyle = esSel || enFoco ? textoFuerte : textoMeta;
          ctx!.globalAlpha = dim;
          ctx!.fillText(
            texto.toUpperCase(),
            n.x!,
            n.y! + r + 14 / vista.k,
          );
          ctx!.globalAlpha = 1;
        }
      }
    }

    // Reduced motion: settle synchronously, render static frames on demand.
    if (reduce) {
      simRef.current?.tick(280);
    }

    function frame() {
      if (!vivo) return;
      t++;
      const sim = simRef.current;
      if (sim && !reduce && sim.alpha() > sim.alphaMin()) {
        sim.tick();
      } else if (sim && reduce && sim.alpha() > sim.alphaMin()) {
        sim.tick(60);
      }
      if (w > 0 && h > 0) dibujar();
      requestAnimationFrame(frame);
    }
    frame();

    return () => {
      vivo = false;
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn("h-full w-full touch-none", className)}
      role="img"
      aria-label={`Grafo de estudio: ${nodos.length} nodos, ${enlaces.length} enlaces. Toca un nodo para inspeccionarlo.`}
    />
  );
}
