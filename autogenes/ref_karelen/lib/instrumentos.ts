import type { Dictamen, Nodo, Punto } from "@/types/resultado";

/**
 * Pure builders and geometry for the universal instruments. No IO here —
 * services feed these with real store/connector data; tests feed them
 * with fixed values.
 */

const DIA_MS = 86_400_000;

/** Deterministic radial placement: ring + index → SVG coordinates. */
export function posicionNodo(
  indice: number,
  total: number,
  anillo: 1 | 2,
  centro: number,
  radios: { 1: number; 2: number },
): { x: number; y: number } {
  const n = Math.max(total, 1);
  // Phase offset per ring so ring 2 never eclipses ring 1 (swarm pattern).
  const fase = anillo === 1 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / n;
  const angulo = fase + (indice / n) * 2 * Math.PI;
  const r = radios[anillo];
  return {
    x: centro + r * Math.cos(angulo),
    y: centro + r * Math.sin(angulo),
  };
}

/** Scale points into an SVG box, padded; handles flat/single series. */
export function escalarSerie(
  puntos: Punto[],
  ancho: number,
  alto: number,
  margen: number,
): { x: number; y: number }[] {
  if (puntos.length === 0) return [];
  const ts = puntos.map((p) => p.t);
  const vs = puntos.map((p) => p.v);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  const tSpan = tMax - tMin || 1;
  const vSpan = vMax - vMin || 1;
  return puntos.map((p) => ({
    x: margen + ((p.t - tMin) / tSpan) * (ancho - margen * 2),
    y: alto - margen - ((p.v - vMin) / vSpan) * (alto - margen * 2),
  }));
}

/** Map a reference value into the same Y domain escalarSerie uses. */
export function yDeValor(
  puntos: Punto[],
  v: number,
  alto: number,
  margen: number,
): number | null {
  if (puntos.length === 0) return null;
  const vs = puntos.map((p) => p.v);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  const vSpan = vMax - vMin || 1;
  if (v < vMin || v > vMax) return null;
  return alto - margen - ((v - vMin) / vSpan) * (alto - margen * 2);
}

/** Percent change between the last two points of a series. */
export function deltaSerie(
  puntos: Punto[],
): { pct: number; periodo: string } | undefined {
  if (puntos.length < 2) return undefined;
  const prev = puntos[puntos.length - 2];
  const last = puntos[puntos.length - 1];
  if (prev.v === 0) return undefined;
  const pct = ((last.v - prev.v) / prev.v) * 100;
  return { pct, periodo: "vs lectura previa" };
}

/**
 * Backup verdict from real device state. Rules:
 * - no data at all → insuficiente (nothing to protect yet)
 * - data present, never exported or export older than 7 days → atencion
 * - fresh export → favorable
 */
export function construirDictamenRespaldo(entrada: {
  totalDatos: number;
  totalObjetos: number;
  totalOperaciones: number;
  lastExport: number | null;
  ahora: number;
}): Dictamen {
  const { totalDatos, totalObjetos, totalOperaciones, lastExport, ahora } =
    entrada;
  const dias =
    lastExport === null ? null : Math.floor((ahora - lastExport) / DIA_MS);

  const evidencia = [
    {
      dato: `${totalDatos} ${totalDatos === 1 ? "dato cargado" : "datos cargados"}`,
      cita: "sistema · datos",
    },
    {
      dato: `${totalObjetos} ${totalObjetos === 1 ? "objeto" : "objetos"} en memoria`,
      cita: "sistema · memoria",
    },
    {
      dato: `${totalOperaciones} ${totalOperaciones === 1 ? "operación documentada" : "operaciones documentadas"}`,
      cita: "sistema · archivo",
    },
    {
      dato:
        dias === null
          ? "Sin respaldo exportado"
          : dias === 0
            ? "Respaldo exportado hoy"
            : `Último respaldo hace ${dias} ${dias === 1 ? "día" : "días"}`,
      cita: "sistema · respaldo",
    },
  ];

  const sinSustancia =
    totalDatos === 0 && totalObjetos === 0 && totalOperaciones === 0;

  if (sinSustancia) {
    return {
      funcion: "dictamen",
      titulo: "Respaldo del Umwelt",
      veredicto: "insuficiente",
      enunciado:
        "No hay sustancia que respaldar aún. Carga datos en Ingesta para que el dictamen opere.",
      evidencia,
      siguienteAccion: { etiqueta: "Cargar datos", href: "/ingesta" },
      fuente: {
        conector: "sistema",
        consulta: "respaldo",
        obtenido: new Date(ahora).toISOString(),
      },
    };
  }

  const vencido = dias === null || dias > 7;
  const nivel = {
    valor: Math.min((dias ?? 14) / 14, 1),
    zonas: ["fresco", "vence", "vencido"] as [string, string, string],
  };

  return {
    funcion: "dictamen",
    titulo: "Respaldo del Umwelt",
    veredicto: vencido ? "atencion" : "favorable",
    enunciado: vencido
      ? "Tu Umwelt vive solo en este dispositivo y el respaldo venció. Exporta ahora."
      : "Respaldo vigente. Tu Umwelt sobrevive a la pérdida del dispositivo.",
    evidencia,
    nivel,
    siguienteAccion: vencido
      ? { etiqueta: "Exportar respaldo", href: "/ingesta" }
      : undefined,
    fuente: {
      conector: "sistema",
      consulta: "respaldo",
      obtenido: new Date(ahora).toISOString(),
    },
  };
}

/** Memory objects → constellation nodes. Ring 1 = related, ring 2 = loose. */
export function construirNodosMemoria(
  objetos: {
    id: string;
    nombre: string;
    tipo: string;
    resumen: string;
    relaciones: { con: string; tipo: string }[];
    createdAt: number;
  }[],
  ahora: number,
): Nodo[] {
  return objetos.slice(0, 20).map((o) => ({
    id: o.id,
    etiqueta: o.nombre,
    anillo: o.relaciones.length > 0 ? (1 as const) : (2 as const),
    vivo: ahora - o.createdAt < 7 * DIA_MS,
    detalle: `${o.tipo} · ${o.resumen}${
      o.relaciones.length > 0
        ? ` · ${o.relaciones.map((r) => `${r.tipo} → ${r.con}`).join(" · ")}`
        : ""
    }`,
  }));
}
