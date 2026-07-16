import { formatearFechaEs } from "@/lib/fechas";
import { normalizar } from "@/lib/similitud";
import type { Entidad, FiltroVista, TipoOperador } from "@/types/autogenes";

/**
 * VISTAS capability (D5) — the object explorer's engine. A view is a
 * QUESTION (facet filter); this module answers it live: filtered
 * entities plus deterministic derived metrics — count always, and
 * when the view is typed (D2 subtipo), sum/average of every numero
 * property and the next upcoming fecha property. No estimation, no
 * sampling: what the graph holds, aggregated.
 */

export function aplicarFiltro(
  entidades: Entidad[],
  filtro: FiltroVista,
): Entidad[] {
  const q = filtro.texto ? normalizar(filtro.texto.trim()) : "";
  return entidades.filter((e) => {
    if (filtro.tipo && e.tipo !== filtro.tipo) return false;
    if (filtro.campo && e.campo !== filtro.campo) return false;
    if (filtro.subtipo && e.subtipo !== filtro.subtipo) return false;
    if (q.length > 0) {
      const blanco = [e.nombre, ...(e.alias ?? []), e.resumen ?? ""]
        .map(normalizar)
        .join(" ");
      if (!blanco.includes(q)) return false;
    }
    return true;
  });
}

export interface MetricaVista {
  clave: string;
  etiqueta: string;
  /** Display value (numbers pre-formatted; dates in es). */
  valor: string;
  /** Raw number when the metric is presentable as an instrument. */
  numero?: number;
  unidad?: string;
}

const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2);

export function metricasDeVista(
  resultado: Entidad[],
  tipoOperador: TipoOperador | undefined,
  ahora: number,
): MetricaVista[] {
  const metricas: MetricaVista[] = [
    {
      clave: "conteo",
      etiqueta: "Entidades",
      valor: String(resultado.length),
      numero: resultado.length,
      unidad: "entidades",
    },
  ];
  if (!tipoOperador) return metricas;

  const hoy = new Date(ahora);
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  for (const def of tipoOperador.propiedades) {
    const valores = resultado
      .map((e) => e.propiedades?.[def.clave])
      .filter((v): v is string => Boolean(v));
    if (valores.length === 0) continue;

    if (def.tipo === "numero") {
      const numeros = valores.map(Number).filter(Number.isFinite);
      if (numeros.length === 0) continue;
      const suma = numeros.reduce((a, b) => a + b, 0);
      metricas.push({
        clave: `suma-${def.clave}`,
        etiqueta: `Suma de ${def.etiqueta.toLowerCase()}`,
        valor: fmt(suma),
        numero: suma,
        unidad: def.etiqueta,
      });
      metricas.push({
        clave: `prom-${def.clave}`,
        etiqueta: `Promedio de ${def.etiqueta.toLowerCase()}`,
        valor: fmt(suma / numeros.length),
        numero: suma / numeros.length,
        unidad: def.etiqueta,
      });
    } else if (def.tipo === "fecha") {
      const futuras = valores.filter((v) => v >= hoyIso).sort();
      if (futuras.length > 0) {
        metricas.push({
          clave: `prox-${def.clave}`,
          etiqueta: `Próxima ${def.etiqueta.toLowerCase()}`,
          valor: formatearFechaEs(futuras[0], "dia"),
        });
      }
    }
  }
  return metricas;
}
