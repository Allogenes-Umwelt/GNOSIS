"use client";

import { useState } from "react";
import { ejecutarAccion } from "@/services/autogenes";
import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full border border-structural bg-inset px-3 py-2 font-mono text-small text-frame-1 placeholder:text-frame-3 focus:border-soft focus:outline-none";
const metaClass = "font-mono text-micro tracking-[0.12em] text-frame-3";

/**
 * Operator Actions (L·6) — structured capture in two taps. Every type the
 * operator defined IS an action: pick "Registrar Pago", fill its validated
 * properties, optionally link it through a catalog-checked relation, done.
 * The service validates everything before anything writes.
 */
export function AccionesPanel() {
  const tipos = useAutogenesStore((s) => s.tiposOperador);
  const tiposRelacion = useAutogenesStore((s) => s.tiposRelacion);
  const entidades = useAutogenesStore((s) => s.entidades);
  const fire = useBurstStore((s) => s.fire);

  const [tipoId, setTipoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [destinoId, setDestinoId] = useState("");
  const [tipoEnlace, setTipoEnlace] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  const tipo = tipos.find((t) => t.id === tipoId);
  if (tipos.length === 0) return null;

  const ejecutar = () => {
    if (!tipo) return;
    setAviso(null);
    const r = ejecutarAccion({
      tipoId: tipo.id,
      nombre,
      propiedades: valores,
      enlace:
        destinoId && tipoEnlace.trim().length > 0
          ? { destinoId, tipo: tipoEnlace }
          : undefined,
    });
    if (!r.ok) {
      setErrores(r.errores);
      return;
    }
    setErrores([]);
    setAviso(`Registrado: ${r.entidad.nombre} (${tipo.nombre}).`);
    setNombre("");
    setValores({});
    setDestinoId("");
    setTipoEnlace("");
    fire();
  };

  return (
    <section className="hud flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Acciones
        </h2>
        <span className="font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          captura validada
        </span>
      </div>
      <p className={metaClass}>
        Cada tipo tuyo es una acción: registra con validación y enlaza en el
        mismo paso.
      </p>

      <div className="flex flex-col gap-2 lg:flex-row">
        <label htmlFor="accion-tipo" className="sr-only">
          Tipo a registrar
        </label>
        <select
          id="accion-tipo"
          value={tipoId}
          onChange={(e) => {
            setTipoId(e.target.value);
            setValores({});
            setErrores([]);
            setAviso(null);
          }}
          className={inputClass}
          style={{ minHeight: "var(--touch-target)" }}
        >
          <option value="">Registrar…</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              Registrar {t.nombre}
            </option>
          ))}
        </select>
        {tipo ? (
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={`Nombre del ${tipo.nombre.toLowerCase()}`}
            aria-label="Nombre del registro"
            className={inputClass}
            style={{ minHeight: "var(--touch-target)" }}
          />
        ) : null}
      </div>

      {tipo ? (
        <>
          <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2">
            {tipo.propiedades.map((p) => (
              <input
                key={p.clave}
                type="text"
                value={valores[p.clave] ?? ""}
                onChange={(e) =>
                  setValores((v) => ({ ...v, [p.clave]: e.target.value }))
                }
                placeholder={`${p.etiqueta} (${p.tipo})${p.requerida ? " · requerida" : ""}`}
                aria-label={p.etiqueta}
                className={inputClass}
                style={{ minHeight: "var(--touch-target)" }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2 lg:flex-row">
            <label htmlFor="accion-destino" className="sr-only">
              Enlazar a
            </label>
            <select
              id="accion-destino"
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              className={inputClass}
              style={{ minHeight: "var(--touch-target)" }}
            >
              <option value="">Sin enlace</option>
              {entidades.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} · {e.tipo}
                </option>
              ))}
            </select>
            {destinoId ? (
              <>
                <input
                  type="text"
                  list="accion-tipos-relacion"
                  value={tipoEnlace}
                  onChange={(e) => setTipoEnlace(e.target.value)}
                  placeholder="tipo de enlace"
                  aria-label="Tipo de enlace"
                  className={inputClass}
                  style={{ minHeight: "var(--touch-target)" }}
                />
                <datalist id="accion-tipos-relacion">
                  {tiposRelacion.map((tr) => (
                    <option key={tr.id} value={tr.nombre} />
                  ))}
                </datalist>
              </>
            ) : null}
            <button
              type="button"
              onClick={ejecutar}
              disabled={nombre.trim().length === 0}
              className={cn(
                "hud-btn shrink-0 px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em]",
                nombre.trim().length > 0
                  ? "bg-coral text-void"
                  : "border border-structural text-frame-3",
              )}
              style={{ minHeight: "var(--touch-target)" }}
            >
              Registrar
            </button>
          </div>
        </>
      ) : null}

      {errores.map((e) => (
        <p key={e} className="font-mono text-micro tracking-[0.12em] text-coral-text">
          {e}
        </p>
      ))}
      {aviso ? (
        <p className="font-mono text-micro tracking-[0.12em] text-frame-2">
          {aviso}
        </p>
      ) : null}
    </section>
  );
}
