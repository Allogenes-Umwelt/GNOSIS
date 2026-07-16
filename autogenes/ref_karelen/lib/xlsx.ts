/**
 * Minimal XLSX reader — zero dependencies, fully on device, deterministic.
 * An .xlsx is a ZIP of XML parts; we parse the central directory, inflate
 * the parts we need with the platform-native DecompressionStream, and read
 * cells with lightweight regex (no DOMParser — this runs in Node tests too).
 * Scope: values, shared strings, inline strings, and serial→ISO date
 * conversion for date-formatted cells. No formulas evaluation, no styling.
 * The result is plain rows, handed to the CSV table analyzer.
 */

import { leerZip } from "@/lib/zip";

export interface HojaCalculo {
  nombre: string;
  filas: string[][];
}

/* ── XML helpers (regex, UTF-8) ──────────────────────────────────── */

function texto(bytes: Uint8Array | undefined): string {
  return bytes ? new TextDecoder().decode(bytes) : "";
}

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

function atributo(tag: string, nombre: string): string | undefined {
  const m = new RegExp(`${nombre}="([^"]*)"`).exec(tag);
  return m ? m[1] : undefined;
}

/** Concatenate every <t> run inside a fragment, entity-decoded. */
function textoDeCorridas(xml: string): string {
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out += decodificar(m[1]);
  return out;
}

function leerSharedStrings(xml: string): string[] {
  const salida: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    salida.push(m[1] ? textoDeCorridas(m[1]) : "");
  }
  return salida;
}

const NUMFMT_FECHA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** styleIndex → is this cell formatted as a date/time. */
function leerFormatosFecha(xml: string): boolean[] {
  // Custom formats whose code carries date/time tokens once literals are
  // stripped (quoted text, [bracketed] modifiers).
  const numFmtEsFecha = new Map<number, boolean>();
  const reFmt = /<numFmt\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = reFmt.exec(xml)) !== null) {
    const id = Number(atributo(m[0], "numFmtId"));
    const code = (atributo(m[0], "formatCode") ?? "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/"[^"]*"/g, "");
    numFmtEsFecha.set(id, /[ymdhs]/i.test(code));
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const estilos: boolean[] = [];
  const reXf = /<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g;
  while ((m = reXf.exec(cellXfs)) !== null) {
    const id = Number(atributo(m[0], "numFmtId") ?? "0");
    estilos.push(NUMFMT_FECHA.has(id) || numFmtEsFecha.get(id) === true);
  }
  return estilos;
}

function columnaDe(ref: string): number {
  const letras = /^[A-Z]+/i.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel 1900 serial (with the 1900-02-29 bug) → "YYYY-MM-DD". */
function serialAFecha(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function leerHoja(
  xml: string,
  compartidas: string[],
  formatosFecha: boolean[],
): string[][] {
  const filas: string[][] = [];
  const reRow = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let mr: RegExpExecArray | null;
  let maxCol = 0;
  while ((mr = reRow.exec(xml)) !== null) {
    const cuerpo = mr[1] ?? "";
    const fila: string[] = [];
    const reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let mc: RegExpExecArray | null;
    while ((mc = reC.exec(cuerpo)) !== null) {
      const attrs = mc[1];
      const interior = mc[2] ?? "";
      const col = columnaDe(atributo(attrs, "r") ?? "A");
      const tipo = atributo(attrs, "t") ?? "n";
      let valor = "";
      if (tipo === "inlineStr") {
        valor = textoDeCorridas(interior);
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(interior)?.[1] ?? "";
        if (tipo === "s") {
          valor = compartidas[Number(v)] ?? "";
        } else if (tipo === "str" || tipo === "b" || tipo === "e") {
          valor = decodificar(v);
        } else {
          // number — a date-formatted cell converts its serial.
          const estilo = Number(atributo(attrs, "s") ?? "-1");
          valor =
            v !== "" && formatosFecha[estilo] === true
              ? serialAFecha(Number(v))
              : v;
        }
      }
      fila[col] = valor;
      if (col + 1 > maxCol) maxCol = col + 1;
    }
    filas.push(fila);
  }
  // Densify: fill gaps and pad every row to the widest, so the table
  // analyzer sees a rectangular grid.
  return filas.map((f) => {
    const densa: string[] = [];
    for (let i = 0; i < maxCol; i++) densa.push(f[i] ?? "");
    return densa;
  });
}

/**
 * Read every sheet of an .xlsx workbook into plain rows. Sheets keep their
 * workbook order and names; empty workbooks yield an empty list.
 */
export async function leerXlsx(buffer: ArrayBuffer): Promise<HojaCalculo[]> {
  const zip = await leerZip(buffer);
  const compartidas = leerSharedStrings(texto(zip.get("xl/sharedStrings.xml")));
  const formatosFecha = leerFormatosFecha(texto(zip.get("xl/styles.xml")));

  const workbook = texto(zip.get("xl/workbook.xml"));
  const rels = texto(zip.get("xl/_rels/workbook.xml.rels"));
  const objetivoPorId = new Map<string, string>();
  const reRel = /<Relationship\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = reRel.exec(rels)) !== null) {
    const id = atributo(m[0], "Id");
    const target = atributo(m[0], "Target");
    if (id && target) objetivoPorId.set(id, target.replace(/^\/?xl\//, ""));
  }

  const hojas: HojaCalculo[] = [];
  const reSheet = /<sheet\b[^>]*\/>/g;
  let idx = 0;
  while ((m = reSheet.exec(workbook)) !== null) {
    idx++;
    const nombre = decodificar(atributo(m[0], "name") ?? `Hoja ${idx}`);
    const rid = atributo(m[0], "r:id") ?? atributo(m[0], "id");
    const ruta = (rid && objetivoPorId.get(rid)) || `worksheets/sheet${idx}.xml`;
    const xml = texto(zip.get(`xl/${ruta}`));
    if (!xml) continue;
    hojas.push({ nombre, filas: leerHoja(xml, compartidas, formatosFecha) });
  }
  return hojas;
}
