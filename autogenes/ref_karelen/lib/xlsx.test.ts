import { describe, expect, it } from "vitest";
import { leerXlsx } from "@/lib/xlsx";
import { analizarTabla } from "@/lib/pipelines/csv";

/* Build a real (deflate-raw) .xlsx in-memory so the test exercises the ZIP
   central-directory parse, shared strings, styles and serial-date paths. */

const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32 = (n: number) => [
  n & 0xff,
  (n >> 8) & 0xff,
  (n >> 16) & 0xff,
  (n >> 24) & 0xff,
];

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zip(entries: { name: string; text: string }[]): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const nombre = enc.encode(e.name);
    const crudo = enc.encode(e.text);
    const data = await deflateRaw(crudo);
    const lh = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8),
      ...u16(0), ...u16(0),
      ...u32(0), ...u32(data.length), ...u32(crudo.length),
      ...u16(nombre.length), ...u16(0),
    ];
    const local = new Uint8Array([...lh, ...nombre, ...data]);
    locals.push(local);
    const cd = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8),
      ...u16(0), ...u16(0),
      ...u32(0), ...u32(data.length), ...u32(crudo.length),
      ...u16(nombre.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset),
    ];
    central.push(new Uint8Array([...cd, ...nombre]));
    offset += local.length;
  }
  const centralStart = offset;
  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(centralStart), ...u16(0),
  ]);
  const parts = [...locals, ...central, eocd];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

const serialDe = (y: number, m: number, d: number) =>
  Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);

async function libroEstado(): Promise<ArrayBuffer> {
  const s1 = serialDe(2026, 3, 12);
  const s2 = serialDe(2026, 3, 13);
  return zip([
    {
      name: "xl/workbook.xml",
      text: `<workbook><sheets><sheet name="Estado" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text: `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    {
      name: "xl/sharedStrings.xml",
      text: `<sst><si><t>Fecha</t></si><si><t>Concepto</t></si><si><t>Monto</t></si><si><t>OXXO</t></si><si><t>CFE</t></si></sst>`,
    },
    {
      name: "xl/styles.xml",
      text: `<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      text:
        `<worksheet><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>` +
        `<row r="2"><c r="A2" s="1"><v>${s1}</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>-150.5</v></c></row>` +
        `<row r="3"><c r="A3" s="1"><v>${s2}</v></c><c r="B3" t="s"><v>4</v></c><c r="C3"><v>8000</v></c></row>` +
        `</sheetData></worksheet>`,
    },
  ]);
}

describe("leerXlsx", () => {
  it("reads sheet name, shared strings and converts serial dates", async () => {
    const hojas = await leerXlsx(await libroEstado());
    expect(hojas).toHaveLength(1);
    expect(hojas[0].nombre).toBe("Estado");
    expect(hojas[0].filas[0]).toEqual(["Fecha", "Concepto", "Monto"]);
    // Date-styled serials became ISO dates; concept resolved from sst.
    expect(hojas[0].filas[1]).toEqual(["2026-03-12", "OXXO", "-150.5"]);
    expect(hojas[0].filas[2][0]).toBe("2026-03-13");
  });

  it("feeds straight into the shared table analyzer (same as CSV)", async () => {
    const hojas = await leerXlsx(await libroEstado());
    const r = analizarTabla("estado.xlsx", hojas[0].filas);
    expect(r.fragmentos[0].texto).toContain("2 movimientos");
    expect(r.fragmentos[1].texto).toContain("2026-03-12 · OXXO · -150.5");
    expect(r.entidades).toHaveLength(0);
  });
});
