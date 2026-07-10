"use client";

import { useMemo, useState } from "react";
import {
  candidatosLote,
  claveOmision,
  oportunidadesFicha,
  type CandidatoFicha,
} from "@/lib/enriquecimiento";
import {
  aplicarFicha,
  buscarFicha,
  buscarFichasLote,
  type FichaLote,
} from "@/services/autogenes";
import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";

/**
 * ENRIQUECIMIENTO (C4) — entities without a ficha, resolved through
 * the open connectors. The operator triggers each lookup (the name is
 * what travels, nothing else) and adjudicates the candidates; applying
 * docks the description as resumen and the label as alias. Omitting
 * persists — the gap is never proposed again.
 */
export function EnriquecimientoPanel() {
  const entidades = useAutogenesStore((s) => s.entidades);
  const paresDescartados = useAutogenesStore((s) => s.paresDescartados);
  const descartarPar = useAutogenesStore((s) => s.descartarPar);
  const fire = useBurstStore((s) => s.fire);

  const [abierta, setAbierta] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<CandidatoFicha[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lote, setLote] = useState<FichaLote[] | null>(null);
  const [buscandoLote, setBuscandoLote] = useState(false);
  const [erroresLote, setErroresLote] = useState<string[]>([]);

  const oportunidades = useMemo(
    () => oportunidadesFicha(entidades, new Set(paresDescartados)),
    [entidades, paresDescartados],
  );
  const enlazables = useMemo(
    () => candidatosLote(entidades, new Set(paresDescartados)),
    [entidades, paresDescartados],
  );

  async function buscarLote() {
    setBuscandoLote(true);
    setErroresLote([]);
    try {
      const r = await buscarFichasLote(
        enlazables.map((e) => ({ id: e.id, nombre: e.nombre })),
      );
      setLote(r.resultados);
      setErroresLote(r.errores);
    } finally {
      setBuscandoLote(false);
    }
  }

  function aplicarDelLote(item: FichaLote) {
    aplicarFicha(item.entidadId, item.ficha);
    setLote((prev) =>
      prev ? prev.filter((x) => x.entidadId !== item.entidadId) : prev,
    );
    fire();
  }

  if (oportunidades.length === 0) return null;

  async function buscar(entidadId: string, nombre: string) {
    setAbierta(entidadId);
    setCandidatos([]);
    setError(null);
    setBuscando(true);
    try {
      const lista = await buscarFicha(nombre);
      setCandidatos(lista);
      if (lista.length === 0) {
        setError("Sin fichas aplicables para ese nombre. Omite o reintenta.");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "La búsqueda de ficha falló.",
      );
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="hud flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Enriquecimiento
        </h2>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {oportunidades.length} sin ficha
        </span>
      </div>
      <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
        Buscar envía solo el nombre a Wikidata (servicio abierto). Tú
        decides qué ficha se aplica.
      </p>

      {enlazables.length >= 2 ? (
        <div className="flex flex-col gap-2 border border-structural bg-contain px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
              Lote: {enlazables.length} entidades de tipo público
              (organización, lugar, término…). Las personas nunca viajan.
            </p>
            <button
              type="button"
              onClick={() => void buscarLote()}
              disabled={buscandoLote}
              className="hud-btn shrink-0 border border-coral px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.15em] text-coral-text disabled:opacity-30"
              style={{ minHeight: "var(--touch-target)" }}
            >
              {buscandoLote ? "Buscando lote" : "Buscar por lote"}
            </button>
          </div>
          {lote !== null && lote.length === 0 ? (
            <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
              Sin coincidencias con confianza suficiente. Nada se aplicó.
            </p>
          ) : null}
          {lote && lote.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {lote.map((item) => (
                <li key={item.entidadId} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-caption leading-relaxed text-frame-2">
                      <span className="text-coral-text">{item.nombre}</span>
                      {" — "}
                      {item.ficha.descripcion}
                    </p>
                    <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
                      [wikidata · {item.ficha.id}] · confianza{" "}
                      {item.confianza.toFixed(2)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => aplicarDelLote(item)}
                    className="hud-btn shrink-0 bg-coral px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.15em] text-void"
                    style={{ minHeight: "var(--touch-target)" }}
                  >
                    Aplicar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {erroresLote.map((e) => (
            <p
              key={e}
              className="font-mono text-micro tracking-[0.12em] text-frame-3"
            >
              {e}
            </p>
          ))}
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {oportunidades.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-1.5 border border-structural bg-contain px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                  {e.nombre}
                </p>
                <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
                  {e.tipo} · {e.origen}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => descartarPar(claveOmision(e.id))}
                  className="border border-structural px-3 py-2 font-mono text-micro uppercase tracking-[0.2em] text-frame-3"
                  style={{ minHeight: "var(--touch-target)" }}
                >
                  Omitir
                </button>
                <button
                  type="button"
                  onClick={() => void buscar(e.id, e.nombre)}
                  disabled={buscando && abierta === e.id}
                  className="hud-btn border border-coral px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
                  style={{ minHeight: "var(--touch-target)" }}
                >
                  {buscando && abierta === e.id ? "Buscando" : "Buscar ficha"}
                </button>
              </div>
            </div>

            {abierta === e.id && error ? (
              <p className="font-mono text-micro tracking-wide text-frame-2">
                {error}
              </p>
            ) : null}

            {abierta === e.id && candidatos.length > 0 ? (
              <ul className="flex flex-col gap-1.5 border-t border-structural pt-2">
                {candidatos.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-caption leading-relaxed text-frame-2">
                        {c.descripcion}
                      </p>
                      <p className="font-mono text-micro tracking-[0.12em] text-frame-3">
                        [wikidata · {c.id}]{c.nombre ? ` · ${c.nombre}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        aplicarFicha(e.id, c);
                        setAbierta(null);
                        setCandidatos([]);
                        fire();
                      }}
                      className="hud-btn shrink-0 bg-coral px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em] text-void"
                      style={{ minHeight: "var(--touch-target)" }}
                    >
                      Aplicar
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
