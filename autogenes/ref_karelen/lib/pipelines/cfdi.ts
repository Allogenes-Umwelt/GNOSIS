import { parsearCfdi } from "@/lib/cfdi/parse";
import type { Pipeline, ResultadoPipeline } from "@/types/pipeline";

/**
 * CFDI pipeline — Mexican SAT invoices (CFDI 3.3/4.0 XML). It delegates the
 * whole parse to the single rich CFDI parser (`parsearCfdi`), then projects
 * the comprobante into the substrate: one citable digest fragment, emisor
 * and receptor as organizations, and the invoice as a dated event. There is
 * no second parser — this and COBRANZA read the same source of truth.
 */

function money(n: number): string {
  return n.toFixed(2);
}

export const pipelineCfdi: Pipeline = {
  id: "cfdi",
  nombre: "CFDI (factura SAT)",
  descripcion:
    "Lee una factura CFDI del SAT: emisor y receptor al grafo, la factura como evento fechado, todo citado.",
  detecta: (nombre, contenido) =>
    /\.xml$/i.test(nombre) &&
    // Sniff the whole file: a valid CFDI can carry a large prolog/comment
    // block before <Comprobante>, and a capped window would reject it.
    /<(?:[\w-]+:)?Comprobante\b/i.test(contenido),
  procesar: (nombre, contenido): ResultadoPipeline => {
    // Throws operator-words errors on non-CFDI / incomplete XML.
    const c = parsearCfdi(contenido);

    const emisor = c.emisor.nombre;
    const receptor = c.receptor.nombre;
    const referencia = [c.serie, c.folio].filter(Boolean).join("-");
    const iva = c.impuestos.totalTrasladados;
    const ret = c.impuestos.totalRetenidos;

    const digesto = [
      `CFDI ${c.tipo}${referencia ? ` ${referencia}` : ""} · ${c.fechaDia}`,
      `Emisor: ${emisor} (RFC ${c.emisor.rfc})`,
      `Receptor: ${receptor} (RFC ${c.receptor.rfc})`,
      `Total: $${money(c.total)} ${c.moneda}${c.metodoPago ? ` · ${c.metodoPago}` : ""}`,
      iva > 0 ? `IVA trasladado: $${money(iva)}` : null,
      ret > 0 ? `Retenciones: $${money(ret)}` : null,
      c.timbre ? `UUID: ${c.timbre.uuid}` : null,
      `Archivo: ${nombre}`,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      fragmentos: [{ texto: digesto, pagina: 1 }],
      entidades: [
        {
          nombre: emisor,
          tipo: "organizacion",
          resumen: `RFC ${c.emisor.rfc}. Emisor de CFDI.`,
          fragmentos: [0],
        },
        {
          nombre: receptor,
          tipo: "organizacion",
          resumen: `RFC ${c.receptor.rfc}. Receptor de CFDI.`,
          fragmentos: [0],
        },
      ],
      eventos: [
        {
          titulo: `Factura${referencia ? ` ${referencia}` : ""} de ${emisor} por $${money(c.total)} ${c.moneda}`,
          fecha: c.fechaDia,
          precision: "dia",
          entidades: [emisor, receptor],
          fragmentos: [0],
        },
      ],
    };
  },
};
