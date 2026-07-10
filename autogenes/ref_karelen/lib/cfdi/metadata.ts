/**
 * SAT Metadata reader — the operator's "descarga masiva" Metadata file
 * (TXT/CSV) is the ONLY authoritative source of cancellation status, which
 * never lives in the CFDI XML itself. Pure and on device: it maps each UUID
 * to vigente/cancelado so COBRANZA can drop cancelled invoices from income.
 * Delimiter is sniffed (~, ; or ,) and columns are matched by header name,
 * so both the masiva TXT and the portal CSV parse.
 */

export interface MetadataCfdi {
  uuid: string;
  estatus: "vigente" | "cancelado";
  fechaCancelacion?: string; // YYYY-MM-DD
}

const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function delimitador(encabezado: string): string {
  if (encabezado.includes("~")) return "~";
  if (encabezado.includes(";")) return ";";
  return ",";
}

function columna(cols: string[], ...nombres: string[]): number {
  const norm = cols.map(normalizar);
  for (const n of nombres) {
    const i = norm.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

export function parsearMetadataSat(texto: string): MetadataCfdi[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length < 2) {
    throw new Error("La Metadata del SAT viene vacía o sin encabezado.");
  }
  const delim = delimitador(lineas[0]);
  const cols = lineas[0].split(delim);
  const iUuid = columna(cols, "uuid", "folio fiscal", "foliofiscal");
  const iEstatus = columna(
    cols,
    "estatus",
    "estatuscancelacion",
    "estado",
    "estado comprobante",
  );
  const iFecha = columna(
    cols,
    "fechacancelacion",
    "fecha cancelacion",
    "fecha proceso de cancelacion",
  );
  if (iUuid < 0) {
    throw new Error("La Metadata del SAT no tiene columna Uuid. Revisa el archivo.");
  }

  const out: MetadataCfdi[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const campos = lineas[i].split(delim);
    const uuid = (campos[iUuid] ?? "").trim().toUpperCase();
    if (!UUID_RE.test(uuid)) continue;
    const crudo = iEstatus >= 0 ? normalizar(campos[iEstatus] ?? "") : "";
    // SAT masiva: "1" vigente / "0" cancelado; portal: "Vigente"/"Cancelado".
    const cancelado = /cancel|no vigente/.test(crudo) || crudo === "0";
    const fecha = iFecha >= 0 ? (campos[iFecha] ?? "").trim().slice(0, 10) : "";
    out.push({
      uuid,
      estatus: cancelado ? "cancelado" : "vigente",
      fechaCancelacion:
        cancelado && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined,
    });
  }
  return out;
}
