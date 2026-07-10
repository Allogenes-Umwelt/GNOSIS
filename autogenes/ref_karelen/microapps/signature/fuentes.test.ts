import { describe, expect, it } from "vitest";
import {
  combinarRedes,
  entradasDeProductos,
  redDesdeAutogenes,
  redDesdeDatos,
  redDesdeFuentes,
  redDesdeLotes,
} from "@/microapps/signature/fuentes";
import type { Producto } from "@/types/autogenes";
import type { Datum } from "@/types/datum";
import type { Entidad, Relacion } from "@/types/autogenes";
import type { FuenteItem } from "@/store/qualia";

function item(
  etiqueta: string,
  valor: string,
  lote: string,
  id = `${lote}-${etiqueta}`,
): FuenteItem {
  return { id, etiqueta, valor, lote, origen: "propia", createdAt: 1 };
}

function entidad(id: string, nombre: string): Entidad {
  return {
    id,
    nombre,
    tipo: "otro",
    origen: "operador",
    evidencia: [],
    createdAt: 1,
  };
}

function relacion(desdeId: string, hastaId: string, peso = 0.5): Relacion {
  return {
    id: `${desdeId}-${hastaId}`,
    desdeId,
    hastaId,
    tipo: "relacionado",
    peso,
    evidencia: [],
    createdAt: 1,
  };
}

function datum(
  campo: Datum["campo"],
  etiqueta: string,
  valor: string,
  id = `${campo}-${etiqueta}-${valor}`,
): Datum {
  return { id, campo, etiqueta, valor, createdAt: 1 };
}

describe("redDesdeDatos", () => {
  it("makes one node per distinct etiqueta, case-insensitive", () => {
    const red = redDesdeDatos([
      datum("fiscal", "RFC", "AAA010101AAA"),
      datum("fiscal", "rfc", "BBB020202BBB", "d2"),
    ]);
    expect(red.nodos).toHaveLength(1);
    expect(red.nodos[0].etiqueta).toBe("RFC");
    expect(red.nodos[0].peso).toBe(2);
  });

  it("links labels that share a campo", () => {
    const red = redDesdeDatos([
      datum("fiscal", "RFC", "x"),
      datum("fiscal", "Régimen", "y"),
    ]);
    expect(red.nodos).toHaveLength(2);
    expect(red.enlaces).toHaveLength(1);
    expect(red.enlaces[0].peso).toBe(1);
  });

  it("weights a shared value more than a shared campo", () => {
    const soloCampo = redDesdeDatos([
      datum("fiscal", "A", "1"),
      datum("fiscal", "B", "2"),
    ]);
    const compartenValor = redDesdeDatos([
      datum("fiscal", "A", "MISMO"),
      datum("legal", "B", "MISMO"),
    ]);
    expect(soloCampo.enlaces[0].peso).toBe(1);
    expect(compartenValor.enlaces[0].peso).toBe(2);
  });

  it("is deterministic and sorted", () => {
    const datos = [
      datum("legal", "Z", "1"),
      datum("fiscal", "A", "1"),
      datum("fiscal", "M", "2"),
    ];
    const a = redDesdeDatos(datos);
    const b = redDesdeDatos(datos);
    expect(a).toEqual(b);
    const ids = a.nodos.map((n) => n.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("ignores blank labels and yields an isolated node when nothing links", () => {
    const red = redDesdeDatos([
      datum("fiscal", "  ", "x"),
      datum("salud", "Solo", "y"),
    ]);
    expect(red.nodos).toHaveLength(1);
    expect(red.enlaces).toHaveLength(0);
  });

  it("returns an empty net for empty input", () => {
    expect(redDesdeDatos([])).toEqual({ nodos: [], enlaces: [] });
  });

  it("keeps endpoints intact for labels containing spaces", () => {
    const red = redDesdeDatos([
      datum("fiscal", "fecha de pago", "1"),
      datum("fiscal", "monto total", "1"),
    ]);
    expect(red.enlaces).toHaveLength(1);
    expect(red.enlaces[0].origen).toBe("fecha de pago");
    expect(red.enlaces[0].destino).toBe("monto total");
  });
});

describe("redDesdeFuentes", () => {
  it("links concepts that arrived in the same batch", () => {
    const red = redDesdeFuentes([
      item("RFC", "x", "L1"),
      item("Régimen", "y", "L1"),
    ]);
    expect(red.nodos).toHaveLength(2);
    expect(red.enlaces).toHaveLength(1);
    expect(red.enlaces[0].peso).toBe(1);
  });

  it("links across batches through a shared value, more strongly", () => {
    const red = redDesdeFuentes([
      item("A", "MISMO", "L1"),
      item("B", "MISMO", "L2"),
    ]);
    expect(red.enlaces).toHaveLength(1);
    expect(red.enlaces[0].peso).toBe(2);
  });

  it("keeps endpoints intact for labels with spaces", () => {
    const red = redDesdeFuentes([
      item("fecha de pago", "1", "L1"),
      item("monto total", "2", "L1"),
    ]);
    expect(red.enlaces[0].origen).toBe("fecha de pago");
    expect(red.enlaces[0].destino).toBe("monto total");
  });
});

describe("redDesdeLotes", () => {
  it("cliques a batch and fuses shared values into hubs", () => {
    const red = redDesdeLotes([
      [
        { etiqueta: "A", valor: "A" },
        { etiqueta: "Hub", valor: "Hub" },
      ],
      [
        { etiqueta: "B", valor: "B" },
        { etiqueta: "Hub", valor: "Hub" },
      ],
    ]);
    expect(red.nodos.map((n) => n.id).sort()).toEqual(["a", "b", "hub"]);
    // Hub links to both A and B (same node reused across batches)
    const endpoints = new Set(red.enlaces.flatMap((e) => [e.origen, e.destino]));
    expect(endpoints.has("hub")).toBe(true);
    expect(red.enlaces).toHaveLength(2);
  });
});

describe("entradasDeProductos", () => {
  function producto(
    titulo: string,
    unidad: string,
    entidades: string[] = [],
  ): Producto {
    return {
      id: `p-${titulo}`,
      clase: "informe",
      titulo,
      unidad,
      cuerpo: null,
      entidades,
      evidencia: [],
      createdAt: 1,
    };
  }

  it("batches each product with its title, class, unit and cited entities", () => {
    const lotes = entradasDeProductos(
      [producto("Informe A", "sintesis", ["e1"])],
      [{ id: "e1", nombre: "Ana", tipo: "persona", origen: "operador", evidencia: [], createdAt: 1 }],
    );
    expect(lotes).toHaveLength(1);
    expect(lotes[0].map((e) => e.etiqueta)).toEqual([
      "Informe A",
      "informe",
      "sintesis",
      "Ana",
    ]);
  });

  it("links products that cite the same entity via redDesdeLotes", () => {
    const ents = [
      { id: "e1", nombre: "Ana", tipo: "persona" as const, origen: "operador" as const, evidencia: [], createdAt: 1 },
    ];
    const red = redDesdeLotes(
      entradasDeProductos(
        [producto("Uno", "radar", ["e1"]), producto("Dos", "vinculos", ["e1"])],
        ents,
      ),
    );
    expect(red.nodos.some((n) => n.etiqueta === "Ana")).toBe(true);
    // "Ana" is shared, so it connects both products' batches
    const ana = red.nodos.find((n) => n.etiqueta === "Ana");
    expect(ana).toBeDefined();
  });
});

describe("redDesdeAutogenes", () => {
  it("projects entities as nodes and relations as edges", () => {
    const red = redDesdeAutogenes(
      [entidad("e1", "Ana"), entidad("e2", "Beto")],
      [relacion("e1", "e2", 0.8)],
    );
    expect(red.nodos.map((n) => n.etiqueta)).toEqual(["Ana", "Beto"]);
    expect(red.enlaces).toHaveLength(1);
    expect(red.enlaces[0].peso).toBeCloseTo(0.8);
  });

  it("drops relations whose endpoints are missing and floors weight", () => {
    const red = redDesdeAutogenes(
      [entidad("e1", "Ana"), entidad("e2", "Beto")],
      [relacion("e1", "fantasma"), relacion("e1", "e2", 0)],
    );
    expect(red.enlaces).toHaveLength(1);
    expect(red.enlaces[0].peso).toBeGreaterThan(0);
  });
});

describe("combinarRedes", () => {
  it("namespaces node ids by source and keeps sources separate", () => {
    const datos = redDesdeDatos([
      datum("fiscal", "RFC", "x"),
      datum("fiscal", "Régimen", "x"),
    ]);
    const grafo = redDesdeAutogenes(
      [entidad("rfc", "RFC")],
      [],
    );
    const combinada = combinarRedes([
      { clave: "datos", red: datos },
      { clave: "autogenes", red: grafo },
    ]);
    expect(combinada.nodos).toHaveLength(3);
    expect(combinada.nodos.every((n) => /^(datos|autogenes)::/.test(n.id))).toBe(true);
    // datos edge survives; no accidental merge across sources
    expect(combinada.enlaces).toHaveLength(1);
    expect(combinada.enlaces[0].origen.startsWith("datos::")).toBe(true);
  });

  it("returns an empty net when no sources are active", () => {
    expect(combinarRedes([])).toEqual({ nodos: [], enlaces: [] });
  });
});

describe("seriesDeConectores (N2)", () => {
  it("agrupa por etiqueta, ordena por fecha y exige seis puntos numéricos", async () => {
    const { seriesDeConectores } = await import("@/microapps/signature/fuentes");
    const item = (etiqueta: string, valor: string, t: number, origen: "conector" | "propia" = "conector") => ({
      id: `${etiqueta}-${t}`,
      etiqueta,
      valor,
      lote: `l${t}`,
      origen,
      createdAt: t,
    });
    const fuentes = [
      // FIX: six numeric points, deliberately out of order.
      item("FIX", "18.6", 6),
      item("FIX", "18.1", 1),
      item("FIX", "18.2", 2),
      item("FIX", "18.3", 3),
      item("FIX", "18.4", 4),
      item("FIX", "18.5", 5),
      // Too short.
      item("UDI", "8.1", 1),
      // Non-numeric never counts.
      item("Nota", "sin numero", 1),
      // Operator-loaded sources never count.
      item("FIX", "99", 7, "propia"),
    ];
    const series = seriesDeConectores(fuentes);
    expect(series).toHaveLength(1);
    expect(series[0].etiqueta).toBe("FIX");
    expect(series[0].valores).toEqual([18.1, 18.2, 18.3, 18.4, 18.5, 18.6]);
  });
});

describe("aplicarFusiones (N3)", () => {
  it("proyecta la etiqueta fusionada sin tocar el resto", async () => {
    const { aplicarFusiones } = await import("@/microapps/signature/fuentes");
    const items = [
      { id: "1", etiqueta: "renta mensual", valor: "9000", lote: "a", origen: "propia" as const, createdAt: 1 },
      { id: "2", etiqueta: "Notario", valor: "N7", lote: "a", origen: "propia" as const, createdAt: 2 },
    ];
    const salida = aplicarFusiones(items, { "renta mensual": "Renta" });
    expect(salida[0].etiqueta).toBe("Renta");
    expect(salida[1].etiqueta).toBe("Notario");
    // Pure: the input list is untouched.
    expect(items[0].etiqueta).toBe("renta mensual");
  });

  it("sin fusiones devuelve la misma lista", async () => {
    const { aplicarFusiones } = await import("@/microapps/signature/fuentes");
    const items = [
      { id: "1", etiqueta: "X", valor: "1", lote: "a", origen: "propia" as const, createdAt: 1 },
    ];
    expect(aplicarFusiones(items, {})).toBe(items);
  });
});
