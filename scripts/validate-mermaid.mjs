#!/usr/bin/env node
/**
 * Compuerta HARD de docs/estandares/architecture-standards.md §7.
 *
 * Dos pasadas sobre cada vista de docs/architecture/:
 *
 *  1. Pre-vuelo estructural (SIEMPRE, sin dependencias). §3 de la doctrina
 *     exige que todo diagrama lleve titulo, nivel/notacion, leyenda y la
 *     pregunta que responde. Un diagrama sin esas cuatro cosas no esta
 *     terminado, asi que aqui es un error, no un aviso.
 *  2. Parseo real de cada bloque ```mermaid (solo si mermaid + jsdom estan
 *     instalados). En un contenedor sin ellos degradamos al pre-vuelo y lo
 *     decimos: degradar en silencio convertiria una compuerta en teatro.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const raiz = process.argv[2] ?? 'docs/architecture';

const CAMPOS = [
  { clave: 'Nivel', re: /^>\s*\*\*Nivel:\*\*/m },
  { clave: 'Notación', re: /\*\*Notación:\*\*/m },
  { clave: 'Pregunta que responde', re: /^>\s*\*\*Pregunta que responde:\*\*/m },
  { clave: 'Leyenda', re: /^>\s*\*\*Leyenda:\*\*/m },
];

async function* archivosMarkdown(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* archivosMarkdown(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

function bloquesMermaid(texto) {
  const out = [];
  const re = /^```mermaid\n([\s\S]*?)^```$/gm;
  let m;
  while ((m = re.exec(texto)) !== null) {
    out.push({ codigo: m[1], linea: texto.slice(0, m.index).split('\n').length });
  }
  return out;
}

async function cargarMermaid() {
  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false });
    return mermaid;
  } catch {
    return null;
  }
}

const errores = [];
const vistas = [];
for await (const archivo of archivosMarkdown(raiz)) vistas.push(archivo);
vistas.sort();

// Los ADR y los indices son prosa, no vistas: no se les exige cabecera.
const esVista = (p) => !p.includes(`${'adr'}/`) && !p.endsWith('README.md')
  && !p.endsWith('decisiones-historicas.md');

const mermaid = await cargarMermaid();
let totalBloques = 0;

for (const archivo of vistas) {
  const texto = await readFile(archivo, 'utf8');
  const rel = relative(process.cwd(), archivo);

  if (esVista(archivo)) {
    if (!/^#\s+\S/m.test(texto)) errores.push(`${rel}: sin titulo H1`);
    for (const { clave, re } of CAMPOS) {
      if (!re.test(texto)) errores.push(`${rel}: falta la cabecera "${clave}" (§3 de la doctrina)`);
    }
  }

  for (const { codigo, linea } of bloquesMermaid(texto)) {
    totalBloques++;
    if (!codigo.trim()) {
      errores.push(`${rel}:${linea}: bloque mermaid vacio`);
      continue;
    }
    if (mermaid) {
      try {
        await mermaid.parse(codigo);
      } catch (e) {
        errores.push(`${rel}:${linea}: mermaid no parsea — ${String(e.message ?? e).split('\n')[0]}`);
      }
    }
  }
}

const modo = mermaid ? 'pre-vuelo + parseo mermaid' : 'SOLO pre-vuelo (mermaid/jsdom no instalados)';
console.log(`validate-mermaid: ${vistas.length} archivos, ${totalBloques} bloques — ${modo}`);

if (errores.length) {
  console.error(`\n${errores.length} problema(s):`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('validate-mermaid: OK');
