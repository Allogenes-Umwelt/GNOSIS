"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { conectores } from "@/conectores/registry";
import { consultarConector } from "@/services/conectores";
import { useQualiaStore } from "@/store/qualia";
import { entradasDeConector } from "@/microapps/signature/archivos";
import { BuscadorLugar } from "@/features/campos/BuscadorLugar";
import { SelectorDivisa } from "@/features/campos/SelectorDivisa";

const CAMPO =
  "border border-frame-3/40 bg-transparent px-3 font-mono text-caption text-frame-1 placeholder:text-frame-3";

/**
 * Connectors as a QUALIA source. The operator picks a connector and one of
 * its typed queries, fills the params, and runs it through /api/conector
 * (the only outbound door). The raw payload is projected into concept
 * batches (entradasDeConector) and written to the Conectores source — the
 * network then recombines them like any other source. Cited by connector.
 */
export function ConectoresQualia({ abierto }: { abierto: boolean }) {
  const agregarLotes = useQualiaStore((s) => s.agregarLotes);
  const [conectorId, setConectorId] = useState(conectores[0]?.manifest.id ?? "");
  const conector = conectores.find((c) => c.manifest.id === conectorId) ?? conectores[0];
  const [consultaId, setConsultaId] = useState(
    conector?.manifest.consultas[0]?.id ?? "",
  );
  const consulta = useMemo(
    () =>
      conector?.manifest.consultas.find((q) => q.id === consultaId) ??
      conector?.manifest.consultas[0],
    [conector, consultaId],
  );
  const [valores, setValores] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!conector || !consulta) return null;
  const m = conector.manifest;

  // {prefijo}latitud/{prefijo}longitud pairs get a worldwide place search;
  // a de/a pair gets a currency picker — same affordances as the campo door.
  const paresCoord = consulta.parametros
    .filter((p) => p.nombre.endsWith("latitud"))
    .map((p) => p.nombre.slice(0, p.nombre.length - "latitud".length))
    .filter((pre) => consulta.parametros.some((q) => q.nombre === `${pre}longitud`));
  const nombresCoord = new Set(
    paresCoord.flatMap((pre) => [`${pre}latitud`, `${pre}longitud`]),
  );
  const etiquetaCoord = (pre: string) =>
    pre === ""
      ? "Ubicación"
      : pre.replace(/_$/, "").replace(/^./, (c) => c.toUpperCase());
  const tieneDivisas =
    consulta.parametros.some((p) => p.nombre === "de") &&
    consulta.parametros.some((p) => p.nombre === "a");

  const cambiarConector = (id: string) => {
    setConectorId(id);
    const c = conectores.find((x) => x.manifest.id === id);
    setConsultaId(c?.manifest.consultas[0]?.id ?? "");
    setValores({});
    setAviso(null);
  };

  const correr = async () => {
    const faltan = consulta.parametros.filter(
      (p) => p.requerido && !valores[p.nombre]?.trim(),
    );
    if (faltan.length > 0) {
      setAviso(`Falta: ${faltan.map((p) => p.nombre).join(", ")}`);
      return;
    }
    setCargando(true);
    setAviso(null);
    try {
      const r = await consultarConector(m.id, consulta.id, valores);
      const n = agregarLotes(entradasDeConector(r.datos), "conector");
      setAviso(
        n > 0
          ? `${n} conceptos de ${m.nombre} añadidos a Conectores.`
          : `${m.nombre} respondió, pero sin conceptos legibles para la red.`,
      );
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "El conector no respondió.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <details open={abierto} className="hud flex flex-col gap-2 p-3">
      <summary className="cursor-pointer list-none font-mono text-micro uppercase tracking-[0.2em] text-coral-text">
        Conectores
      </summary>
      <div className="mt-1 flex flex-col gap-2">
        <label className="sr-only" htmlFor="qualia-conector">
          Conector
        </label>
        <select
          id="qualia-conector"
          value={conectorId}
          onChange={(e) => cambiarConector(e.target.value)}
          className={CAMPO}
          style={{ minHeight: "var(--touch-target)" }}
        >
          {conectores.map((c) => (
            <option key={c.manifest.id} value={c.manifest.id}>
              {c.manifest.nombre}
            </option>
          ))}
        </select>

        {m.consultas.length > 1 ? (
          <select
            value={consultaId}
            onChange={(e) => {
              setConsultaId(e.target.value);
              setValores({});
              setAviso(null);
            }}
            className={CAMPO}
            style={{ minHeight: "var(--touch-target)" }}
          >
            {m.consultas.map((q) => (
              <option key={q.id} value={q.id}>
                {q.descripcion}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-caption leading-snug text-frame-3">{consulta.descripcion}</p>
        )}

        {paresCoord.map((pre) => (
          <BuscadorLugar
            key={pre || "unico"}
            etiqueta={etiquetaCoord(pre)}
            lat={valores[`${pre}latitud`] ?? ""}
            lon={valores[`${pre}longitud`] ?? ""}
            onCoords={(la, lo) =>
              setValores((v) => ({ ...v, [`${pre}latitud`]: la, [`${pre}longitud`]: lo }))
            }
          />
        ))}

        {tieneDivisas ? (
          <SelectorDivisa
            de={valores.de ?? ""}
            a={valores.a ?? ""}
            onChange={(de, a) => setValores((v) => ({ ...v, de, a }))}
          />
        ) : null}

        {consulta.parametros
          .filter(
            (p) =>
              !nombresCoord.has(p.nombre) &&
              !(tieneDivisas && (p.nombre === "de" || p.nombre === "a")),
          )
          .map((p) => (
            <label key={p.nombre} className="flex flex-col gap-1">
              <span className="font-mono text-micro uppercase tracking-[0.15em] text-frame-3">
                {p.nombre}
                {p.requerido ? "" : " · opcional"}
              </span>
              <input
                value={valores[p.nombre] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [p.nombre]: e.target.value }))}
                placeholder={p.ejemplo}
                className={CAMPO}
                style={{ minHeight: "var(--touch-target)" }}
              />
            </label>
          ))}

        <button
          type="button"
          onClick={() => void correr()}
          disabled={cargando}
          className={cn(
            "border border-coral px-4 font-display text-micro font-bold uppercase tracking-[0.2em] text-coral-text disabled:opacity-30",
          )}
          style={{ minHeight: "var(--touch-target)" }}
        >
          {cargando ? "Consultando…" : "Consultar y añadir"}
        </button>

        {aviso ? (
          <p className="font-mono text-micro leading-relaxed tracking-[0.04em] text-coral-text">
            {aviso}
          </p>
        ) : null}
        <p className="font-mono text-micro leading-relaxed tracking-[0.04em] text-frame-3">
          Fuente abierta vía {m.acceso === "token" ? "token · " : ""}
          {m.nombre}. Todo pasa por el gateway; el resultado entra a la red como
          fuente Conectores.
        </p>
      </div>
    </details>
  );
}
