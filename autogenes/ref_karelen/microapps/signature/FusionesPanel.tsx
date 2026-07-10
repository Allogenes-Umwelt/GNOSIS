"use client";

import { useMemo, useState } from "react";
import { clavePar, paresSimilares, type ParSimilar } from "@/capacidades/semejanza";
import { embederLote } from "@/lib/embeddings";
import { useQualiaStore } from "@/store/qualia";

const metaClass = "font-mono text-micro tracking-[0.12em] text-frame-3";
const MAX_ETIQUETAS = 60;

/**
 * Semantic fusion proposals (N3) — near-duplicate concepts («Renta» /
 * «renta mensual») found with the on-device embedding model; nothing
 * leaves the phone. Every fusion is operator-approved and reversible in
 * data terms: the store keeps a label→canonical map applied at
 * projection time, the fuentes are never rewritten. Dismissals persist.
 */
export function FusionesPanel({ etiquetas }: { etiquetas: string[] }) {
  const fusiones = useQualiaStore((s) => s.fusiones);
  const paresOmitidos = useQualiaStore((s) => s.paresOmitidos);
  const fusionar = useQualiaStore((s) => s.fusionar);
  const omitirPar = useQualiaStore((s) => s.omitirPar);

  const [sugerencias, setSugerencias] = useState<ParSimilar[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [progreso, setProgreso] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const candidatas = useMemo(
    () =>
      [...new Set(etiquetas)]
        .filter((e) => !(e in fusiones))
        .slice(0, MAX_ETIQUETAS),
    [etiquetas, fusiones],
  );

  const visibles = useMemo(
    () =>
      (sugerencias ?? []).filter(
        (p) =>
          !paresOmitidos.includes(clavePar(p.a, p.b)) &&
          !(p.a in fusiones) &&
          !(p.b in fusiones),
      ),
    [sugerencias, paresOmitidos, fusiones],
  );

  const sugerir = async () => {
    setBuscando(true);
    setError(null);
    try {
      const vectores = await embederLote(candidatas, (h, t) =>
        setProgreso([h, t]),
      );
      setSugerencias(paresSimilares(candidatas, vectores));
    } catch {
      setError(
        "El modelo de similitud no se pudo cargar (requiere red la primera vez). Revisa tu conexión y reintenta.",
      );
    } finally {
      setBuscando(false);
      setProgreso(null);
    }
  };

  if (candidatas.length < 2) return null;

  return (
    <div className="hud flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
          Fusiones sugeridas
        </span>
        <span className={metaClass}>
          {Object.keys(fusiones).length} aplicadas
        </span>
      </div>

      {sugerencias === null ? (
        <p className={metaClass}>
          Busca conceptos casi duplicados («Renta» / «renta mensual») con el
          modelo de similitud local. Corre en tu dispositivo; nada sale.
        </p>
      ) : visibles.length === 0 ? (
        <p className={metaClass}>
          Sin duplicados aparentes entre {candidatas.length} conceptos. Nada
          que fusionar.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visibles.map((p) => (
            <li
              key={clavePar(p.a, p.b)}
              className="flex items-center gap-2 border border-structural bg-contain px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-caption leading-relaxed text-frame-2">
                  «{p.a}» ≈ «{p.b}»
                </p>
                <p className={metaClass}>
                  similitud {p.similitud.toFixed(2)} · fusionar deja «{p.b}»
                </p>
              </div>
              <button
                type="button"
                onClick={() => omitirPar(clavePar(p.a, p.b))}
                className="shrink-0 border border-structural px-2.5 py-2 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                style={{ minHeight: "var(--touch-target)" }}
              >
                Omitir
              </button>
              <button
                type="button"
                onClick={() => fusionar(p.a, p.b)}
                className="hud-btn shrink-0 border border-coral px-2.5 py-2 font-mono text-micro font-bold uppercase tracking-[0.15em] text-coral-text"
                style={{ minHeight: "var(--touch-target)" }}
              >
                Fusionar
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className={metaClass}>{error}</p> : null}

      <button
        type="button"
        onClick={() => void sugerir()}
        disabled={buscando}
        className="hud-btn self-start border border-structural px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-frame-2 disabled:text-frame-3"
        style={{ minHeight: "var(--touch-target)" }}
      >
        {buscando
          ? progreso
            ? `Comparando ${progreso[0]}/${progreso[1]}`
            : "Cargando modelo"
          : sugerencias === null
            ? "Sugerir fusiones"
            : "Rehacer sugerencias"}
      </button>
    </div>
  );
}
