"use client";

import { useMemo } from "react";
import { claveConexion, proponerConexiones } from "@/lib/inferencia";
import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";

/**
 * CONEXIONES (C1) — inference proposals, adjudicated by the operator.
 * Deterministic signals (co-citation, shared events) surface pairs the
 * extraction didn't link; accepting docks a "co-aparece con" relation
 * WITH the shared evidence, discarding persists so the pair never
 * returns. The system proposes; the operator decides.
 */
export function ConexionesPanel() {
  const artefactos = useAutogenesStore((s) => s.artefactos);
  const fragmentos = useAutogenesStore((s) => s.fragmentos);
  const entidades = useAutogenesStore((s) => s.entidades);
  const relaciones = useAutogenesStore((s) => s.relaciones);
  const eventos = useAutogenesStore((s) => s.eventos);
  const paresDescartados = useAutogenesStore((s) => s.paresDescartados);
  const addRelacion = useAutogenesStore((s) => s.addRelacion);
  const descartarPar = useAutogenesStore((s) => s.descartarPar);
  const fire = useBurstStore((s) => s.fire);

  const propuestas = useMemo(
    () =>
      proponerConexiones(
        { artefactos, fragmentos, entidades, relaciones, eventos },
        new Set(paresDescartados),
      ),
    [artefactos, fragmentos, entidades, relaciones, eventos, paresDescartados],
  );

  if (propuestas.length === 0) return null;

  return (
    <div className="hud flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Conexiones sugeridas
        </h2>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {propuestas.length} por revisar
        </span>
      </div>
      <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
        Señales del grafo, no afirmaciones. Tú decides qué se enlaza.
      </p>
      <ul className="flex flex-col gap-2">
        {propuestas.map((p) => (
          <li
            key={claveConexion(p.aId, p.bId)}
            className="flex flex-col gap-1.5 border border-structural bg-contain px-3 py-2"
          >
            <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
              {p.aNombre}
              <span className="mx-1.5 font-mono font-normal text-coral-text">
                ↔
              </span>
              {p.bNombre}
            </p>
            {p.motivos.map((m) => (
              <p
                key={m}
                className="font-mono text-micro tracking-[0.12em] text-frame-2"
              >
                {m}
              </p>
            ))}
            {p.citas.length > 0 ? (
              <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
                [{p.citas.join("] [")}]
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => descartarPar(claveConexion(p.aId, p.bId))}
                className="border border-structural px-3 py-2 font-mono text-micro uppercase tracking-[0.2em] text-frame-3"
                style={{ minHeight: "var(--touch-target)" }}
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={() => {
                  addRelacion({
                    desdeId: p.aId,
                    hastaId: p.bId,
                    tipo: "co-aparece con",
                    peso: p.peso,
                    evidencia: p.evidencia,
                  });
                  fire();
                }}
                className="hud-btn bg-coral px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-void"
                style={{ minHeight: "var(--touch-target)" }}
              >
                Enlazar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
