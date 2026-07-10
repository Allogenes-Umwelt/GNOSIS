import { z } from "zod";

/**
 * Sync (F0) — the sealed envelope contract. A backup leaves the device as
 * this and nothing else: the ciphertext plus the public parameters needed
 * to re-derive the key (KDF salt + cost) and open the seal (IV), with a
 * SHA-256 of the ciphertext so corruption is caught before decryption is
 * even attempted. The passphrase is NEVER part of this — it lives only in
 * the operator's memory. The server (F1) will store exactly this shape and
 * can read none of it.
 */
export const SobreCifradoSchema = z.object({
  /** Envelope format version — widened to a union when it ever changes. */
  version: z.literal(1),
  algoritmo: z.literal("argon2id+aes-256-gcm"),
  /** Argon2id parameters, stored so tightening defaults never locks out
      an older backup. Salt is base64. */
  kdf: z.object({
    iteraciones: z.number().int().positive(),
    memoriaKib: z.number().int().positive(),
    paralelismo: z.number().int().positive(),
    sal: z.string().min(1),
  }),
  /** AES-GCM initialization vector, base64. */
  iv: z.string().min(1),
  /** SHA-256 of the ciphertext, base64 — integrity/version check. */
  hash: z.string().min(1),
  /** AES-256-GCM ciphertext (includes the auth tag), base64. */
  cifrado: z.string().min(1),
});
export type SobreCifrado = z.infer<typeof SobreCifradoSchema>;
