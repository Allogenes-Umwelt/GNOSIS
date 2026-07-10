"use client";

import { useMemo, useState } from "react";
import { aplicarFiltro, metricasDeVista } from "@/capacidades/vistas";
import { CAMPOS_INFO } from "@/lib/campos";
import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";
import { useCanvasStore } from "@/store/canvas";
import { TIPOS_ENTIDAD, type FiltroVista } from "@/types/autogenes";
import { MetricaSchema } from "@/types/resultado";
import { cn } from "@/lib/cn";

const metaClass = "font-mono text-micro tracking-[0.12em] text-frame-3";
const inputClass =
  "w-full border border-structural bg-inset px-3 py-2 font-mono text-small text-frame-1 placeholder:text-frame-3 focus:border-soft focus:outline-none";
const selectClass =
  "border border-structural bg-inset px-2 py-2 font-mono text-micro text-frame-1";

const FILTRO_VACIO: FiltroVista = {};

/**
 * EXPLORADOR (D5) — the object explorer: facet the entity layer (tipo,
 * campo, tipo del operador, texto), read live derived metrics, save
 * the question as a named view, and dock any numeric metric as a
 * Panel instrument (fuente "sistema", derived on device).
 */
export function ExploradorPanel() {
  const entidades = useAutogenesStore((s) => s.entidades);
  const tiposOperador = useAutogenesStore((s) => s.tiposOperador);
  const vistas = useAutogenesStore((s) => s.vistas);
  const guardarVista = useAutogenesStore((s) => s.guardarVista);
  const removeVista = useAutogenesStore((s) => s.removeVista);
  const presentar = useCanvasStore((s) => s.registerInstrumento);
  const fire = useBurstStore((s) => s.fire);

  const [filtro, setFiltro] = useState<FiltroVista>(FILTRO_VACIO);
  const [nombreVista, setNombreVista] = useState("");
  const [presentada, setPresentada] = useState<string | null>(null);
  const [ahora] = useState(() => Date.now());

  const resultado = useMemo(
    () => aplicarFiltro(entidades, filtro),
    [entidades, filtro],
  );
  const tipoActivo = useMemo(
    () => tiposOperador.find((t) => t.id === filtro.subtipo),
    [tiposOperador, filtro.subtipo],
  );
  const metricas = useMemo(
    () => metricasDeVista(resultado, tipoActivo, ahora),
    [resultado, tipoActivo, ahora],
  );

  if (entidades.length === 0) return null;

  const hayFiltro = Boolean(
    filtro.texto?.trim() || filtro.tipo || filtro.campo || filtro.subtipo,
  );

  function presentarMetrica(clave: string) {
    const m = metricas.find((x) => x.clave === clave);
    if (!m || m.numero === undefined) return;
    const etiquetaVista =
      nombreVista.trim() ||
      [
        tipoActivo?.nombre,
        filtro.tipo,
        filtro.campo,
        filtro.texto?.trim() ? `«${filtro.texto.trim()}»` : null,
      ]
        .filter(Boolean)
        .join(" · ") ||
      "Todo el grafo";
    const metrica = MetricaSchema.safeParse({
      funcion: "metrica",
      titulo: `${etiquetaVista}: ${m.etiqueta}`,
      unidad: m.unidad ?? "",
      valor: m.numero,
      decimales: Number.isInteger(m.numero) ? 0 : 2,
      serie: [{ t: ahora, v: m.numero }],
      fuente: {
        conector: "sistema",
        consulta: "vista del explorador",
        obtenido: new Date(ahora).toISOString(),
      },
    });
    if (metrica.success) {
      presentar(metrica.data.titulo, metrica.data);
      setPresentada(clave);
      fire();
    }
  }

  return (
    <div className="hud flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Explorador
        </h2>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {resultado.length} / {entidades.length}
        </span>
      </div>

      {/* Facets */}
      <div className="flex flex-col gap-2">
        <label htmlFor="exp-texto" className="sr-only">
          Buscar en la vista
        </label>
        <input
          id="exp-texto"
          type="search"
          value={filtro.texto ?? ""}
          onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })}
          placeholder="Nombre, alias o resumen…"
          className={inputClass}
        />
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filtrar por tipo"
            value={filtro.tipo ?? ""}
            onChange={(e) =>
              setFiltro({
                ...filtro,
                tipo: (e.target.value || undefined) as FiltroVista["tipo"],
              })
            }
            className={selectClass}
            style={{ minHeight: "var(--touch-target)" }}
          >
            <option value="">tipo · todos</option>
            {TIPOS_ENTIDAD.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por campo"
            value={filtro.campo ?? ""}
            onChange={(e) =>
              setFiltro({
                ...filtro,
                campo: (e.target.value || undefined) as FiltroVista["campo"],
              })
            }
            className={selectClass}
            style={{ minHeight: "var(--touch-target)" }}
          >
            <option value="">campo · todos</option>
            {CAMPOS_INFO.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nombre}
              </option>
            ))}
          </select>
          {tiposOperador.length > 0 ? (
            <select
              aria-label="Filtrar por tipo del operador"
              value={filtro.subtipo ?? ""}
              onChange={(e) =>
                setFiltro({ ...filtro, subtipo: e.target.value || undefined })
              }
              className={selectClass}
              style={{ minHeight: "var(--touch-target)" }}
            >
              <option value="">tipo operador · todos</option>
              {tiposOperador.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {/* Derived metrics — dock any numeric one as a Panel instrument */}
      <ul className="flex flex-col gap-1.5">
        {metricas.map((m) => (
          <li
            key={m.clave}
            className="flex items-center gap-3 border border-structural bg-contain px-3 py-2"
          >
            <p className="min-w-0 flex-1 font-mono text-small text-frame-1">
              <span className="tnum font-bold text-coral-text">{m.valor}</span>{" "}
              <span className={metaClass}>{m.etiqueta}</span>
            </p>
            {m.numero !== undefined ? (
              <button
                type="button"
                onClick={() => presentarMetrica(m.clave)}
                className={cn(
                  "shrink-0 border px-2.5 py-1.5 font-mono text-micro uppercase tracking-[0.15em]",
                  presentada === m.clave
                    ? "border-structural text-frame-3"
                    : "border-coral text-coral-text",
                )}
              >
                {presentada === m.clave ? "En el Panel" : "→ Panel"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Results (capped listing) */}
      {resultado.length > 0 ? (
        <p className="text-caption leading-relaxed text-frame-2">
          {resultado
            .slice(0, 12)
            .map((e) => e.nombre)
            .join(" · ")}
          {resultado.length > 12 ? ` · y ${resultado.length - 12} más` : ""}
        </p>
      ) : (
        <p className={metaClass}>Nada responde a esa vista.</p>
      )}

      {/* Save the question */}
      {hayFiltro ? (
        <div className="flex gap-2">
          <label htmlFor="exp-nombre" className="sr-only">
            Nombre de la vista
          </label>
          <input
            id="exp-nombre"
            type="text"
            value={nombreVista}
            onChange={(e) => setNombreVista(e.target.value)}
            placeholder="Nombra esta vista"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => {
              if (nombreVista.trim().length === 0) return;
              guardarVista(nombreVista, filtro);
              setNombreVista("");
              fire();
            }}
            disabled={nombreVista.trim().length === 0}
            className={cn(
              "hud-btn shrink-0 px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em]",
              nombreVista.trim()
                ? "bg-coral text-void"
                : "border border-structural text-frame-3",
            )}
            style={{ minHeight: "var(--touch-target)" }}
          >
            Guardar vista
          </button>
        </div>
      ) : null}

      {/* Saved views — one tap reloads the question */}
      {vistas.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className={metaClass}>Vistas guardadas</p>
          <ul className="flex flex-wrap gap-1.5">
            {vistas.map((v) => (
              <li key={v.id} className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setFiltro(v.filtro)}
                  className="border border-coral px-3 py-2 font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
                  style={{ minHeight: "var(--touch-target)" }}
                >
                  {v.nombre}
                </button>
                <button
                  type="button"
                  onClick={() => removeVista(v.id)}
                  aria-label={`Quitar vista ${v.nombre}`}
                  className="border border-l-0 border-structural px-2 font-mono text-micro text-frame-3"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
