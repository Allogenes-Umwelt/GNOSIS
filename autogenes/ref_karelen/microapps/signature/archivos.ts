import { parsearEntradas, type EntradaIngesta } from "@/microapps/signature/ingesta";

/**
 * Signature's own file ingesta — turn a dropped document into concept
 * entries, entirely on device and independent of AUTOGENES. Text/CSV/JSON
 * parse purely; PDF text is lifted with pdf.js (no OCR, no network). None
 * of this reads or writes the substrate; the caller writes the entries to
 * the operator's own datos store.
 */

/** Split delimited text into rows, honouring simple double-quoted fields. */
export function parsearCSV(texto: string): string[][] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length === 0) return [];
  const delim = detectarDelimitador(lineas[0]);
  return lineas.map((linea) => partirFila(linea, delim));
}

function detectarDelimitador(linea: string): string {
  const cuenta = (d: string) => linea.split(d).length;
  const candidatos = [",", ";", "\t"];
  return candidatos.reduce((mejor, d) => (cuenta(d) > cuenta(mejor) ? d : mejor));
}

function partirFila(linea: string, delim: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else comillas = !comillas;
    } else if (c === delim && !comillas) {
      celdas.push(actual.trim());
      actual = "";
    } else actual += c;
  }
  celdas.push(actual.trim());
  return celdas;
}

/** Header row names the concepts; each cell becomes a concept value. */
export function entradasDeCSV(filas: string[][]): EntradaIngesta[] {
  if (filas.length < 2) {
    return filas.flatMap((f) => f.filter(Boolean).map((v) => ({ etiqueta: v, valor: v })));
  }
  const cabecera = filas[0];
  const salida: EntradaIngesta[] = [];
  for (const fila of filas.slice(1)) {
    fila.forEach((celda, i) => {
      const etiqueta = (cabecera[i] ?? "").trim();
      const valor = celda.trim();
      if (etiqueta && valor) salida.push({ etiqueta, valor });
    });
  }
  return salida;
}

/** Flatten a JSON object one level deep into key/value concepts. */
export function entradasDeJSON(texto: string): EntradaIngesta[] {
  let dato: unknown;
  try {
    dato = JSON.parse(texto);
  } catch {
    return [];
  }
  const salida: EntradaIngesta[] = [];
  const empujar = (etiqueta: string, valor: unknown) => {
    if (valor === null || valor === undefined) return;
    if (typeof valor === "object") {
      for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        if (v !== null && typeof v !== "object")
          salida.push({ etiqueta: `${etiqueta}.${k}`, valor: String(v) });
      }
    } else {
      salida.push({ etiqueta, valor: String(valor) });
    }
  };
  if (Array.isArray(dato)) {
    dato.forEach((item, i) => empujar(`item ${i + 1}`, item));
  } else if (dato && typeof dato === "object") {
    for (const [k, v] of Object.entries(dato as Record<string, unknown>)) empujar(k, v);
  }
  return salida.filter((e) => e.etiqueta.trim().length > 0 && e.valor.trim().length > 0);
}

/**
 * Project a connector payload into per-record concept batches. Records are
 * the payload's array (or its single array field, else the object itself);
 * each record's non-numeric scalar values become concepts that co-occur in
 * that record's batch. Numbers and long strings are skipped so the network
 * is entities and categories, not raw figures. Generic on purpose — the
 * operator picks connectors/queries whose values make sense as a graph.
 */
export function entradasDeConector(datos: unknown): EntradaIngesta[][] {
  return aRegistros(datos)
    .map(registroAEntradas)
    .filter((l) => l.length > 0);
}

function aRegistros(datos: unknown): unknown[] {
  if (Array.isArray(datos)) return datos;
  if (datos && typeof datos === "object") {
    const arr = Object.values(datos as Record<string, unknown>).find((v) =>
      Array.isArray(v),
    );
    if (Array.isArray(arr)) return arr;
    return [datos];
  }
  return datos == null ? [] : [datos];
}

function registroAEntradas(rec: unknown): EntradaIngesta[] {
  const tomar = (v: unknown): EntradaIngesta[] => {
    if (v == null || typeof v === "object" || typeof v === "number") return [];
    const s = String(v).trim();
    return s.length > 0 && s.length <= 60 ? [{ etiqueta: s, valor: s }] : [];
  };
  if (rec && typeof rec === "object" && !Array.isArray(rec)) {
    return Object.values(rec as Record<string, unknown>).flatMap(tomar);
  }
  return tomar(rec);
}

/** Only lines with an explicit "label: value" — for prose-heavy sources. */
export function extraerPares(texto: string): EntradaIngesta[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /[:=]/.test(l))
    .map((l) => {
      const m = l.match(/^(.*?)\s*[:=]\s*(.*)$/);
      return m ? { etiqueta: m[1].trim(), valor: m[2].trim() } : null;
    })
    .filter(
      (e): e is EntradaIngesta =>
        e !== null && e.etiqueta.length > 0 && e.valor.length > 0,
    );
}

/** Lift plain text from a native-digital PDF (pdf.js, on device). */
async function extraerTextoPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const lineas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .flatMap((it) =>
        "str" in it && it.str.trim()
          ? [{ x: it.transform[4], y: it.transform[5], str: it.str }]
          : [],
      )
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let ultimaY: number | null = null;
    let actual = "";
    for (const it of items) {
      if (ultimaY === null || Math.abs(it.y - ultimaY) > 3) {
        if (actual.trim()) lineas.push(actual.trim());
        actual = it.str;
        ultimaY = it.y;
      } else {
        actual += ` ${it.str}`;
      }
    }
    if (actual.trim()) lineas.push(actual.trim());
  }
  return lineas.join("\n");
}

/** Dispatch a dropped file to the right local parser → concept entries. */
export async function entradasDeArchivo(file: File): Promise<EntradaIngesta[]> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".json")) return entradasDeJSON(await file.text());
  if (nombre.endsWith(".csv") || nombre.endsWith(".tsv"))
    return entradasDeCSV(parsearCSV(await file.text()));
  if (nombre.endsWith(".pdf")) return extraerPares(await extraerTextoPdf(file));
  return parsearEntradas(await file.text());
}
