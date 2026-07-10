/**
 * Minimal ZIP reader — zero dependencies, on device, deterministic. Parses
 * the central directory and inflates entries with the platform-native
 * DecompressionStream (deflate). Enough to read the XML parts inside an
 * .xlsx or a .zip of CFDI invoices; no encryption, no ZIP64, no writing.
 * Runs in Node tests too (DecompressionStream is a web standard shipped by
 * modern Node). The result is a map of entry path → raw bytes.
 */

async function inflarRaw(datos: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  // Copy into a fresh ArrayBuffer-backed view (subarray widens the buffer
  // type, which BlobPart won't accept).
  const stream = new Blob([new Uint8Array(datos)]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read every entry of a ZIP archive into a map of path → decompressed bytes. */
export async function leerZip(
  buffer: ArrayBuffer,
): Promise<Map<string, Uint8Array>> {
  const b = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  // Locate the End Of Central Directory record (may be followed by a
  // comment, so scan backwards for its signature 0x06054b50).
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("El archivo no tiene un directorio ZIP válido.");
  const total = dv.getUint16(eocd + 10, true);
  let ptr = dv.getUint32(eocd + 16, true);

  const entradas = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < total; i++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(ptr + 10, true);
    const compSize = dv.getUint32(ptr + 20, true);
    const nameLen = dv.getUint16(ptr + 28, true);
    const extraLen = dv.getUint16(ptr + 30, true);
    const commentLen = dv.getUint16(ptr + 32, true);
    const localOff = dv.getUint32(ptr + 42, true);
    const nombre = decoder.decode(b.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    // Follow the local header to find where the entry's data begins.
    const lnLen = dv.getUint16(localOff + 26, true);
    const leLen = dv.getUint16(localOff + 28, true);
    const dataOff = localOff + 30 + lnLen + leLen;
    const crudo = b.subarray(dataOff, dataOff + compSize);
    entradas.set(nombre, metodo === 0 ? crudo : await inflarRaw(crudo));
  }
  return entradas;
}
