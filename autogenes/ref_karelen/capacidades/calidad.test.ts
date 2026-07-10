import { describe, expect, it } from "vitest";
import { saludDelGrafo } from "@/capacidades/calidad";
import type {
  Artefacto,
  Entidad,
  Evento,
  Fragmento,
  Relacion,
  TipoOperador,
} from "@/types/autogenes";

const T = 1_700_000_000_000;

const ART: Artefacto = { id: "a1", kind: "pdf", nombre: "poliza.pdf", createdAt: T };
const FRAGS: Fragmento[] = [
  { id: "f1", artefactoId: "a1", pagina: 1, texto: "texto real", createdAt: T },
  { id: "f2", artefactoId: "a1", pagina: 2, texto: "  ", createdAt: T },
];
const TIPO: TipoOperador = {
  id: "t1",
  nombre: "Póliza",
  base: "documento",
  propiedades: [
    { clave: "vigencia", etiqueta: "Vigencia", tipo: "fecha", requerida: true },
    { clave: "nota", etiqueta: "Nota", tipo: "texto", requerida: false },
  ],
  createdAt: T,
};

function ent(parcial: Partial<Entidad> & { id: string; nombre: string }): Entidad {
  return {
    tipo: "concepto",
    origen: "operador",
    evidencia: [],
    createdAt: T,
    ...parcial,
  } as Entidad;
}

describe("saludDelGrafo (L·1)", () => {
  it("detecta cada cubeta con su detalle accionable", () => {
    const entidades: Entidad[] = [
      ent({ id: "e1", nombre: "Fantasma", origen: "synesis" }), // sin evidencia + huérfana
      ent({ id: "e2", nombre: "Aseguradora", subtipo: "t1", propiedades: {} }), // ficha incompleta
      ent({ id: "e3", nombre: "Julio" }), // nombrada por evento → no huérfana
      ent({ id: "e4", nombre: "Ligada" }), // tocada por relación → no huérfana
    ];
    const relaciones: Relacion[] = [
      {
        id: "r1",
        desdeId: "e2",
        hastaId: "e4",
        tipo: "asegura",
        peso: 0.5,
        evidencia: [],
        createdAt: T,
      },
    ];
    const eventos: Evento[] = [
      {
        id: "ev1",
        titulo: "Firma",
        fecha: "2024-01-01",
        precision: "dia",
        entidades: ["Julio"],
        evidencia: ["f1"],
        origen: "synesis",
        createdAt: T,
      },
    ];

    const s = saludDelGrafo([ART], FRAGS, entidades, relaciones, eventos, [TIPO]);

    expect(s.entidadesSinEvidencia.map((h) => h.etiqueta)).toEqual(["Fantasma"]);
    expect(s.relacionesSinCita).toBe(1);
    expect(s.fichasIncompletas[0]).toMatchObject({
      etiqueta: "Aseguradora",
      detalle: "Póliza · falta Vigencia",
    });
    expect(s.paginasMudas[0]).toMatchObject({
      etiqueta: "poliza.pdf",
      detalle: "pág 2 · sin texto",
    });
    expect(s.huerfanas.map((h) => h.etiqueta)).toEqual(["Fantasma"]);
    expect(s.total).toBe(4);
  });

  it("un grafo sano reporta cero", () => {
    const s = saludDelGrafo([], [], [], [], [], []);
    expect(s.total).toBe(0);
    expect(s.relacionesSinCita).toBe(0);
  });
});
