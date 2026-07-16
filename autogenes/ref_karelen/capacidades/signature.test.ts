import { describe, expect, it } from "vitest";
import {
  contarComponentes,
  contribucionesCentralidad,
  detectarComunidades,
  distribucionGrado,
  embeddingEspectral,
  escaleraRenorm,
  gradoNodo,
  gradoPonderado,
  matrizAdyacencia,
  ordenarPorComunidad,
  persistenciaH0,
  puentesArticulacion,
  renormalizar,
  resumenRed,
  type RedSig,
} from "@/capacidades/signature";

/** Two triangles (a,b,c) and (x,y,z) joined by one weak bridge c—x. */
function dosCliques(): RedSig {
  return {
    nodos: ["a", "b", "c", "x", "y", "z"].map((id) => ({ id, etiqueta: id })),
    enlaces: [
      { origen: "a", destino: "b", peso: 5 },
      { origen: "b", destino: "c", peso: 5 },
      { origen: "a", destino: "c", peso: 5 },
      { origen: "x", destino: "y", peso: 5 },
      { origen: "y", destino: "z", peso: 5 },
      { origen: "x", destino: "z", peso: 5 },
      { origen: "c", destino: "x", peso: 1 },
    ],
  };
}

describe("gradoPonderado", () => {
  it("sums incident edge weights and includes isolated nodes at 0", () => {
    const red: RedSig = {
      nodos: [
        { id: "a", etiqueta: "a" },
        { id: "b", etiqueta: "b" },
        { id: "solo", etiqueta: "solo" },
      ],
      enlaces: [{ origen: "a", destino: "b", peso: 3 }],
    };
    const g = gradoPonderado(red);
    expect(g.get("a")).toBe(3);
    expect(g.get("b")).toBe(3);
    expect(g.get("solo")).toBe(0);
  });
});

describe("detectarComunidades", () => {
  it("splits two cliques joined by a weak bridge into two communities", () => {
    const com = detectarComunidades(dosCliques());
    expect(com.get("a")).toBe(com.get("b"));
    expect(com.get("b")).toBe(com.get("c"));
    expect(com.get("x")).toBe(com.get("y"));
    expect(com.get("y")).toBe(com.get("z"));
    expect(com.get("a")).not.toBe(com.get("x"));
    expect(new Set(com.values()).size).toBe(2);
  });

  it("is deterministic across runs", () => {
    const a = [...detectarComunidades(dosCliques()).entries()].sort();
    const b = [...detectarComunidades(dosCliques()).entries()].sort();
    expect(a).toEqual(b);
  });

  it("labels communities densely from 0", () => {
    const com = detectarComunidades(dosCliques());
    expect(new Set(com.values())).toEqual(new Set([0, 1]));
  });
});

describe("ordenarPorComunidad", () => {
  it("keeps community members contiguous", () => {
    const red = dosCliques();
    const com = detectarComunidades(red);
    const orden = ordenarPorComunidad(red, com);
    expect(orden).toHaveLength(6);
    const comunidadSeq = orden.map((id) => com.get(id));
    // no community re-appears after a different one (contiguous blocks)
    const vistos = new Set<number>();
    let previa: number | undefined;
    for (const c of comunidadSeq) {
      if (c !== previa) {
        expect(vistos.has(c as number)).toBe(false);
        vistos.add(c as number);
        previa = c;
      }
    }
  });
});

describe("matrizAdyacencia", () => {
  it("is symmetric and places weights at ordered positions", () => {
    const red: RedSig = {
      nodos: [
        { id: "a", etiqueta: "a" },
        { id: "b", etiqueta: "b" },
      ],
      enlaces: [{ origen: "a", destino: "b", peso: 4 }],
    };
    const m = matrizAdyacencia(red, ["a", "b"]);
    expect(m).toEqual([
      [0, 4],
      [4, 0],
    ]);
  });
});

describe("contarComponentes", () => {
  it("counts disconnected islands", () => {
    const red: RedSig = {
      nodos: ["a", "b", "c"].map((id) => ({ id, etiqueta: id })),
      enlaces: [{ origen: "a", destino: "b", peso: 1 }],
    };
    expect(contarComponentes(red)).toBe(2);
  });
});

describe("renormalizar", () => {
  it("collapses communities into supernodes and aggregates the bridge", () => {
    const red = dosCliques();
    const coarse = renormalizar(red);
    expect(coarse.nodos).toHaveLength(2);
    // the single weak bridge survives as one inter-community edge
    expect(coarse.enlaces).toHaveLength(1);
    expect(coarse.enlaces[0].peso).toBe(1);
    // each supernode carries three members' mass
    expect(coarse.nodos.every((n) => n.peso === 3)).toBe(true);
  });

  it("drops intra-community edges", () => {
    const red = dosCliques();
    const coarse = renormalizar(red);
    // no self loops
    expect(coarse.enlaces.every((e) => e.origen !== e.destino)).toBe(true);
  });
});

describe("escaleraRenorm", () => {
  it("starts at the raw net and coarsens monotonically", () => {
    const red = dosCliques();
    const escalera = escaleraRenorm(red);
    expect(escalera[0]).toBe(red);
    for (let i = 1; i < escalera.length; i++) {
      expect(escalera[i].nodos.length).toBeLessThan(escalera[i - 1].nodos.length);
    }
  });

  it("stops instead of looping on a trivial net", () => {
    const red: RedSig = {
      nodos: [{ id: "a", etiqueta: "a" }],
      enlaces: [],
    };
    expect(escaleraRenorm(red)).toHaveLength(1);
  });
});

describe("gradoNodo", () => {
  it("counts distinct neighbours, ignoring weight", () => {
    const red: RedSig = {
      nodos: ["a", "b", "c"].map((id) => ({ id, etiqueta: id })),
      enlaces: [
        { origen: "a", destino: "b", peso: 9 },
        { origen: "a", destino: "c", peso: 1 },
      ],
    };
    const g = gradoNodo(red);
    expect(g.get("a")).toBe(2);
    expect(g.get("b")).toBe(1);
  });
});

describe("distribucionGrado", () => {
  it("ranks nodes by degree and fits an exponent on a hub-and-spoke star", () => {
    // star: centre linked to 4 leaves → very scale-free
    const red: RedSig = {
      nodos: ["c", "l1", "l2", "l3", "l4"].map((id) => ({ id, etiqueta: id })),
      enlaces: [
        { origen: "c", destino: "l1", peso: 1 },
        { origen: "c", destino: "l2", peso: 1 },
        { origen: "c", destino: "l3", peso: 1 },
        { origen: "c", destino: "l4", peso: 1 },
      ],
    };
    const d = distribucionGrado(red);
    expect(d.rankSize[0].id).toBe("c");
    expect(d.gradoMax).toBe(4);
    expect(d.exponente).not.toBeNull();
    expect(d.exponente as number).toBeGreaterThan(0);
  });
});

describe("persistenciaH0", () => {
  it("gives one bar per node, survivors dying at 0, cross-checked with components", () => {
    const red = dosCliques();
    const per = persistenciaH0(red);
    expect(per.barras).toHaveLength(6); // one per node
    expect(per.nComponentes).toBe(contarComponentes(red));
    // exactly nComponentes bars live to 0
    expect(per.barras.filter((b) => b.muerte === 0)).toHaveLength(per.nComponentes);
    // sorted most-persistent first (ascending death)
    for (let i = 1; i < per.barras.length; i++) {
      expect(per.barras[i].muerte).toBeGreaterThanOrEqual(per.barras[i - 1].muerte);
    }
  });
});

describe("embeddingEspectral", () => {
  it("is deterministic and places every node", () => {
    const a = embeddingEspectral(dosCliques());
    const b = embeddingEspectral(dosCliques());
    expect(a.size).toBe(6);
    for (const [id, p] of a) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(b.get(id)).toEqual(p);
    }
  });

  it("separates two cliques along the Fiedler axis", () => {
    const pos = embeddingEspectral(dosCliques());
    const media = (ids: string[]) =>
      ids.reduce((s, id) => s + (pos.get(id)?.x ?? 0), 0) / ids.length;
    const mA = media(["a", "b", "c"]);
    const mX = media(["x", "y", "z"]);
    expect(Math.abs(mA - mX)).toBeGreaterThan(0.05);
  });
});

describe("resumenRed", () => {
  it("reports verifiable structural facts", () => {
    const red = dosCliques();
    const r = resumenRed(red);
    expect(r.nNodos).toBe(6);
    expect(r.nEnlaces).toBe(7);
    expect(r.nComunidades).toBe(2);
    expect(r.nComponentes).toBe(1);
    expect(r.comunidadMayor).toBe(3);
    expect(r.hubs.length).toBeGreaterThan(0);
    expect(r.densidad).toBeGreaterThan(0);
    expect(r.densidad).toBeLessThanOrEqual(1);
  });
});

describe("puentes de articulación (H2)", () => {
  it("detecta el nodo que parte la red en dos", () => {
    // a-b-c: b es punto de articulación; en un triángulo no hay ninguno.
    const barra: RedSig = {
      nodos: [
        { id: "a", etiqueta: "A" },
        { id: "b", etiqueta: "B" },
        { id: "c", etiqueta: "C" },
      ],
      enlaces: [
        { origen: "a", destino: "b", peso: 1 },
        { origen: "b", destino: "c", peso: 1 },
      ],
    };
    expect(puentesArticulacion(barra)).toEqual(["b"]);

    const triangulo: RedSig = {
      ...barra,
      enlaces: [...barra.enlaces, { origen: "a", destino: "c", peso: 1 }],
    };
    expect(puentesArticulacion(triangulo)).toEqual([]);
  });

  it("resumenRed expone exponente y puentes etiquetados", () => {
    const red: RedSig = {
      nodos: [
        { id: "hub", etiqueta: "Centro" },
        { id: "x", etiqueta: "X" },
        { id: "y", etiqueta: "Y" },
        { id: "z", etiqueta: "Z" },
      ],
      enlaces: [
        { origen: "hub", destino: "x", peso: 1 },
        { origen: "hub", destino: "y", peso: 1 },
        { origen: "hub", destino: "z", peso: 1 },
      ],
    };
    const r = resumenRed(red);
    expect(r.puentes.map((p) => p.etiqueta)).toEqual(["Centro"]);
    // exponente puede ser null con pocos puntos — pero el campo existe.
    expect("exponente" in r).toBe(true);
  });
});

describe("contribucionesCentralidad (M2)", () => {
  const estrella: RedSig = {
    nodos: [
      { id: "sol", etiqueta: "Sol" },
      { id: "a", etiqueta: "A" },
      { id: "b", etiqueta: "B" },
      { id: "c", etiqueta: "C" },
      { id: "d", etiqueta: "D" },
    ],
    enlaces: ["a", "b", "c", "d"].map((id) => ({
      origen: "sol",
      destino: id,
      peso: 1,
    })),
  };

  it("explica una hoja por su único vecino: el sol con masa 1", () => {
    const aportes = contribucionesCentralidad(estrella, "a");
    expect(aportes).toHaveLength(1);
    expect(aportes[0].id).toBe("sol");
    expect(aportes[0].masa).toBeCloseTo(1, 5);
  });

  it("recorta al top pedido con desempate determinista por id", () => {
    const aportes = contribucionesCentralidad(estrella, "sol", 3);
    expect(aportes.map((x) => x.id)).toEqual(["a", "b", "c"]);
    // Cada hoja aporta peso 1 × masa 0.5 (teoría exacta de la estrella).
    for (const x of aportes) expect(x.aporte).toBeCloseTo(0.5, 5);
  });

  it("un nodo aislado no tiene aportes", () => {
    const red: RedSig = {
      nodos: [
        { id: "solo", etiqueta: "Solo" },
        { id: "a", etiqueta: "A" },
        { id: "b", etiqueta: "B" },
      ],
      enlaces: [{ origen: "a", destino: "b", peso: 1 }],
    };
    expect(contribucionesCentralidad(red, "solo")).toEqual([]);
  });
});
