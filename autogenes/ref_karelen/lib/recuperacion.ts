import { formatearFechaEs } from "@/lib/fechas";
import { normalizar } from "@/lib/similitud";
import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
} from "@/types/autogenes";
import type { Datum } from "@/types/datum";

/**
 * Retrieval engine over the Umwelt corpus — deterministic, on-device,
 * Spanish-first BM25. This is the seam SYNESIS's grounded answers and
 * the búsqueda surface stand on; a semantic (embedding) route plugs
 * into the SAME interface later, exactly like the OCR router. Every
 * result carries its citation — retrieval obeys the provenance law too.
 */

const STOPWORDS_ES = new Set([
  "a", "al", "algo", "ante", "asi", "aun", "cada", "como", "con", "cual",
  "cuando", "de", "del", "desde", "donde", "dos", "e", "el", "ella", "ellas",
  "ellos", "en", "entre", "era", "es", "esa", "ese", "eso", "esta", "este",
  "esto", "fue", "ha", "hay", "la", "las", "le", "les", "lo", "los", "mas",
  "me", "mi", "mis", "muy", "ni", "no", "nos", "o", "otra", "otro", "para",
  "pero", "por", "que", "se", "segun", "ser", "si", "sin", "sobre", "son",
  "su", "sus", "tal", "tambien", "te", "tiene", "tras", "tu", "tus", "u",
  "un", "una", "uno", "unos", "y", "ya",
]);

/** Normalize → drop stopwords → light plural stem. Pure. */
export function tokenizar(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS_ES.has(t))
    .map((t) => {
      if (t.length > 4 && t.endsWith("es")) return t.slice(0, -2);
      if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
      return t;
    });
}

export type ClaseDocumento = "fragmento" | "entidad" | "evento" | "dato";

export interface DocumentoCorpus {
  clase: ClaseDocumento;
  id: string;
  /** Searchable text (name + alias + summary for entities, etc.). */
  texto: string;
  titulo: string;
  /** Provenance shown with every hit: [fuente · pág], tipo, fecha… */
  cita: string;
}

export interface ResultadoRecuperado extends DocumentoCorpus {
  score: number;
  extracto: string;
}

/** Project the whole Umwelt into one searchable, cited corpus. */
export function construirCorpus(
  datos: Datum[],
  artefactos: Artefacto[],
  fragmentos: Fragmento[],
  entidades: Entidad[],
  eventos: Evento[],
): DocumentoCorpus[] {
  const nombreArtefacto = new Map(
    artefactos.map((a) => [a.id, a.nombre] as const),
  );
  const corpus: DocumentoCorpus[] = [];

  for (const f of fragmentos) {
    if (f.texto.trim().length === 0) continue;
    const fuente = nombreArtefacto.get(f.artefactoId) ?? "fuente";
    corpus.push({
      clase: "fragmento",
      id: f.id,
      texto: f.texto,
      titulo: fuente,
      cita: `${fuente}${f.pagina ? ` · pág ${f.pagina}` : ""}`,
    });
  }
  for (const e of entidades) {
    corpus.push({
      clase: "entidad",
      id: e.id,
      texto: [e.nombre, ...(e.alias ?? []), e.resumen ?? ""].join(". "),
      titulo: e.nombre,
      cita: `entidad · ${e.tipo} · ${e.origen}`,
    });
  }
  for (const ev of eventos) {
    corpus.push({
      clase: "evento",
      id: ev.id,
      texto: [ev.titulo, ...ev.entidades].join(". "),
      titulo: ev.titulo,
      cita: `evento · ${formatearFechaEs(ev.fecha, ev.precision)}`,
    });
  }
  for (const d of datos) {
    corpus.push({
      clase: "dato",
      id: d.id,
      texto: `${d.etiqueta}. ${d.valor}`,
      titulo: d.etiqueta,
      cita: `dato · ${d.campo}`,
    });
  }
  return corpus;
}

const K1 = 1.5;
const B = 0.75;

/** Excerpt around the first query-term hit, word-aligned. Pure. */
function extraerVentana(texto: string, terminos: Set<string>): string {
  if (texto.length <= 220) return texto;
  const palabras = texto.split(/\s+/);
  const idx = palabras.findIndex((p) => {
    const [t] = tokenizar(p);
    return t !== undefined && terminos.has(t);
  });
  if (idx === -1) return `${texto.slice(0, 220)}…`;
  const desde = Math.max(0, idx - 14);
  const hasta = Math.min(palabras.length, idx + 18);
  return `${desde > 0 ? "…" : ""}${palabras.slice(desde, hasta).join(" ")}${hasta < palabras.length ? "…" : ""}`;
}

/**
 * BM25 over the corpus. Returns the top-k documents with score,
 * citation and a query-centered excerpt. Deterministic; ties broken by
 * corpus order (stable sort).
 */
export function recuperar(
  consulta: string,
  corpus: DocumentoCorpus[],
  k = 8,
): ResultadoRecuperado[] {
  const q = [...new Set(tokenizar(consulta))];
  if (q.length === 0 || corpus.length === 0) return [];

  const docsTokens = corpus.map((d) => tokenizar(d.texto));
  const N = corpus.length;
  const avgdl =
    docsTokens.reduce((acc, t) => acc + t.length, 0) / Math.max(1, N);

  // Document frequency per query term.
  const df = new Map<string, number>();
  for (const term of q) {
    let n = 0;
    for (const tokens of docsTokens) {
      if (tokens.includes(term)) n++;
    }
    df.set(term, n);
  }

  const resultados: ResultadoRecuperado[] = [];
  for (let i = 0; i < N; i++) {
    const tokens = docsTokens[i];
    if (tokens.length === 0) continue;
    let score = 0;
    for (const term of q) {
      const n = df.get(term) ?? 0;
      if (n === 0) continue;
      const tf = tokens.filter((t) => t === term).length;
      if (tf === 0) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score +=
        (idf * tf * (K1 + 1)) /
        (tf + K1 * (1 - B + (B * tokens.length) / avgdl));
    }
    if (score > 0) {
      resultados.push({
        ...corpus[i],
        score,
        extracto: extraerVentana(corpus[i].texto, new Set(q)),
      });
    }
  }
  return resultados.sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * Reciprocal Rank Fusion of several ranked id lists into one. Deterministic
 * and rank-only (no score calibration between lanes), which is exactly why
 * it fuses BM25 and cosine cleanly: each lane votes 1/(k+rank). Ties broken
 * by first appearance. This is the C2 router (F2a) — BM25 always, semantic
 * when the index exists.
 */
export function fusionarRRF(
  listas: string[][],
  k = 60,
): { id: string; score: number }[] {
  const puntos = new Map<string, number>();
  const orden: string[] = [];
  for (const lista of listas) {
    lista.forEach((id, rango) => {
      if (!puntos.has(id)) orden.push(id);
      puntos.set(id, (puntos.get(id) ?? 0) + 1 / (k + rango + 1));
    });
  }
  return orden
    .map((id) => ({ id, score: puntos.get(id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
