import { getConector } from "@/conectores/registry";
import { consultarConector } from "@/services/conectores";
import { usePreferenciasStore } from "@/store/preferencias";
import { useQualiaStore } from "@/store/qualia";
import { useRutinasStore, type Rutina } from "@/store/rutinas";

/**
 * A0 runner — executes due routines when the app wakes. Sequential and
 * bounded (shared-service etiquette); each result lands in the QUALIA
 * connector sources as clean {etiqueta, valor} rows via the connector's
 * own presentador (metric title = series label, so the FUENTES spoke
 * accumulates real series). Failures are recorded on the routine and
 * shown in its panel — never silent, never retried in a loop.
 */

function vencida(r: Rutina, ahora: number): boolean {
  if (!r.activa) return false;
  if (r.ultimaEjecucion === null) return true;
  return ahora - r.ultimaEjecucion >= r.frecuenciaHoras * 3_600_000;
}

/** Map a connector result to source rows through its presentador. */
function filasDe(
  conectorId: string,
  consulta: string,
  datos: unknown,
  obtenido: string,
): { etiqueta: string; valor: string }[] {
  const conector = getConector(conectorId);
  const vistas =
    conector?.presentar?.(datos, {
      conector: conectorId,
      consulta,
      obtenido,
    }) ?? [];
  const filas: { etiqueta: string; valor: string }[] = [];
  for (const v of vistas) {
    if (v.funcion === "metrica") {
      filas.push({ etiqueta: v.titulo, valor: String(v.valor) });
    }
    if (v.funcion === "comparacion") {
      for (const par of v.pares.slice(0, 6)) {
        filas.push({
          etiqueta: `${v.titulo} · ${par.etiqueta}`,
          valor: String(par.valor),
        });
      }
    }
  }
  return filas;
}

/** Operator-initiated routine creation — the units' door to A0. */
export function crearRutina(r: {
  conector: string;
  consulta: string;
  parametros: Record<string, string>;
  frecuenciaHoras: number;
}): boolean {
  return useRutinasStore.getState().crear(r) !== null;
}

export async function ejecutarRutinasPendientes(): Promise<{
  ejecutadas: number;
  errores: number;
}> {
  const ahora = Date.now();
  const pendientes = useRutinasStore
    .getState()
    .rutinas.filter((r) => vencida(r, ahora));
  let ejecutadas = 0;
  let errores = 0;
  for (const r of pendientes) {
    // Mark the attempt FIRST so a failing service is not hammered on
    // every app open within the same window.
    useRutinasStore.getState().marcarEjecucion(r.id, ahora, null);
    try {
      const token =
        usePreferenciasStore.getState().clavesServicio[r.conector];
      const res = await consultarConector(
        r.conector,
        r.consulta,
        r.parametros,
        token,
      );
      const filas = filasDe(r.conector, r.consulta, res.datos, res.obtenido);
      if (filas.length > 0) {
        useQualiaStore.getState().agregarLote(filas, "conector");
      }
      ejecutadas += 1;
    } catch (e) {
      errores += 1;
      useRutinasStore
        .getState()
        .marcarEjecucion(
          r.id,
          ahora,
          e instanceof Error ? e.message : "La consulta falló.",
        );
    }
  }
  return { ejecutadas, errores };
}
