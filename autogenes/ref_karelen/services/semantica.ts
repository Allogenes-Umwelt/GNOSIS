import { get, set, del } from "idb-keyval";
import {
  recuperar,
  fusionarRRF,
  type DocumentoCorpus,
  type ResultadoRecuperado,
} from "@/lib/recuperacion";
import { embeder, embederLote } from "@/lib/embeddings";
import { topKcoseno, type VectorDoc } from "@/lib/coseno";

/**
 * Semantic index + hybrid retrieval (F2a). The index (docId → vector) is
 * built on demand over the whole cited corpus and persisted on device
 * (idb-keyval). Search fuses BM25 (always) with cosine (when the index
 * exists) via RRF — same ResultadoRecuperado shape as recuperar(), so the
 * omnibox and every other consumer stay unchanged. Degrades honestly: no
 * index or a failed embed → pure BM25 still answers.
 */
const CLAVE_INDICE = "umwelt-semantica-indice-v1";

type IndiceGuardado = Record<string, number[]>;

/** Embed the whole cited corpus and persist the index. Returns the count. */
export async function construirIndice(
  corpus: DocumentoCorpus[],
  onProgreso?: (hechos: number, total: number) => void,
): Promise<number> {
  const docs = corpus.filter((d) => d.texto.trim().length > 0);
  const vectores = await embederLote(
    docs.map((d) => d.texto),
    onProgreso,
  );
  const indice: IndiceGuardado = {};
  docs.forEach((d, i) => {
    indice[d.id] = vectores[i];
  });
  await set(CLAVE_INDICE, indice);
  return docs.length;
}

export async function borrarIndice(): Promise<void> {
  await del(CLAVE_INDICE);
}

async function cargarIndice(): Promise<VectorDoc[]> {
  const guardado = await get<IndiceGuardado>(CLAVE_INDICE);
  if (!guardado) return [];
  return Object.entries(guardado).map(([id, vector]) => ({ id, vector }));
}

export async function recuperarHibrido(
  consulta: string,
  corpus: DocumentoCorpus[],
  k = 8,
): Promise<ResultadoRecuperado[]> {
  const bm25 = recuperar(consulta, corpus, k * 3);

  let semantico: string[] = [];
  try {
    const indice = await cargarIndice();
    if (indice.length > 0) {
      const q = await embeder(consulta);
      semantico = topKcoseno(q, indice, k * 3).map((r) => r.id);
    }
  } catch {
    semantico = [];
  }
  if (semantico.length === 0) return bm25.slice(0, k);

  const fusion = fusionarRRF([bm25.map((r) => r.id), semantico]);
  const porId = new Map(corpus.map((d) => [d.id, d] as const));
  const extractoPorId = new Map(bm25.map((r) => [r.id, r.extracto] as const));

  const salida: ResultadoRecuperado[] = [];
  for (const { id, score } of fusion) {
    const doc = porId.get(id);
    if (!doc) continue;
    salida.push({
      ...doc,
      score,
      extracto:
        extractoPorId.get(id) ??
        (doc.texto.length > 220 ? `${doc.texto.slice(0, 220)}…` : doc.texto),
    });
    if (salida.length >= k) break;
  }
  return salida;
}
