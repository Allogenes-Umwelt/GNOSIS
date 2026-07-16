import { empacar, desempacar, serializarSobre, parseSobre } from "@/services/sync";
import { construirBundleActual } from "@/services/bundle";
import { useDatosStore } from "@/store/datos";
import { useCanvasStore } from "@/store/canvas";
import { useAutogenesStore } from "@/store/autogenes";

/**
 * "Tu base" gateway (F1) — the only place the app talks to the operator's
 * backup server. Everything leaves sealed (F0): the server stores opaque
 * blobs and can read nothing. Degradation is honest: a server that is down
 * throws a clear message and the PWA keeps working without it.
 */
export interface ConfigBase {
  url: string;
  token: string;
  dispositivo: string;
}

export interface VersionRemota {
  version: number;
  dispositivo: string;
  hash: string;
  bytes: number;
  creado: number;
}

export interface ResultadoRestauracion {
  datos: number;
  operaciones: number;
  grafo: number;
}

function base(config: ConfigBase): string {
  return config.url.replace(/\/+$/, "");
}

async function conAuth(
  config: ConfigBase,
  ruta: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`${base(config)}${ruta}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${config.token}`,
      },
    });
  } catch {
    throw new Error("Sin enlace con tu base. Revisa que esté encendida y la URL.");
  }
}

/** Liveness check — open endpoint, no token needed. */
export async function comprobarBase(
  config: ConfigBase,
): Promise<{ vivo: boolean; versiones: number }> {
  let res: Response;
  try {
    res = await fetch(`${base(config)}/salud`);
  } catch {
    throw new Error("Sin enlace con tu base. Revisa que esté encendida y la URL.");
  }
  if (!res.ok) throw new Error("Tu base respondió con un error. Revisa la URL.");
  const j = (await res.json()) as { estado?: string; versiones?: number };
  return { vivo: j.estado === "vivo", versiones: j.versiones ?? 0 };
}

/** Seal the current graph and push it as a new version. */
export async function respaldar(
  config: ConfigBase,
  frase: string,
): Promise<VersionRemota> {
  const sobre = await empacar(construirBundleActual(), frase);
  const res = await conAuth(config, `/sync/${encodeURIComponent(config.dispositivo)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blob: serializarSobre(sobre), hash: sobre.hash }),
  });
  if (res.status === 401) {
    throw new Error("Tu base rechazó el token. Revísalo en esta pantalla.");
  }
  if (!res.ok) throw new Error("Tu base no aceptó el respaldo. Reintenta.");
  return (await res.json()) as VersionRemota;
}

/** List stored versions (metadata only — no blobs travel here). */
export async function listarVersiones(
  config: ConfigBase,
): Promise<VersionRemota[]> {
  const res = await conAuth(config, "/sync");
  if (res.status === 401) {
    throw new Error("Tu base rechazó el token. Revísalo en esta pantalla.");
  }
  if (!res.ok) throw new Error("No se pudo leer las versiones de tu base.");
  return (await res.json()) as VersionRemota[];
}

/** Fetch a version, open it, and MERGE into the local graph (never replace). */
export async function restaurar(
  config: ConfigBase,
  version: number,
  frase: string,
): Promise<ResultadoRestauracion> {
  const res = await conAuth(config, `/sync/${version}`);
  if (res.status === 401) {
    throw new Error("Tu base rechazó el token. Revísalo en esta pantalla.");
  }
  if (res.status === 404) throw new Error("Esa versión ya no está en tu base.");
  if (!res.ok) throw new Error("No se pudo descargar esa versión.");
  const fila = (await res.json()) as { blob: string };
  const bundle = await desempacar(parseSobre(fila.blob), frase);
  return {
    datos: useDatosStore.getState().mergeDatos(bundle.datos),
    operaciones: useCanvasStore.getState().mergeOperations(bundle.operations),
    grafo: bundle.grafo
      ? useAutogenesStore.getState().mergeGrafo(bundle.grafo)
      : 0,
  };
}
