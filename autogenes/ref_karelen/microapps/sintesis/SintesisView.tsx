"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CasoFocoChip } from "@/components/shell/CasoFocoChip";
import Link from "next/link";
import { generarInforme } from "@/microapps/sintesis/servicio";
import { manifiestoSintesis } from "@/microapps/sintesis/manifest";
import { useAutogenesStore } from "@/store/autogenes";
import { useBurstStore } from "@/store/burst";
import { usePreferenciasStore } from "@/store/preferencias";
import { cn } from "@/lib/cn";
import { InformeSchema, type Informe } from "@/capacidades/informe";

const subscribeNoop = () => () => {};

const metaClass = "font-mono text-micro tracking-[0.12em] text-frame-3";

/**
 * SÍNTESIS — the executive report over the whole graph. The digest is
 * built on device, the model writes, the server prunes every citation
 * it can't prove, and this view resolves what survived to [fuente ·
 * pág] / [grafo · entidad]. Nothing renders without a citation.
 */
export function SintesisView() {
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const artefactos = useAutogenesStore((s) => s.artefactos);
  const fragmentos = useAutogenesStore((s) => s.fragmentos);
  const entidades = useAutogenesStore((s) => s.entidades);
  const productos = useAutogenesStore((s) => s.productos);
  const dockearProducto = useAutogenesStore((s) => s.dockearProducto);
  const fire = useBurstStore((s) => s.fire);
  const provider = usePreferenciasStore((s) => s.provider);

  const [informe, setInforme] = useState<Informe | null>(null);
  const [dockeado, setDockeado] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The unit's own shelf: docked informes, newest first (E3).
  const guardados = useMemo(
    () => (hydrated ? productos.filter((p) => p.unidad === "sintesis") : []),
    [hydrated, productos],
  );

  function dockear() {
    if (!informe || dockeado) return;
    const nombres = new Set(
      informe.secciones.flatMap((s) => s.puntos.flatMap((p) => p.entidades)),
    );
    dockearProducto({
      clase: "informe",
      titulo: informe.titulo,
      unidad: "sintesis",
      cuerpo: informe,
      entidades: entidades
        .filter((e) => nombres.has(e.nombre))
        .map((e) => e.id),
      evidencia: [
        ...new Set(
          informe.secciones.flatMap((s) =>
            s.puntos.flatMap((p) => p.evidencia),
          ),
        ),
      ],
    });
    setDockeado(true);
    fire();
  }

  const citaDe = useMemo(() => {
    const fragmentoPorId = new Map(fragmentos.map((f) => [f.id, f] as const));
    const artefactoPorId = new Map(artefactos.map((a) => [a.id, a] as const));
    return (fragmentoId: string): string | null => {
      const f = fragmentoPorId.get(fragmentoId);
      if (!f) return null;
      const fuente = artefactoPorId.get(f.artefactoId)?.nombre ?? "fuente";
      return `${fuente}${f.pagina ? ` · pág ${f.pagina}` : ""}`;
    };
  }, [fragmentos, artefactos]);

  const sinMaterial = hydrated && entidades.length === 0;

  async function generar() {
    setGenerando(true);
    setError(null);
    setDockeado(false);
    try {
      setInforme(await generarInforme());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "La síntesis falló. Reintenta.",
      );
    } finally {
      setGenerando(false);
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-5 py-4">
      <CasoFocoChip />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-head-sm font-bold uppercase tracking-[0.2em] text-frame-1">
          {manifiestoSintesis.nombre}
        </h1>
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
          Informe · sobre tu grafo de conocimiento
        </p>
        <p className="max-w-prose text-caption leading-relaxed text-frame-3">
          {manifiestoSintesis.descripcion}
        </p>
      </header>

      {sinMaterial ? (
        <div className="hud flex flex-col items-center gap-3 p-6 text-center">
          <p className="font-display text-small font-bold uppercase tracking-[0.3em] text-frame-1">
            Sin material aún
          </p>
          <p className="max-w-64 text-caption leading-relaxed text-frame-3">
            Síntesis redacta desde lo que ya vive en tu grafo. Carga y
            extrae tus documentos en Autogenes; luego vuelve.
          </p>
          <Link
            href="/grafo"
            className="hud-btn border border-coral px-4 py-2 font-display text-micro font-bold uppercase tracking-[0.25em] text-coral-text"
            style={{ minHeight: "var(--touch-target)" }}
          >
            Abrir Autogenes →
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void generar()}
              disabled={generando || !hydrated}
              className={cn(
                "hud-btn px-4 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em]",
                generando
                  ? "border border-structural text-frame-3"
                  : "bg-coral text-void",
              )}
              style={{ minHeight: "var(--touch-target)" }}
            >
              {generando
                ? "Sintetizando"
                : informe
                  ? "Regenerar informe"
                  : "Generar informe"}
            </button>
            <p className={metaClass}>
              vía {provider} · solo viaja el digesto de tu grafo
            </p>
          </div>

          {error ? (
            <p className="border border-structural bg-contain px-3 py-2 font-mono text-micro tracking-wide text-frame-2">
              {error}
            </p>
          ) : null}

          {generando ? (
            <div className="hud hud-live p-3">
              <p className="font-mono text-micro uppercase tracking-[0.25em] text-coral-text">
                Sintetizando tu Umwelt…
              </p>
            </div>
          ) : null}

          {informe && !generando ? (
            informe.secciones.length === 0 ? (
              <p className={metaClass}>
                El grafo aún no da para un informe. Extrae más fuentes en
                Autogenes.
              </p>
            ) : (
              <article className="hud flex flex-col gap-4 p-3">
                <h2 className="font-display text-sub-head font-bold uppercase tracking-[0.2em] text-coral-text">
                  {informe.titulo}
                </h2>
                {informe.secciones.map((s) => (
                  <div key={s.encabezado} className="flex flex-col gap-2">
                    <h3 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
                      {s.encabezado}
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {s.puntos.map((p) => {
                        const citas = [
                          ...p.evidencia
                            .map(citaDe)
                            .filter((c): c is string => c !== null),
                          ...p.entidades.map((n) => `grafo · ${n}`),
                        ];
                        return (
                          <li
                            key={p.texto}
                            className="border-l border-structural pl-3"
                          >
                            <p className="text-caption leading-relaxed text-frame-1">
                              {p.texto}
                            </p>
                            {citas.length > 0 ? (
                              <p className={metaClass}>
                                [{citas.join("] [")}]
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-structural pt-2">
                  <p className={metaClass}>
                    Generado desde tu grafo. Cada afirmación cita su fuente;
                    lo no citado no se muestra.
                  </p>
                  <button
                    type="button"
                    onClick={dockear}
                    disabled={dockeado}
                    className={cn(
                      "hud-btn shrink-0 px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.2em]",
                      dockeado
                        ? "border border-structural text-frame-3"
                        : "border border-coral text-coral-text",
                    )}
                    style={{ minHeight: "var(--touch-target)" }}
                  >
                    {dockeado ? "En el grafo" : "Dockear informe"}
                  </button>
                </div>
              </article>
            )
          ) : null}

          {/* Docked informes — products living in the ontology (E3) */}
          {guardados.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-micro font-bold uppercase tracking-[0.35em] text-frame-2">
                Informes dockeados{" "}
                <span className="tnum text-coral-text">{guardados.length}</span>
              </h2>
              <ul className="flex flex-col gap-1.5">
                {guardados.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const parsed = InformeSchema.safeParse(p.cuerpo);
                        if (parsed.success) {
                          setInforme(parsed.data);
                          setDockeado(true);
                        }
                      }}
                      className="flex w-full items-center justify-between gap-3 border border-structural bg-contain px-3 py-2 text-left"
                      style={{ minHeight: "var(--touch-target)" }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-display text-micro font-bold uppercase tracking-[0.2em] text-frame-1">
                          {p.titulo}
                        </span>
                        <span className={`mt-0.5 block tnum ${metaClass}`}>
                          {new Date(p.createdAt).toLocaleDateString("es-MX")} ·{" "}
                          {p.evidencia.length}{" "}
                          {p.evidencia.length === 1 ? "cita" : "citas"}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
                        Abrir →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
