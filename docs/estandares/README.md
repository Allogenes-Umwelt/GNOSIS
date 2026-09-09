# Estandares — doctrina compartida del ecosistema GESTELL

Doctrina repo-agnóstica, versionada dentro de GNOSIS para que cualquier agente
(CLAUDE/CLARENT) que clone el repo la tenga disponible sin depender de rutas
locales (`~/...`).

## Los archivos

Los cinco archivos de `MD-FILES-SHOP` se instalan **como conjunto**: se citan
entre sí por `id` (`backend-engineering` §9, `api-design` §3), de modo que una
copia parcial deja referencias colgando. `backend-engineering` es la espina —
los otros cuatro lo requieren y profundizan donde él no puede.

| Archivo | Doctrina | Master · snapshot |
| --- | --- | --- |
| `backend-engineering.md` | Espina: doctrina, arquitectura, Python, datos, resiliencia, testing, gates, observabilidad, DevOps, proceso, era-IA | `MD-FILES-SHOP/library/` — **v1.6.1**, 2026-09-09 |
| `api-design.md` | El contrato HTTP: forma, errores, versionado, fiabilidad en el borde, lo que el backend le debe a un cliente de navegador | `MD-FILES-SHOP/library/` — **v1.2.1**, 2026-09-09 |
| `application-security.md` | ASVS, OWASP, authn/z, codificación segura, cadena de suministro, threat modeling, privacidad | `MD-FILES-SHOP/library/` — **v1.3.1**, 2026-09-09 |
| `frontend-engineering.md` | Clientes de navegador: tipos, estado, rendimiento, accesibilidad, seguridad, testing, i18n, UI con modelo | `MD-FILES-SHOP/library/` — **v1.3.1**, 2026-09-09 |
| `llm-engineering.md` | Modelos como dependencias, prompts como código, evals, retrieval, agentes, guardarraíles, coste | `MD-FILES-SHOP/library/` — **v1.2.1**, 2026-09-09 |
| `architecture-standards.md` | C4 + arc42, diagrams-as-code, ADR, gates de CI | `~/architecture-standards.md` |

## Jerarquía (cómo se aplica)

1. **Este repo gana:** `CLAUDE.md` / `AGENTS.md` de GNOSIS y sus leyes no
   negociables tienen precedencia sobre cualquier doctrina genérica.
2. **Estos archivos:** doctrina repo-agnóstica — se aplican donde el repo no
   especifica algo distinto.
3. **Master:** la fuente canónica de los cinco archivos de biblioteca es el
   repositorio `MD-FILES-SHOP` (`library/`), no un archivo en `~`. La tabla
   anota qué versión es cada snapshot; el front matter del propio archivo la
   repite. Si editas la doctrina, edítala en el master y re-sincroniza aquí
   con la versión anotada **en el mismo commit** (regla de staleness). El
   primer snapshot se quedó ocho versiones atrás precisamente porque nada en
   el archivo decía cuál era.

## Notas de stack (importante para agentes)

Cada archivo declara en su front matter cuándo debe cargarse (`activation`) y
qué deja fuera (`excludes`). Sobre eso, lo que este repo matiza:

- **`backend-engineering.md`** aplica con una salvedad: este repo es Flask +
  SQLite + NetworkX + pandas + pydantic, no el layout `app/…` genérico del
  documento — el layout real está en `CLAUDE.md` §Estructura. Las secciones de
  doctrina (tipado, testing, seguridad, observabilidad) aplican tal cual.
- **`frontend-engineering.md`** está escrito TypeScript-first (bundler, tipos
  en el borde, framework). El frontend de GNOSIS es **JS vanilla + canvas 2D +
  Jinja sin build step**, decisión deliberada (`docs/EVALUACION_ESTANDAR_A.md`).
  Aplican sus principios universales — accesibilidad, seguridad de navegador,
  medición de rendimiento, estados de la UI — **no** su stack. Lo mismo valía
  para el antiguo `~/frontend-standards.md`, que este archivo reemplaza.
- **`api-design.md`** aplica a la superficie HTTP de `app.py`: forma del
  contrato, códigos y forma de error, paginación, idempotencia. Sus secciones
  de evolución de API pesan menos en un repo sin clientes externos versionados.
- **`application-security.md`** aplica entero.
- **`llm-engineering.md`** aplica a `jarvis/` (proveedor Anthropic): modelo
  pinneado, evals, contención de herramientas, coste. Su §10 sobre ingeniería
  asistida por IA aplica a cómo se trabaja este repo.

## Cómo se auditan

Los benchmarks de cada sección son la parte accionable: umbral + enforcer. El
recorrido de adopción de GNOSIS contra ellos vive en el master, en
`reports/gnosis-ledger-*.md` — 81 de 265 benchmarks recorridos, 18 ejecutando
el enforcer. Los archivos no son lectura; son aquello contra lo que un cambio
puede estar equivocado.
