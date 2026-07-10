import { normalizar } from "@/lib/similitud";
import type { Artefacto, Entidad, Fragmento } from "@/types/autogenes";
import type { Datum } from "@/types/datum";

/**
 * Cross-search over the whole Umwelt — accent-insensitive, always
 * cited. "¿Dónde aparece X?" answers with the entity layer, the
 * operator's datos, and the exact fragment passages (source + page),
 * never a bare claim.
 */

export interface HitEntidad {
  clase: "entidad";
  id: string;
  titulo: string;
  detalle: string;
}
export interface HitDato {
  clase: "dato";
  id: string;
  titulo: string;
  detalle: string;
}
export interface HitFragmento {
  clase: "fragmento";
  id: string;
  titulo: string;
  /** Excerpt around the first match. */
  detalle: string;
  cita: string;
}
export type HitBusqueda = HitEntidad | HitDato | HitFragmento;

const MAX_POR_CLASE = 6;

/**
 * Accent/case folding that PRESERVES string length, so an index found
 * in the folded text points at the same spot in the raw text.
 */
function plegar(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const d = s[i]
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    out += d.length > 0 ? d[0] : " ";
  }
  return out;
}

function extracto(texto: string, indice: number, radio = 90): string {
  const desde = Math.max(0, indice - radio);
  const hasta = Math.min(texto.length, indice + radio);
  return `${desde > 0 ? "…" : ""}${texto.slice(desde, hasta).trim()}${hasta < texto.length ? "…" : ""}`;
}

export function buscarEnUmwelt(
  consulta: string,
  fuentes: {
    datos: Datum[];
    artefactos: Artefacto[];
    fragmentos: Fragmento[];
    entidades: Entidad[];
  },
): HitBusqueda[] {
  const q = normalizar(consulta);
  if (q.length < 2) return [];

  const hits: HitBusqueda[] = [];

  let n = 0;
  for (const e of fuentes.entidades) {
    const campos = [e.nombre, e.resumen ?? "", ...(e.alias ?? [])];
    if (campos.some((c) => normalizar(c).includes(q))) {
      hits.push({
        clase: "entidad",
        id: e.id,
        titulo: e.nombre,
        detalle: `${e.tipo} · ${e.origen}${e.resumen ? ` · ${e.resumen}` : ""}`,
      });
      if (++n >= MAX_POR_CLASE) break;
    }
  }

  n = 0;
  for (const d of fuentes.datos) {
    if (normalizar(d.etiqueta).includes(q) || normalizar(d.valor).includes(q)) {
      hits.push({
        clase: "dato",
        id: d.id,
        titulo: d.etiqueta,
        detalle: d.valor.length > 120 ? `${d.valor.slice(0, 120)}…` : d.valor,
      });
      if (++n >= MAX_POR_CLASE) break;
    }
  }

  const nombreArtefacto = new Map(
    fuentes.artefactos.map((a) => [a.id, a.nombre] as const),
  );
  const qPlegada = plegar(consulta).trim();
  n = 0;
  for (const f of fuentes.fragmentos) {
    if (qPlegada.length < 2) break;
    const indice = plegar(f.texto).indexOf(qPlegada);
    if (indice === -1) continue;
    hits.push({
      clase: "fragmento",
      id: f.id,
      titulo: nombreArtefacto.get(f.artefactoId) ?? "fuente",
      detalle: extracto(f.texto, indice),
      cita: `${nombreArtefacto.get(f.artefactoId) ?? "fuente"}${f.pagina ? ` · pág ${f.pagina}` : ""}`,
    });
    if (++n >= MAX_POR_CLASE) break;
  }

  return hits;
}
