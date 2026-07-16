"use client";

import { useMemo } from "react";
import { fuentesFrias } from "@/capacidades/senales";
import { oportunidadesFicha } from "@/lib/enriquecimiento";
import { proponerConexiones } from "@/lib/inferencia";
import { proponerFusiones } from "@/lib/resolucion";
import { useAutogenesStore } from "@/store/autogenes";

/**
 * The substrate's working pipeline, made explicit (E2): Fuentes →
 * Procesar → Adjudicar → Productos. Same capability reads Radar uses;
 * this strip is the cockpit's compass, Radar is the actionable queue.
 */
export function FlujoSustrato() {
  const artefactos = useAutogenesStore((s) => s.artefactos);
  const fragmentos = useAutogenesStore((s) => s.fragmentos);
  const entidades = useAutogenesStore((s) => s.entidades);
  const relaciones = useAutogenesStore((s) => s.relaciones);
  const eventos = useAutogenesStore((s) => s.eventos);
  const productos = useAutogenesStore((s) => s.productos);
  const paresDescartados = useAutogenesStore((s) => s.paresDescartados);

  const etapas = useMemo(() => {
    const descartadas = new Set(paresDescartados);
    const porAdjudicar =
      proponerConexiones(
        { artefactos, fragmentos, entidades, relaciones, eventos },
        descartadas,
      ).length +
      oportunidadesFicha(entidades, descartadas).length +
      entidades.filter((e) => e.tipo === "lugar" && !e.geo).length +
      proponerFusiones(entidades, relaciones, descartadas).length;
    return [
      { etiqueta: "Fuentes", n: artefactos.length },
      { etiqueta: "Procesar", n: fuentesFrias(artefactos, fragmentos, entidades).length },
      { etiqueta: "Adjudicar", n: porAdjudicar },
      { etiqueta: "Productos", n: productos.length },
    ];
  }, [artefactos, fragmentos, entidades, relaciones, eventos, productos, paresDescartados]);

  if (artefactos.length === 0 && entidades.length === 0) return null;

  return (
    <div className="flex items-stretch gap-1.5" aria-label="Flujo del sustrato">
      {etapas.map((e, i) => (
        <div
          key={e.etiqueta}
          className="flex flex-1 flex-col items-center gap-0.5 border border-structural bg-contain px-1 py-2"
        >
          <span
            className={`tnum font-mono text-small font-bold ${e.n > 0 && (i === 1 || i === 2) ? "text-coral-text" : "text-frame-1"}`}
          >
            {e.n}
          </span>
          <span className="font-mono text-micro uppercase tracking-[0.12em] text-frame-3">
            {e.etiqueta}
          </span>
        </div>
      ))}
    </div>
  );
}
