import type { Renglon } from "@/lib/banco/bbva";

/**
 * Extract positioned text lines from a native-digital PDF, on device via
 * pdf.js (no OCR, no network). Text runs are grouped into visual lines by
 * their Y coordinate and ordered left-to-right — the shape a statement
 * parser reads. A scanned (image-only) PDF yields no text here.
 */
export async function extraerRenglonesPdf(file: File): Promise<Renglon[]> {
  // Legacy build ships the core-js polyfill the modern build stalls without.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const renglones: Renglon[] = [];
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

    let actual: { x: number; str: string }[] | null = null;
    let ultimaY: number | null = null;
    for (const it of items) {
      if (ultimaY === null || Math.abs(it.y - ultimaY) > 3) {
        actual = [];
        renglones.push(actual);
        ultimaY = it.y;
      }
      if (actual) actual.push({ x: it.x, str: it.str });
    }
  }
  return renglones;
}
