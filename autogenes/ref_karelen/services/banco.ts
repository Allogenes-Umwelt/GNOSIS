import { parsearEstadoBbva, type EstadoBanco } from "@/lib/banco/bbva";
import { extraerRenglonesPdf } from "@/lib/banco/pdf";

/**
 * Bank statement intake — reads a native-digital PDF into structured
 * movements, entirely on device. BBVA (Maestra PYME / personal) for now;
 * other banks throw a clear "no movements" until their parser lands.
 */
export async function leerEstadoBancario(file: File): Promise<EstadoBanco> {
  if (!/\.pdf$/i.test(file.name)) {
    throw new Error("Carga el estado de cuenta en PDF nativo (no escaneado).");
  }
  const renglones = await extraerRenglonesPdf(file);
  if (renglones.length === 0) {
    throw new Error(
      "El PDF no tiene texto legible. Si es un escaneo, exporta el PDF nativo digital desde tu banca.",
    );
  }
  const estado = parsearEstadoBbva(renglones);
  if (estado.movimientos.length === 0) {
    throw new Error(
      "No se encontraron movimientos. Por ahora se soporta el estado de cuenta de BBVA.",
    );
  }
  return estado;
}
