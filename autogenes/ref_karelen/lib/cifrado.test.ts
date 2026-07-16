import { describe, it, expect } from "vitest";
import {
  cifrar,
  descifrar,
  FraseIncorrectaError,
  RespaldoDanadoError,
} from "@/lib/cifrado";
import { SobreCifradoSchema } from "@/types/sync";

// Argon2id is memory-hard on purpose; give each derivation room to run.
const LIMITE = 20_000;
const FRASE = "correcto caballo bateria grapa";
const TEXTO = 'Datos reales del operador: {"campo":"fiscal","valor":"RFC"}';

describe("cifrado (F0)", () => {
  it(
    "round-trip: lo que se cifra se descifra idéntico",
    async () => {
      const sobre = await cifrar(TEXTO, FRASE);
      expect(await descifrar(sobre, FRASE)).toBe(TEXTO);
    },
    LIMITE,
  );

  it(
    "el sobre cumple el contrato Zod y no filtra la frase",
    async () => {
      const sobre = await cifrar(TEXTO, FRASE);
      expect(SobreCifradoSchema.safeParse(sobre).success).toBe(true);
      // The passphrase and plaintext never appear in the envelope.
      const serializado = JSON.stringify(sobre);
      expect(serializado).not.toContain(FRASE);
      expect(serializado).not.toContain("fiscal");
    },
    LIMITE,
  );

  it(
    "dos cifrados del mismo texto difieren (sal/IV aleatorios) pero ambos abren",
    async () => {
      const a = await cifrar(TEXTO, FRASE);
      const b = await cifrar(TEXTO, FRASE);
      expect(a.cifrado).not.toBe(b.cifrado);
      expect(a.kdf.sal).not.toBe(b.kdf.sal);
      expect(await descifrar(a, FRASE)).toBe(TEXTO);
      expect(await descifrar(b, FRASE)).toBe(TEXTO);
    },
    LIMITE,
  );

  it(
    "frase incorrecta falla con FraseIncorrectaError",
    async () => {
      const sobre = await cifrar(TEXTO, FRASE);
      await expect(descifrar(sobre, "otra frase")).rejects.toBeInstanceOf(
        FraseIncorrectaError,
      );
    },
    LIMITE,
  );

  it(
    "un blob dañado falla con RespaldoDanadoError (antes de probar la llave)",
    async () => {
      const sobre = await cifrar(TEXTO, FRASE);
      // Flip the ciphertext without fixing the hash → integrity gate trips.
      const roto = { ...sobre, cifrado: "AA" + sobre.cifrado.slice(2) };
      await expect(descifrar(roto, FRASE)).rejects.toBeInstanceOf(
        RespaldoDanadoError,
      );
    },
    LIMITE,
  );

  it("una frase vacía se rechaza antes de derivar", async () => {
    await expect(cifrar(TEXTO, "")).rejects.toThrow();
  });
});
