import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
  Relacion,
  TipoOperador,
} from "@/types/autogenes";

/**
 * Data-quality engine (L·1) — the graph's health, computed, not judged.
 * Pure and deterministic: each bucket is a fact the operator can act on
 * (cite it, OCR it, fill it, link it or forget it). Foundry has a data
 * health surface; this is ours, at personal scale.
 */

export interface HallazgoCalidad {
  id: string;
  etiqueta: string;
  detalle: string;
}

export interface SaludGrafo {
  /** Synesis entities citing nothing — memory without a source. */
  entidadesSinEvidencia: HallazgoCalidad[];
  /** Relations that cite nothing (operator-declared links, uncited). */
  relacionesSinCita: number;
  /** Typed entities missing required D2 properties. */
  fichasIncompletas: HallazgoCalidad[];
  /** Scanned pages with no citable text yet (OCR pending). */
  paginasMudas: HallazgoCalidad[];
  /** Entities no relation touches and no event names — unwoven material. */
  huerfanas: HallazgoCalidad[];
  /** Total actionable findings across buckets. */
  total: number;
}

const TOPE = 8;

export function saludDelGrafo(
  artefactos: Artefacto[],
  fragmentos: Fragmento[],
  entidades: Entidad[],
  relaciones: Relacion[],
  eventos: Evento[],
  tiposOperador: TipoOperador[],
): SaludGrafo {
  const entidadesSinEvidencia = entidades
    .filter((e) => e.origen === "synesis" && e.evidencia.length === 0)
    .map((e) => ({
      id: e.id,
      etiqueta: e.nombre,
      detalle: `${e.tipo} · sin cita`,
    }));

  const relacionesSinCita = relaciones.filter(
    (r) => r.evidencia.length === 0,
  ).length;

  const tipoPorId = new Map(tiposOperador.map((t) => [t.id, t] as const));
  const fichasIncompletas = entidades
    .flatMap((e) => {
      if (!e.subtipo) return [];
      const tipo = tipoPorId.get(e.subtipo);
      if (!tipo) return [];
      const faltantes = tipo.propiedades
        .filter(
          (p) => p.requerida && !(e.propiedades?.[p.clave] ?? "").trim(),
        )
        .map((p) => p.etiqueta);
      if (faltantes.length === 0) return [];
      return [
        {
          id: e.id,
          etiqueta: e.nombre,
          detalle: `${tipo.nombre} · falta ${faltantes.join(", ")}`,
        },
      ];
    });

  const nombreArtefacto = new Map(
    artefactos.map((a) => [a.id, a.nombre] as const),
  );
  const paginasMudas = fragmentos
    .filter((f) => f.texto.trim().length === 0)
    .map((f) => ({
      id: f.id,
      etiqueta: nombreArtefacto.get(f.artefactoId) ?? "fuente",
      detalle: f.pagina ? `pág ${f.pagina} · sin texto` : "sin texto",
    }));

  const tocadas = new Set<string>();
  for (const r of relaciones) {
    tocadas.add(r.desdeId);
    tocadas.add(r.hastaId);
  }
  const nombradas = new Set<string>();
  for (const ev of eventos) {
    for (const n of ev.entidades) nombradas.add(n.trim().toLowerCase());
  }
  const huerfanas = entidades
    .filter(
      (e) =>
        !tocadas.has(e.id) &&
        !nombradas.has(e.nombre.trim().toLowerCase()) &&
        !(e.alias ?? []).some((a) => nombradas.has(a.trim().toLowerCase())),
    )
    .map((e) => ({
      id: e.id,
      etiqueta: e.nombre,
      detalle: `${e.tipo} · sin vínculos ni eventos`,
    }));

  const total =
    entidadesSinEvidencia.length +
    fichasIncompletas.length +
    paginasMudas.length +
    huerfanas.length;

  return {
    entidadesSinEvidencia: entidadesSinEvidencia.slice(0, TOPE),
    relacionesSinCita,
    fichasIncompletas: fichasIncompletas.slice(0, TOPE),
    paginasMudas: paginasMudas.slice(0, TOPE),
    huerfanas: huerfanas.slice(0, TOPE),
    total,
  };
}
