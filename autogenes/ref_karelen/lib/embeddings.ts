import type { FeatureExtractionPipeline } from "@huggingface/transformers";

/**
 * On-device text embeddings (F2a) — multilingual MiniLM, quantized. The
 * PUBLIC model weights download from HuggingFace once (declared trade-off:
 * 130 MB of static hosting was too heavy for the app's host; the browser
 * caches the download, and no operator data ever travels — inference is
 * 100% on device). The ONNX runtime wasm stays self-hosted in /ort/ and
 * runs under the same 'wasm-unsafe-eval' the CSP already grants Tesseract.
 * Single-threaded on purpose (avoids needing cross-origin isolation on a
 * phone). Dynamically imported and lazily initialized, so it costs nothing
 * until the operator turns semantic search on.
 */

const MODELO = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

type Transformers = typeof import("@huggingface/transformers");

let modulo: Promise<Transformers> | null = null;
let tuberia: Promise<FeatureExtractionPipeline> | null = null;

async function cargarModulo(): Promise<Transformers> {
  if (!modulo) {
    modulo = import("@huggingface/transformers").then((m) => {
      // Public weights from HF, cached by the browser after the first
      // download; the runtime wasm stays on our own origin.
      m.env.allowRemoteModels = true;
      m.env.allowLocalModels = false;
      m.env.useBrowserCache = true;
      const wasm = m.env.backends?.onnx?.wasm;
      if (wasm) {
        wasm.wasmPaths = "/ort/";
        wasm.numThreads = 1;
      }
      return m;
    });
  }
  return modulo;
}

async function extractor(): Promise<FeatureExtractionPipeline> {
  if (!tuberia) {
    const m = await cargarModulo();
    tuberia = m.pipeline("feature-extraction", MODELO, { dtype: "q8" });
  }
  return tuberia;
}

/** Embed one text into a normalized 384-dim vector. */
export async function embeder(texto: string): Promise<number[]> {
  const e = await extractor();
  const salida = await e(texto, { pooling: "mean", normalize: true });
  return Array.from(salida.data as Float32Array);
}

/** Embed many texts sequentially, reporting progress (phone-friendly). */
export async function embederLote(
  textos: string[],
  onProgreso?: (hechos: number, total: number) => void,
): Promise<number[][]> {
  const e = await extractor();
  const vectores: number[][] = [];
  for (let i = 0; i < textos.length; i++) {
    const salida = await e(textos[i], { pooling: "mean", normalize: true });
    vectores.push(Array.from(salida.data as Float32Array));
    onProgreso?.(i + 1, textos.length);
  }
  return vectores;
}
