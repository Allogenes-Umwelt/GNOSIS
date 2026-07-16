import type { ResumenRed } from "@/capacidades/signature";

/**
 * Deterministic reading of the network — every line is a fact the engine
 * computed and can defend, phrased in Spanish for the operator. This is
 * the honest S1 floor: no model, no invention. The SYNESIS narrative
 * layer docks on top later, bound by the same law (interpreta lo que el
 * motor ya verificó; todo citado).
 */

function densidadTexto(d: number): string {
  if (d < 0.08) return "dispersa";
  if (d < 0.25) return "moderada";
  return "densa";
}

export function construirLectura(
  resumen: ResumenRed,
  nRegistros: number,
): string[] {
  const lineas: string[] = [];
  if (resumen.nNodos === 0) return lineas;

  lineas.push(
    `${resumen.nNodos} conceptos y ${resumen.nEnlaces} vínculos, ` +
      `en ${resumen.nComunidades} ${resumen.nComunidades === 1 ? "comunidad" : "comunidades"}.`,
  );

  const hub = resumen.hubs[0];
  if (hub) {
    lineas.push(
      `El concentrador principal es «${hub.etiqueta}» (grado ${hub.grado}): ` +
        "el concepto que más ata al resto.",
    );
  }

  lineas.push(
    `Estructura ${densidadTexto(resumen.densidad)} ` +
      `(densidad ${(resumen.densidad * 100).toFixed(0)} por ciento).`,
  );

  if (resumen.exponente !== null && resumen.nNodos >= 12) {
    const s = resumen.exponente;
    lineas.push(
      s >= 0.8
        ? `La conectividad sigue ley de potencias (exponente ${s.toFixed(2)}): pocos conceptos concentran la estructura.`
        : `Conectividad repartida (exponente ${s.toFixed(2)}): ningún concepto domina la red.`,
    );
  }

  if (resumen.puentes.length > 0) {
    const nombres = resumen.puentes.map((p) => `«${p.etiqueta}»`).join(", ");
    lineas.push(
      `${resumen.puentes.length === 1 ? "Puente crítico" : "Puentes críticos"}: ${nombres} — si ${resumen.puentes.length === 1 ? "cae" : "caen"}, la red se parte.`,
    );
  }

  if (resumen.nComponentes > 1) {
    lineas.push(
      `${resumen.nComponentes} islas sin puente entre sí: material que aún no conversa.`,
    );
  }

  lineas.push(
    `Derivado de ${nRegistros} ${nRegistros === 1 ? "registro" : "registros"} de tus fuentes.`,
  );
  return lineas;
}
