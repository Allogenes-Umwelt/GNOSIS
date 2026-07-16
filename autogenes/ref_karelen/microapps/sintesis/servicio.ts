import { alcanceDeCaso } from "@/capacidades/casos";
import { construirDigesto, InformeSchema, type Informe } from "@/capacidades/informe";
import { useCasoFocoStore } from "@/store/casoFoco";
import { useAutogenesStore } from "@/store/autogenes";
import { usePreferenciasStore } from "@/store/preferencias";
import { z } from "zod";

/**
 * SÍNTESIS client — builds the digest from the graph ON device and
 * asks the microapp's own route for the report. The server already
 * sanitized citations against what was sent; the client still parses
 * the wire shape before trusting it.
 */

const RespuestaSchema = z.object({ informe: InformeSchema });

export async function generarInforme(): Promise<Informe> {
  const { artefactos, fragmentos, entidades, relaciones, eventos, casos } =
    useAutogenesStore.getState();
  // L·5 — case scope: with a case in focus the digest reads only its
  // sub-graph, so the report speaks about the investigation at hand.
  const caso = casos.find(
    (c) => c.id === useCasoFocoStore.getState().casoActivoId,
  );
  const alcance = caso
    ? alcanceDeCaso(caso, { fragmentos, entidades, eventos })
    : null;
  const digesto = alcance
    ? construirDigesto(
        artefactos.filter((a) => alcance.artefactoIds.has(a.id)),
        fragmentos.filter((fr) => alcance.fragmentoIds.has(fr.id)),
        entidades.filter((e) => alcance.entidadIds.has(e.id)),
        relaciones.filter(
          (r) =>
            alcance.entidadIds.has(r.desdeId) &&
            alcance.entidadIds.has(r.hastaId),
        ),
        eventos.filter((ev) => alcance.eventoIds.has(ev.id)),
      )
    : construirDigesto(artefactos, fragmentos, entidades, relaciones, eventos);
  const { provider, claves } = usePreferenciasStore.getState();
  const res = await fetch("/api/u/sintesis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      clave: claves[provider] || undefined,
      digesto,
    }),
  });
  const json: unknown = await res.json();
  if (!res.ok) {
    const err =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : "La síntesis falló. Reintenta.";
    throw new Error(err);
  }
  return RespuestaSchema.parse(json).informe;
}
