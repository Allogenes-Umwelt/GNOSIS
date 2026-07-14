# Evaluación — ¿migrar GNOSIS al stack del Estándar A (Parte A)?

> v1 · 2026-07-13 · Evidencia contra el árbol en `4bc9564`.
> **Marco de decisión (B0):** la pregunta es si GNOSIS debe migrar del stack
> actual (Flask/Python 3.11 + vanilla JS/canvas server-rendered) al stack de la
> Parte A de `WORKING_STANDARDS.md` (React 19 + TypeScript + Vite + Tailwind +
> Zustand + TanStack Query). La decisión que informa: dónde invertir las
> próximas sesiones de ingeniería. Decisor: Jesús. Evidencia que cambiaría la
> respuesta: ver §6 (triggers).

---

## 0. Respuesta primero (BLUF)

**No migrar el stack hoy. Adoptar ya la *disciplina* de la Parte A, portada a
Python/Flask, como `CLAUDE.md` del repo (hoy no existe ninguno).**

- La migración reescribiría ~9,200 líneas de JS y 33 plantillas para ganar poco
  donde vive el valor real (el canvas imperativo no se beneficia de React), y
  competiría directamente contra el roadmap de insight VW — el diferenciador.
- La disciplina de la Parte A (commits convencionales, tests como gate, listas
  "Do Not", workflow de cierre) es adoptable en una sesión con riesgo casi nulo
  y beneficio inmediato: eso sí se hace.
- La migración queda **condicionada a triggers** medibles (§6), no descartada
  para siempre.

---

## 1. Lo que costaría migrar — cuantificado

| Activo actual | Tamaño medido | Destino bajo la Parte A |
|---|---|---|
| JS vanilla en `static/` | **9,189 líneas** en ~25 módulos | Reescritura a React/TS componente a componente |
| Plantillas Jinja server-rendered | **33 archivos** | Reescritura a rutas/componentes SPA |
| Núcleo visual (`static/grafo.js`) | **1,483 líneas** de canvas 2D imperativo | Se envuelve en un componente, pero el código NO cambia de naturaleza (ver §3) |
| Suite de tests | **315 tests** (Python) | Los smoke de plantillas mueren; los de API sobreviven; suite de componentes + E2E desde cero |
| Design system GESTELL | Tokens CSS primitivo→semántico→componente en `static/styles.css` | Re-expresión en Tailwind v4: retrabajo puro con riesgo de deriva AAA |
| Pipelegado (`concentrado*.py`, `Estadistico.py`, `PDFs_*.py`) | Intocable por ley | Queda en Python: el repo sería bilingüe permanente, con dos toolchains |

Estimación honesta de esfuerzo: la sola *paridad* (mismas pantallas, cero
funcionalidad nueva) consume múltiples semanas de sesiones. Durante ese tiempo
el valor visible para VW es **cero**.

## 2. Riesgos de migrar ahora — la parte que pediste subrayada

| Riesgo | Severidad | Detalle |
|---|---|---|
| **Costo de oportunidad** | **Alta** | Cada sesión de paridad SPA es una sesión que no construye el motor de insight VW (la Pista I de `PROPUESTA_GRAFO.md`). Es el riesgo dominante. |
| **Regresión del determinismo** | Alta | La ley "mismo grafo abre idéntico" vive en `fuerzas.js`/`proyeccion.py` y sus tests. Una reescritura de la capa de datos del cliente (TanStack Query, caches, suspense) introduce reordenamientos y estados intermedios que hay que volver a domar. |
| **Pérdida de confianza de la suite** | Alta | Se pasa de 315 tests verdes a un periodo largo con cobertura parcial en la UI nueva. El estándar B5 (zero-defect) queda sin red durante la transición. |
| **Deriva del design system** | Media | GESTELL/PANOPTES está afinado a mano (AAA en dos temas, disciplina de magenta vía `--danger`/`--telos-on`, `styles.css:72`). La re-expresión en Tailwind invita a "casi iguales" que rompen la disciplina token a token. |
| **Repo bilingüe permanente** | Media | El pipelegado no se toca: Python queda sí o sí. Migrar añade Node/Vite al Docker, segunda cadena de dependencias y dos ciclos de actualización para siempre. |
| **Equipo real = 1 operador + sesiones de IA** | Media | Las ventajas de React (escala de equipo, contratación, convenciones compartidas) pagan con equipos; hoy no hay equipo que las cobre. |
| **Doble fuente de verdad transitoria** | Media | Convivencia Flask-templates ↔ SPA durante la migración: dos routers, dos estados, bugs de frontera. |

## 3. Lo que la migración NO arregla (el punto técnico clave)

El activo más complejo del frontend es el lienzo de fuerzas: render imperativo
sobre **un solo elemento `<canvas>`** (`grafo.js`), con su motor propio
(`fuerzas.js`) y su lenguaje visual PANOPTES. React organiza árboles de
componentes DOM; un canvas imperativo se integra a React como una caja opaca
dentro de un `useEffect`. Tras la migración, esas ~1,900 líneas seguirían
siendo exactamente el mismo código vanilla — envuelto. **El costo se paga
donde el beneficio no existe.** Los beneficios reales de la Parte A (tipado
estricto, Zod en fronteras, TanStack Query) aplican a la parte *fácil* del
frontend actual (fetch + pintar paneles), que hoy son ~150 líneas por vista y
ya funcionan.

## 4. Lo que SÍ adoptar ya — la disciplina de la Parte A, portada

Plan concreto para Opus 4.8 (una sesión, riesgo casi nulo):

1. **Crear `CLAUDE.md` en la raíz** (hoy no existe `CLAUDE.md`, `AGENTS.md` ni
   `.claude/`). Contenido — la Parte A traducida al stack real:
   - *Project overview*: qué es GNOSIS (2 frases).
   - *Commands*: `python3 -m pytest tests/ -q` (y por archivo), arranque
     Docker/Podman, dónde corre la app.
   - *Tech stack fijo*: Flask + vanilla JS/canvas + tokens CSS; **no introducir
     alternativas sin flag previo** (el equivalente de la regla de la Parte A).
   - *Conventions*: inglés en código/comentarios/commits; español en copy de
     UI (sin emojis); sin `console.log` ni código muerto en commits; tokens
     únicamente, sin hex/px crudos en componentes.
   - *Architecture (las leyes)*: pipelegado intocable; determinismo de la
     topología del render; provenance law; zero snake oil; sustrato local-first.
   - *Workflow gates* (el "YOU MUST" de la Parte A): tests relevantes verdes +
     re-leer el diff contra las convenciones antes de declarar terminado.
   - *Do Not list* explícita (espejo de las leyes).
2. **Lint sin build step**: `ruff` para Python (lint + format) y ESLint flat
   config para `static/*.js` (vanilla, sin transpilación). Config mínima,
   cero cambio de runtime.
3. **Commits**: ya se practican conventional commits; documentarlo en
   `CLAUDE.md` los vuelve ley del repo.
4. **Spikes opcionales, no compromisos**: (a) `pyright` sobre `autogenes/`
   (los módulos ya usan type hints — buena base); (b) `// @ts-check` + JSDoc
   en `grafo.js`. Ambos se evalúan en una sesión corta y se descartan sin
   culpa si generan más ruido que señal.

Criterio de aceptación: la suite sigue verde; `ruff`/ESLint corren limpios o
con baseline documentado; `CLAUDE.md` ≤ ~120 líneas (lean, como exige la
propia Parte A).

## 5. Riesgos de NO migrar — honestidad bidireccional

- **JS sin tipos** seguirá permitiendo regresiones silenciosas que TS habría
  atrapado. Mitigación real: ESLint + tests de humo + módulos pequeños; el
  riesgo residual es aceptable al tamaño actual (~9K líneas repartidas).
- **Sin ecosistema de componentes** (shadcn/Radix): los paneles nuevos se
  siguen construyendo a mano. Mitigación: el design system propio ya cubre lo
  que estos paneles necesitan; el costo marginal por panel es bajo.
- **Onboarding futuro**: un dev nuevo entra más caro a canvas vanilla + Jinja
  que a un stack React estándar. Mitigación: la documentación PANOPTES/docs ya
  existe; el trigger de §6 cubre el caso de que llegue equipo.

## 6. Cuándo revisitar la migración — triggers medibles

Reabrir esta decisión si ocurre **cualquiera** de:

1. GNOSIS pasa a **multi-usuario** (auth, roles, sesiones concurrentes).
2. Se requiere **colaboración en tiempo real** o UI reactiva DOM-pesada en
   decenas de vistas (no canvas).
3. Se incorporan **≥2 desarrolladores de UI** trabajando en paralelo.
4. Pivot del producto a **SaaS** distribuido a terceros.

Mientras ninguno ocurra, el veredicto de §0 se mantiene. Si ocurre, la
migración se hace **por fronteras** (primero los paneles DOM, el canvas al
final o nunca), no big-bang.
