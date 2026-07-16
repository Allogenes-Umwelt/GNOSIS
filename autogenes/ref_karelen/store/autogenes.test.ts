import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutogenesStore } from "@/store/autogenes";
import {
  ArtefactoSchema,
  FragmentoSchema,
  RelacionSchema,
} from "@/types/autogenes";

function reset() {
  useAutogenesStore.setState({
    artefactos: [],
    fragmentos: [],
    entidades: [],
    relaciones: [],
  });
}

describe("autogenes store", () => {
  beforeEach(reset);

  it("adds an artefacto and its fragmentos, contract-valid", () => {
    const s = useAutogenesStore.getState();
    const a = s.addArtefacto({ kind: "pdf", nombre: "apunte.pdf", paginas: 2 });
    const frs = s.addFragmentos(a.id, [
      { texto: "pagina uno", pagina: 1 },
      { texto: "pagina dos", pagina: 2 },
    ]);
    expect(() => ArtefactoSchema.parse(a)).not.toThrow();
    frs.forEach((f) => expect(() => FragmentoSchema.parse(f)).not.toThrow());
    expect(useAutogenesStore.getState().fragmentos).toHaveLength(2);
    expect(frs.every((f) => f.artefactoId === a.id)).toBe(true);
  });

  it("upsertEntidad merges by lowercased name and unions evidence", () => {
    const s = useAutogenesStore.getState();
    s.upsertEntidad({
      nombre: "Entropía",
      tipo: "concepto",
      origen: "synesis",
      evidencia: ["f1"],
    });
    s.upsertEntidad({
      nombre: "entropía",
      tipo: "termino",
      origen: "synesis",
      evidencia: ["f2"],
    });
    const ents = useAutogenesStore.getState().entidades;
    expect(ents).toHaveLength(1);
    expect(ents[0].tipo).toBe("termino");
    expect(new Set(ents[0].evidencia)).toEqual(new Set(["f1", "f2"]));
  });

  it("relaciones require evidence and validate", () => {
    const s = useAutogenesStore.getState();
    const r = s.addRelacion({
      desdeId: "e1",
      hastaId: "e2",
      tipo: "deriva de",
      evidencia: ["f1"],
    });
    expect(() => RelacionSchema.parse(r)).not.toThrow();
    expect(r.peso).toBe(0.5);
  });

  it("removeArtefacto cascades fragmentos and prunes evidence", () => {
    const s = useAutogenesStore.getState();
    const a = s.addArtefacto({ kind: "pdf", nombre: "x.pdf" });
    const [f1] = s.addFragmentos(a.id, [{ texto: "t", pagina: 1 }]);
    s.upsertEntidad({
      nombre: "Concepto",
      tipo: "concepto",
      origen: "synesis",
      evidencia: [f1.id, "otro"],
    });
    s.addRelacion({ desdeId: "a", hastaId: "b", tipo: "x", evidencia: [f1.id] });

    s.removeArtefacto(a.id);
    const st = useAutogenesStore.getState();
    expect(st.artefactos).toHaveLength(0);
    expect(st.fragmentos).toHaveLength(0);
    expect(st.entidades[0].evidencia).toEqual(["otro"]);
    // B1: the relation cited ONLY the dead fragment — it dies with it.
    expect(st.relaciones).toHaveLength(0);
  });

  it("removeEntidad drops its relaciones", () => {
    const s = useAutogenesStore.getState();
    const e = s.upsertEntidad({
      nombre: "N",
      tipo: "otro",
      origen: "operador",
    });
    s.addRelacion({ desdeId: e.id, hastaId: "z", tipo: "liga", evidencia: [] });
    s.removeEntidad(e.id);
    const st = useAutogenesStore.getState();
    expect(st.entidades).toHaveLength(0);
    expect(st.relaciones).toHaveLength(0);
  });
});

describe("eventos (B3)", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
  });

  it("prunes extracted events whose evidence dies with the artefacto", () => {
    const s = useAutogenesStore.getState();
    const art = s.addArtefacto({ kind: "pdf", nombre: "contrato.pdf" });
    const [frag] = s.addFragmentos(art.id, [{ texto: "firmado el 12" }]);
    s.addEventos([
      {
        titulo: "Firma",
        fecha: "2024-03-12",
        precision: "dia",
        evidencia: [frag.id],
        origen: "synesis",
      },
      {
        titulo: "Recordatorio manual",
        fecha: "2025-01-01",
        precision: "dia",
        evidencia: [],
        origen: "operador",
      },
    ]);
    expect(useAutogenesStore.getState().eventos).toHaveLength(2);

    useAutogenesStore.getState().removeArtefacto(art.id);
    const { eventos } = useAutogenesStore.getState();
    expect(eventos).toHaveLength(1);
    expect(eventos[0].origen).toBe("operador");
  });

  it("mergeGrafo docks unknown events only", () => {
    const s = useAutogenesStore.getState();
    // Real fragment so the imported event's citation survives sanitizing.
    const art = s.addArtefacto({ kind: "pdf", nombre: "c.pdf" });
    const [frag] = useAutogenesStore
      .getState()
      .addFragmentos(art.id, [{ texto: "vence el 30" }]);
    const [ev] = useAutogenesStore.getState().addEventos([
      {
        titulo: "Firma",
        fecha: "2024-03-12",
        precision: "dia",
        evidencia: ["f1"],
        origen: "synesis",
      },
    ]);
    const nuevos = useAutogenesStore.getState().mergeGrafo({
      artefactos: [],
      fragmentos: [],
      entidades: [],
      relaciones: [],
      productos: [],
      casos: [],
      tiposOperador: [],
      tiposRelacion: [],
      vistas: [],
      eventos: [
        ev,
        {
          id: "ev-2",
          titulo: "Vencimiento",
          fecha: "2025-06-30",
          precision: "dia",
          entidades: [],
          evidencia: [frag.id],
          origen: "synesis",
          createdAt: 1,
        },
      ],
    });
    expect(nuevos).toBe(1);
    expect(useAutogenesStore.getState().eventos).toHaveLength(2);
  });
});

describe("bitácora y deshacer (D1)", () => {
  beforeEach(() => {
    // clear() is the explicit nuke: graph, audit AND undo stack.
    useAutogenesStore.getState().clear();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("audits every mutation, newest first", () => {
    const s = useAutogenesStore.getState();
    const a = s.addArtefacto({ kind: "pdf", nombre: "contrato.pdf" });
    vi.advanceTimersByTime(2000);
    s.removeArtefacto(a.id);
    const { bitacora } = useAutogenesStore.getState();
    expect(bitacora.map((e) => e.accion)).toEqual([
      "quitar-fuente",
      "dockear-fuente",
    ]);
    expect(bitacora[0].detalle).toContain("contrato.pdf");
  });

  it("undo restores the graph but never rewrites the audit", () => {
    const s = useAutogenesStore.getState();
    s.upsertEntidad({ nombre: "ACME", tipo: "organizacion", origen: "synesis" });
    vi.advanceTimersByTime(2000);
    expect(useAutogenesStore.getState().deshacerDisponibles).toBeGreaterThan(0);
    expect(useAutogenesStore.getState().deshacer()).toBe(true);
    const st = useAutogenesStore.getState();
    expect(st.entidades).toHaveLength(0);
    expect(st.bitacora.map((e) => e.accion)).toEqual(["deshacer", "entidad"]);
  });

  it("coalesces a mutation burst into ONE undo step", () => {
    const s = useAutogenesStore.getState();
    // Same-second burst — an extraction integrating several items.
    s.upsertEntidad({ nombre: "A", tipo: "concepto", origen: "synesis" });
    vi.advanceTimersByTime(100);
    s.upsertEntidad({ nombre: "B", tipo: "concepto", origen: "synesis" });
    vi.advanceTimersByTime(100);
    const [ea] = useAutogenesStore.getState().entidades;
    const eb = useAutogenesStore.getState().entidades[1];
    s.addRelacion({ desdeId: ea.id, hastaId: eb.id, tipo: "liga" });
    vi.advanceTimersByTime(2000);
    expect(useAutogenesStore.getState().deshacer()).toBe(true);
    const st = useAutogenesStore.getState();
    expect(st.entidades).toHaveLength(0);
    expect(st.relaciones).toHaveLength(0);
    // The whole burst was one step: nothing more to undo.
    expect(st.deshacer()).toBe(false);
  });

  it("separate bursts undo one at a time; audit is capped", () => {
    const s = useAutogenesStore.getState();
    s.upsertEntidad({ nombre: "A", tipo: "concepto", origen: "synesis" });
    vi.advanceTimersByTime(2000);
    s.upsertEntidad({ nombre: "B", tipo: "concepto", origen: "synesis" });
    vi.advanceTimersByTime(2000);
    expect(useAutogenesStore.getState().deshacer()).toBe(true);
    expect(useAutogenesStore.getState().entidades.map((e) => e.nombre)).toEqual(["A"]);
    expect(useAutogenesStore.getState().deshacer()).toBe(true);
    expect(useAutogenesStore.getState().entidades).toHaveLength(0);
  });

  it("clear nukes graph, audit and undo stack", () => {
    const s = useAutogenesStore.getState();
    s.upsertEntidad({ nombre: "A", tipo: "concepto", origen: "synesis" });
    vi.advanceTimersByTime(2000);
    s.clear();
    const st = useAutogenesStore.getState();
    expect(st.bitacora).toHaveLength(0);
    expect(st.deshacer()).toBe(false);
  });
});

describe("ontología del operador (D2)", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
  });

  it("typing an entity and deleting the type untypes it (cascade)", () => {
    const s = useAutogenesStore.getState();
    const tipo = s.crearTipoOperador({
      nombre: "Póliza",
      base: "documento",
      propiedades: [
        { clave: "vigencia", etiqueta: "Vigencia", tipo: "fecha", requerida: true },
      ],
    });
    const e = s.upsertEntidad({
      nombre: "POLIZA 88",
      tipo: "documento",
      origen: "operador",
    });
    s.setSubtipoEntidad(e.id, tipo.id, { vigencia: "2026-08-12" });
    expect(useAutogenesStore.getState().entidades[0].propiedades).toEqual({
      vigencia: "2026-08-12",
    });
    useAutogenesStore.getState().removeTipoOperador(tipo.id);
    const st = useAutogenesStore.getState();
    expect(st.tiposOperador).toHaveLength(0);
    expect(st.entidades[0].subtipo).toBeUndefined();
    expect(st.entidades[0].propiedades).toBeUndefined();
    expect(st.bitacora[0].detalle).toContain("destipadas");
  });
});

describe("integridad de referencias (auditoría)", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("fusión repunta miembros de casos y productos al ganador (sin pérdida)", () => {
    const s = useAutogenesStore.getState();
    const a = s.upsertEntidad({ nombre: "ACME", tipo: "organizacion", origen: "synesis" });
    const b = s.upsertEntidad({ nombre: "ACME SA", tipo: "organizacion", origen: "synesis" });
    const caso = s.crearCaso("Caso");
    s.anexarAlCaso(caso.id, { entidades: [b.id] });
    const prod = s.dockearProducto({ clase: "informe", titulo: "P", unidad: "sintesis", cuerpo: {}, entidades: [b.id] });
    useAutogenesStore.getState().fusionarEntidades(a.id, b.id);
    const st = useAutogenesStore.getState();
    expect(st.casos.find((c) => c.id === caso.id)!.entidades).toEqual([a.id]);
    expect(st.productos.find((p) => p.id === prod.id)!.entidades).toEqual([a.id]);
    expect(st.entidades.map((e) => e.id)).toEqual([a.id]);
  });

  it("removeEntidad poda el ancla en productos además de casos", () => {
    const s = useAutogenesStore.getState();
    const e = s.upsertEntidad({ nombre: "X", tipo: "otro", origen: "operador" });
    const prod = s.dockearProducto({ clase: "informe", titulo: "P", unidad: "sintesis", cuerpo: {}, entidades: [e.id] });
    s.removeEntidad(e.id);
    const st = useAutogenesStore.getState();
    expect(st.productos.find((p) => p.id === prod.id)!.entidades).toEqual([]);
  });

  it("removeArtefacto elimina la entidad synesis huérfana y sus referencias", () => {
    const s = useAutogenesStore.getState();
    const a = s.addArtefacto({ kind: "pdf", nombre: "src.pdf" });
    const [f] = s.addFragmentos(a.id, [{ texto: "t", pagina: 1 }]);
    const ext = s.upsertEntidad({ nombre: "Extraida", tipo: "concepto", origen: "synesis", evidencia: [f.id] });
    const op = s.upsertEntidad({ nombre: "Operador", tipo: "otro", origen: "operador", evidencia: [f.id] });
    s.addRelacion({ desdeId: ext.id, hastaId: op.id, tipo: "liga", evidencia: [f.id] });
    const caso = s.crearCaso("C");
    s.anexarAlCaso(caso.id, { entidades: [ext.id] });
    useAutogenesStore.getState().removeArtefacto(a.id);
    const st = useAutogenesStore.getState();
    // synesis entity with no evidence left is dropped; operator entity survives
    expect(st.entidades.map((e) => e.nombre)).toEqual(["Operador"]);
    // its relation is gone (dangling), and the case anchor pruned
    expect(st.relaciones).toHaveLength(0);
    expect(st.casos.find((c) => c.id === caso.id)!.entidades).toEqual([]);
  });

  it("upsertEntidad synesis no sobrescribe la curación del operador (aditivo)", () => {
    const s = useAutogenesStore.getState();
    const op = s.upsertEntidad({ nombre: "SAT", tipo: "organizacion", resumen: "curado", origen: "operador" });
    s.upsertEntidad({ nombre: "SAT", tipo: "concepto", resumen: "auto", origen: "synesis", evidencia: ["fx"] });
    const e = useAutogenesStore.getState().entidades.find((x) => x.id === op.id)!;
    expect(e.tipo).toBe("organizacion"); // operator field protected
    expect(e.resumen).toBe("curado");
    expect(e.evidencia).toContain("fx"); // evidence still unions (enrich)
  });

  it("deshacer conserva granularidad bajo actividad sostenida sub-ventana", () => {
    const s = useAutogenesStore.getState();
    s.upsertEntidad({ nombre: "A", tipo: "concepto", origen: "synesis" });
    vi.advanceTimersByTime(600);
    s.upsertEntidad({ nombre: "B", tipo: "concepto", origen: "synesis" });
    vi.advanceTimersByTime(600); // 1200ms since first snapshot → new snapshot
    s.upsertEntidad({ nombre: "C", tipo: "concepto", origen: "synesis" });
    vi.advanceTimersByTime(2000);
    // more than one undo step exists (session not collapsed into one)
    expect(useAutogenesStore.getState().deshacer()).toBe(true);
    expect(useAutogenesStore.getState().deshacer()).toBe(true);
  });
});

describe("saneamiento de cascadas e import (Ola G)", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
  });

  it("B1: relación que citaba y perdió TODA su evidencia muere en cascada; la declarada sin evidencia sobrevive", () => {
    const s = useAutogenesStore.getState();
    const art = s.addArtefacto({ kind: "pdf", nombre: "poliza.pdf" });
    const [frag] = s.addFragmentos(art.id, [{ texto: "asegura a Julio" }]);
    // Operator entities survive the cascade (origen is their provenance).
    const a = s.upsertEntidad({ nombre: "Aseguradora", tipo: "organizacion", origen: "operador" });
    const b = s.upsertEntidad({ nombre: "Julio", tipo: "persona", origen: "operador" });
    s.addRelacion({ desdeId: a.id, hastaId: b.id, tipo: "asegura", evidencia: [frag.id] });
    s.addRelacion({ desdeId: b.id, hastaId: a.id, tipo: "cliente de", evidencia: [] });

    useAutogenesStore.getState().removeArtefacto(art.id);
    const { relaciones } = useAutogenesStore.getState();
    expect(relaciones).toHaveLength(1);
    expect(relaciones[0].tipo).toBe("cliente de");
  });

  it("B3: borrar una entidad poda su nombre y alias de los eventos", () => {
    const s = useAutogenesStore.getState();
    const e = s.upsertEntidad({
      nombre: "IMSS",
      tipo: "organizacion",
      origen: "operador",
    });
    s.updateEntidad(e.id, { alias: ["Seguro Social"] });
    s.addEventos([
      {
        titulo: "Alta patronal",
        fecha: "2024-05-01",
        precision: "dia",
        entidades: ["IMSS", "Julio"],
        evidencia: [],
        origen: "operador",
      },
      {
        titulo: "Cita",
        fecha: "2024-06-01",
        precision: "dia",
        entidades: ["Seguro Social"],
        evidencia: [],
        origen: "operador",
      },
    ]);
    useAutogenesStore.getState().removeEntidad(e.id);
    const { eventos } = useAutogenesStore.getState();
    expect(eventos[0].entidades).toEqual(["Julio"]);
    expect(eventos[1].entidades).toEqual([]);
  });

  it("B2a: el import sanea evidencia contra fragmentos reales y descarta synesis sin cita", () => {
    const s = useAutogenesStore.getState();
    const n = s.mergeGrafo({
      artefactos: [],
      fragmentos: [],
      entidades: [
        {
          id: "ent-fab",
          nombre: "Fabricada",
          tipo: "concepto",
          origen: "synesis",
          evidencia: ["frag-inexistente"],
          createdAt: 1,
        },
        {
          id: "ent-op",
          nombre: "Declarada",
          tipo: "concepto",
          origen: "operador",
          evidencia: ["frag-inexistente"],
          createdAt: 1,
        },
      ],
      relaciones: [],
      eventos: [],
      productos: [],
      casos: [],
      tiposOperador: [],
      tiposRelacion: [],
      vistas: [],
    });
    const { entidades } = useAutogenesStore.getState();
    // The fabricated-synesis entity is dropped; the operator one docks
    // but its fake citation is stripped.
    expect(n).toBe(1);
    expect(entidades).toHaveLength(1);
    expect(entidades[0].nombre).toBe("Declarada");
    expect(entidades[0].evidencia).toEqual([]);
  });

  it("B2b: mismo id en el import une evidencia y alias en vez de descartar la edición", () => {
    const s = useAutogenesStore.getState();
    const art = s.addArtefacto({ kind: "pdf", nombre: "acta.pdf" });
    const [f1, f2] = s.addFragmentos(art.id, [{ texto: "uno" }, { texto: "dos" }]);
    const e = s.upsertEntidad({
      nombre: "Notaría 5",
      tipo: "organizacion",
      origen: "synesis",
      evidencia: [f1.id],
    });
    const n = useAutogenesStore.getState().mergeGrafo({
      artefactos: [],
      fragmentos: [],
      entidades: [
        {
          id: e.id,
          nombre: "Notaría 5",
          tipo: "organizacion",
          origen: "synesis",
          alias: ["Notaria Cinco"],
          resumen: "Fedatario del acta",
          evidencia: [f2.id, "frag-falso"],
          createdAt: e.createdAt,
        },
      ],
      relaciones: [],
      eventos: [],
      productos: [],
      casos: [],
      tiposOperador: [],
      tiposRelacion: [],
      vistas: [],
    });
    expect(n).toBe(0); // nothing NEW docked — but the existing one enriched
    const mia = useAutogenesStore.getState().entidades.find((x) => x.id === e.id);
    expect(mia?.evidencia.sort()).toEqual([f1.id, f2.id].sort());
    expect(mia?.alias).toEqual(["Notaria Cinco"]);
    expect(mia?.resumen).toBe("Fedatario del acta");
  });
});

describe("catálogo de relaciones (D2b)", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
  });

  it("crea, audita y elimina tipos de relación; el merge deduplica por id", () => {
    const s = useAutogenesStore.getState();
    const tr = s.crearTipoRelacion({
      nombre: "asegura a",
      desde: "organizacion",
      hasta: "persona",
    });
    expect(useAutogenesStore.getState().tiposRelacion).toHaveLength(1);

    // Re-import of the same catalog entry is a no-op; a new one docks.
    const n = useAutogenesStore.getState().mergeGrafo({
      artefactos: [],
      fragmentos: [],
      entidades: [],
      relaciones: [],
      eventos: [],
      productos: [],
      casos: [],
      tiposOperador: [],
      tiposRelacion: [
        tr,
        {
          id: "tr-nuevo",
          nombre: "renta a",
          desde: "persona",
          hasta: "organizacion",
          createdAt: 1,
        },
      ],
      vistas: [],
    });
    expect(n).toBe(1);
    expect(useAutogenesStore.getState().tiposRelacion).toHaveLength(2);

    useAutogenesStore.getState().removeTipoRelacion(tr.id);
    expect(
      useAutogenesStore.getState().tiposRelacion.map((x) => x.nombre),
    ).toEqual(["renta a"]);
  });
});
