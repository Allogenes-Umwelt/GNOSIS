import { ExportBundleSchema, type ExportBundle } from "@/types/datum";
import type { Datum } from "@/types/datum";
import type { Grafo } from "@/types/autogenes";
import type { Operation } from "@/types/operation";
import { useDatosStore } from "@/store/datos";
import { useCanvasStore } from "@/store/canvas";
import { useAutogenesStore } from "@/store/autogenes";

/**
 * Bundle service — the sole gateway for data leaving or entering the
 * device. The operator's data is real and portable: export everything,
 * import validated, never silently drop. v2 carries the AUTOGENES graph
 * (text/metadata; source binaries stay in the device vault).
 */

export function buildBundle(
  datos: Datum[],
  operations: Operation[],
  grafo?: Grafo,
): ExportBundle {
  return {
    version: 2,
    exportedAt: Date.now(),
    datos,
    operations,
    grafo,
  };
}

/**
 * Snapshot everything the operator owns right now into a bundle. Single
 * source of truth for "what a backup contains" — the export button and the
 * encrypted-sync path (F0) both build from here, so they can never diverge.
 */
export function construirBundleActual(): ExportBundle {
  const { datos } = useDatosStore.getState();
  const { operations } = useCanvasStore.getState();
  const a = useAutogenesStore.getState();
  return buildBundle(datos, operations, {
    artefactos: a.artefactos,
    fragmentos: a.fragmentos,
    entidades: a.entidades,
    relaciones: a.relaciones,
    eventos: a.eventos,
    productos: a.productos,
    casos: a.casos,
    tiposOperador: a.tiposOperador,
    tiposRelacion: a.tiposRelacion,
    vistas: a.vistas,
  });
}

export function downloadBundle(bundle: ExportBundle): void {
  const stamp = new Date(bundle.exportedAt)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `umwelt-datos-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export type ParseBundleResult =
  | { ok: true; bundle: ExportBundle }
  | { ok: false; reason: string };

export function parseBundle(text: string): ParseBundleResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "El archivo no es JSON válido." };
  }
  const result = ExportBundleSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      reason: "El archivo no tiene el formato de exportación de UMWELT.",
    };
  }
  return { ok: true, bundle: result.data };
}
