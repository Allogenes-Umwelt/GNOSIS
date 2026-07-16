"use client";

import Link from "next/link";
import { useState } from "react";
import { InformeSchema } from "@/capacidades/informe";
import { useAutogenesStore } from "@/store/autogenes";
import { cn } from "@/lib/cn";

const UNIDAD_RUTA: Record<string, string> = {
  sintesis: "/u/sintesis",
  vinculos: "/u/vinculos",
  flujo: "/u/flujo",
  cuadre: "/u/cuadre",
  cobranza: "/u/cobranza",
  mandado: "/u/mandado",
  signature: "/u/signature",
};

/**
 * PRODUCTOS (E3) — the ontology's shelf of unit deliverables. Every
 * product OPENS in place (Q audit: a shelf you cannot read is not a
 * shelf): informes render their cited sections right here; other
 * classes fall back to their unit. Deleting here is final.
 */
export function ProductosPanel() {
  const productos = useAutogenesStore((s) => s.productos);
  const removeProducto = useAutogenesStore((s) => s.removeProducto);
  const [abierto, setAbierto] = useState<string | null>(null);

  if (productos.length === 0) return null;

  return (
    <div className="hud flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
          Productos
        </h2>
        <span className="tnum font-mono text-micro uppercase tracking-[0.2em] text-frame-3">
          {productos.length} en el grafo
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {productos.map((p) => {
          const informe =
            p.clase === "informe" ? InformeSchema.safeParse(p.cuerpo) : null;
          const abrible = informe?.success ?? false;
          const estaAbierto = abierto === p.id;
          return (
            <li
              key={p.id}
              className={cn(
                "flex flex-col gap-2 border border-structural bg-contain px-3 py-2",
                estaAbierto && "border-coral",
              )}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAbierto(estaAbierto ? null : p.id)}
                  disabled={!abrible}
                  className="min-w-0 flex-1 text-left"
                  style={{ minHeight: "var(--touch-target)" }}
                  aria-expanded={estaAbierto}
                  aria-label={`${estaAbierto ? "Cerrar" : "Ver"} producto ${p.titulo}`}
                >
                  <p className="truncate font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                    {p.titulo}
                  </p>
                  <p className="tnum font-mono text-micro tracking-[0.12em] text-frame-3">
                    {p.clase} · {p.unidad} ·{" "}
                    {new Date(p.createdAt).toLocaleDateString("es-MX")}
                    {abrible ? (estaAbierto ? " · cerrar" : " · ver") : ""}
                  </p>
                </button>
                {UNIDAD_RUTA[p.unidad] ? (
                  <Link
                    href={UNIDAD_RUTA[p.unidad]}
                    className="shrink-0 font-mono text-micro font-bold uppercase tracking-[0.2em] text-coral-text"
                  >
                    Abrir →
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeProducto(p.id)}
                  aria-label={`Quitar producto ${p.titulo}`}
                  className="shrink-0 border border-structural px-2.5 py-1.5 font-mono text-micro uppercase tracking-[0.15em] text-frame-3"
                >
                  Quitar
                </button>
              </div>
              {estaAbierto && informe?.success ? (
                <div className="flex flex-col gap-2 border-l border-coral pl-3">
                  {informe.data.secciones.map((sec) => (
                    <div key={sec.encabezado} className="flex flex-col gap-1">
                      <p className="font-display text-micro font-bold uppercase tracking-[0.25em] text-coral-text">
                        {sec.encabezado}
                      </p>
                      {sec.puntos.map((pt) => (
                        <p
                          key={pt.texto}
                          className="text-caption leading-relaxed text-frame-2"
                        >
                          {pt.texto}
                          {pt.evidencia.length > 0 ? (
                            <span className="font-mono text-micro text-frame-3">
                              {" "}
                              · {pt.evidencia.length}{" "}
                              {pt.evidencia.length === 1 ? "cita" : "citas"}
                            </span>
                          ) : null}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
