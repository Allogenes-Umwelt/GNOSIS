"use client";

import { useMemo, useState } from "react";
import { EspinaMeses } from "@/features/autogenes/EspinaMeses";
import { agruparPorAnio, formatearFechaEs } from "@/lib/fechas";
import { useAutogenesStore } from "@/store/autogenes";

/**
 * CRONOLOGÍA (B3) — the time primitive rendered: year groups on a grey
 * spine, coral diamond markers, dates in mono by precision. Tap an
 * event to interrogate its provenance (the exact fragment passages that
 * date it); every event can be removed individually.
 */
export function CronologiaPanel() {
  const eventos = useAutogenesStore((s) => s.eventos);
  const fragmentos = useAutogenesStore((s) => s.fragmentos);
  const artefactos = useAutogenesStore((s) => s.artefactos);
  const removeEvento = useAutogenesStore((s) => s.removeEvento);

  const [abierto, setAbierto] = useState<string | null>(null);
  const cronologia = useMemo(() => agruparPorAnio(eventos), [eventos]);

  if (cronologia.length === 0) return null;

  return (
    <div className="hud flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Cronología
        </h2>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {eventos.length} {eventos.length === 1 ? "evento" : "eventos"} citados
        </span>
      </div>
      {cronologia.map((grupo) => (
        <div key={grupo.anio} className="flex flex-col gap-1.5">
          <p className="tnum font-display text-caption font-bold uppercase tracking-[0.35em] text-coral-text">
            {grupo.anio}
          </p>
          <EspinaMeses eventos={grupo.eventos} />
          <ol className="flex flex-col border-l border-structural">
            {grupo.eventos.map((e) => {
              const estaAbierto = abierto === e.id;
              const citas = e.evidencia
                .map((id) => fragmentos.find((f) => f.id === id))
                .filter((f): f is NonNullable<typeof f> => Boolean(f))
                .slice(0, 2);
              return (
                <li key={e.id} className="relative pb-2 pl-4">
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-coral"
                  />
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => setAbierto(estaAbierto ? null : e.id)}
                      aria-expanded={estaAbierto}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="tnum font-mono text-micro font-bold tracking-[0.15em] text-coral-text">
                        {formatearFechaEs(e.fecha, e.precision)}
                      </p>
                      <p className="text-caption leading-relaxed text-frame-1">
                        {e.titulo}
                      </p>
                      {e.entidades.length > 0 ? (
                        <p className="mt-0.5 font-mono text-micro tracking-[0.12em] text-frame-3">
                          {e.entidades.join(" · ")}
                        </p>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeEvento(e.id)}
                      aria-label={`Quitar evento ${e.titulo}`}
                      className="shrink-0 border border-structural px-2 py-1 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                    >
                      Quitar
                    </button>
                  </div>
                  {estaAbierto
                    ? citas.map((f) => {
                        const a = artefactos.find(
                          (x) => x.id === f.artefactoId,
                        );
                        return (
                          <p
                            key={f.id}
                            className="mt-1 border-l border-structural pl-2 text-caption leading-relaxed text-frame-2"
                          >
                            <span className="font-mono text-micro tracking-[0.12em] text-frame-3">
                              [{a?.nombre ?? "fuente"}
                              {f.pagina ? ` · pág ${f.pagina}` : ""}]{" "}
                            </span>
                            {f.texto.slice(0, 160)}
                            {f.texto.length > 160 ? "…" : ""}
                          </p>
                        );
                      })
                    : null}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
