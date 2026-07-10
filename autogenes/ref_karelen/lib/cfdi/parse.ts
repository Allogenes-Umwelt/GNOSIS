import type {
  ComprobanteCfdi,
  Concepto,
  DoctoPagado,
  ImpuestoLinea,
  Pago,
  TipoCfdi,
} from "@/lib/cfdi/tipos";
import { TIPOS_CFDI } from "@/lib/cfdi/tipos";

/**
 * CFDI 4.0 / 3.3 parser — pure, deterministic, namespace-agnostic. Works
 * off the well-formed XML the SAT emits using regex only (no DOMParser, so
 * it runs on device and in Node tests). Extracts the full financial shape:
 * header, parties, concepts, comprobante-level taxes, timbre, and payment
 * complements. Throws with operator words on a non-CFDI or incomplete XML.
 */

interface Elemento {
  attrs: string;
  inner: string;
}

/** Every occurrence of an element (any namespace prefix), self-closing or paired. */
function elementos(xml: string, nombre: string): Elemento[] {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${nombre}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>)`,
    "gi",
  );
  const out: Elemento[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push({ attrs: m[1], inner: m[2] ?? "" });
  return out;
}

/**
 * Resolve the XML entities the SAT escapes inside attribute values
 * (company names carry `&amp;`, descriptions carry `&quot;`). `&amp;` is
 * replaced LAST so a doubly-escaped sequence decodes only one level.
 */
function decodificar(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/**
 * One attribute value, entity-decoded. An XML attribute is always stored
 * escaped, so the decoded string IS its real value — numbers and codes carry
 * no entities, so decoding them is a harmless no-op.
 */
function attr(attrs: string, nombre: string): string | undefined {
  const m = new RegExp(`\\b${nombre}="([^"]*)"`, "i").exec(attrs);
  return m ? decodificar(m[1]) : undefined;
}

function num(s: string | undefined, fallback = 0): number {
  if (s === undefined || s.trim() === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}
function numOpt(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function txt(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t && t.length > 0 ? t : undefined;
}

function lineasImpuesto(bloque: string, elemento: string): ImpuestoLinea[] {
  return elementos(bloque, elemento).map((l) => ({
    impuesto: attr(l.attrs, "Impuesto") ?? "",
    tipoFactor: txt(attr(l.attrs, "TipoFactor")),
    tasaOCuota: numOpt(attr(l.attrs, "TasaOCuota")),
    base: numOpt(attr(l.attrs, "Base")),
    importe: num(attr(l.attrs, "Importe")),
  }));
}

export function parsearCfdi(xml: string): ComprobanteCfdi {
  const comp = elementos(xml, "Comprobante")[0];
  if (!comp) {
    throw new Error("El XML no es un CFDI: no se encontró el Comprobante.");
  }
  const A = comp.attrs;

  const fecha = attr(A, "Fecha");
  const total = attr(A, "Total");
  const emisorEl = elementos(xml, "Emisor")[0];
  const receptorEl = elementos(xml, "Receptor")[0];
  const emisorRfc = emisorEl && attr(emisorEl.attrs, "Rfc");
  const receptorRfc = receptorEl && attr(receptorEl.attrs, "Rfc");
  if (!fecha || !total || !emisorRfc || !receptorRfc) {
    throw new Error(
      "El XML no es un CFDI completo: faltan fecha, total o RFC. Revisa el archivo.",
    );
  }
  const fechaDia = fecha.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaDia)) {
    throw new Error("La fecha del CFDI no es legible. Revisa el archivo.");
  }

  const tipoRaw = (attr(A, "TipoDeComprobante") ?? "I").toUpperCase();
  const tipo: TipoCfdi = (TIPOS_CFDI as readonly string[]).includes(tipoRaw)
    ? (tipoRaw as TipoCfdi)
    : "I";
  const metodo = attr(A, "MetodoPago");

  const conceptos: Concepto[] = elementos(xml, "Concepto").map((c) => ({
    claveProdServ: txt(attr(c.attrs, "ClaveProdServ")),
    descripcion: (attr(c.attrs, "Descripcion") ?? "").trim(),
    cantidad: num(attr(c.attrs, "Cantidad")),
    valorUnitario: num(attr(c.attrs, "ValorUnitario")),
    importe: num(attr(c.attrs, "Importe")),
    descuento: num(attr(c.attrs, "Descuento")),
  }));

  // Comprobante-level Impuestos = the one carrying the Total* attributes
  // (Concepto-level blocks never do). Fall back to the block after the last
  // Concepto, honoring CFDI element ordering.
  const bloquesImp = elementos(xml, "Impuestos");
  const impComprobante =
    bloquesImp.find((b) => /TotalImpuestos/i.test(b.attrs)) ??
    (conceptos.length > 0
      ? elementos(xml.slice(xml.lastIndexOf("Concepto>")), "Impuestos")[0]
      : bloquesImp[0]);
  const trasladados = impComprobante
    ? lineasImpuesto(impComprobante.inner, "Traslado")
    : [];
  const retenidos = impComprobante
    ? lineasImpuesto(impComprobante.inner, "Retencion")
    : [];
  const totalTrasladados = impComprobante
    ? num(
        attr(impComprobante.attrs, "TotalImpuestosTrasladados"),
        trasladados.reduce((a, t) => a + t.importe, 0),
      )
    : 0;
  const totalRetenidos = impComprobante
    ? num(
        attr(impComprobante.attrs, "TotalImpuestosRetenidos"),
        retenidos.reduce((a, t) => a + t.importe, 0),
      )
    : 0;

  const tfd = elementos(xml, "TimbreFiscalDigital")[0];
  const uuid = tfd && attr(tfd.attrs, "UUID");
  const timbre = uuid
    ? {
        uuid,
        fechaTimbrado: txt(attr(tfd.attrs, "FechaTimbrado")),
        noCertificadoSat: txt(attr(tfd.attrs, "NoCertificadoSAT")),
      }
    : null;

  const pagos: Pago[] = elementos(xml, "Pago").map((p) => {
    const relacionados: DoctoPagado[] = elementos(
      p.inner,
      "DoctoRelacionado",
    ).flatMap((d) => {
      const id = attr(d.attrs, "IdDocumento");
      if (!id) return [];
      return [
        {
          uuid: id,
          parcialidad: numOpt(attr(d.attrs, "NumParcialidad")),
          saldoAnterior: numOpt(attr(d.attrs, "ImpSaldoAnt")),
          pagado: num(attr(d.attrs, "ImpPagado")),
          saldoInsoluto: numOpt(attr(d.attrs, "ImpSaldoInsoluto")),
        },
      ];
    });
    return {
      fecha: (attr(p.attrs, "FechaPago") ?? "").slice(0, 10),
      moneda: attr(p.attrs, "MonedaP") ?? "MXN",
      tipoCambio: num(attr(p.attrs, "TipoCambioP"), 1),
      monto: num(attr(p.attrs, "Monto")),
      relacionados,
    };
  });

  return {
    version: attr(A, "Version") ?? "4.0",
    tipo,
    serie: txt(attr(A, "Serie")),
    folio: txt(attr(A, "Folio")),
    fecha,
    fechaDia,
    formaPago: txt(attr(A, "FormaPago")),
    metodoPago: metodo === "PUE" || metodo === "PPD" ? metodo : null,
    moneda: attr(A, "Moneda") ?? "MXN",
    tipoCambio: num(attr(A, "TipoCambio"), 1),
    subTotal: num(attr(A, "SubTotal")),
    descuento: num(attr(A, "Descuento")),
    total: num(total),
    lugarExpedicion: txt(attr(A, "LugarExpedicion")),
    emisor: {
      rfc: emisorRfc,
      nombre: (attr(emisorEl.attrs, "Nombre") ?? emisorRfc).trim(),
      regimenFiscal: txt(attr(emisorEl.attrs, "RegimenFiscal")),
    },
    receptor: {
      rfc: receptorRfc,
      nombre: (attr(receptorEl.attrs, "Nombre") ?? receptorRfc).trim(),
      usoCfdi: txt(attr(receptorEl.attrs, "UsoCFDI")),
      regimenFiscal: txt(attr(receptorEl.attrs, "RegimenFiscalReceptor")),
    },
    conceptos,
    impuestos: { trasladados, retenidos, totalTrasladados, totalRetenidos },
    timbre,
    pagos,
  };
}
