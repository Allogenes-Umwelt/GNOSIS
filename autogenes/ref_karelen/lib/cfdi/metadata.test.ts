import { describe, expect, it } from "vitest";
import { parsearMetadataSat } from "@/lib/cfdi/metadata";

const U1 = "40241D10-77B2-46E0-B536-E7A5E5D94DCB";
const U2 = "35B18AD0-FFF3-4138-9AA8-533E3A2CD0B3";

// SAT "descarga masiva" Metadata: ~-delimited, Estatus 1=vigente / 0=cancelado.
const MASIVA = `Uuid~RfcEmisor~NombreEmisor~RfcReceptor~NombreReceptor~RfcPac~FechaEmision~FechaCertificacionSat~Monto~EfectoComprobante~Estatus~FechaCancelacion
${U1}~AAA010101AAA~EMISOR~BBB010101BB1~RECEPTOR~SPR190613I52~2026-06-08T07:58:32~2026-06-08T08:09:49~23560.00~I~1~
${U2}~AAA010101AAA~EMISOR~CCC010101CC2~RECEPTOR~SPR190613I52~2026-04-09T20:19:36~2026-04-09T20:20:04~14500.00~I~0~2026-05-10T10:00:00`;

// Portal export: comma-delimited, textual status.
const PORTAL = `Uuid,Estatus,FechaCancelacion
${U1},Vigente,
${U2},Cancelado,2026-05-10`;

describe("parsearMetadataSat", () => {
  it("reads the ~-delimited masiva with numeric status", () => {
    const m = parsearMetadataSat(MASIVA);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ uuid: U1, estatus: "vigente" });
    expect(m[1]).toMatchObject({ uuid: U2, estatus: "cancelado", fechaCancelacion: "2026-05-10" });
  });

  it("reads the comma portal export with textual status", () => {
    const m = parsearMetadataSat(PORTAL);
    expect(m[0].estatus).toBe("vigente");
    expect(m[1].estatus).toBe("cancelado");
  });

  it("uppercases UUIDs and skips rows without a valid one", () => {
    const m = parsearMetadataSat(`Uuid,Estatus\n${U1.toLowerCase()},Vigente\nbasura,Vigente\n,Cancelado`);
    expect(m).toHaveLength(1);
    expect(m[0].uuid).toBe(U1);
  });

  it("throws operator words on an empty or headerless file", () => {
    expect(() => parsearMetadataSat("")).toThrow(/vac/i);
    expect(() => parsearMetadataSat("Fecha,Monto\n2026-01-01,100")).toThrow(/Uuid/i);
  });
});
