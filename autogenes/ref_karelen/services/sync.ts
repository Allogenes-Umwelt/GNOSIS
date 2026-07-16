import { ExportBundleSchema, type ExportBundle } from "@/types/datum";
import { SobreCifradoSchema, type SobreCifrado } from "@/types/sync";
import type { Grafo } from "@/types/autogenes";
import { cifrar, descifrar, RespaldoDanadoError } from "@/lib/cifrado";

/**
 * Sync service (F0) — the encrypted-backup seam. `empacar` seals a bundle
 * into a versioned envelope; `desempacar` opens one and validates it
 * against the REAL bundle schema before returning it, so a decrypted-but-
 * malformed blob never reaches the merge. No network lives here: the
 * transport (F1) moves the sealed envelope untouched. The passphrase is
 * always an argument, never state — it exists only in the caller's memory
 * for the length of the call.
 */

/** Seal a bundle. The plaintext is the exact JSON we round-trip on restore. */
export async function empacar(
  bundle: ExportBundle,
  frase: string,
): Promise<SobreCifrado> {
  return cifrar(JSON.stringify(bundle), frase);
}

/** Open a sealed bundle and validate it against the real schema. */
export async function desempacar(
  sobre: SobreCifrado,
  frase: string,
): Promise<ExportBundle> {
  const texto = await descifrar(sobre, frase);
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new RespaldoDanadoError();
  }
  const r = ExportBundleSchema.safeParse(crudo);
  if (!r.success) {
    throw new Error("El respaldo se abrió pero no tiene el formato de UMWELT.");
  }
  return r.data;
}

/** Serialize the sealed envelope for storage/transport (F1). */
export function serializarSobre(sobre: SobreCifrado): string {
  return JSON.stringify(sobre);
}

/** Parse a stored envelope, rejecting anything that is not a valid seal. */
export function parseSobre(json: string): SobreCifrado {
  let crudo: unknown;
  try {
    crudo = JSON.parse(json);
  } catch {
    throw new RespaldoDanadoError();
  }
  const r = SobreCifradoSchema.safeParse(crudo);
  if (!r.success) throw new RespaldoDanadoError();
  return r.data;
}

function contarGrafo(g?: Grafo): number {
  if (!g) return 0;
  return (
    g.artefactos.length +
    g.fragmentos.length +
    g.entidades.length +
    g.relaciones.length +
    g.eventos.length +
    g.productos.length +
    g.casos.length +
    g.tiposOperador.length +
    g.vistas.length
  );
}

export interface ResultadoPrueba {
  datos: number;
  operaciones: number;
  elementosGrafo: number;
  /** The sealed bytes opened back to exactly what went in. */
  integro: boolean;
}

/**
 * Prove the seal works end to end, entirely on device and without touching
 * the network: seal the current bundle, push it through the same serialize
 * → validate-shape → open path a real backup would take, and confirm the
 * bytes come back identical. This is the "Probar empaque local" the operator
 * runs before trusting a backup.
 */
export async function probarEmpaqueLocal(
  bundle: ExportBundle,
  frase: string,
): Promise<ResultadoPrueba> {
  const original = JSON.stringify(bundle);
  const sobre = await cifrar(original, frase);
  // Round-trip through storage exactly as F1 will: serialize, re-validate
  // the envelope shape, then open it.
  const reSobre = parseSobre(serializarSobre(sobre));
  const abierto = await descifrar(reSobre, frase);
  // It must also re-validate as a real bundle — an import would accept it.
  ExportBundleSchema.parse(JSON.parse(abierto));
  return {
    datos: bundle.datos.length,
    operaciones: bundle.operations.length,
    elementosGrafo: contarGrafo(bundle.grafo),
    integro: abierto === original,
  };
}
