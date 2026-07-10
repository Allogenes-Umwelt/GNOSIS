/**
 * Shared HTTP helper for connectors — server-side only. One timeout,
 * one error voice (what failed + why + what to do), JSON in/out.
 */

const TIMEOUT_MS = 10_000;

/** Community etiquette: open services (Wikimedia, Overpass, OSM) demand
 * an identifying User-Agent and 403 anonymous clients. One default here
 * keeps every connector compliant; callers can override it. */
const UA = "UMWELT-prototipo/0.1 (operador unico; contacto en repositorio)";

export async function getJson(
  url: string,
  headers: Record<string, string> = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "El servicio no respondió a tiempo. Reintenta en unos minutos.",
    );
  }
  if (!res.ok) {
    throw new Error(
      `El servicio respondió ${res.status}. Verifica los parámetros y reintenta.`,
    );
  }
  try {
    return await res.json();
  } catch {
    throw new Error("El servicio devolvió una respuesta ilegible.");
  }
}

/** Parses a required numeric parameter or fails with the operator's voice. */
export function numeroRequerido(
  parametros: Record<string, string>,
  nombre: string,
): number {
  const n = Number.parseFloat(parametros[nombre] ?? "");
  if (!Number.isFinite(n)) {
    throw new Error(
      `Falta el parámetro numérico "${nombre}". Indícalo y reintenta.`,
    );
  }
  return n;
}

/**
 * Text fetch for open datasets (SAT publishes CSV in Windows-1252).
 * Same timeout and error voice as getJson.
 */
export async function getTexto(
  url: string,
  charset = "windows-1252",
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS * 3),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "El servicio no respondió a tiempo. Reintenta en unos minutos.",
    );
  }
  if (!res.ok) {
    throw new Error(
      `El servicio respondió ${res.status}. Verifica los parámetros y reintenta.`,
    );
  }
  const crudo = await res.arrayBuffer();
  return new TextDecoder(charset).decode(crudo);
}
