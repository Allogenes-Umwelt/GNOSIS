import { beforeEach, describe, expect, it } from "vitest";
import { migrarMemoriaAlGrafo, recordarEnGrafo } from "@/services/autogenes";
import { useAutogenesStore } from "@/store/autogenes";
import { useMemoriaStore } from "@/store/memoria";

describe("recordarEnGrafo", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
  });

  it("upserts the entity and resolves relations, stubbing unknown targets", () => {
    recordarEnGrafo({
      nombre: "RFC",
      tipo: "documento",
      resumen: "Clave fiscal",
      campo: "fiscal",
      origen: "synesis",
      relaciones: [{ con: "SAT", tipo: "emitido por" }],
    });
    const { entidades, relaciones } = useAutogenesStore.getState();
    expect(entidades).toHaveLength(2);
    const stub = entidades.find((e) => e.nombre === "SAT")!;
    expect(stub.tipo).toBe("otro");
    expect(relaciones).toHaveLength(1);
    expect(entidades.find((e) => e.nombre === "RFC")!.campo).toBe("fiscal");
  });

  it("collapses duplicate relations and ignores self-relations", () => {
    recordarEnGrafo({
      nombre: "A",
      tipo: "concepto",
      origen: "synesis",
      relaciones: [
        { con: "B", tipo: "liga" },
        { con: "B", tipo: "liga" },
        { con: "A", tipo: "liga" },
      ],
    });
    expect(useAutogenesStore.getState().relaciones).toHaveLength(1);
  });
});

describe("migrarMemoriaAlGrafo", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
    useMemoriaStore.getState().clear();
  });

  it("pours legacy memory into the graph and clears it (idempotent)", () => {
    useMemoriaStore.getState().upsertObjeto({
      nombre: "SAT",
      tipo: "organizacion",
      resumen: "Autoridad fiscal",
      origen: "synesis",
    });
    useMemoriaStore.getState().upsertObjeto({
      nombre: "RFC",
      tipo: "documento",
      resumen: "Clave del operador",
      origen: "operador",
      relaciones: [{ con: "SAT", tipo: "emitido por" }],
    });

    expect(migrarMemoriaAlGrafo()).toBe(2);
    const { entidades, relaciones } = useAutogenesStore.getState();
    expect(entidades).toHaveLength(2);
    expect(entidades.find((e) => e.nombre === "SAT")!.tipo).toBe("organizacion");
    expect(entidades.find((e) => e.nombre === "RFC")!.origen).toBe("operador");
    expect(relaciones).toHaveLength(1);
    expect(useMemoriaStore.getState().objetos).toHaveLength(0);

    // second run is a no-op
    expect(migrarMemoriaAlGrafo()).toBe(0);
    expect(useAutogenesStore.getState().entidades).toHaveLength(2);
  });
});

describe("fusionarEntidades", () => {
  beforeEach(() => {
    useAutogenesStore.getState().clear();
  });

  it("unions evidence, repoints relations, keeps the absorbed name as alias", () => {
    const s = useAutogenesStore.getState();
    const a = s.upsertEntidad({
      nombre: "SAT",
      tipo: "organizacion",
      origen: "synesis",
      evidencia: ["f1"],
    });
    const b = s.upsertEntidad({
      nombre: "Servicio de Administración Tributaria",
      tipo: "organizacion",
      resumen: "Autoridad fiscal",
      origen: "synesis",
      evidencia: ["f2"],
    });
    const c = s.upsertEntidad({
      nombre: "RFC",
      tipo: "documento",
      origen: "synesis",
    });
    s.addRelacion({ desdeId: b.id, hastaId: c.id, tipo: "emite" });
    s.addRelacion({ desdeId: a.id, hastaId: c.id, tipo: "emite" });
    s.addRelacion({ desdeId: a.id, hastaId: b.id, tipo: "es" });

    const fusionado = useAutogenesStore
      .getState()
      .fusionarEntidades(a.id, b.id)!;
    expect(fusionado.evidencia.sort()).toEqual(["f1", "f2"]);
    expect(fusionado.alias).toEqual(["Servicio de Administración Tributaria"]);
    expect(fusionado.resumen).toBe("Autoridad fiscal");

    const { entidades, relaciones } = useAutogenesStore.getState();
    expect(entidades).toHaveLength(2);
    // b→c repointed to a→c, deduped against existing a→c; a→b self-loop dropped
    expect(relaciones).toHaveLength(1);
    expect(relaciones[0]).toMatchObject({ desdeId: a.id, hastaId: c.id });

    // upsert by the absorbed name resolves to the survivor via alias
    const denuevo = useAutogenesStore.getState().upsertEntidad({
      nombre: "Servicio de Administración Tributaria",
      tipo: "organizacion",
      origen: "synesis",
      evidencia: ["f3"],
    });
    expect(denuevo.id).toBe(a.id);
    expect(useAutogenesStore.getState().entidades).toHaveLength(2);
  });

  it("descartarPar records once", () => {
    const s = useAutogenesStore.getState();
    s.descartarPar("x|y");
    s.descartarPar("x|y");
    expect(useAutogenesStore.getState().paresDescartados).toEqual(["x|y"]);
  });
});
