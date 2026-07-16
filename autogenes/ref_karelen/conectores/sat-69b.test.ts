import { describe, expect, it } from "vitest";
import { buscarEnCsv69b, sat69b } from "@/conectores/sat-69b";

const CSV = [
  "LISTADO COMPLETO DE CONTRIBUYENTES ARTÍCULO 69-B",
  'No,RFC,NOMBRE DEL CONTRIBUYENTE,SITUACIÓN DEL CONTRIBUYENTE,NÚMERO Y FECHA DE OFICIO GLOBAL DE PRESUNCIÓN',
  '1,AAA010101AAA,"COMERCIALIZADORA ALFA, S.A. DE C.V.",Definitivo,500-05-2024-1',
  "2,BBB020202BB2,SERVICIOS BETA SC,Presunto,500-05-2024-2",
  '3,CCC030303CC3,"GAMA, PROVEEDORA",Desvirtuado,500-05-2024-3',
  "",
].join("\r\n");

describe("buscarEnCsv69b", () => {
  it("finds an exact RFC with quoted commas in the name", () => {
    const r = buscarEnCsv69b(CSV, "aaa010101aaa");
    expect(r.encontrado).toBe(true);
    expect(r.fila?.nombre).toBe("COMERCIALIZADORA ALFA, S.A. DE C.V.");
    expect(r.fila?.situacion).toBe("Definitivo");
    expect(r.filas).toBeGreaterThanOrEqual(1);
  });

  it("returns clean absence with the rows-scanned count", () => {
    const r = buscarEnCsv69b(CSV, "ZZZ990101ZZ9");
    expect(r.encontrado).toBe(false);
    expect(r.fila).toBeNull();
    expect(r.filas).toBe(3);
  });

  it("fails loudly when the header changes", () => {
    expect(() => buscarEnCsv69b("a,b,c\n1,2,3", "AAA010101AAA")).toThrow(
      /formato/,
    );
  });
});

describe("sat69b.presentar", () => {
  it("hit → dictamen atencion citing Art. 69-B CFF", () => {
    const vistas = sat69b.presentar?.(
      {
        rfc: "AAA010101AAA",
        encontrado: true,
        nombre: "COMERCIALIZADORA ALFA",
        situacion: "Definitivo",
        filasRevisadas: 3,
      },
      { conector: "sat-69b", consulta: "buscar_rfc", obtenido: "2026-07-05" },
    );
    expect(vistas).toHaveLength(1);
    const d = vistas?.[0];
    expect(d?.funcion).toBe("dictamen");
    if (d?.funcion === "dictamen") {
      expect(d.veredicto).toBe("atencion");
      expect(d.evidencia[0].cita).toMatch(/69-B CFF/);
    }
  });

  it("miss → dictamen favorable", () => {
    const vistas = sat69b.presentar?.(
      { rfc: "ZZZ990101ZZ9", encontrado: false, nombre: null, situacion: null, filasRevisadas: 14000 },
      { conector: "sat-69b", consulta: "buscar_rfc", obtenido: "2026-07-05" },
    );
    if (vistas?.[0]?.funcion === "dictamen") {
      expect(vistas[0].veredicto).toBe("favorable");
    } else {
      throw new Error("expected dictamen");
    }
  });
});
