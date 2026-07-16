import { PropuestaPlanSchema, type PasoPlan, type PropuestaPlan } from "@/types/plan";
import type { RedSig, ResumenRed } from "@/capacidades/signature";

/**
 * QUALIA's Decidir → Actuar step: turn what the network reveals into an
 * ADDITIVE plan the substrate can execute under the autonomy dimmer.
 * Deducción destructiva decomposed the sources into concentrators; this is
 * the inducción creativa — propose to materialize the top hubs as graph
 * entities (recordar) and their strongest co-occurrences as relations
 * (enlazar). No campo is declared, so the dimmer answers to level 3:
 * explicit operator approval. Deletes are never in the vocabulary.
 */
export function construirPropuestaPlan(
  resumen: ResumenRed,
  red: RedSig,
): PropuestaPlan | null {
  const hubs = resumen.hubs.slice(0, 6);
  if (hubs.length === 0) return null;
  const etiquetaDe = new Map(hubs.map((h) => [h.id, h.etiqueta]));
  const hubIds = new Set(hubs.map((h) => h.id));

  const recordar: PasoPlan[] = hubs.map((h) => ({
    op: "recordar",
    nombre: h.etiqueta.slice(0, 80),
    tipo: "otro",
    resumen: `Concentrador de la red Qualia, grado ${h.grado}.`.slice(0, 200),
  }));

  const enlazar: PasoPlan[] = red.enlaces
    .filter(
      (e) =>
        hubIds.has(e.origen) &&
        hubIds.has(e.destino) &&
        etiquetaDe.get(e.origen) !== etiquetaDe.get(e.destino),
    )
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 5)
    .map((e) => ({
      op: "enlazar",
      desde: (etiquetaDe.get(e.origen) ?? "").slice(0, 80),
      hasta: (etiquetaDe.get(e.destino) ?? "").slice(0, 80),
      tipo: "co-ocurre",
    }));

  const pasos = [...recordar, ...enlazar].slice(0, 12);
  const parsed = PropuestaPlanSchema.safeParse({
    objetivo:
      `Materializar ${recordar.length} concentradores de Qualia y ${enlazar.length} vínculos en el grafo.`.slice(
        0,
        200,
      ),
    pasos,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * DECIDIR's inductive hand-off (M3): one simulated link A—B, made real as
 * an ADDITIVE plan under the dimmer — recordar both concepts, enlazar
 * them once. Same closed vocabulary, same gate; deletes never exist here.
 */
export function construirPropuestaEnlace(
  red: RedSig,
  aId: string,
  bId: string,
): PropuestaPlan | null {
  const a = red.nodos.find((n) => n.id === aId);
  const b = red.nodos.find((n) => n.id === bId);
  if (!a || !b || a.id === b.id || a.etiqueta === b.etiqueta) return null;
  const pasos: PasoPlan[] = [
    ...[a, b].map((n) => ({
      op: "recordar" as const,
      nombre: n.etiqueta.slice(0, 80),
      tipo: "otro" as const,
      resumen: "Concepto de la red Qualia, unido por simulación de enlace.",
    })),
    {
      op: "enlazar" as const,
      desde: a.etiqueta.slice(0, 80),
      hasta: b.etiqueta.slice(0, 80),
      tipo: "co-ocurre",
    },
  ];
  const parsed = PropuestaPlanSchema.safeParse({
    objetivo: `Materializar el enlace simulado «${a.etiqueta}» — «${b.etiqueta}» en el grafo.`.slice(
      0,
      200,
    ),
    pasos,
  });
  return parsed.success ? parsed.data : null;
}
