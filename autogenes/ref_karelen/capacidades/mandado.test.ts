import { describe, expect, it } from "vitest";
import {
  compararTiendas,
  distanciaKm,
  rangosPorProducto,
  veredictoMandado,
} from "@/capacidades/mandado";
import { parsearCsvQqp } from "@/lib/qqp/parse";

const CSV = [
  "PRODUCTO,PRESENTACION,MARCA,CATEGORIA,CATALOGO,PRECIO,FECHAREGISTRO,CADENACOMERCIAL,GIRO,NOMBRECOMERCIAL,DIRECCION,ESTADO,MUNICIPIO,LATITUD,LONGITUD",
  'LECHE ULTRAPASTEURIZADA,1 LT,LALA,LACTEOS,BASICOS,24.50,2026-06-29 00:00:00.000,CHEDRAUI,SUPERMERCADO,CHEDRAUI POLANCO,"AV EJERCITO 843, POLANCO",CIUDAD DE MEXICO,MIGUEL HIDALGO,19.4400,-99.2000',
  "LECHE ULTRAPASTEURIZADA,1 LT,LALA,LACTEOS,BASICOS,31.00,2026-06-29 00:00:00.000,OXXO,TIENDA,OXXO HORACIO,CALLE HORACIO 120,CIUDAD DE MEXICO,MIGUEL HIDALGO,19.4380,-99.1950",
  "PARACETAMOL 500 MG 10 TABS,CAJA,GENERICO,MEDICAMENTOS,SALUD,18.00,2026-06-28 00:00:00.000,F. DEL AHORRO,FARMACIA,FARMACIA DEL AHORRO POLANCO,AV HORACIO 200,CIUDAD DE MEXICO,MIGUEL HIDALGO,19.4390,-99.1960",
  "PARACETAMOL 500 MG 10 TABS,CAJA,GENERICO,MEDICAMENTOS,SALUD,35.50,2026-06-28 00:00:00.000,CHEDRAUI,SUPERMERCADO,CHEDRAUI POLANCO,\"AV EJERCITO 843, POLANCO\",CIUDAD DE MEXICO,MIGUEL HIDALGO,19.4400,-99.2000",
  "HUEVO BLANCO,18 PZAS,SAN JUAN,HUEVO,BASICOS,52.00,2026-06-29 00:00:00.000,CHEDRAUI,SUPERMERCADO,CHEDRAUI POLANCO,\"AV EJERCITO 843, POLANCO\",CIUDAD DE MEXICO,MIGUEL HIDALGO,19.4400,-99.2000",
  "HUEVO BLANCO,18 PZAS,SAN JUAN,HUEVO,BASICOS,49.90,2026-06-22 00:00:00.000,CHEDRAUI,SUPERMERCADO,CHEDRAUI POLANCO,\"AV EJERCITO 843, POLANCO\",CIUDAD DE MEXICO,MIGUEL HIDALGO,19.4400,-99.2000",
  "LECHE DESLACTOSADA,1 LT,ALPURA,LACTEOS,BASICOS,0,2026-06-29 00:00:00.000,SORIANA,SUPERMERCADO,SORIANA ANZURES,AV MELCHOR 30,CIUDAD DE MEXICO,MIGUEL HIDALGO,19.4300,-99.1800",
  "",
].join("\n");

const AQUI = { lat: 19.4384, lon: -99.196 };
const LISTA = ["leche", "paracetamol", "huevo"];

describe("parsearCsvQqp", () => {
  it("parses, filters by list terms, drops zero-price rows honestly", () => {
    const r = parsearCsvQqp(CSV, LISTA);
    expect(r.total).toBe(7);
    expect(r.registros).toHaveLength(6); // zero-price deslactosada dropped
    expect(r.descartados).toBe(1);
    expect(r.registros[0].direccion).toBe("AV EJERCITO 843, POLANCO");
    expect(r.registros[0].fecha).toBe("2026-06-29");
  });

  it("fails loudly on a foreign format", () => {
    expect(() => parsearCsvQqp("a,b,c\n1,2,3")).toThrow(/formato QQP/);
  });
});

describe("compararTiendas + veredicto", () => {
  const registros = parsearCsvQqp(CSV, LISTA).registros;

  it("ranks by coverage, then basket, and measures distance", () => {
    const tiendas = compararTiendas(registros, LISTA, AQUI, 5);
    // Chedraui covers 3/3; Oxxo 1/3; Farmacia 1/3.
    expect(tiendas[0].tienda).toBe("CHEDRAUI POLANCO");
    expect(tiendas[0].cubre).toBe(3);
    // Cheapest surveyed egg row wins within the store (49.90).
    expect(tiendas[0].totalCanasta).toBe(24.5 + 35.5 + 49.9);
    expect(tiendas[0].faltantes).toHaveLength(0);
    expect(tiendas[0].distanciaKm).not.toBeNull();
    const oxxo = tiendas.find((t) => t.tienda === "OXXO HORACIO");
    expect(oxxo?.faltantes).toEqual(["paracetamol", "huevo"]);
  });

  it("radius filter excludes far stores", () => {
    const lejos = compararTiendas(registros, LISTA, { lat: 20.7, lon: -103.4 }, 5);
    expect(lejos).toHaveLength(0);
  });

  it("verdict never compares baskets of different coverage", () => {
    const tiendas = compararTiendas(registros, LISTA, AQUI, 5);
    const v = veredictoMandado(tiendas, LISTA.length);
    expect(v.aplica).toBe(true);
    expect(v.mejor?.tienda).toBe("CHEDRAUI POLANCO");
    // Only one store covers 3/3 → no savings claim invented.
    expect(v.ahorro).toBeNull();
    expect(v.sentencia).toMatch(/sin otra tienda comparable/);
  });
});

describe("rangosPorProducto", () => {
  it("finds min/max per term and flags missing sampling", () => {
    const registros = parsearCsvQqp(CSV, LISTA).registros;
    const tiendas = compararTiendas(registros, LISTA, AQUI, 5);
    const rangos = rangosPorProducto(tiendas, [...LISTA, "aguacate"]);
    const leche = rangos.find((r) => r.termino === "leche");
    expect(leche?.minimo.precio).toBe(24.5);
    expect(leche?.maximo.precio).toBe(31);
    expect(leche?.brecha).toBeCloseTo(0.27, 2);
    const paracetamol = rangos.find((r) => r.termino === "paracetamol");
    expect(paracetamol?.minimo.tienda).toBe("FARMACIA DEL AHORRO POLANCO");
    expect(rangos.find((r) => r.termino === "aguacate")?.sinMuestreo).toBe(true);
  });
});

describe("distanciaKm", () => {
  it("computes plausible city distances", () => {
    const d = distanciaKm(AQUI, { lat: 19.44, lon: -99.2 });
    expect(d).toBeGreaterThan(0.3);
    expect(d).toBeLessThan(0.7);
  });
});
