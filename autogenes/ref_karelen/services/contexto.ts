import { z } from "zod";
import { consultarConector } from "@/services/conectores";
import { usePreferenciasStore } from "@/store/preferencias";

/**
 * Case context pack (N2) — the world's state at (place, time), pinned to
 * the operator's evidence. One tap fires a fixed, bounded set of gateway
 * consultas (historic weather, holiday, surroundings, FIX of the day)
 * and returns cited pieces; failures surface verbatim, never silently.
 * Nothing here writes — docking the pack is a separate, explicit act.
 */

export interface PiezaContexto {
  id: string;
  titulo: string;
  detalle: string;
  conector: string;
  consulta: string;
  obtenido: string;
}

export interface ContextoResultado {
  piezas: PiezaContexto[];
  errores: string[];
}

const CERCA = [
  { categoria: "hospital", etiqueta: "Hospitales" },
  { categoria: "policia", etiqueta: "Policía" },
  { categoria: "notaria", etiqueta: "Notarías" },
] as const;

const ORDEN_PIEZAS = ["clima", "feriado", "fix", "cerca-hospital", "cerca-policia", "cerca-notaria"];

const ClimaSchema = z.object({
  fecha: z.string(),
  temperatura_max: z.number(),
  temperatura_min: z.number().nullable(),
  precipitacion_mm: z.number().nullable(),
});

const FestivosSchema = z.object({
  festivos: z.array(z.object({ fecha: z.string(), nombre: z.string() })),
});

const AlrededorSchema = z.object({
  etiqueta: z.string(),
  radio_m: z.number(),
  total: z.number(),
  lugares: z.array(
    z.object({ nombre: z.string(), distancia_m: z.number() }),
  ),
});

const FixSchema = z.object({
  nota: z.string(),
  fecha: z.string(),
  valor: z.string(),
});

export async function traerContexto(entrada: {
  lat: number;
  lon: number;
  lugar: string;
  /** AAAA-MM-DD of the case's key event; null = no dated events yet. */
  fecha: string | null;
}): Promise<ContextoResultado> {
  const piezas: PiezaContexto[] = [];
  const errores: string[] = [];
  const hoy = new Date().toISOString().slice(0, 10);
  const lat = String(entrada.lat);
  const lon = String(entrada.lon);

  const tareas: Promise<void>[] = [];

  if (entrada.fecha && entrada.fecha < hoy) {
    const fecha = entrada.fecha;
    tareas.push(
      consultarConector("open-meteo", "historico", {
        latitud: lat,
        longitud: lon,
        fecha,
      })
        .then((r) => {
          const d = ClimaSchema.parse(r.datos);
          piezas.push({
            id: "clima",
            titulo: `Clima del ${d.fecha} en ${entrada.lugar}`,
            detalle: `máxima ${d.temperatura_max.toFixed(1)}°${d.temperatura_min !== null ? ` · mínima ${d.temperatura_min.toFixed(1)}°` : ""}${d.precipitacion_mm !== null ? ` · lluvia ${d.precipitacion_mm.toFixed(1)} mm` : ""}`,
            conector: "open-meteo",
            consulta: "historico",
            obtenido: r.obtenido,
          });
        })
        .catch((e: unknown) => {
          errores.push(`Clima histórico: ${e instanceof Error ? e.message : "falló"}`);
        }),
      );

    tareas.push(
      consultarConector("nager-date", "dias_festivos", {
        anio: fecha.slice(0, 4),
      })
        .then((r) => {
          const d = FestivosSchema.parse(r.datos);
          const festivo = d.festivos.find((f) => f.fecha === fecha);
          piezas.push({
            id: "feriado",
            titulo: `Calendario del ${fecha}`,
            detalle: festivo
              ? `feriado nacional: ${festivo.nombre}`
              : "no fue feriado nacional",
            conector: "nager-date",
            consulta: "dias_festivos",
            obtenido: r.obtenido,
          });
        })
        .catch((e: unknown) => {
          errores.push(`Feriados: ${e instanceof Error ? e.message : "falló"}`);
        }),
      );

    const tokenBanxico =
      usePreferenciasStore.getState().clavesServicio["banxico"];
    tareas.push(
      consultarConector(
        "banxico",
        "tipo_de_cambio_fecha",
        { fecha },
        tokenBanxico,
      )
        .then((r) => {
          const d = FixSchema.parse(r.datos);
          piezas.push({
            id: "fix",
            titulo: `FIX USD/MXN del ${d.fecha}`,
            detalle: `${d.valor} pesos por dólar`,
            conector: "banxico",
            consulta: "tipo_de_cambio_fecha",
            obtenido: r.obtenido,
          });
        })
        .catch((e: unknown) => {
          errores.push(`FIX del día: ${e instanceof Error ? e.message : "falló"}`);
        }),
      );
  }

  for (const c of CERCA) {
    tareas.push(
      consultarConector("overpass", "alrededor", {
        latitud: lat,
        longitud: lon,
        categoria: c.categoria,
        radio: "1500",
      })
        .then((r) => {
          const d = AlrededorSchema.parse(r.datos);
          const cercano = d.lugares[0];
          piezas.push({
            id: `cerca-${c.categoria}`,
            titulo: `${d.etiqueta} a ${d.radio_m} m de ${entrada.lugar}`,
            detalle:
              d.total === 0
                ? "ninguno en el radio"
                : `${d.total} en el radio${cercano ? ` · más cercano: «${cercano.nombre}» a ${cercano.distancia_m} m` : ""}`,
            conector: "overpass",
            consulta: "alrededor",
            obtenido: r.obtenido,
          });
        })
        .catch((e: unknown) => {
          errores.push(`${c.etiqueta}: ${e instanceof Error ? e.message : "falló"}`);
        }),
      );
  }

  await Promise.allSettled(tareas);
  piezas.sort(
    (a, b) => ORDEN_PIEZAS.indexOf(a.id) - ORDEN_PIEZAS.indexOf(b.id),
  );
  return { piezas, errores };
}
