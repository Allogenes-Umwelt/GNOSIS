# Estandares — doctrina compartida del ecosistema GESTELL

Doctrina repo-agnóstica, versionada dentro de GNOSIS para que cualquier agente
(CLAUDE/CLARENT) que clone el repo la tenga disponible sin depender de rutas
locales (`~/...`).

| Archivo | Doctrina | Master local |
| --- | --- | --- |
| `architecture-standards.md` | C4 + arc42, diagrams-as-code, ADR, CI gates | `~/architecture-standards.md` |
| `backend-engineering.md` | Backend/skills profesionales (Python): tipado, async, seguridad OWASP, testing, datos, observabilidad, DevOps, AI-era | `MD-FILES-SHOP/library/backend-engineering.md` — snapshot de **v1.5.0**, 2026-09-08 |

## Jerarquía (cómo se aplica)

1. **Este repo gana:** `CLAUDE.md` / `AGENTS.md` de GNOSIS y sus leyes no
   negociables tienen precedencia sobre cualquier doctrina genérica.
2. **Estos archivos:** doctrina repo-agnóstica — se aplican donde el repo no
   especifica algo distinto.
3. **Master:** la fuente canónica de `backend-engineering.md` es el
   repositorio `MD-FILES-SHOP` (`library/`), no un archivo en `~`. La tabla
   anota qué versión es este snapshot; el front matter del propio archivo la
   repite. Si editas la doctrina, edítala en el master y re-sincroniza aquí
   con la versión anotada (regla de staleness). El snapshot anterior se quedó
   ocho versiones atrás precisamente porque nada en el archivo decía cuál
   era.

## Nota de stack (importante para agentes)

`frontend-standards.md` (~/frontend-standards.md, doctrina React/Vite/TS)
**NO aplica a GNOSIS** — el frontend de este repo es JS vanilla + canvas 2D +
Jinja sin build step (decisión deliberada, ver `docs/EVALUACION_ESTANDAR_A.md`).
De la doctrina frontend solo aplican los principios universales (gates,
seguridad, a11y), no el stack.

`backend-engineering.md` aplica con su propia salvedad: este repo es Flask +
SQLite + NetworkX + pandas + pydantic, no el layout `app/…` genérico del
documento — el layout real está en `CLAUDE.md` §Estructura. Las secciones de
doctrina (tipado, testing, seguridad, observabilidad) aplican tal cual.
