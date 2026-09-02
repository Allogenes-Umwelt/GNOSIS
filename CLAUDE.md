# CLAUDE.md — GNOSIS

App Flask/Python 3.11 de analítica de importación de vehículos VW, con el
sustrato de ontología **AUTOGENES** y el design system **GESTELL/PANOPTES**.
Frontend: JS vanilla + canvas 2D servido por plantillas Jinja (sin build step,
sin framework SPA — decisión deliberada, ver `docs/EVALUACION_ESTANDAR_A.md`).

## Comandos
- **Tests (todo):** `python3 -m pytest tests/ -q`  — baseline 604 verdes + 1
  skip (`test_ingesta_ocr` se salta sin Pillow/Tesseract en el contenedor).
- **Tests (un archivo):** `python3 -m pytest tests/test_X.py -q` — prefiérelo al iterar.
- **Sin el banco de escala:** `python3 -m pytest -q -m "not slow"` — `tests/test_escala.py`
  tarda segundos y afirma RATIOS (forma de la curva), no milisegundos.
- **Lint Python:** `python3 -m ruff check .`  — debe salir limpio.
- **Lint JS:** `npx eslint static`  — 0 errores (warnings de vars sin usar toleradas).
- **App:** `docker/compose.yaml` → http://127.0.0.1:5001. Rebuild Podman:
  `podman rm -f gnosis; podman rmi -f gnosis:local; podman-compose -f docker/compose.yaml up -d --build`

## Stack fijo — no introducir alternativas sin avisar primero
Flask · SQLite (única verdad) · NetworkX (solo lentes de sesión, no el render) ·
pandas (bordes de ingesta) · pydantic (tipos del sustrato) · JS vanilla + canvas ·
tokens CSS. El frontend NO usa React/TS/Vite/Tailwind ni bundler.

## Convenciones (lo que el tooling no fuerza)
- **Idioma:** copy de UI en **español** (registro accesible, sin emojis); código,
  comentarios y mensajes de commit en **inglés**.
- **Sin `console.log` ni código comentado** en archivos commiteados.
- **Design system:** solo **tokens** (`static/styles.css`) — nada de hex/px crudos
  en componentes. Magenta SOLO vía `--danger`/`--telos-on`. Contraste **AAA** en
  ambos temas (Nocturne oscuro / Daylight claro). Motion desde tokens, sin flashes
  >5 Hz; `prefers-reduced-motion` degrada a estático.
- **NO imponemos formateador automático** (`ruff format` reformatearía ~46 archivos
  y destruiría el estilo alineado y los comentarios densos PANOPTES, deliberados).
  El linter de correctitud (`ruff check`) sí es gate; el formateo es manual.

## Arquitectura — LEYES no negociables
- **Pipelegado intocable:** `concentrado1.py`, `concentrado2.py`, `Estadistico.py`,
  `PDFs_*.py` no se tocan. Cualquier ajuste va en el borde (`app.py` / capas nuevas).
  (Están excluidos de ruff a propósito.)
- **Determinismo del render:** la topología que alimenta el lienzo es determinista
  y reproducible — el mismo grafo abre idéntico (`fuerzas.js`, `topologia.py`,
  `proyeccion.py`). Toda métrica que alimente un panel numérico citado se implementa
  **pura y determinista** en `topologia.py`/`analisis_vw.py`, con test de doble
  corrida idéntica. NetworkX queda confinado a `caminos.py` (camino/vecindario/hubs).
- **Puerta única de escritura:** toda mutación del sustrato pasa por `Sustrato`
  (`autogenes/sustrato.py`), con procedencia (`origen=operador`) y bitácora WORM.
  Ninguna ruta fabrica evidencia ni escribe `ag_*` directo.
- **Provenance law / local-first:** las entidades citan fragmentos; el sustrato no
  hace red sin aprobación; cero peticiones externas (incluidos assets de mapas).
- **Zero snake oil:** ningún número inventa monto ni confianza. Todo es derivable y
  citable a fila/fragmento/pedimento. Montos ($) solo de CONCILIA/NOMOS. Única
  proyección permitida: `cupos_what_if` (declara su método).

## Estructura
- `autogenes/` — el sustrato: proyección, topología, motores (concilia, validacion,
  nomos, sinapsis, qualia, cronos, cascada), caminos, red (lente NetworkX).
- `rutas/` — blueprints Flask (autogenes.py = grafo + APIs; tableros.py = TBV).
- `tableros/` — tableros VW. `database/` — SQLite + persistencia. `jarvis/` — chat/tools.
- `static/` — JS/CSS/assets. `templates/` — Jinja. `tests/` — pytest (1:1 con el motor).
- `docs/` — planes rectores: `PROPUESTA_GRAFO.md` (v3, el plan del grafo),
  `BENCHMARK_PALANTIR.md`, `EVALUACION_ESTANDAR_A.md`.
  `docs/architecture/` — las vistas C4 + ADR. `docs/estandares/` — doctrina
  compartida del ecosistema. `docs/DIAGNOSTICO_FABLE_v02.md` — diagnóstico
  vigente (escala, revisión de la ejecución, uplift del grafo; el v01 queda
  como registro de lo cerrado).
- `scripts/` — compuertas de arquitectura (validador Mermaid, staleness).

## Documentación de arquitectura
- C4 (Contexto → Contenedores → Componentes) + arc42, según
  `docs/estandares/architecture-standards.md` — doctrina común de cualquier
  repo del ecosistema (copia en-repo del master `~/architecture-standards.md`).
- **Las vistas viven en `docs/architecture/`**, una por archivo; el índice es
  `docs/architecture/README.md` y `docs/ARQUITECTURA.md` es la puerta de
  entrada. Cada vista declara nivel, notación, pregunta, leyenda y sus ADR.
- Diagramas como Mermaid; un cambio estructural requiere ADR
  (`docs/architecture/adr/`) y actualizar la vista en el MISMO commit (regla
  de staleness) — ambas cosas las verifica CI.
- Doctrina backend (Python/seguridad/testing/observabilidad):
  `docs/estandares/backend-engineering.md` (copia en-repo del master
  `~/backend-engineering.md`). Auditoría medida contra sus benchmarks §13:
  `docs/architecture/auditoria-backend.md`.
- Documentos de marca: `docs/GUIA_DOCUMENTOS_GESTELL.md` (contrato GESTELL).
- Compuertas (en `scripts/`, corren en CI):
  `node scripts/validate-mermaid.mjs docs/architecture` (cabeceras + parseo) y
  `node scripts/check-diagram-staleness.mjs` (staleness HARD, ADR SOFT).

## Git & commits
- **Conventional Commits** en inglés: `feat:`/`fix:`/`refactor:`/`chore:`/`test:`/`docs:`
  con scope opcional (`feat(grafo): …`). Un cambio lógico por commit.
- Nunca commitear secretos, `.env`, `node_modules/` ni artefactos generados.
- No abrir PR salvo petición explícita.

## Workflow — completar ANTES de declarar una tarea terminada
1. `python3 -m ruff check .` y `npx eslint static` — 0 errores.
2. Correr los tests relevantes (archivo o suite) — verdes.
3. Re-leer el diff: ¿satisface la petición y respeta estas leyes y convenciones?
4. Añadir/actualizar tests para todo comportamiento cambiado (doble corrida para
   métricas nuevas).

## Do Not
- Tocar el pipelegado. · Escribir `ag_*` fuera de `Sustrato`. · Usar NetworkX (o
  cualquier fuente no determinista) para cifras de panel o para el layout del render.
- Hex/px crudos en componentes; magenta fuera de `--danger`/`--telos-on`.
- Inventar montos/confianzas o mostrar cifras sin unidad/periodo/fuente.
- `console.log`, código muerto o emojis en la UI. · Abrir PR sin que Jesús lo pida.
