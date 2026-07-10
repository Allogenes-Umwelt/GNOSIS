import { parsearFechaEs } from "@/lib/fechas";
import type { Pipeline, ResultadoPipeline } from "@/types/pipeline";

/**
 * CSV pipeline — bank statements and tabular exports. Deterministic
 * column detection (date = most parseable-date cells; amount = most
 * numeric cells; concept = longest remaining text), rows normalized to
 * "FECHA · CONCEPTO · MONTO" lines and chunked into citable fragments,
 * plus one summary fragment with hard stats. It extracts NO entities —
 * guessing counterparties from free text would be noise, not knowledge.
 */

const FILAS_POR_FRAGMENTO = 15;

/**
 * Quote-aware CSV tokenizer over the WHOLE text — a quoted field may span
 * newlines (real bank exports wrap long concepts), and RFC 4180 escaped
 * quotes ("") collapse to one. Splitting on newline first (the naive way)
 * tears such rows apart and silently drops them at the column-count check.
 */
function partirCsv(contenido: string, sep: string): string[][] {
  const filas: string[][] = [];
  let celda = "";
  let fila: string[] = [];
  let entreComillas = false;
  const cerrarFila = () => {
    fila.push(celda.trim());
    celda = "";
    if (fila.some((c) => c.length > 0)) filas.push(fila);
    fila = [];
  };
  for (let i = 0; i < contenido.length; i++) {
    const ch = contenido[i];
    if (ch === '"') {
      if (entreComillas && contenido[i + 1] === '"') {
        celda += '"';
        i++;
      } else entreComillas = !entreComillas;
    } else if (ch === sep && !entreComillas) {
      fila.push(celda.trim());
      celda = "";
    } else if ((ch === "\n" || ch === "\r") && !entreComillas) {
      if (ch === "\r" && contenido[i + 1] === "\n") i++;
      cerrarFila();
    } else celda += ch;
  }
  if (celda.length > 0 || fila.length > 0) cerrarFila();
  return filas;
}

function esMonto(s: string): boolean {
  // Optional $/sign, thousands, and ANY number of decimals — Excel emits
  // "-150.5" as readily as "-150.50", so don't require exactly two.
  return /^-?\$?\s?-?[\d,]+(?:\.\d+)?$/.test(s.trim());
}

function aNumero(s: string): number {
  return Number(s.replace(/[$,\s]/g, "")) || 0;
}

export const pipelineCsv: Pipeline = {
  id: "csv",
  nombre: "Tabla CSV",
  descripcion:
    "Lee un estado de cuenta o tabla CSV: movimientos normalizados como fragmentos citables más un resumen con totales.",
  detecta: (nombre) => /\.csv$/i.test(nombre),
  procesar: (nombre, contenido): ResultadoPipeline => {
    // Detect the separator from the header line (quoted newlines don't
    // occur in headers), then tokenize the whole file quote-aware.
    const cabecera = contenido.split(/\r?\n/, 1)[0] ?? "";
    const sep = (cabecera.match(/;/g)?.length ?? 0) >
      (cabecera.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
    return analizarTablaOTexto(nombre, partirCsv(contenido, sep));
  },
};

/**
 * Table → citable movements + totals summary. Shared by the CSV pipeline
 * and the XLSX reader (a spreadsheet is just a table from another wrapper),
 * so both dock identical, provenance-clean fragments. Throws with operator
 * words when the table isn't a recognizable dated-amount ledger.
 */
export function analizarTabla(
  nombre: string,
  filas: string[][],
): ResultadoPipeline {
  {
    if (filas.length < 2) {
      throw new Error("La tabla está vacía o sin filas. Revisa el archivo.");
    }
    const columnas = filas[0].length;

    // Score each column over the data rows (header excluded).
    const cuerpo = filas.slice(1).filter((f) => f.length === columnas);
    if (cuerpo.length === 0) {
      throw new Error("Las filas de la tabla no cuadran con su cabecera.");
    }
    const puntaje = Array.from({ length: columnas }, () => ({
      fechas: 0,
      montos: 0,
      texto: 0,
    }));
    for (const fila of cuerpo) {
      fila.forEach((celda, i) => {
        // A bare 4-digit integer ("2026") parses as a year but in a bank
        // table it is almost always an amount — score it as monto so an
        // integer-only amount column isn't mistaken for the date column.
        const bareYear = /^\d{4}$/.test(celda.trim());
        if (parsearFechaEs(celda) && !bareYear) puntaje[i].fechas++;
        else if (esMonto(celda)) puntaje[i].montos++;
        puntaje[i].texto += celda.length;
      });
    }
    const mejor = (clave: "fechas" | "montos") =>
      puntaje.reduce((max, p, i) => (p[clave] > puntaje[max][clave] ? i : max), 0);
    const colFecha = mejor("fechas");
    const colMonto = mejor("montos");
    if (
      puntaje[colFecha].fechas < cuerpo.length / 2 ||
      puntaje[colMonto].montos < cuerpo.length / 2 ||
      colFecha === colMonto
    ) {
      throw new Error(
        "No reconocí columnas de fecha y monto en la tabla. Cárgala como dato manual.",
      );
    }
    // Seed with the FIRST column that is neither date nor amount (never a
    // data column, which the old positional seed could accidentally pick);
    // −1 when there are only two columns → "(sin concepto)" downstream.
    const primeraLibre = puntaje.findIndex(
      (_, i) => i !== colFecha && i !== colMonto,
    );
    const colConcepto = puntaje.reduce(
      (max, p, i) =>
        i !== colFecha && i !== colMonto && (max < 0 || p.texto > puntaje[max].texto)
          ? i
          : max,
      primeraLibre,
    );

    const movimientos = cuerpo.flatMap((fila) => {
      const f = parsearFechaEs(fila[colFecha]);
      if (!f) return [];
      // A quoted concept may have wrapped across lines — flatten internal
      // whitespace so each movement stays a single citable line.
      const concepto =
        (fila[colConcepto] ?? "").replace(/\s+/g, " ").trim() || "(sin concepto)";
      return [
        {
          fecha: f.fecha,
          linea: `${f.fecha} · ${concepto} · ${fila[colMonto]}`,
          monto: aNumero(fila[colMonto]),
        },
      ];
    });
    if (movimientos.length === 0) {
      throw new Error("Ninguna fila de la tabla tiene fecha legible.");
    }

    const fechas = movimientos.map((m) => m.fecha).sort();
    const cargos = movimientos.filter((m) => m.monto < 0);
    const abonos = movimientos.filter((m) => m.monto > 0);
    const suma = (xs: { monto: number }[]) =>
      xs.reduce((a, x) => a + x.monto, 0);
    const resumen = [
      `Tabla ${nombre}: ${movimientos.length} movimientos del ${fechas[0]} al ${fechas[fechas.length - 1]}.`,
      `Cargos: ${cargos.length} por ${suma(cargos).toFixed(2)}. Abonos: ${abonos.length} por ${suma(abonos).toFixed(2)}.`,
      `Neto del periodo: ${suma(movimientos).toFixed(2)}.`,
    ].join("\n");

    const fragmentos = [{ texto: resumen, pagina: 1 }];
    for (let i = 0; i < movimientos.length; i += FILAS_POR_FRAGMENTO) {
      fragmentos.push({
        texto: movimientos
          .slice(i, i + FILAS_POR_FRAGMENTO)
          .map((m) => m.linea)
          .join("\n"),
        pagina: fragmentos.length + 1,
      });
    }

    return { fragmentos, entidades: [], eventos: [] };
  }
}

/**
 * Generic-table fallback: any table (not just a dated-amount ledger) docks
 * its rows as citable text fragments — a header/summary plus row chunks,
 * whitespace flattened, empty cells dropped. No entities/events (extraction
 * is a separate operator tap), but the content becomes searchable and
 * cite-able in the graph. Throws only when there is nothing at all.
 */
export function tablaGenerica(
  nombre: string,
  filas: string[][],
): ResultadoPipeline {
  const limpias = filas
    .map((f) => f.map((c) => c.replace(/\s+/g, " ").trim()))
    .filter((f) => f.some((c) => c.length > 0));
  if (limpias.length === 0) {
    throw new Error("La tabla está vacía o sin datos legibles.");
  }
  const columnas = Math.max(...limpias.map((f) => f.length));
  const encabezado = limpias[0].filter((c) => c).join(" · ");
  const lineas = limpias
    .map((f) => f.filter((c) => c).join(" · "))
    .filter((l) => l.length > 0);

  const resumen = `Tabla ${nombre}: ${limpias.length} filas, ${columnas} columnas.${
    encabezado ? ` Primera fila: ${encabezado.slice(0, 200)}.` : ""
  }`;
  const fragmentos: ResultadoPipeline["fragmentos"] = [
    { texto: resumen, pagina: 1 },
  ];
  for (let i = 0; i < lineas.length; i += FILAS_POR_FRAGMENTO) {
    fragmentos.push({
      texto: lineas.slice(i, i + FILAS_POR_FRAGMENTO).join("\n"),
      pagina: fragmentos.length + 1,
    });
  }
  return { fragmentos, entidades: [], eventos: [] };
}

/**
 * Analyze a table as a dated-amount ledger when it fits (cargos/abonos,
 * cited events); otherwise fall back to docking it as a generic citable
 * table instead of rejecting it. Shared by the CSV pipeline and XLSX.
 */
export function analizarTablaOTexto(
  nombre: string,
  filas: string[][],
): ResultadoPipeline {
  try {
    return analizarTabla(nombre, filas);
  } catch {
    return tablaGenerica(nombre, filas);
  }
}
