/**
 * Image normalization for the vision route: downscale to a sane long
 * edge (token cost) and re-encode. The ORIGINAL blob stays in the vault
 * for local OCR and future region provenance; only the reduced copy
 * travels when the operator opts in.
 */

const LADO_MAX = 1568;

export async function reducirImagen(
  blob: Blob,
): Promise<{ base64: string; mime: "image/jpeg" }> {
  // Honor EXIF orientation — without this, rotated phone photos feed
  // sideways into vision transcription and degrade extraction.
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  const factor = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * factor));
  const h = Math.max(1, Math.round(bitmap.height * factor));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin contexto de canvas para reducir la imagen.");
  // White backing so transparent screenshots don't turn black in JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return { base64: dataUrl.split(",")[1] ?? "", mime: "image/jpeg" };
}

// Vault cap: plenty for OCR and region provenance; a 12MP photo shrinks
// ~10× instead of sitting full-size in IndexedDB.
const LADO_MAX_BOVEDA = 2000;

/**
 * Compress an image for the vault: EXIF orientation baked in, long edge
 * capped, JPEG re-encode. Falls back to the ORIGINAL blob if anything
 * fails or if compression would not actually shrink it (tiny PNGs).
 */
export async function comprimirParaBoveda(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
    });
    const factor = Math.min(
      1,
      LADO_MAX_BOVEDA / Math.max(bitmap.width, bitmap.height),
    );
    const w = Math.max(1, Math.round(bitmap.width * factor));
    const h = Math.max(1, Math.round(bitmap.height * factor));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const salida = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.85),
    );
    return salida && salida.size < blob.size ? salida : blob;
  } catch {
    return blob;
  }
}

/**
 * Re-encode an image with its EXIF orientation applied, full size.
 * Tesseract does not read EXIF, so rotated phone photos would OCR
 * sideways without this pass. High-quality JPEG keeps glyphs crisp.
 */
export async function normalizarOrientacion(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const salida = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", 0.95),
  );
  return salida ?? blob;
}
