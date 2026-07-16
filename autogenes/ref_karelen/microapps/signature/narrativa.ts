import { z } from "zod";
import type { ResumenRed } from "@/capacidades/signature";

/**
 * QUALIA's SYNESIS narrative — the model INTERPRETS the network's verified
 * structure; it never computes it. The deterministic engine hands over
 * metrics and the top concentrators (each with an exact `clave`); the model
 * may only cite a concepto by its exact clave, and sanearNarrativa drops any
 * reading citing a clave we did not send. So a fabricated concept or figure
 * cannot survive. Same law as COBRANZA's dictamen.
 */

export const LecturaNarrativaSchema = z.object({
  /** Exact clave of a concepto or a metric from the digest. */
  concepto: z.string().min(1),
  lectura: z.string().min(1).max(280),
});
export type LecturaNarrativa = z.infer<typeof LecturaNarrativaSchema>;

export const NarrativaSchema = z.object({
  panorama: z.string().min(1).max(600),
  lecturas: z.array(LecturaNarrativaSchema).max(8),
  observaciones: z.array(z.string().min(1).max(220)).max(4),
});
export type Narrativa = z.infer<typeof NarrativaSchema>;

export interface MetricaDigesto {
  clave: string;
  etiqueta: string;
  valor: string;
}

export interface ConceptoDigesto {
  clave: string;
  etiqueta: string;
  grado: number;
}

export interface DigestoRed {
  metricas: MetricaDigesto[];
  conceptos: ConceptoDigesto[];
}

/** Build the digest from the deterministic summary. Structure only, no prose. */
export function construirDigestoRed(resumen: ResumenRed): DigestoRed {
  const metricas: MetricaDigesto[] = [
    { clave: "nodos", etiqueta: "Conceptos", valor: String(resumen.nNodos) },
    { clave: "vinculos", etiqueta: "Vínculos", valor: String(resumen.nEnlaces) },
    { clave: "comunidades", etiqueta: "Comunidades", valor: String(resumen.nComunidades) },
    { clave: "componentes", etiqueta: "Islas sin puente", valor: String(resumen.nComponentes) },
    {
      clave: "densidad",
      etiqueta: "Densidad",
      valor: `${(resumen.densidad * 100).toFixed(0)} por ciento`,
    },
    { clave: "comunidad_mayor", etiqueta: "Comunidad mayor", valor: String(resumen.comunidadMayor) },
  ];
  if (resumen.exponente !== null) {
    metricas.push({
      clave: "exponente",
      etiqueta: "Exponente de la ley de grado",
      valor: resumen.exponente.toFixed(2),
    });
  }
  if (resumen.puentes.length > 0) {
    metricas.push({
      clave: "puentes",
      etiqueta: "Puentes críticos",
      valor: resumen.puentes.map((p) => p.etiqueta).join(", "),
    });
  }
  // Hubs AND bridges are citable concepts; dedupe by id.
  const vistos = new Set<string>();
  const conceptos: ConceptoDigesto[] = [];
  for (const h of [...resumen.hubs, ...resumen.puentes]) {
    if (vistos.has(h.id)) continue;
    vistos.add(h.id);
    conceptos.push({ clave: h.id, etiqueta: h.etiqueta, grado: h.grado });
  }
  return { metricas, conceptos };
}

/**
 * The machine's unified digest (M4): the four OODA windows condensed into
 * the SAME DigestoRed contract the route already sanitizes — anomalies
 * and monoliths become citable conceptos (grado carries their 0–100
 * intensity), telemetry becomes a metric. "Leer el sistema" narrates
 * exactly this; nothing outside it can be cited.
 */
export function construirDigestoMaquina(entrada: {
  resumen: ResumenRed;
  anomalias: { clave: string; titulo: string; severidad: number }[];
  monolitos: { id: string; etiqueta: string; masa: number }[];
  nReferencias: number;
  delta: { nodos: number; enlaces: number } | null;
}): DigestoRed {
  const base = construirDigestoRed(entrada.resumen);
  const metricas = [...base.metricas];
  metricas.push({
    clave: "anomalias",
    etiqueta: "Anomalías contra la línea base",
    valor: String(entrada.anomalias.length),
  });
  if (entrada.monolitos.length > 0) {
    metricas.push({
      clave: "monolito",
      etiqueta: "Monolito principal (centralidad)",
      valor: entrada.monolitos[0].etiqueta.slice(0, 60),
    });
  }
  const signo = (n: number) => (n > 0 ? `+${n}` : String(n));
  metricas.push({
    clave: "telemetria",
    etiqueta: "Referencias de telemetría",
    valor: entrada.delta
      ? `${entrada.nReferencias} · delta ${signo(entrada.delta.nodos)} conceptos, ${signo(entrada.delta.enlaces)} vínculos`.slice(0, 60)
      : String(entrada.nReferencias),
  });

  const conceptos = [...base.conceptos];
  const vistos = new Set(conceptos.map((c) => c.clave));
  for (const m of entrada.monolitos.slice(0, 3)) {
    if (vistos.has(m.id)) continue;
    vistos.add(m.id);
    conceptos.push({
      clave: m.id,
      etiqueta: m.etiqueta,
      grado: Math.round(m.masa * 100),
    });
  }
  for (const a of entrada.anomalias.slice(0, 6)) {
    if (vistos.has(a.clave)) continue;
    vistos.add(a.clave);
    conceptos.push({
      clave: a.clave,
      etiqueta: a.titulo.slice(0, 80),
      grado: Math.round(a.severidad * 100),
    });
  }
  return { metricas: metricas.slice(0, 12), conceptos: conceptos.slice(0, 20) };
}

/** All claves the model is allowed to cite. */
export function clavesDigesto(digesto: DigestoRed): Set<string> {
  return new Set([
    ...digesto.metricas.map((m) => m.clave),
    ...digesto.conceptos.map((c) => c.clave),
  ]);
}

/** Provenance law: drop any reading citing a clave we did not send. */
export function sanearNarrativa(narrativa: Narrativa, clavesValidas: Set<string>): Narrativa {
  return {
    ...narrativa,
    lecturas: narrativa.lecturas.filter((l) => clavesValidas.has(l.concepto)),
  };
}
