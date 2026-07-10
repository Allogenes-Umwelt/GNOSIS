import type { RegistroQqp } from "@/lib/qqp/parse";
import { coincideProducto } from "@/lib/qqp/parse";

/**
 * MANDADO engine — the errand, measured. Pure and unit-agnostic: takes
 * Profeco QQP survey rows (official, dated, per-establishment) plus the
 * operator's shopping list and location, and answers where the basket
 * costs least WITHIN REACH — always citing the survey date, always
 * honest about what a store does not carry ("cubre 3 de 5") and about
 * products with no Profeco sampling. No payment, no ordering: price
 * intelligence only (the payment wiring belongs to the S plan).
 */

const r2 = (v: number): number => Math.round(v * 100) / 100;

export interface Ubicacion {
  lat: number;
  lon: number;
}

/** Great-circle distance, km. */
export function distanciaKm(a: Ubicacion, b: Ubicacion): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return r2(6371 * 2 * Math.asin(Math.sqrt(s)));
}

export interface PrecioItem {
  termino: string;
  /** Exact surveyed row backing this price. */
  producto: string;
  presentacion: string;
  marca: string;
  precio: number;
  fecha: string;
}

export interface TiendaComparada {
  id: string;
  tienda: string;
  cadena: string;
  direccion: string;
  lat: number;
  lon: number;
  distanciaKm: number | null;
  /** Cheapest surveyed price per matched list term. */
  items: PrecioItem[];
  /** List terms with no sampling at this store. */
  faltantes: string[];
  /** Sum over matched items only. */
  totalCanasta: number;
  cubre: number;
  /** Oldest survey date backing the basket. */
  muestreoDesde: string;
}

/**
 * Compare stores against the shopping list: per store, the cheapest
 * surveyed row per term (freshest date wins ties), the basket total
 * over covered terms only, and the distance when a location exists.
 * Sorted: full coverage first, then cheapest basket, then nearest.
 */
export function compararTiendas(
  registros: RegistroQqp[],
  lista: string[],
  ubicacion: Ubicacion | null,
  radioKm: number | null,
): TiendaComparada[] {
  const terminos = lista.map((t) => t.trim()).filter((t) => t.length > 0);
  if (terminos.length === 0 || registros.length === 0) return [];

  const porTienda = new Map<string, RegistroQqp[]>();
  for (const r of registros) {
    const id = `${r.tienda}|${r.direccion}`;
    const arr = porTienda.get(id) ?? [];
    arr.push(r);
    porTienda.set(id, arr);
  }

  const filas: TiendaComparada[] = [];
  for (const [id, rows] of porTienda) {
    const base = rows[0];
    const d = ubicacion
      ? distanciaKm(ubicacion, { lat: base.lat, lon: base.lon })
      : null;
    if (radioKm !== null && d !== null && d > radioKm) continue;

    const items: PrecioItem[] = [];
    const faltantes: string[] = [];
    for (const termino of terminos) {
      const candidatos = rows.filter(
        (r) =>
          coincideProducto(r.producto, termino) ||
          coincideProducto(r.marca, termino),
      );
      if (candidatos.length === 0) {
        faltantes.push(termino);
        continue;
      }
      const mejor = [...candidatos].sort(
        (a, b) => a.precio - b.precio || (a.fecha < b.fecha ? 1 : -1),
      )[0];
      items.push({
        termino,
        producto: mejor.producto,
        presentacion: mejor.presentacion,
        marca: mejor.marca,
        precio: mejor.precio,
        fecha: mejor.fecha,
      });
    }
    if (items.length === 0) continue;
    filas.push({
      id,
      tienda: base.tienda,
      cadena: base.cadena,
      direccion: base.direccion,
      lat: base.lat,
      lon: base.lon,
      distanciaKm: d,
      items,
      faltantes,
      totalCanasta: r2(items.reduce((s, i) => s + i.precio, 0)),
      cubre: items.length,
      muestreoDesde: items.map((i) => i.fecha).sort()[0],
    });
  }

  return filas.sort(
    (a, b) =>
      b.cubre - a.cubre ||
      a.totalCanasta - b.totalCanasta ||
      (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity),
  );
}

export interface VeredictoMandado {
  aplica: boolean;
  mejor: TiendaComparada | null;
  /** Same-coverage most expensive option — the honest comparison base. */
  peorComparable: TiendaComparada | null;
  ahorro: number | null;
  sentencia: string;
}

/** The verdict: cheapest full(est)-coverage store vs the most expensive
 * store with the SAME coverage — never compares baskets of different
 * sizes, that would be lying with arithmetic. */
export function veredictoMandado(
  tiendas: TiendaComparada[],
  nLista: number,
): VeredictoMandado {
  if (tiendas.length === 0) {
    return {
      aplica: false,
      mejor: null,
      peorComparable: null,
      ahorro: null,
      sentencia:
        "Sin tiendas comparables: carga el CSV de Profeco y define tu lista.",
    };
  }
  const mejor = tiendas[0];
  const comparables = tiendas.filter((t) => t.cubre === mejor.cubre);
  const peor = comparables[comparables.length - 1];
  const ahorro =
    comparables.length > 1 ? r2(peor.totalCanasta - mejor.totalCanasta) : null;
  const cobertura =
    mejor.cubre === nLista
      ? "tu lista completa"
      : `${mejor.cubre} de ${nLista} de tu lista`;
  const dist =
    mejor.distanciaKm !== null ? ` a ${formatoKm(mejor.distanciaKm)}` : "";
  const sentencia =
    ahorro !== null && ahorro > 0
      ? `Surtir ${cobertura} en ${mejor.tienda}${dist} cuesta ${fmt(mejor.totalCanasta)}: ${fmt(ahorro)} menos que en ${peor.tienda}, con el mismo muestreo de Profeco.`
      : `Surtir ${cobertura} en ${mejor.tienda}${dist} cuesta ${fmt(mejor.totalCanasta)} según el muestreo de Profeco; sin otra tienda comparable para medir ahorro.`;
  return {
    aplica: true,
    mejor,
    peorComparable: comparables.length > 1 ? peor : null,
    ahorro,
    sentencia,
  };
}

const fmt = (v: number): string =>
  `$${v.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

export function formatoKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export interface RangoProducto {
  termino: string;
  n: number;
  minimo: PrecioItem & { tienda: string };
  maximo: PrecioItem & { tienda: string };
  /** (max − min) / min — the spread that makes walking worth it. */
  brecha: number;
  sinMuestreo: boolean;
}

/** Per list term: the cheapest and priciest surveyed offer in reach. */
export function rangosPorProducto(
  tiendas: TiendaComparada[],
  lista: string[],
): RangoProducto[] {
  return lista
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((termino) => {
      const ofertas = tiendas.flatMap((tienda) =>
        tienda.items
          .filter((i) => i.termino === termino)
          .map((i) => ({ ...i, tienda: tienda.tienda })),
      );
      if (ofertas.length === 0) {
        return {
          termino,
          n: 0,
          minimo: null as never,
          maximo: null as never,
          brecha: 0,
          sinMuestreo: true,
        };
      }
      const orden = [...ofertas].sort((a, b) => a.precio - b.precio);
      const minimo = orden[0];
      const maximo = orden[orden.length - 1];
      return {
        termino,
        n: ofertas.length,
        minimo,
        maximo,
        brecha:
          minimo.precio > 0
            ? r2((maximo.precio - minimo.precio) / minimo.precio)
            : 0,
        sinMuestreo: false,
      };
    });
}
