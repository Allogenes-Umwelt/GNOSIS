#!/usr/bin/env node
/**
 * Compuerta HARD de docs/estandares/architecture-standards.md §6-§7:
 * "si el codigo se mueve, el diagrama se mueve en el mismo commit".
 *
 * Que cuenta como ESTRUCTURAL en GNOSIS
 * ------------------------------------
 * Anadir o borrar un modulo Python en las carpetas que los diagramas nombran
 * caja por caja (autogenes/, rutas/, tableros/, database/, jarvis/) o tocar
 * app.py, que es la factory y el registro de blueprints.
 *
 * Editar el INTERIOR de un modulo que ya existe no es estructural: el
 * diagrama sigue siendo cierto. Esa distincion es deliberada — una compuerta
 * que grita en cada commit se acaba desactivando, y una compuerta desactivada
 * protege menos que ninguna.
 *
 * Exento siempre: tests/, docs/, scripts/, static/, templates/, *.md, *.css.
 *
 * Uso:  node scripts/check-diagram-staleness.mjs [--base <ref>]
 *       (por defecto compara contra HEAD~1)
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const i = args.indexOf('--base');
const base = i !== -1 && args[i + 1] ? args[i + 1] : 'HEAD~1';

// stderr silenciado: cuando la base no existe (rama nueva, sha de ceros,
// clon superficial) git escupe un fatal: que no es un fallo nuestro — lo
// tratamos abajo con un mensaje propio.
const git = (...a) =>
  execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

let diff;
try {
  diff = git('diff', '--name-status', `${base}...HEAD`);
} catch {
  console.log(`check-diagram-staleness: no se pudo comparar contra ${base} (¿historial superficial?) — se omite`);
  process.exit(0);
}
if (!diff) {
  console.log('check-diagram-staleness: sin cambios que revisar');
  process.exit(0);
}

const filas = diff.split('\n').map((l) => {
  const [estado, ...resto] = l.split('\t');
  return { estado: estado[0], ruta: resto[resto.length - 1] };
});

const DIRS_ESTRUCTURA = /^(autogenes|rutas|tableros|database|jarvis)\/.*\.py$/;
const EXENTO = /^(tests|docs|scripts|static|templates)\/|\.(md|css|txt|toml|ya?ml)$/;

const estructurales = filas.filter(({ estado, ruta }) => {
  if (EXENTO.test(ruta)) return false;
  if (ruta === 'app.py') return true;                       // factory + blueprints
  return (estado === 'A' || estado === 'D') && DIRS_ESTRUCTURA.test(ruta);
});

const diagramas = filas.filter(({ ruta }) => ruta.startsWith('docs/architecture/'));
const adrs = diagramas.filter(({ ruta }) => ruta.startsWith('docs/architecture/adr/'));

if (!estructurales.length) {
  console.log('check-diagram-staleness: ningun cambio estructural en el diff — OK');
  process.exit(0);
}

console.log(`check-diagram-staleness: ${estructurales.length} cambio(s) estructural(es):`);
for (const { estado, ruta } of estructurales) console.log(`  ${estado}  ${ruta}`);

if (!diagramas.length) {
  console.error(
    '\nERROR (HARD): el diff cambia la estructura y no toca docs/architecture/.\n' +
    'Los diagramas nombran estos modulos; si el codigo se mueve, la vista se mueve\n' +
    'en el MISMO commit (doctrina §6).'
  );
  process.exit(1);
}
console.log(`check-diagram-staleness: ${diagramas.length} archivo(s) de docs/architecture/ en el mismo diff — OK`);

if (!adrs.length) {
  console.warn(
    '\nAVISO (SOFT): cambio estructural sin ningun ADR tocado.\n' +
    'La doctrina (§5) pide un ADR por decision estructural. La revision decide;\n' +
    'esta compuerta puede endurecerse cuando el operador lo pida (ADR-0001).'
  );
}
