#!/usr/bin/env node
/**
 * Compuerta del frontend sin build step — hallazgo H14 (v01), R5 (v02).
 *
 * 233 asignaciones a `innerHTML` en `static/`, y ningun bundler que revise
 * nada: el repo no tiene build step a proposito (ADR-0008), asi que un valor
 * de documento interpolado sin escapar solo se descubre en el navegador del
 * operador.
 *
 * DOS niveles, y la diferencia importa
 * ------------------------------------
 * HARD  · un archivo que interpola dentro de `innerHTML` tiene que tener un
 *         `esc` A MANO: definido, o tomado de `GestellComun`/`QualiaComun`.
 *         Si no lo tiene, no es que se le haya olvidado escapar una vez: es
 *         que no puede escapar nada.
 *
 * SOFT  · las lineas que interpolan y no llaman a `esc(` en la MISMA linea.
 *         Se listan, no se rechazan. La deteccion por linea no distingue un
 *         `+ i +` (un indice) de un `+ nombre +` (dato del documento), y a
 *         dia de hoy las diez que encuentra son todas correctas — revisadas
 *         una a una. Una compuerta que grita en cada commit se acaba
 *         desactivando, y una compuerta desactivada protege menos que
 *         ninguna.
 *
 * Uso:  node scripts/check-innerhtml.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'static';
const ASIGNA = /\.innerHTML\s*\+?=/;
// interpola: concatena algo que no es un literal de cadena
const INTERPOLA = /\+\s*[A-Za-z_$][\w$.[\]()]*/;
// tiene un escape a mano en la linea (esc, o una conversion numerica segura)
const ESCAPA = /\besc\(|\bnum\(|\bfmt\(|String\(/;
// el archivo tiene un `esc` disponible en absoluto
const TIENE_ESC = /function esc\s*\(|=\s*GestellComun\.esc|GestellComun\.esc\(|Q\.esc\(|QualiaComun\.esc/;

let duros = 0;
const blandas = [];

for (const nombre of readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
  const texto = readFileSync(join(DIR, nombre), 'utf8');
  const lineas = texto.split('\n');
  let interpolaAlgo = false;

  lineas.forEach((linea, i) => {
    if (!ASIGNA.test(linea) || !INTERPOLA.test(linea)) return;
    interpolaAlgo = true;
    if (!ESCAPA.test(linea)) {
      blandas.push(`${nombre}:${i + 1}: ${linea.trim().slice(0, 100)}`);
    }
  });

  if (interpolaAlgo && !TIENE_ESC.test(texto)) {
    console.error(
      `check-innerhtml: ERROR ${nombre} interpola en innerHTML y no tiene ` +
      'ningun `esc` disponible (defínelo o toma GestellComun.esc)');
    duros += 1;
  }
}

if (blandas.length) {
  console.log(`check-innerhtml: ${blandas.length} linea(s) a revisar ` +
              '(SOFT — interpolan sin `esc(` en la misma linea):');
  for (const b of blandas) console.log(`  ${b}`);
}

if (duros) {
  console.error(`check-innerhtml: ${duros} archivo(s) sin escape disponible — FALLA`);
  process.exit(1);
}
console.log('check-innerhtml: OK');
