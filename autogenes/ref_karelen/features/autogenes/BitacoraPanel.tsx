"use client";

import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";

/**
 * BITÁCORA (D1) — the graph's append-only audit trail plus the undo
 * control. The trail is immutable: undoing restores the graph, never
 * the record of what happened. Undo lives in memory — after a reload
 * the audit remains, the undo stack starts empty.
 */
export function BitacoraPanel() {
  const bitacora = useAutogenesStore((s) => s.bitacora);
  const deshacerDisponibles = useAutogenesStore((s) => s.deshacerDisponibles);
  const deshacer = useAutogenesStore((s) => s.deshacer);
  const fire = useBurstStore((s) => s.fire);

  if (bitacora.length === 0) return null;

  return (
    <div className="hud flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Bitácora
        </h2>
        <button
          type="button"
          onClick={() => {
            if (deshacer()) fire();
          }}
          disabled={deshacerDisponibles === 0}
          className={
            deshacerDisponibles > 0
              ? "hud-btn border border-coral px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
              : "border border-structural px-3 py-2 font-mono text-micro uppercase tracking-[0.2em] text-frame-3"
          }
          style={{ minHeight: "var(--touch-target)" }}
        >
          Deshacer
        </button>
      </div>
      <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
        Registro inmutable de cada mutación del grafo. Deshacer revierte el
        grafo, nunca el registro.
      </p>
      <details className="border border-structural bg-contain">
        <summary
          className="cursor-pointer list-none px-3 py-3 font-mono text-micro uppercase tracking-[0.25em] text-frame-3"
          style={{ minHeight: "var(--touch-target)" }}
        >
          ▸ {bitacora.length}{" "}
          {bitacora.length === 1 ? "movimiento" : "movimientos"}
        </summary>
        <ol className="flex flex-col border-t border-structural">
          {bitacora.slice(0, 40).map((e) => (
            <li
              key={e.id}
              className="flex items-baseline gap-3 border-b border-structural px-3 py-2 last:border-b-0"
            >
              <span className="tnum shrink-0 font-mono text-micro tracking-[0.12em] text-frame-3">
                {new Date(e.ts).toLocaleString("es-MX", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="min-w-0">
                <span className="mr-2 font-mono text-micro uppercase tracking-[0.15em] text-coral-text">
                  {e.accion}
                </span>
                <span className="text-caption leading-relaxed text-frame-2">
                  {e.detalle}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
