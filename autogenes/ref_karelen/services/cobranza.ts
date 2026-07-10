import { parsearMetadataSat, type MetadataCfdi } from "@/lib/cfdi/metadata";
import { parsearCfdi } from "@/lib/cfdi/parse";
import type { ComprobanteCfdi } from "@/lib/cfdi/tipos";
import { leerZip } from "@/lib/zip";

/**
 * COBRANZA intake — the sole gateway that turns operator files into parsed
 * CFDI. Accepts individual .xml invoices or a .zip of them (the SAT's bulk
 * download shape), all on device. Parsing is deterministic and offline; a
 * bad file is reported per-archivo, never aborting the batch.
 */

export interface ImportadoCfdi {
  comprobante: ComprobanteCfdi;
  archivo: string;
}

export interface ErrorImport {
  archivo: string;
  error: string;
}

export interface ResultadoImport {
  comprobantes: ImportadoCfdi[];
  errores: ErrorImport[];
}

function esXml(nombre: string): boolean {
  return /\.xml$/i.test(nombre);
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : "No se pudo leer el archivo.";
}

async function leerZipCfdi(
  file: File,
  out: ResultadoImport,
): Promise<void> {
  let entradas: Map<string, Uint8Array>;
  try {
    entradas = await leerZip(await file.arrayBuffer());
  } catch (e) {
    out.errores.push({ archivo: file.name, error: mensaje(e) });
    return;
  }
  const decoder = new TextDecoder();
  let vistos = 0;
  for (const [ruta, bytes] of entradas) {
    // Skip directories and the macOS resource-fork noise ZIP tools add.
    if (ruta.endsWith("/") || ruta.startsWith("__MACOSX") || !esXml(ruta)) {
      continue;
    }
    vistos += 1;
    const etiqueta = `${file.name} › ${ruta.split("/").pop() ?? ruta}`;
    try {
      out.comprobantes.push({
        comprobante: parsearCfdi(decoder.decode(bytes)),
        archivo: etiqueta,
      });
    } catch (e) {
      out.errores.push({ archivo: etiqueta, error: mensaje(e) });
    }
  }
  if (vistos === 0) {
    out.errores.push({
      archivo: file.name,
      error: "El comprimido no contiene archivos XML.",
    });
  }
}

/** Read a batch of operator files into parsed CFDI, collecting per-file errors. */
export async function leerArchivosCfdi(
  files: File[],
): Promise<ResultadoImport> {
  const out: ResultadoImport = { comprobantes: [], errores: [] };
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      await leerZipCfdi(file, out);
    } else if (esXml(file.name)) {
      try {
        out.comprobantes.push({
          comprobante: parsearCfdi(await file.text()),
          archivo: file.name,
        });
      } catch (e) {
        out.errores.push({ archivo: file.name, error: mensaje(e) });
      }
    } else {
      out.errores.push({
        archivo: file.name,
        error: "Formato no soportado. Carga XML o ZIP de facturas.",
      });
    }
  }
  return out;
}

export interface ResultadoMetadata {
  entradas: MetadataCfdi[];
  errores: ErrorImport[];
}

function esMetadataTexto(nombre: string): boolean {
  return /\.(txt|csv)$/i.test(nombre);
}

/**
 * Read SAT Metadata files (the cancellation source) — a .txt/.csv export or
 * the .zip the "descarga masiva" ships it in. Per-file errors don't abort.
 */
export async function leerMetadataSat(
  files: File[],
): Promise<ResultadoMetadata> {
  const out: ResultadoMetadata = { entradas: [], errores: [] };
  const decoder = new TextDecoder();
  for (const file of files) {
    try {
      if (/\.zip$/i.test(file.name)) {
        const zip = await leerZip(await file.arrayBuffer());
        let vistos = 0;
        for (const [ruta, bytes] of zip) {
          if (ruta.endsWith("/") || ruta.startsWith("__MACOSX") || !esMetadataTexto(ruta)) {
            continue;
          }
          vistos += 1;
          out.entradas.push(...parsearMetadataSat(decoder.decode(bytes)));
        }
        if (vistos === 0) {
          out.errores.push({
            archivo: file.name,
            error: "El comprimido no contiene Metadata (TXT o CSV).",
          });
        }
      } else if (esMetadataTexto(file.name)) {
        out.entradas.push(...parsearMetadataSat(await file.text()));
      } else {
        out.errores.push({
          archivo: file.name,
          error: "Formato no soportado. Carga la Metadata del SAT en TXT, CSV o ZIP.",
        });
      }
    } catch (e) {
      out.errores.push({ archivo: file.name, error: mensaje(e) });
    }
  }
  return out;
}
