"use client";

import { useState } from "react";
import { claveDeEtiqueta } from "@/lib/tipado";
import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";
import {
  TIPOS_ENTIDAD,
  TIPOS_PROPIEDAD,
  type PropiedadDef,
  type TipoEntidad,
  type TipoPropiedad,
} from "@/types/autogenes";
import { cn } from "@/lib/cn";

const metaClass = "font-mono text-micro tracking-[0.12em] text-frame-3";
const inputClass =
  "w-full border border-structural bg-inset px-3 py-2 font-mono text-small text-frame-1 placeholder:text-frame-3 focus:border-soft focus:outline-none";

interface FilaProp {
  etiqueta: string;
  tipo: TipoPropiedad;
  requerida: boolean;
}

/**
 * ONTOLOGÍA (D2) — the operator defines his own types over the base
 * enum: "Póliza" (documento) with vigencia:fecha, prima:numero. Types
 * are the contract entity properties validate against; deleting one
 * untypes its entities (audited, undoable).
 */
export function OntologiaPanel() {
  const tipos = useAutogenesStore((s) => s.tiposOperador);
  const entidades = useAutogenesStore((s) => s.entidades);
  const crearTipoOperador = useAutogenesStore((s) => s.crearTipoOperador);
  const removeTipoOperador = useAutogenesStore((s) => s.removeTipoOperador);
  const tiposRelacion = useAutogenesStore((s) => s.tiposRelacion);
  const crearTipoRelacion = useAutogenesStore((s) => s.crearTipoRelacion);
  const removeTipoRelacion = useAutogenesStore((s) => s.removeTipoRelacion);
  const fire = useBurstStore((s) => s.fire);

  const [nombre, setNombre] = useState("");
  const [base, setBase] = useState<TipoEntidad>("documento");
  const [filas, setFilas] = useState<FilaProp[]>([
    { etiqueta: "", tipo: "texto", requerida: false },
  ]);

  function crear() {
    const propiedades: PropiedadDef[] = [];
    const claves = new Set<string>();
    for (const f of filas) {
      const clave = claveDeEtiqueta(f.etiqueta);
      if (clave.length === 0 || claves.has(clave)) continue;
      claves.add(clave);
      propiedades.push({
        clave,
        etiqueta: f.etiqueta.trim(),
        tipo: f.tipo,
        requerida: f.requerida,
      });
    }
    if (nombre.trim().length === 0 || propiedades.length === 0) return;
    crearTipoOperador({ nombre, base, propiedades });
    setNombre("");
    setFilas([{ etiqueta: "", tipo: "texto", requerida: false }]);
    fire();
  }

  // D2b — relation catalog mini-form.
  const [nombreRel, setNombreRel] = useState("");
  const [desdeRel, setDesdeRel] = useState<TipoEntidad>("organizacion");
  const [hastaRel, setHastaRel] = useState<TipoEntidad>("persona");
  const crearRel = () => {
    if (nombreRel.trim().length === 0) return;
    crearTipoRelacion({ nombre: nombreRel, desde: desdeRel, hasta: hastaRel });
    setNombreRel("");
    fire();
  };

  return (
    <div className="hud flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Ontología del operador
        </h2>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {tipos.length} {tipos.length === 1 ? "tipo" : "tipos"}
        </span>
      </div>
      <p className={metaClass}>
        Define tus tipos con propiedades estructuradas; las entidades se
        tipifican en su Dossier y los valores se validan al guardar.
      </p>

      {tipos.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {tipos.map((t) => {
            const usos = entidades.filter((e) => e.subtipo === t.id).length;
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 border border-structural bg-contain px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                    {t.nombre}
                    <span className="ml-2 font-mono font-normal tracking-[0.15em] text-frame-3">
                      {t.base}
                    </span>
                  </p>
                  <p className={`tnum ${metaClass}`}>
                    {t.propiedades
                      .map(
                        (p) =>
                          `${p.etiqueta} (${p.tipo}${p.requerida ? " · requerida" : ""})`,
                      )
                      .join(" · ")}{" "}
                    · {usos} {usos === 1 ? "entidad" : "entidades"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeTipoOperador(t.id)}
                  aria-label={`Quitar tipo ${t.nombre}`}
                  className="shrink-0 border border-structural px-2.5 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                >
                  Quitar
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <details className="border border-structural bg-contain">
        <summary
          className="cursor-pointer list-none px-3 py-3 font-mono text-micro uppercase tracking-[0.25em] text-coral-text"
          style={{ minHeight: "var(--touch-target)" }}
        >
          ▸ Definir tipo
        </summary>
        <div className="flex flex-col gap-3 border-t border-structural p-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="tipo-nombre" className="sr-only">
                Nombre del tipo
              </label>
              <input
                id="tipo-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Póliza, Contrato, Trámite…"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="tipo-base" className="sr-only">
                Tipo base
              </label>
              <select
                id="tipo-base"
                value={base}
                onChange={(e) => setBase(e.target.value as TipoEntidad)}
                className={inputClass}
                style={{ minHeight: "var(--touch-target)" }}
              >
                {TIPOS_ENTIDAD.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filas.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                aria-label={`Propiedad ${i + 1}`}
                value={f.etiqueta}
                onChange={(e) =>
                  setFilas(
                    filas.map((x, j) =>
                      j === i ? { ...x, etiqueta: e.target.value } : x,
                    ),
                  )
                }
                placeholder="Vigencia, Prima anual…"
                className={inputClass}
              />
              <select
                aria-label={`Tipo de propiedad ${i + 1}`}
                value={f.tipo}
                onChange={(e) =>
                  setFilas(
                    filas.map((x, j) =>
                      j === i
                        ? { ...x, tipo: e.target.value as TipoPropiedad }
                        : x,
                    ),
                  )
                }
                className="border border-structural bg-inset px-2 py-2 font-mono text-micro text-frame-1"
                style={{ minHeight: "var(--touch-target)" }}
              >
                {TIPOS_PROPIEDAD.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setFilas(
                    filas.map((x, j) =>
                      j === i ? { ...x, requerida: !x.requerida } : x,
                    ),
                  )
                }
                aria-pressed={f.requerida}
                className={cn(
                  "shrink-0 border px-2 py-2 font-mono text-micro uppercase tracking-[0.12em]",
                  f.requerida
                    ? "border-coral text-coral-text"
                    : "border-structural text-frame-3",
                )}
                style={{ minHeight: "var(--touch-target)" }}
              >
                req
              </button>
            </div>
          ))}
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setFilas([
                  ...filas,
                  { etiqueta: "", tipo: "texto", requerida: false },
                ])
              }
              className="border border-structural px-3 py-2 font-mono text-micro uppercase tracking-[0.2em] text-frame-3"
              style={{ minHeight: "var(--touch-target)" }}
            >
              Sumar propiedad
            </button>
            <button
              type="button"
              onClick={crear}
              disabled={
                nombre.trim().length === 0 ||
                !filas.some((f) => claveDeEtiqueta(f.etiqueta).length > 0)
              }
              className={cn(
                "hud-btn px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em]",
                nombre.trim().length > 0 &&
                  filas.some((f) => claveDeEtiqueta(f.etiqueta).length > 0)
                  ? "bg-coral text-void"
                  : "border border-structural text-frame-3",
              )}
              style={{ minHeight: "var(--touch-target)" }}
            >
              Crear tipo
            </button>
          </div>
        </div>
      </details>

      {/* D2b — the relation catalog: which typed edges the operator's
          hand may declare, with their permitted ends. */}
      <div className="flex flex-col gap-2 border-t border-structural pt-3">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-micro font-bold uppercase tracking-[0.3em] text-frame-2">
            Tipos de relación
          </h3>
          <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
            {tiposRelacion.length}
          </span>
        </div>
        <p className={metaClass}>
          Declara qué une cada vínculo. Al enlazar a mano, los extremos se
          validan contra esto; la extracción sigue libre.
        </p>
        {tiposRelacion.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {tiposRelacion.map((tr) => (
              <li
                key={tr.id}
                className="flex items-center gap-3 border border-structural bg-contain px-3 py-2"
              >
                <p className="min-w-0 flex-1 font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                  {tr.nombre}
                  <span className="ml-2 font-mono font-normal normal-case tracking-[0.15em] text-frame-3">
                    {tr.desde} → {tr.hasta}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => removeTipoRelacion(tr.id)}
                  aria-label={`Quitar tipo de relación ${tr.nombre}`}
                  className="shrink-0 border border-structural px-2.5 py-2 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                  style={{ minHeight: "var(--touch-target)" }}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-col gap-2 lg:flex-row">
          <label htmlFor="rel-nombre" className="sr-only">
            Nombre del tipo de relación
          </label>
          <input
            id="rel-nombre"
            type="text"
            value={nombreRel}
            onChange={(e) => setNombreRel(e.target.value)}
            placeholder="asegura a, renta a, trabaja en…"
            className={inputClass}
          />
          <div className="flex gap-2">
            <label htmlFor="rel-desde" className="sr-only">
              Tipo de origen
            </label>
            <select
              id="rel-desde"
              value={desdeRel}
              onChange={(e) => setDesdeRel(e.target.value as TipoEntidad)}
              className={inputClass}
            >
              {TIPOS_ENTIDAD.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <span className="self-center font-mono text-micro text-frame-3">→</span>
            <label htmlFor="rel-hasta" className="sr-only">
              Tipo de destino
            </label>
            <select
              id="rel-hasta"
              value={hastaRel}
              onChange={(e) => setHastaRel(e.target.value as TipoEntidad)}
              className={inputClass}
            >
              {TIPOS_ENTIDAD.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={crearRel}
            disabled={nombreRel.trim().length === 0}
            className={cn(
              "hud-btn shrink-0 px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em]",
              nombreRel.trim().length > 0
                ? "bg-coral text-void"
                : "border border-structural text-frame-3",
            )}
            style={{ minHeight: "var(--touch-target)" }}
          >
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
