/**
 * Profeco · Quién es Quién en los Precios — parser of the official open
 * CSV (datos.profeco.gob.mx). Format-guarded like every UMWELT parser:
 * columns are located by header NAME, never by position, and a changed
 * format fails loudly instead of producing silent garbage. Pure and
 * local — the file never leaves the device when loaded as a pipeline.
 */

export interface RegistroQqp {
  producto: string;
  presentacion: string;
  marca: string;
  categoria: string;
  precio: number;
  /** Survey date YYYY-MM-DD. */
  fecha: string;
  cadena: string;
  tienda: string;
  direccion: string;
  estado: string;
  municipio: string;
  lat: number;
  lon: number;
}

/** One CSV line → fields, honoring quoted commas. */
export function camposCsv(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let enComillas = false;
  for (const ch of linea) {
    if (ch === '"') enComillas = !enComillas;
    else if (ch === "," && !enComillas) {
      campos.push(actual.trim());
      actual = "";
    } else actual += ch;
  }
  campos.push(actual.trim());
  return campos;
}

const COLUMNAS = {
  producto: "PRODUCTO",
  presentacion: "PRESENTACION",
  marca: "MARCA",
  categoria: "CATEGORIA",
  precio: "PRECIO",
  fecha: "FECHAREGISTRO",
  cadena: "CADENACOMERCIAL",
  tienda: "NOMBRECOMERCIAL",
  direccion: "DIRECCION",
  estado: "ESTADO",
  municipio: "MUNICIPIO",
  lat: "LATITUD",
  lon: "LONGITUD",
} as const;

const sinAcentos = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Loose contains-match, accent- and case-insensitive. */
export function coincideProducto(registro: string, termino: string): boolean {
  return sinAcentos(registro)
    .toUpperCase()
    .includes(sinAcentos(termino).toUpperCase().trim());
}

function fechaIso(cruda: string): string {
  // QQP dates arrive as "YYYY-MM-DD HH:MM:SS.mmm" or "DD/MM/YYYY".
  const m = cruda.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = cruda.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (d) return `${d[3]}-${d[2]}-${d[1]}`;
  return cruda.slice(0, 10);
}

export interface ResultadoQqp {
  registros: RegistroQqp[];
  /** Rows dropped for missing price/coordinates — honesty counter. */
  descartados: number;
  total: number;
}

/**
 * Parse the QQP CSV, optionally keeping only rows whose PRODUCTO,
 * MARCA or CATEGORIA matches one of `terminos` (the shopping list) —
 * the weekly file is huge and IndexedDB is not a data lake.
 */
export function parsearCsvQqp(
  texto: string,
  terminos?: string[],
): ResultadoQqp {
  const lineas = texto.split(/\r?\n/);
  if (lineas.length === 0) {
    throw new Error("El archivo está vacío. Verifica el CSV de Profeco.");
  }
  const encabezados = camposCsv(lineas[0]).map((c) =>
    sinAcentos(c).toUpperCase(),
  );
  const idx: Record<keyof typeof COLUMNAS, number> = {} as never;
  for (const [clave, nombre] of Object.entries(COLUMNAS)) {
    const i = encabezados.findIndex((h) => h === nombre || h.includes(nombre));
    if (i < 0) {
      throw new Error(
        `El CSV no trae la columna ${nombre}: no parece el formato QQP de Profeco. Descarga el archivo de datos abiertos y reintenta.`,
      );
    }
    idx[clave as keyof typeof COLUMNAS] = i;
  }

  const registros: RegistroQqp[] = [];
  let descartados = 0;
  let total = 0;
  for (let i = 1; i < lineas.length; i++) {
    if (lineas[i].trim().length === 0) continue;
    total += 1;
    const c = camposCsv(lineas[i]);
    const producto = c[idx.producto] ?? "";
    const marca = c[idx.marca] ?? "";
    const categoria = c[idx.categoria] ?? "";
    if (
      terminos &&
      terminos.length > 0 &&
      !terminos.some(
        (t) =>
          coincideProducto(producto, t) ||
          coincideProducto(marca, t) ||
          coincideProducto(categoria, t),
      )
    ) {
      continue;
    }
    const precio = Number.parseFloat(c[idx.precio] ?? "");
    const lat = Number.parseFloat(c[idx.lat] ?? "");
    const lon = Number.parseFloat(c[idx.lon] ?? "");
    if (!Number.isFinite(precio) || precio <= 0 || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      descartados += 1;
      continue;
    }
    registros.push({
      producto,
      presentacion: c[idx.presentacion] ?? "",
      marca,
      categoria,
      precio: Math.round(precio * 100) / 100,
      fecha: fechaIso(c[idx.fecha] ?? ""),
      cadena: c[idx.cadena] ?? "",
      tienda: c[idx.tienda] ?? "",
      direccion: c[idx.direccion] ?? "",
      estado: c[idx.estado] ?? "",
      municipio: c[idx.municipio] ?? "",
      lat,
      lon,
    });
  }
  return { registros, descartados, total };
}
