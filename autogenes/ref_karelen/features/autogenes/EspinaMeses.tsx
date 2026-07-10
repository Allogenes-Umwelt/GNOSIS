"use client";

import { useMemo } from "react";
import { histogramaMeses } from "@/lib/fechas";
import type { Evento } from "@/types/autogenes";

const INICIALES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const NOMBRE = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * The heat spine — a year's month-density profile at a glance, so a
 * loaded year shows its SHAPE instead of collapsing into a flat list.
 * Twelve cells, coral intensity by count; empty months keep a faint
 * frame tick (the Frame stays visible). Pure visualization, no tap
 * target (sub-48px cells would break the touch floor): it reads, it
 * doesn't act. Reduced-motion safe by construction (static).
 */
export function EspinaMeses({ eventos }: { eventos: Evento[] }) {
  const h = useMemo(() => histogramaMeses(eventos), [eventos]);

  // A single-month year tells you nothing new over the list — skip it.
  const mesesConEventos = h.meses.filter((m) => m > 0).length;
  if (mesesConEventos < 2) return null;

  const resumen = h.meses
    .map((c, i) => (c > 0 ? `${c} en ${NOMBRE[i]}` : null))
    .filter((s): s is string => s !== null)
    .join(", ");

  return (
    <div
      role="img"
      aria-label={`Densidad por mes: ${resumen}${h.sinMes > 0 ? `, ${h.sinMes} sin mes` : ""}.`}
      className="flex items-end gap-[3px]"
    >
      {h.meses.map((count, i) => {
        // 0 → faint frame tick; >0 → coral ramped from a legible floor.
        const intensidad = count === 0 ? 0 : 0.28 + 0.72 * (count / h.pico);
        return (
          <span
            key={i}
            className="flex-1"
            title={count > 0 ? `${NOMBRE[i]}: ${count}` : NOMBRE[i]}
          >
            <span
              aria-hidden
              className="block w-full rounded-xs"
              style={{
                height: "10px",
                background:
                  count === 0 ? "var(--viz-ink-3)" : "var(--coral)",
                opacity: count === 0 ? 0.22 : intensidad,
              }}
            />
            <span
              aria-hidden
              className="mt-0.5 block text-center font-mono text-frame-3"
              style={{ fontSize: "7px", lineHeight: 1 }}
            >
              {INICIALES[i]}
            </span>
          </span>
        );
      })}
    </div>
  );
}
