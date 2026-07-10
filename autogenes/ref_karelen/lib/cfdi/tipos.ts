import { z } from "zod";

/**
 * CFDI structured record — the full financial shape the COBRANZA engine
 * reads, richer than the D4 pipeline's citable digest. Zod is the single
 * source of truth (z.infer). Covers CFDI 4.0 and 3.3; money is parsed to
 * numbers and dates normalized to ISO. Cancellation/payment STATUS is not
 * in the XML (needs SAT metadata / complementos) and lives elsewhere.
 */

/** SAT TipoDeComprobante: Ingreso, Egreso, Traslado, Nómina, Pago. */
export const TIPOS_CFDI = ["I", "E", "T", "N", "P"] as const;
export const TipoCfdiSchema = z.enum(TIPOS_CFDI);
export type TipoCfdi = z.infer<typeof TipoCfdiSchema>;

/** MétodoPago: PUE = una exhibición (IVA a la emisión); PPD = diferido. */
export const MetodoPagoSchema = z.enum(["PUE", "PPD"]).nullable();

export const ImpuestoLineaSchema = z.object({
  /** SAT code: 002 IVA, 001 ISR, 003 IEPS. */
  impuesto: z.string(),
  /** "Tasa" | "Cuota" | "Exento". */
  tipoFactor: z.string().optional(),
  tasaOCuota: z.number().nullable(),
  base: z.number().nullable(),
  importe: z.number(),
});
export type ImpuestoLinea = z.infer<typeof ImpuestoLineaSchema>;

export const ConceptoSchema = z.object({
  claveProdServ: z.string().optional(),
  descripcion: z.string(),
  cantidad: z.number(),
  valorUnitario: z.number(),
  importe: z.number(),
  descuento: z.number(),
});
export type Concepto = z.infer<typeof ConceptoSchema>;

/** One document a payment complement settles (type P). */
export const DoctoPagadoSchema = z.object({
  /** UUID of the invoice being paid. */
  uuid: z.string(),
  parcialidad: z.number().nullable(),
  saldoAnterior: z.number().nullable(),
  pagado: z.number(),
  saldoInsoluto: z.number().nullable(),
});
export type DoctoPagado = z.infer<typeof DoctoPagadoSchema>;

export const PagoSchema = z.object({
  fecha: z.string(), // YYYY-MM-DD (FechaPago, date part)
  moneda: z.string(),
  tipoCambio: z.number(),
  monto: z.number(),
  relacionados: z.array(DoctoPagadoSchema),
});
export type Pago = z.infer<typeof PagoSchema>;

export const ComprobanteCfdiSchema = z.object({
  version: z.string(),
  tipo: TipoCfdiSchema,
  serie: z.string().optional(),
  folio: z.string().optional(),
  /** Full emission timestamp as issued (ISO-ish, no zone). */
  fecha: z.string(),
  /** Emission date, YYYY-MM-DD. */
  fechaDia: z.string(),
  formaPago: z.string().optional(),
  metodoPago: MetodoPagoSchema,
  moneda: z.string(),
  tipoCambio: z.number(),
  subTotal: z.number(),
  descuento: z.number(),
  total: z.number(),
  lugarExpedicion: z.string().optional(),
  emisor: z.object({
    rfc: z.string(),
    nombre: z.string(),
    regimenFiscal: z.string().optional(),
  }),
  receptor: z.object({
    rfc: z.string(),
    nombre: z.string(),
    usoCfdi: z.string().optional(),
    regimenFiscal: z.string().optional(),
  }),
  conceptos: z.array(ConceptoSchema),
  impuestos: z.object({
    trasladados: z.array(ImpuestoLineaSchema),
    retenidos: z.array(ImpuestoLineaSchema),
    totalTrasladados: z.number(),
    totalRetenidos: z.number(),
  }),
  timbre: z
    .object({
      uuid: z.string(),
      fechaTimbrado: z.string().optional(),
      noCertificadoSat: z.string().optional(),
    })
    .nullable(),
  /** Payment complements — only present on tipo === "P". */
  pagos: z.array(PagoSchema),
});
export type ComprobanteCfdi = z.infer<typeof ComprobanteCfdiSchema>;

/**
 * A parsed CFDI as COBRANZA stores it on device: the comprobante plus its
 * dedup key (the timbre UUID, or a composite when unstamped) and import
 * provenance. The engine derives every figure from these; nothing is
 * dual-written.
 */
export const RegistroCfdiSchema = z.object({
  clave: z.string(),
  comprobante: ComprobanteCfdiSchema,
  archivo: z.string().optional(),
  importadoEn: z.number(),
});
export type RegistroCfdi = z.infer<typeof RegistroCfdiSchema>;
