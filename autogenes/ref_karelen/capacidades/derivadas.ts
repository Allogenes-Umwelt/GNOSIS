import type {
  Entidad,
  Relacion,
  TipoOperador,
} from "@/types/autogenes";

/**
 * Derived properties per entity (L·4) — Foundry's per-object derivation
 * at personal scale: "total pagado a X" is the sum of the numeric
 * properties of the entities related to X, grouped by relation type.
 * Zero declarations needed: every (relation tipo × typed property)
 * combination present among an entity's neighbors derives automatically.
 * Pure, deterministic, recomputed at read — never stored.
 */

export interface DerivadaEntidad {
  /** Relation type the aggregate runs over ("pagado por", "renta a"…). */
  relacion: string;
  /** Property label as the operator defined it ("Monto", "Vigencia"…). */
  propiedad: string;
  tipo: "numero" | "fecha";
  conteo: number;
  /** Sum across neighbors (numeric properties). */
  suma?: number;
  /** Next upcoming ISO date, or the latest past one (date properties). */
  fecha?: string;
  /** True when `fecha` is in the future relative to `hoy`. */
  proxima?: boolean;
}

export function derivadasDeEntidad(
  entidadId: string,
  g: {
    entidades: Entidad[];
    relaciones: Relacion[];
    tiposOperador: TipoOperador[];
  },
  /** ISO date (YYYY-MM-DD) that splits past from upcoming. */
  hoy: string,
): DerivadaEntidad[] {
  const porId = new Map(g.entidades.map((e) => [e.id, e] as const));
  const tipoPorId = new Map(g.tiposOperador.map((t) => [t.id, t] as const));

  interface Acumulado {
    relacion: string;
    propiedad: string;
    tipo: "numero" | "fecha";
    conteo: number;
    suma: number;
    fechas: string[];
  }
  const acumulados = new Map<string, Acumulado>();

  for (const r of g.relaciones) {
    const otroId =
      r.desdeId === entidadId ? r.hastaId : r.hastaId === entidadId ? r.desdeId : null;
    if (!otroId) continue;
    const vecino = porId.get(otroId);
    if (!vecino?.subtipo || !vecino.propiedades) continue;
    const def = tipoPorId.get(vecino.subtipo);
    if (!def) continue;

    for (const p of def.propiedades) {
      if (p.tipo !== "numero" && p.tipo !== "fecha") continue;
      const crudo = (vecino.propiedades[p.clave] ?? "").trim();
      if (crudo.length === 0) continue;
      const clave = `${r.tipo.toLowerCase()}|${p.clave}`;
      let acc = acumulados.get(clave);
      if (!acc) {
        acc = {
          relacion: r.tipo,
          propiedad: p.etiqueta,
          tipo: p.tipo,
          conteo: 0,
          suma: 0,
          fechas: [],
        };
        acumulados.set(clave, acc);
      }
      if (p.tipo === "numero") {
        const n = Number(crudo);
        if (!Number.isFinite(n)) continue;
        acc.conteo += 1;
        acc.suma += n;
      } else {
        acc.conteo += 1;
        acc.fechas.push(crudo);
      }
    }
  }

  const salida: DerivadaEntidad[] = [];
  for (const acc of acumulados.values()) {
    if (acc.tipo === "numero") {
      salida.push({
        relacion: acc.relacion,
        propiedad: acc.propiedad,
        tipo: "numero",
        conteo: acc.conteo,
        suma: acc.suma,
      });
    } else {
      const futuras = acc.fechas.filter((f) => f >= hoy).sort();
      const pasadas = acc.fechas.filter((f) => f < hoy).sort();
      const fecha = futuras[0] ?? pasadas[pasadas.length - 1];
      if (!fecha) continue;
      salida.push({
        relacion: acc.relacion,
        propiedad: acc.propiedad,
        tipo: "fecha",
        conteo: acc.conteo,
        fecha,
        proxima: futuras.length > 0,
      });
    }
  }
  // Deterministic order: biggest aggregates first, then alphabetically.
  return salida.sort(
    (a, b) =>
      b.conteo - a.conteo ||
      a.relacion.localeCompare(b.relacion) ||
      a.propiedad.localeCompare(b.propiedad),
  );
}
