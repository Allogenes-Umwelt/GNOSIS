import { parsearFechaEs } from "@/lib/fechas";
import type { Entidad, TipoOperador, TipoRelacion } from "@/types/autogenes";

/**
 * D2 — property validation for operator types. Pure: given a type
 * definition and raw values, returns the sanitized record (declared
 * keys only, trimmed) or operator-words errors. Numbers accept
 * currency-style input; dates accept everything parsearFechaEs does
 * and normalize to ISO.
 */

export interface VeredictoTipado {
  ok: boolean;
  propiedades: Record<string, string>;
  errores: string[];
}

export function validarPropiedades(
  tipo: TipoOperador,
  crudas: Record<string, string>,
): VeredictoTipado {
  const propiedades: Record<string, string> = {};
  const errores: string[] = [];

  for (const def of tipo.propiedades) {
    const valor = (crudas[def.clave] ?? "").trim();
    if (valor.length === 0) {
      if (def.requerida) errores.push(`Falta ${def.etiqueta}.`);
      continue;
    }
    if (def.tipo === "numero") {
      const n = Number(valor.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n)) {
        errores.push(`${def.etiqueta} debe ser un número.`);
        continue;
      }
      propiedades[def.clave] = String(n);
    } else if (def.tipo === "fecha") {
      const f = parsearFechaEs(valor);
      if (!f) {
        errores.push(
          `${def.etiqueta} debe ser una fecha legible (ej. 12/08/2026).`,
        );
        continue;
      }
      propiedades[def.clave] = f.fecha;
    } else {
      propiedades[def.clave] = valor.slice(0, 200);
    }
  }
  // Undeclared keys are dropped silently — the type IS the contract.
  return { ok: errores.length === 0, propiedades, errores };
}

/** Kebab key derived from an operator-written label. */
export function claveDeEtiqueta(etiqueta: string): string {
  return etiqueta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * D2b — relation-endpoint validation against the operator catalog.
 * Case-insensitive lookup by name; a relation whose tipo is not in the
 * catalog is free-form and always passes (the catalog governs declared
 * types, it does not forbid new language). Returns null when valid, or
 * an operator-words error.
 */
export function tipoRelacionDe(
  catalogo: TipoRelacion[],
  nombreTipo: string,
): TipoRelacion | null {
  const clave = nombreTipo.trim().toLowerCase();
  return catalogo.find((t) => t.nombre.trim().toLowerCase() === clave) ?? null;
}

export function validarExtremosRelacion(
  tipo: TipoRelacion,
  desde: Pick<Entidad, "nombre" | "tipo">,
  hasta: Pick<Entidad, "nombre" | "tipo">,
): string | null {
  if (desde.tipo !== tipo.desde) {
    return `«${tipo.nombre}» sale de ${tipo.desde}, y «${desde.nombre}» es ${desde.tipo}.`;
  }
  if (hasta.tipo !== tipo.hasta) {
    return `«${tipo.nombre}» llega a ${tipo.hasta}, y «${hasta.nombre}» es ${hasta.tipo}.`;
  }
  return null;
}
