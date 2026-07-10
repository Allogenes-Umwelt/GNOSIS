"use client";

import { useMemo } from "react";
import { saludDelGrafo, type HallazgoCalidad } from "@/capacidades/calidad";
import { useAutogenesStore } from "@/store/autogenes";

/**
 * Data-quality surface (L·1) — the graph's health with its queues. Every
 * bucket is actionable: cite it, OCR it, fill the ficha, weave it or
 * forget it. The engine computes; this panel only renders.
 */
export function CalidadPanel() {
  const artefactos = useAutogenesStore((s) => s.artefactos);
  const fragmentos = useAutogenesStore((s) => s.fragmentos);
  const entidades = useAutogenesStore((s) => s.entidades);
  const relaciones = useAutogenesStore((s) => s.relaciones);
  const eventos = useAutogenesStore((s) => s.eventos);
  const tiposOperador = useAutogenesStore((s) => s.tiposOperador);

  const salud = useMemo(
    () =>
      saludDelGrafo(
        artefactos,
        fragmentos,
        entidades,
        relaciones,
        eventos,
        tiposOperador,
      ),
    [artefactos, fragmentos, entidades, relaciones, eventos, tiposOperador],
  );

  if (entidades.length === 0 && fragmentos.length === 0) return null;

  const cubeta = (
    titulo: string,
    accion: string,
    items: HallazgoCalidad[],
  ) =>
    items.length === 0 ? null : (
      <details key={titulo} className="border border-structural bg-contain">
        <summary
          className="flex cursor-pointer items-baseline justify-between gap-2 px-3 py-2 font-mono text-micro uppercase tracking-[0.15em] text-frame-2"
          style={{ minHeight: "var(--touch-target)" }}
        >
          <span>{titulo}</span>
          <span className="tnum text-coral-text">{items.length}</span>
        </summary>
        <div className="flex flex-col gap-1 px-3 pb-2">
          <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
            {accion}
          </p>
          {items.map((h) => (
            <p
              key={h.id}
              className="border-l border-structural pl-2 text-caption leading-relaxed text-frame-1"
            >
              {h.etiqueta}{" "}
              <span className="font-mono text-micro tracking-[0.1em] text-frame-3">
                · {h.detalle}
              </span>
            </p>
          ))}
        </div>
      </details>
    );

  return (
    <section className="hud flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Salud del grafo
        </h2>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {salud.total === 0
            ? "íntegro"
            : `${salud.total} ${salud.total === 1 ? "pendiente" : "pendientes"}`}
        </span>
      </div>

      {salud.total === 0 ? (
        <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
          Todo lo extraído cita, las fichas están completas y nada quedó
          suelto.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 lg:grid lg:grid-cols-2 lg:items-start">
          {cubeta(
            "Memoria sin cita",
            "Entidades de SYNESIS que no citan fragmentos. Respáldalas con una fuente o decide si siguen.",
            salud.entidadesSinEvidencia,
          )}
          {cubeta(
            "Fichas incompletas",
            "Les faltan propiedades requeridas de su tipo. Complétalas en el Dossier.",
            salud.fichasIncompletas,
          )}
          {cubeta(
            "Páginas mudas",
            "Escaneos sin texto citable. Pásalos por OCR en las fuentes de arriba.",
            salud.paginasMudas,
          )}
          {cubeta(
            "Material suelto",
            "Sin vínculos ni eventos: todavía no conversa con tu grafo. Enlázalo o descártalo.",
            salud.huerfanas,
          )}
        </div>
      )}

      {salud.relacionesSinCita > 0 ? (
        <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
          {salud.relacionesSinCita}{" "}
          {salud.relacionesSinCita === 1
            ? "relación declarada sin cita"
            : "relaciones declaradas sin cita"}{" "}
          — válidas por tu palabra, sin respaldo documental.
        </p>
      ) : null}
    </section>
  );
}
