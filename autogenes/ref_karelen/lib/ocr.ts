/**
 * OCR router — the "best of all worlds" seam. Two routes into text:
 * - local: tesseract.js, fully on-device (worker/core/lang self-hosted;
 *   nothing leaves the phone). Good for clean screenshots.
 * - vision: the active SYNESIS model transcribes (handled by the
 *   /api/autogenes transcripcion mode) — better on dirty/handwritten
 *   layouts, requires explicit operator opt-in because the image leaves
 *   the device.
 * Both produce fragmentos; the A1 extractor is route-agnostic.
 */

export type RutaOcr = "local" | "vision";

/** On-device OCR (spa+eng). Reports progress 0..1. */
export async function ocrLocal(
  imagen: Blob,
  onProgreso?: (p: number) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["spa", "eng"], 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    langPath: "/tesseract/lang",
    gzip: true,
    logger: (m) => {
      if (m.status === "recognizing text" && onProgreso) {
        onProgreso(m.progress);
      }
    },
  });
  try {
    const { data } = await worker.recognize(imagen);
    return data.text.replace(/\s+\n/g, "\n").trim();
  } finally {
    await worker.terminate();
  }
}
