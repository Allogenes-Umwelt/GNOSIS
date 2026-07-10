import { useMemo } from "react";
import {
  cuadreContraBanco,
  marcasCadencia,
  obligacionDelMes,
  proyectarCajaAlLimite,
  repsEnRiesgo,
  veredictoCuadre,
  type CuadreMes,
  type MarcaCadencia,
  type Obligacion,
  type ProyeccionCaja,
  type RepEnRiesgo,
  type VeredictoCuadre,
} from "@/capacidades/cuadre";
import { pagosSat } from "@/capacidades/flujo";
import {
  inferirRfcOperador,
  posicionFiscal,
  reconciliarCartera,
  resumenCobranza,
  resumenGasto,
  type PagoBanco,
  type PosicionFiscal,
} from "@/capacidades/finanzas";
import { useCobranzaStore } from "@/store/cobranza";
import { useCuadreStore } from "@/store/cuadre";
import { useFlujoStore } from "@/store/flujo";

/**
 * CUADRE gateway — the ONLY door the view uses. It reads the two
 * substrates the operator already feeds (COBRANZA's CFDI corpus,
 * FLUJO's verified bank archive), derives plain data and runs the
 * cited engine. Nothing is re-ingested and nothing is dual-written:
 * same statements, same CFDIs, one new question.
 */

export interface DatosCuadre {
  mes: string;
  hoy: string;
  rfc: string | null;
  /** Sixth NUMERIC digit of the RFC (drives the Decreto 5.1 facility). */
  sextoDigito: string | null;
  posicion: PosicionFiscal;
  obligacion: Obligacion;
  proyeccion: ProyeccionCaja;
  veredicto: VeredictoCuadre;
  reps: RepEnRiesgo[];
  historico: CuadreMes[];
  marcas: MarcaCadencia[];
  /** Unique counterparties from the corpus, heaviest first (for 69-B). */
  contrapartes: { rfc: string; nombre: string; total: number }[];
  /** Source counts, for the honest footer. */
  base: { cfdis: number; movimientosBanco: number; conciliaciones: number };
  coeficienteUtilidad: number | null;
}

/** Sixth digit of the RFC's numeric (date) block, or null. */
export function sextoDigitoDe(rfc: string | null): string | null {
  if (!rfc) return null;
  const digitos = rfc.replace(/\D/g, "");
  return digitos.length >= 6 ? digitos[5] : null;
}

function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

export function datosCuadre(hoy: string): DatosCuadre | null {
  const cob = useCobranzaStore.getState();
  const flujo = useFlujoStore.getState();
  if (cob.registros.length === 0 && flujo.movimientos.length === 0) return null;

  const rfc = cob.rfcOperador ?? inferirRfcOperador(cob.registros);

  // Bank-confirmed payments (operator-reconciled in COBRANZA) count as
  // proof of cash alongside SAT complements.
  const movPorId = new Map(cob.movimientos.map((m) => [m.id, m]));
  const pagosBanco: PagoBanco[] = Object.entries(cob.conciliaciones)
    .map(([id, clave]) => {
      const m = movPorId.get(id);
      return m ? { clave, fecha: m.fecha, monto: Math.abs(m.monto) } : null;
    })
    .filter((p): p is PagoBanco => p !== null);

  // Month under analysis: the latest month with activity in any source.
  const fechas = [
    ...cob.registros.map((r) => r.comprobante.fechaDia),
    ...flujo.movimientos.map((m) => m.fecha),
  ].sort();
  if (fechas.length === 0) return null;
  const mes = mesDe(fechas[fechas.length - 1]);
  const rango = { desde: `${mes}-01`, hasta: `${mes}-31` };

  const ingreso = resumenCobranza(cob.registros, rfc, rango, cob.metadata, pagosBanco);
  const gasto = resumenGasto(cob.registros, rfc, rango, cob.metadata, pagosBanco);
  const posicion = posicionFiscal(ingreso, gasto);

  const sextoDigito = sextoDigitoDe(rfc);
  const obligacion = obligacionDelMes({
    mes,
    ivaACargo: posicion.ivaACargo,
    // COBRANZA's position is billing-basis reference (Art. 1o.-B LIVA
    // determines on flow); the engine labels it honestly.
    ivaSobreFlujo: false,
    retencionesAEnterar: posicion.retencionesAEnterar,
    ingresosNominalesMes: ingreso.ingresoFacturado,
    coeficienteUtilidad: useCuadreStore.getState().coeficienteUtilidad ?? undefined,
    sextoDigitoRfc: sextoDigito ?? undefined,
  });

  const saldoHoy =
    useFlujoStore
      .getState()
      .estados.filter((e) => e.saldoFinal !== null)
      .sort((a, b) =>
        (a.periodo?.hasta ?? "") < (b.periodo?.hasta ?? "") ? 1 : -1,
      )[0]?.saldoFinal ?? 0;
  const proyeccion = proyectarCajaAlLimite(
    saldoHoy,
    flujo.movimientos.map((m) => ({ fecha: m.fecha, monto: m.monto })),
    hoy,
    obligacion.limite.fecha,
  );

  const veredicto = veredictoCuadre(obligacion, proyeccion);

  // PPD collections proven by the bank that still lack their REP.
  const conRep = new Set<string>();
  for (const { comprobante: c } of cob.registros) {
    for (const p of c.pagos) {
      for (const rel of p.relacionados) conRep.add(rel.uuid.toUpperCase());
    }
  }
  const cartera = reconciliarCartera(cob.registros, rfc, cob.metadata, pagosBanco);
  const clientePorUuid = new Map(cartera.map((c) => [c.uuid.toUpperCase(), c.contraparte]));
  const reps = repsEnRiesgo(
    pagosBanco
      .filter(
        (p) =>
          clientePorUuid.has(p.clave.toUpperCase()) &&
          !conRep.has(p.clave.toUpperCase()),
      )
      .map((p) => ({
        uuid: p.clave,
        cliente: clientePorUuid.get(p.clave.toUpperCase()) ?? "cliente",
        monto: p.monto,
        fechaCobro: p.fecha,
      })),
    hoy,
  );

  // Historic cross: SAT charges in the verified bank archive vs the
  // estimated obligation of every month with CFDI activity.
  const mesesCfdi = [...new Set(cob.registros.map((r) => mesDe(r.comprobante.fechaDia)))];
  const obligacionesPorMes = mesesCfdi.map((m) => {
    const r = { desde: `${m}-01`, hasta: `${m}-31` };
    const i = resumenCobranza(cob.registros, rfc, r, cob.metadata, pagosBanco);
    const g = resumenGasto(cob.registros, rfc, r, cob.metadata, pagosBanco);
    const pos = posicionFiscal(i, g);
    return {
      mes: m,
      total: Math.max(0, pos.ivaACargo) + pos.retencionesAEnterar,
    };
  });
  const historico = cuadreContraBanco(
    pagosSat(flujo.movimientos),
    obligacionesPorMes,
  );

  const marcas = marcasCadencia({
    cobros: flujo.movimientos
      .filter((m) => m.monto > 0)
      .map((m) => ({ fecha: m.fecha, monto: m.monto })),
    pagos: flujo.movimientos
      .filter((m) => m.monto < 0)
      .map((m) => ({ fecha: m.fecha, monto: m.monto })),
    limites: [
      {
        fecha: obligacion.limite.fecha,
        tipo: "limite_pago",
        etiqueta: `pago provisional · ${obligacion.limite.fecha.slice(8)}/${obligacion.limite.fecha.slice(5, 7)}`,
      },
      ...reps.slice(0, 3).map((r) => ({
        fecha: r.limite,
        tipo: "limite_rep" as const,
        etiqueta: "REP 5.º natural",
      })),
    ],
  });

  // Counterparties: the OTHER side of every invoice, heaviest first.
  const porRfc = new Map<string, { rfc: string; nombre: string; total: number }>();
  for (const { comprobante: c } of cob.registros) {
    if (c.tipo !== "I") continue;
    const otro = rfc && c.emisor.rfc.toUpperCase() === rfc.toUpperCase() ? c.receptor : c.emisor;
    if (rfc && otro.rfc.toUpperCase() === rfc.toUpperCase()) continue;
    const previo = porRfc.get(otro.rfc) ?? { rfc: otro.rfc, nombre: otro.nombre, total: 0 };
    previo.total = Math.round((previo.total + c.total) * 100) / 100;
    porRfc.set(otro.rfc, previo);
  }
  const contrapartes = [...porRfc.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  return {
    mes,
    hoy,
    rfc,
    sextoDigito,
    posicion,
    obligacion,
    proyeccion,
    veredicto,
    reps,
    historico,
    marcas,
    contrapartes,
    base: {
      cfdis: cob.registros.length,
      movimientosBanco: flujo.movimientos.length,
      conciliaciones: pagosBanco.length,
    },
    coeficienteUtilidad: useCuadreStore.getState().coeficienteUtilidad,
  };
}

/**
 * Reactive gateway for the view: re-derives when any source substrate
 * changes. The view never touches foreign stores — this hook is the
 * boundary.
 */
export function useDatosCuadre(hoy: string): DatosCuadre | null {
  const registros = useCobranzaStore((s) => s.registros);
  const conciliaciones = useCobranzaStore((s) => s.conciliaciones);
  const rfcOperador = useCobranzaStore((s) => s.rfcOperador);
  const movimientos = useFlujoStore((s) => s.movimientos);
  const estados = useFlujoStore((s) => s.estados);
  const cu = useCuadreStore((s) => s.coeficienteUtilidad);
  // datosCuadre reads via getState(); the subscribed slices exist only
  // to invalidate the memo when a source substrate changes.
  return useMemo(
    () => datosCuadre(hoy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoy, registros, conciliaciones, rfcOperador, movimientos, estados, cu],
  );
}
