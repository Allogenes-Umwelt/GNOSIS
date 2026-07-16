import { z } from "zod";
import { getJson } from "@/conectores/http";
import type { Conector } from "@/types/conector";
import type { ResultadoUniversal } from "@/types/resultado";

/**
 * Frankfurter — open FX rates from the European Central Bank reference set
 * (MXN included). No key, no limits for personal use. The cambio query
 * returns the conversion, a 30-day history of the rate, and a basket of the
 * base against major currencies — enough for a full exchange dashboard.
 */

const LatestSchema = z.object({
  base: z.string(),
  date: z.string(),
  rates: z.record(z.string(), z.number()),
});

const RangoSchema = z.object({
  base: z.string(),
  rates: z.record(z.string(), z.record(z.string(), z.number())),
});

const CANASTA = ["USD", "MXN", "EUR", "GBP", "JPY", "CAD", "BRL"];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const frankfurter: Conector = {
  manifest: {
    id: "frankfurter",
    nombre: "Frankfurter",
    campo: "banca",
    acceso: "abierta",
    fuente: "https://frankfurter.dev",
    descripcion:
      "Tipos de cambio de referencia del Banco Central Europeo entre 30+ divisas (incluye MXN).",
    consultas: [
      {
        id: "cambio",
        descripcion:
          "Convierte entre dos divisas al tipo BCE más reciente, con tendencia de 30 días y una canasta de divisas.",
        parametros: [
          {
            nombre: "de",
            descripcion: "Divisa origen, código ISO 4217",
            requerido: true,
            ejemplo: "USD",
          },
          {
            nombre: "a",
            descripcion: "Divisa destino, código ISO 4217",
            requerido: true,
            ejemplo: "MXN",
          },
          {
            nombre: "cantidad",
            descripcion: "Monto a convertir (default 1)",
            requerido: false,
            ejemplo: "250",
          },
        ],
      },
    ],
  },
  async invoke(consulta, parametros) {
    if (consulta !== "cambio") {
      throw new Error(`Consulta desconocida: ${consulta}.`);
    }
    const de = (parametros.de ?? "").toUpperCase();
    const a = (parametros.a ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(de) || !/^[A-Z]{3}$/.test(a)) {
      throw new Error(
        'Faltan divisas válidas. Usa códigos ISO de 3 letras en "de" y "a".',
      );
    }
    if (de === a) {
      throw new Error("Elige dos divisas distintas.");
    }
    const cantidadNum = Number(parametros.cantidad ?? "1");
    const cantidad = Number.isFinite(cantidadNum) && cantidadNum > 0 ? cantidadNum : 1;

    // Unit rates for the target + basket in one call (amount defaults to 1).
    const symbols = [...new Set([a, ...CANASTA])].filter((c) => c !== de);
    const latest = LatestSchema.parse(
      await getJson(
        `https://api.frankfurter.dev/v1/latest?base=${de}&symbols=${symbols.join(",")}`,
      ),
    );
    const tasa = latest.rates[a];
    if (typeof tasa !== "number") {
      throw new Error(`Frankfurter no dio tipo de cambio ${de} → ${a}.`);
    }

    // 30-day history of de → a in one range call.
    const hoy = new Date();
    const desde = new Date(hoy.getTime() - 30 * 86_400_000);
    const rango = RangoSchema.parse(
      await getJson(
        `https://api.frankfurter.dev/v1/${iso(desde)}..${iso(hoy)}?base=${de}&symbols=${a}`,
      ),
    );
    const historia = Object.entries(rango.rates)
      .map(([fecha, obj]) => ({ fecha, tasa: obj[a] }))
      .filter((h) => typeof h.tasa === "number")
      .sort((x, y) => x.fecha.localeCompare(y.fecha));

    return {
      de,
      a,
      cantidad,
      tasa,
      resultado: Math.round(tasa * cantidad * 10000) / 10000,
      fecha: latest.date,
      canasta: symbols
        .map((divisa) => ({ divisa, tasa: latest.rates[divisa] }))
        .filter((x): x is { divisa: string; tasa: number } => typeof x.tasa === "number"),
      historia,
    };
  },
  presentar(datos, fuente) {
    const s = z
      .object({
        de: z.string(),
        a: z.string(),
        cantidad: z.number(),
        tasa: z.number(),
        resultado: z.number(),
        fecha: z.string(),
        canasta: z.array(z.object({ divisa: z.string(), tasa: z.number() })),
        historia: z.array(z.object({ fecha: z.string(), tasa: z.number() })),
      })
      .safeParse(datos);
    if (!s.success) return [];
    const d = s.data;
    const inversa = d.tasa ? 1 / d.tasa : 0;
    const out: ResultadoUniversal[] = [
      {
        funcion: "metrica",
        titulo: `${d.cantidad} ${d.de}`,
        unidad: d.a,
        valor: d.resultado,
        acento: true,
        decimales: 2,
        serie: [],
        laterales: [
          { etiqueta: `1 ${d.de}`, valor: d.tasa.toFixed(4), unidad: d.a },
          { etiqueta: `1 ${d.a}`, valor: inversa.toFixed(4), unidad: d.de },
          { etiqueta: "Fecha BCE", valor: d.fecha },
        ],
        fuente,
      },
    ];
    if (d.historia.length > 1) {
      out.push({
        funcion: "metrica",
        titulo: `${d.de}/${d.a} · 30 días`,
        unidad: d.a,
        valor: d.tasa,
        decimales: 4,
        serie: d.historia
          .map((h) => ({ t: Date.parse(h.fecha), v: h.tasa }))
          .filter((p) => Number.isFinite(p.t)),
        laterales: [],
        fuente,
      });
    }
    if (d.canasta.length > 0) {
      out.push({
        funcion: "comparacion",
        titulo: `1 ${d.de} en el mundo`,
        unidad: "",
        decimales: 2,
        pares: d.canasta.map((c) => ({ etiqueta: c.divisa, valor: c.tasa })),
        sujeto: d.a,
        fuente,
      });
    }
    return out;
  },
};
