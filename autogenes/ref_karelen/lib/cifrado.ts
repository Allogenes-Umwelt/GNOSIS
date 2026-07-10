import { argon2id } from "hash-wasm";
import { type SobreCifrado } from "@/types/sync";

/**
 * Device-local encryption for the operator's backups (F0). The passphrase
 * never leaves memory and is never stored; from it we derive an AES-256 key
 * with Argon2id (memory-hard, phone-appropriate cost) and seal the
 * plaintext with AES-256-GCM via WebCrypto (authenticated). The envelope
 * carries the KDF salt + parameters and the IV so any device holding the
 * passphrase can re-derive and open it, plus a SHA-256 of the ciphertext so
 * corruption is caught before we even try to decrypt. Nothing here touches
 * the network — the server (F1) only ever stores the sealed blob.
 */

// Argon2id cost — OWASP baseline, comfortable on a phone. Stored in the
// envelope so a future tightening never locks out an older backup.
const ARGON2_ITERACIONES = 3;
const ARGON2_MEMORIA_KIB = 19456; // 19 MiB
const ARGON2_PARALELISMO = 1;
const LLAVE_BYTES = 32; // AES-256
const SAL_BYTES = 16;
const IV_BYTES = 12;
const ALGORITMO = "argon2id+aes-256-gcm" as const;
const VERSION_SOBRE = 1 as const;

/** Wrong passphrase — the seal held, the key did not open it. */
export class FraseIncorrectaError extends Error {
  constructor() {
    super("Frase de acceso incorrecta. No se pudo abrir el respaldo.");
    this.name = "FraseIncorrectaError";
  }
}

/** The blob is corrupt or truncated — a different failure than a bad key. */
export class RespaldoDanadoError extends Error {
  constructor() {
    super("El respaldo está dañado o incompleto. Vuelve a generarlo.");
    this.name = "RespaldoDanadoError";
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function aBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// WebCrypto's types want an ArrayBuffer-backed view (not SharedArrayBuffer);
// pin the byte helpers to that so keys/IVs/ciphertext flow without casts.
function deBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function derivarLlave(
  frase: string,
  sal: Uint8Array,
  iteraciones: number,
  memoriaKib: number,
  paralelismo: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const h = await argon2id({
    password: frase,
    salt: sal,
    iterations: iteraciones,
    memorySize: memoriaKib,
    parallelism: paralelismo,
    hashLength: LLAVE_BYTES,
    outputType: "binary",
  });
  return new Uint8Array(h);
}

async function sha256(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(buf);
}

/** Seal a plaintext string into a versioned, self-describing envelope. */
export async function cifrar(
  texto: string,
  frase: string,
): Promise<SobreCifrado> {
  if (frase.length === 0) {
    throw new Error("Define una frase de acceso para cifrar el respaldo.");
  }
  const sal = crypto.getRandomValues(new Uint8Array(SAL_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const llave = await derivarLlave(
    frase,
    sal,
    ARGON2_ITERACIONES,
    ARGON2_MEMORIA_KIB,
    ARGON2_PARALELISMO,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    llave,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(texto)),
  );
  return {
    version: VERSION_SOBRE,
    algoritmo: ALGORITMO,
    kdf: {
      iteraciones: ARGON2_ITERACIONES,
      memoriaKib: ARGON2_MEMORIA_KIB,
      paralelismo: ARGON2_PARALELISMO,
      sal: aBase64(sal),
    },
    iv: aBase64(iv),
    hash: aBase64(await sha256(ct)),
    cifrado: aBase64(ct),
  };
}

/** Open a sealed envelope. Integrity is checked before the key is tried, so
    the operator gets the honest failure: damaged blob vs. wrong passphrase. */
export async function descifrar(
  sobre: SobreCifrado,
  frase: string,
): Promise<string> {
  const ct = deBase64(sobre.cifrado);
  if (aBase64(await sha256(ct)) !== sobre.hash) {
    throw new RespaldoDanadoError();
  }
  const llave = await derivarLlave(
    frase,
    deBase64(sobre.kdf.sal),
    sobre.kdf.iteraciones,
    sobre.kdf.memoriaKib,
    sobre.kdf.paralelismo,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    llave,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: deBase64(sobre.iv) },
      key,
      ct,
    );
    return dec.decode(pt);
  } catch {
    // GCM auth failed after an intact ciphertext ⇒ the key is wrong.
    throw new FraseIncorrectaError();
  }
}
