# Plan v2 — Ingesta (F4) y Radar (F5): al 1% mundial en su dominio

Documento rector ejecutable. Modelo: `docs/PROPUESTA_GRAFO.md` (18 fases ya
ejecutadas con este patrón). Directivas del operador incorporadas en v2:
**(a)** la Ingesta reemplaza el dendrograma por un **diagrama chord circular**
— pirotécnico y deeptech, pero subordinado a las leyes; **(b)** el Radar
conserva su vista (está bien) y gana **acciones ejecutables desde el panel
derecho** (vincular, extraer, sintetizar, resolver) sin abandonar `/radar`;
**(c)** vara: superior a Palantir en este dominio, con funcionalidades elite
reales — nada de teatro.

Cero código en este documento: es el plan que Opus 4.8 ejecuta fase a fase,
cada una verificada en vivo (Playwright contra BD sembrada, ambos temas),
con tests y commit+push.

---

## 0. Resumen ejecutivo — la respuesta primero

**Dos saltos de valor, en este orden: (1) el chord de ingesta — la página
deja de mostrar el grafo aduanal entero y muestra la vía documental
Fuente→Entidad como anillo citable; (2) el radar-cabina — cada fuga y
urgencia se resuelve inline con HITL, y la vía se re-dibuja en vivo al
resolver.** El resto es pulido disciplinado (AAA Daylight, dedupe por hash,
merge-preview, benchmark del gauge, accesibilidad). La auditoría v1 (§2)
sigue vigente como base de evidencia; sus fases F-I2…F-I5 y F-R1/F-R2
quedan absorbidas dentro de las pistas C y T de este plan.

**Lo que NO cambia:** el motor del metabolismo (`metabolismo.py`) y su
lienzo central; el flujo HITL de extracción (saneo doble, quórum); la puerta
única `Sustrato`; el pipelegado.

## 0.1 Estado de ejecución (vivo — actualícese al cerrar cada fase)

| Fase | Estado | Nota |
|------|--------|------|
| C1 · Proyección chord | HECHO | doble corrida; sin nodos aduanales |
| C2 · Render chord AAA | HECHO | AAA computado (acc 11.5/7.5, danger 8.2/7.3); dendro.js retirado (huérfano) |
| C3 · Dossier del artefacto | HECHO | resumen por defecto + dossier; mata la pantalla muerta |
| T1 · API de acciones + procedencia de relación | HECHO | ag_relaciones.origen (migración aditiva); POST /relacion, DELETE /evento |
| T2 · Triage inline en el radar | HECHO | vincular+resolver+extraer+sintetizar verificados en vivo end-to-end (extraer/sintetizar con DeepSeek real: extraer→merge-preview→integrar y generar informe→dockear) |
| T3 · Feedback vivo post-acción | HECHO | transición única 600ms + contador de visita; reduced-motion estático |
| C4 · Pirotecnia disciplinada | HECHO | glow estático + flux en hover + barrido de entrada. **Rotación idle DESCARTADA** (degradaba etiquetas radiales; sospecha confirmada) |
| C5 · Bandeja v2 + dedupe por hash | HECHO | frío ordenable/filtrable; dedupe sha256 con 409; migración guarded FK-safe |
| C6 · Merge-preview de extracción | HECHO | marca NUEVA/YA EXISTE con el mismo _norm de la integración; sin scores |
| T4 · Gauge con benchmark + detalle por defecto | HECHO | ▲/▼ vs sesión previa (misma fórmula) o "sin base previa"; detalle abre la fuga mayor |
| C7/T5 · Accesibilidad (tabla, teclado, aria) | HECHO | tabla alternativa del chord + teclado (flechas/Enter/Escape); triage con foco+Escape+aria-live |
| T6 · Deshacer última acción (opcional) | HECHO | deshacer del Vincular (DELETE /relacion, cortar_relacion). Evento irreversible; informe requiere LLM — fuera de alcance verificable |

**Plan completo.** 18 commits; gates verdes por fase (ruff · eslint 0 errores ·
pytest 370 · capturas AAA ambos temas). TODO verificado en vivo end-to-end,
incluidos los caminos de extraer/sintetizar inline con un proveedor DeepSeek
real: extraer una fuente fría → merge-preview (8 NUEVA / 0 YA-EXISTE con datos
del modelo) → integrar (entidades 8→16, la fuente deja de estar fría) y generar
informe citado → dockear (productos 1→2). El bucle completo de la cabina llevó
el avance del caso de 54% a 76% sin salir del radar. Procedencia correcta: la
extracción escribe origen=synesis (propuesta del modelo, aprobada por HITL); el
Vincular manual, origen=operador.

## 1. Autocrítica de v1 y decisiones fijadas

- v1 diagnosticó bien (el "Mapa de Ingesta" es el árbol de ontología con 40
  hojas VIN; AAA roto en Daylight; radar sólido) pero propuso conservar el
  dendrograma con otra fuente de datos. El operador decidió: **chord
  circular**. Correcto para este dato: la relación artefacto↔entidad es
  bipartita con pesos (citas), exactamente lo que un chord codifica mejor
  que un árbol; el frío se ve como arco sin cintas — la ausencia se vuelve
  visible, que es el punto.
- v1 trató el radar como "pulido menor". El operador subió la vara: el radar
  pasa de espejo a **cabina de mando** (acciones inline). Eso es más valioso
  que cualquier retoque visual y v1 lo subestimó.
- Decisión ya tomada en v1 que se mantiene: `senales_de_sesion` es proveedor
  de datos/conteo; el metabolismo es LA vista. No se construye una segunda
  vista de señales crudas.

## 2. Auditoría v1 condensada (evidencia vigente)

- **H1** `autogenes_ingesta.html:45` + `dendro.js:228` → el mapa renderiza
  `proyeccion.arbol_ontologia` (`proyeccion.py:218`): núcleo→pedimentos→
  vehículos VIN. Los artefactos quedan sepultados (captura `ing_noct.png`).
- **H2** AAA roto en Daylight: aristas `--line-2` @ alpha 0.42
  (`dendro.js:126`), etiquetas `t3` (`ing_day.png`).
- **H3** Etiquetas encimadas/recortadas (bandeja a 20 chars `ingesta.js:53`;
  nodos a 24 `dendro.js:178`).
- **H4** La bandeja no distingue frío de metabolizado (`ingesta.js:53-55`).
- **H5** Panel "Revisa e Integra" vacío por defecto (`autogenes_ingesta.html:56`).
- **H6** Redibujo del mapa completo por CADA archivo del lote (`ingesta.js:110`).
- **R2** El gauge no cumple la gramática de tarjeta: sin benchmark
  (`metabolismo.js:110-114`).
- **R3** Panel de detalle del radar muerto hasta el primer clic
  (`metabolismo.js:306`).
- **Verificado además para v2:** no existe POST de relación individual ni
  DELETE de evento (inventario completo de rutas revisado); `ag_relaciones`
  **no guarda `origen`** (las entidades sí — `models_autogenes.py`, tabla
  `ag_relaciones`): una relación manual hoy sería procedencia incompleta;
  no hay dedupe por contenido en la ingesta (`ingesta.py`, sin hash).

## 3. La vara — "1% mundial / superior a Palantir en su dominio", en medibles

Honestidad primero: Palantir Foundry gana en escala, pipelines y ecosistema.
Nuestra superioridad es **en este dominio y modo de uso**: analista único,
caso aduanal VW, local-first, procedencia citable al fragmento, HITL real y
latencia local sub-segundo — cosas donde Foundry es pesado y opaco. La vara
se alcanza cuando **todo** esto pasa:

1. **Ingesta:** un tercero identifica en <5 segundos qué fuentes están frías
   y qué produjo cada fuente, sin leyenda externa. Cero nodos aduanales
   (vehículo/marca/país) en el chord.
2. **Radar:** toda fuga y toda urgencia es accionable en **≤2 interacciones
   sin salir de `/radar`**; ninguna escritura sin confirmación explícita;
   todo queda en bitácora WORM; la vía re-dibuja el efecto de cada acción.
3. **AAA medido** (no estimado) en Nocturne y Daylight para cada texto y
   marca gráfica esencial de ambas páginas; `prefers-reduced-motion` degrada
   TODO a estático; sin flashes >5 Hz.
4. **Procedencia completa:** toda relación nueva declara `origen`; toda
   cifra citable a fila/fragmento; cero montos/confianzas inventados.
5. **Determinismo:** proyección chord y toda métrica nueva con test de doble
   corrida idéntica; mismo estado → mismo dibujo.
6. **Rendimiento medido:** chord fluido con 50 artefactos / 200 entidades
   (rollup declarado "+N más" si excede); si no cumple, se mide y se decide
   — no se optimiza especulativamente.
7. **Gates:** ruff limpio · eslint 0 errores · pytest verde · capturas ambos
   temas · commit convencional + push, POR FASE.

## 4. Pista C — la Ingesta chord (deeptech disciplinado)

### C1 · Proyección `chord_ingesta` — los datos primero [M]
**Qué:** función pura read-only que proyecta la sesión a la forma chord:
- **Hemisferio izquierdo:** un arco por artefacto, agrupados por `kind`
  (pdf/estructurado/imagen/nota), tamaño ∝ fragmentos (mínimo visible).
  Orden estable por `created_at, id`.
- **Hemisferio derecho:** un arco por entidad, agrupadas por `tipo`, tamaño
  ∝ citas recibidas (mínimo visible). Rollup: por encima de un umbral (48
  arcos de entidad), el excedente POR TIPO colapsa en un arco agregado
  "+N más" — nunca se oculta en silencio (misma ley que el árbol actual).
- **Cintas:** artefacto→entidad con grosor ∝ nº de fragmentos de ese
  artefacto citados por esa entidad (intersección `evidencia` ∩ fragmentos
  del artefacto — el dato ya se computa así en `ingesta.listar_artefactos`
  y `senales.fuentes_frias`; reutilizar el patrón, no duplicar queries a
  ciegas).
- **Frías:** artefacto sin cinta → bandera `fria: true`.
- **Cabecera:** fuentes totales, frías, entidades, **cobertura** =
  fragmentos citados / fragmentos totales (la métrica honesta de "cuánto de
  lo traído se volvió conocimiento").
**Archivos:** `autogenes/proyeccion.py` (nueva función; o módulo
`autogenes/chord.py` si supera ~150 líneas — decisión del ejecutor), ruta
GET `/api/v1/autogenes/chord_ingesta` en `rutas/autogenes.py`,
`tests/test_chord_ingesta.py`.
**Aceptación:** doble corrida idéntica; sesión vacía → estructura vacía sin
error; rollup activo con 200 entidades sembradas; cero referencias a tablas
aduanales de vehículos.
**Riesgo:** N+1 queries por artefacto — mitigación: una query de fragmentos
y una de evidencias, agregadas en Python (patrón `senales.py:44-58`).

### C2 · Render chord en canvas — el anillo AAA [L]
**Qué:** `static/chord.js` nuevo (canvas 2D, JS vanilla, cero librerías —
ley local-first: ni d3 ni nada externo). Reemplaza a `dendro.js` SOLO en la
plantilla de ingesta (dendro.js queda; otras páginas pueden usarlo).
- **Layout determinista:** ángulos por acumulación de pesos + separadores
  por grupo; sin física ni aleatoriedad. Mismo JSON → mismos píxeles.
- **Cintas:** béziers hacia el centro, alpha desde tokens; color del acento
  (`--acc-text`); las cintas de una fuente fría no existen — su arco lleva
  **anillo `--danger`** punteado (el magenta solo aquí: es señal de riesgo
  real, cumple la ley).
- **Hover en arco:** aísla sus cintas (el resto baja a un alpha mínimo que
  siga siendo AAA-legible), tooltip con la cifra citable ("3 fragmentos ·
  2 entidades citantes"). Hover en cinta: resalta esa unión.
- **Etiquetas:** radiales fuera del anillo, tangentes al ángulo del arco;
  resolución de colisión (si dos etiquetas se traslapan, la de menor peso se
  suprime y su dato vive en hover + tabla accesible); NUNCA recortadas por
  el borde del lienzo (padding calculado del radio + texto máximo).
- **Temas:** paleta 100% tokens leída de `getComputedStyle` con re-lectura
  al alternar tema (patrón `metabolismo.js:375-378`); contraste AAA medido
  en ambos (ver §8 método).
- **Reduced-motion:** estático absoluto. DPR-nítido, redibujo en resize.
**Archivos:** `static/chord.js`, `templates/autogenes_ingesta.html` (swap de
script y leyenda), `static/styles.css`/`constelacion.css` solo si falta un
token.
**Aceptación:** capturas ambos temas con la BD sembrada (5 artefactos, 3
fríos, 8 entidades) y con la BD "grande" (50/200, rollup visible); cero
errores de consola; eslint 0 errores.
**Trade-off declarado:** se pierde la jerarquía visual de fragmentos que el
dendro daba; los fragmentos pasan al dossier (C3), donde se leen mejor.
**Riesgo:** el chord con pocas entidades se ve vacío — mitigación: radios y
grosores con mínimos visibles; el estado "poco" es información, no fallo.

### C3 · El dossier del artefacto — mata la pantalla muerta [M]
**Qué:** el panel derecho deja de estar vacío:
- **Por defecto:** resumen de sesión con gramática de tarjeta (fuentes,
  frías, cobertura %, última integración de bitácora).
- **Click en arco de artefacto:** dossier — kind, páginas, fragmentos
  expandibles (texto citable), entidades citantes (enlazan al grafo),
  botón **Extraer** (dispara el flujo HITL existente de `ingesta.js`) y la
  marca de frío si aplica.
- **Click en arco de entidad:** sus fuentes (artefactos que la sustentan) y
  enlace a `/autogenes/grafo`.
**Archivos:** `static/ingesta.js` (integración chord↔dossier vía evento o
API expuesta en el contenedor, patrón `dendroAPI`), plantilla.
**Aceptación:** ningún panel vacío al cargar; el flujo extraer→revisar→
integrar completo sin salir de la página; captura del dossier.

### C4 · Pirotecnia disciplinada — deeptech sin violar una sola ley [M]
**Qué:** la capa "wow" DESPUÉS de que el instrumento funciona:
- Partículas de flux recorriendo las cintas en hover (reuso del patrón de
  partículas de `metabolismo.js:143-155` — ya probado, ya AAA).
- Glow tokenizado en arcos vivos (patrón shadowBlur de `dendro.js:143`).
- **Entrada de arco nuevo:** al terminar una ingesta, el arco del artefacto
  nuevo entra con UN barrido angular ≤600 ms con easing desde tokens de
  motion; UNA vez, sin loop.
- Rotación sutil del anillo completo en idle (<0.5°/s) SOLO si no degrada
  legibilidad de etiquetas — si las etiquetas radiales tiemblan o el costo
  de CPU en idle es medible, SE DESCARTA y se registra en §0.1. Sospecha
  honesta: probablemente se descarta.
- Todo lo anterior congelado con `prefers-reduced-motion`; rAF pausado con
  `document.hidden` (patrón `metabolismo.js:279-287`); sin flashes >5 Hz.
**Aceptación:** captura + verificación con reduced-motion activado
(Playwright `reducedMotion: 'reduce'`) mostrando estático; CPU idle sin
partículas ≈ 0 (rAF no corre sin hover si la rotación se descartó).
**Riesgo dominante:** que la pirotecnia coma legibilidad — mitigación: cada
efecto se evalúa contra la vara §3.1/§3.3 y se descarta con nota honesta si
no la cumple. La estética sirve al dato, no al revés.

### C5 · Bandeja v2 + dedupe por hash [M]
**Qué:**
- **Frío visible:** cada artefacto de la bandeja marca frío/metabolizado
  (dato de C1); orden "frías primero"; filtro "solo frías". (Absorbe F-I3.)
- **Sin recortes:** nombres con ellipsis CSS + title completo. (H3.)
- **Redibujo 1×/lote:** el bucle secuencial refresca bandeja+chord al
  terminar el lote, no por archivo. (Absorbe F-I5/H6.)
- **Dedupe por contenido:** sha256 del binario al ingestar; si la sesión ya
  tiene un artefacto con ese hash → rechazo honesto con el nombre del
  duplicado (HTTP 409). Migración **aditiva** (columna `hash` nullable en
  `ag_artefactos`, sin backfill); la escritura entra por
  `Sustrato.crear_artefacto` (parámetro opcional) — puerta única intacta.
  Elite real: evita el silencio de re-ingestar el mismo PDF dos veces, que
  hoy duplica fragmentos y contamina la cobertura.
**Archivos:** `ingesta.js`, `autogenes/ingesta.py`, `autogenes/sustrato.py`,
`database/models_autogenes.py`, `rutas/autogenes.py` (409), tests de rutas
e ingesta.
**Aceptación:** subir el mismo archivo dos veces → segundo rechazado con
mensaje accionable; test HTTP del 409; lote de N → 1 redibujo (verificable
por conteo de fetches en Playwright).

### C6 · Merge-preview — resolución de entidades a escala honesta [M]
**Qué:** en la revisión HITL, cada entidad propuesta se marca **NUEVA** o
**YA EXISTE** (match por nombre normalizado + alias contra `ag_entidades`,
read-only — la misma normalización `_norm` que ya usa
`Sustrato._integrar_lote`, para que el preview jamás contradiga a la
integración). El operador ve ANTES de integrar qué crecerá el grafo y qué
solo sumará evidencia a lo existente. Es la versión honesta del entity
resolution de Palantir: sin scores inventados — o el nombre normalizado
coincide o no.
**Archivos:** `autogenes/extraccion.py` (anotación en la respuesta de
`/extraer`, computada contra la sesión), `static/ingesta.js` (render de la
marca), test.
**Aceptación:** proponer una entidad ya existente la marca YA EXISTE y al
integrar no duplica (el upsert ya lo garantiza — el preview solo lo hace
visible); doble corrida del anotador.

### C7 · Accesibilidad del chord [M]
**Qué:** paridad con el estándar A1/A2 que el grafo ya tiene:
- **Tabla accesible alternativa** (toggle): artefacto | kind | fragmentos |
  entidades citantes | frío — el mismo dato del chord, navegable con lector
  de pantalla.
- **Teclado:** flechas rotan la selección de arco, Enter abre el dossier,
  Escape lo cierra; foco visible.
- `aria-live` en los estados de carga/ingesta (ya existe `role="status"`,
  verificar que anuncia).
**Aceptación:** operación completa de la página sin ratón, verificada con
Playwright (navegación por teclado real).

## 5. Pista T — el Radar-cabina (acciones sin abandonar `/radar`)

### T1 · API de acciones + procedencia de relación [M]
**Qué:** el mínimo de rutas que faltan, con la ley de puerta única:
- **POST `/api/v1/autogenes/relacion`** — crea UNA relación
  (`Sustrato.agregar_relacion`): valida que `desde_id`/`hasta_id` existen en
  la sesión, `tipo` no vacío, evidencia opcional saneada contra fragmentos
  reales (JAMÁS ids fabricados; vacía es válida — es una afirmación del
  operador).
- **Migración aditiva de procedencia:** columna `origen` en `ag_relaciones`
  (`TEXT NOT NULL DEFAULT 'synesis'`), escrita por `agregar_relacion`
  (parámetro `origen`, default actual). Sin esto, la vara §3.4 no se cumple:
  hoy una relación no declara quién la afirmó. Las relaciones del triage
  entran con `origen='operador'`. Backfill: no (el default documenta que lo
  previo era synesis/operador indistinto — limitación heredada, se anota).
- **DELETE `/api/v1/autogenes/evento/<id>`** — resuelve un vencimiento
  (`Sustrato.quitar_evento`; ya registra en bitácora).
- Reuso sin cambios: `/extraer`, `/integrar`, `/sintetizar`,
  `/sintesis/dockear`, `/grafo` (fuente del typeahead).
**Archivos:** `rutas/autogenes.py`, `autogenes/sustrato.py`,
`database/models_autogenes.py`, `tests/test_http_rutas.py` (candados POST,
404/422 honestos), test de sustrato (origen persiste).
**Aceptación:** POST relación con id ajeno a la sesión → 422; evidencia
fabricada → filtrada; bitácora registra ambas acciones.

### T2 · Triage inline — el panel derecho ejecuta [L]
**Qué:** en `/autogenes/radar`, cada ítem accionable gana su acción in situ,
SIEMPRE en dos pasos (intención → confirmación); nada se escribe solo:
- **Huérfana** (fuga de vinculación, clic en la gota o en el detalle) →
  "Vincular": typeahead sobre las entidades reales de la sesión (datos de
  `/grafo`), campo de tipo con datalist de los verbos ya usados en la sesión
  (derivado, no inventado), confirmar → POST `/relacion` (origen=operador).
- **Fuente fría** (fuga de extracción) → "Extraer aquí": `/extraer` →
  mini-revisión HITL en el panel (checkboxes, mismas reglas que ingesta;
  el render de propuesta se extrae a un módulo compartido
  `static/propuesta.js` para no duplicar `pintarPropuesta` — o se duplica
  mínimo con nota, decisión del ejecutor según tamaño real) → `/integrar`.
- **Síntesis pendiente** → "Generar informe": `/sintetizar` → preview
  citado en el panel → "Dockear" → `/sintesis/dockear`.
- **Vencimiento** → "Resolver" con confirmación → DELETE evento.
- **Urgencias con ruta** (norma, concilia, errores) conservan su enlace —
  esas SÍ deben salir de la página porque su resolución es otra superficie
  entera; fingir que se resuelven inline sería teatro.
**Archivos:** `static/metabolismo.js` (o `static/radar_triage.js` nuevo si
supera ~200 líneas), `templates/autogenes_radar.html`, módulo compartido de
propuesta.
**Aceptación (la vara §3.2):** huérfana vinculada, fría extraída+integrada,
informe dockeado y evento resuelto — los cuatro flujos completos verificados
en vivo con Playwright SIN navegación fuera de `/radar`; cada uno visible en
`/api/v1/autogenes/bitacora`.
**Riesgo dominante:** el panel derecho se vuelve un formulario infinito —
mitigación: una acción abierta a la vez; el estado colapsa al confirmar o
cancelar.

### T3 · Feedback vivo — la fuga baja delante del operador [S–M]
**Qué:** tras cada acción confirmada, re-fetch de `/metabolismo` y
transición ÚNICA de la vía (la banda crece, la gota encoge, ≤600 ms, tokens
de motion, estático con reduced-motion). Contador de sesión de trabajo:
"N resueltas en esta visita" (estado en memoria del cliente, se declara así
— no se persiste ni se finge histórico).
**Aceptación:** vincular una huérfana reduce la fuga de vinculación en
pantalla sin recargar; captura antes/después.

### T4 · El gauge cumple la gramática + detalle por defecto [S]
**Qué:** (hereda F-R1/F-R2 de v1)
- Benchmark en el gauge: "▲/▼ N pts vs sesión previa" derivado de los
  snapshots de telemetría que ya se persisten (`_snapshot_telemetria`); sin
  sesión previa → "sin base previa" (se dice, no se inventa).
- Al cargar, el panel de detalle abre la fuga mayor (el estado inicial ya es
  útil).
**Archivos:** `autogenes/metabolismo.py` (lectura pura del snapshot previo),
`static/metabolismo.js`, test de doble corrida del delta.
**Aceptación:** delta derivable y citable; sin previa lo declara; captura.

### T5 · Accesibilidad del triage [S]
**Qué:** las acciones inline operables por teclado (foco al abrir el
formulario, Escape cancela, orden de tabulación sano), `aria-live` anuncia
el resultado ("Relación creada — fuga de vinculación: 1").
**Aceptación:** los cuatro flujos de T2 completables sin ratón.

### T6 · Deshacer última acción [S — opcional, al final]
**Qué:** revertir la última acción del triage (cortar_relacion /
quitar_producto ya existen en Sustrato; el evento resuelto NO se restaura —
se declara irreversible en el confirm). Solo la última, solo en la visita
actual, bitácora registra el reverso.
**Trade-off:** valor real pero no esencial; si el presupuesto de la sesión
se agota, se descarta sin culpa y se anota.

## 6. Funcionalidades elite evaluadas — entran / no entran

| Funcionalidad | Veredicto | Por qué |
|---|---|---|
| Chord bipartito con frío visible | **ENTRA (C1-C2)** | Codifica exactamente el dato de la página; la ausencia (frío) se ve |
| Dossier citable por fuente | **ENTRA (C3)** | Palantir-grade: de la cinta al fragmento en 2 clics |
| Dedupe por hash de contenido | **ENTRA (C5)** | Previene corrupción silenciosa de cobertura; barato |
| Merge-preview (entity resolution honesto) | **ENTRA (C6)** | Decisión informada pre-integración; sin scores inventados |
| Triage inline con HITL | **ENTRA (T2)** | El salto espejo→cabina; nadie en este nicho lo tiene local-first |
| Procedencia de relación (`origen`) | **ENTRA (T1)** | Sin esto la vara de procedencia es mentira parcial |
| Feedback vivo post-acción | **ENTRA (T3)** | Causa→efecto visible; convierte el radar en loop de trabajo |
| Rotación idle del anillo | **CONDICIONAL (C4)** | Si degrada etiquetas o CPU, fuera — sospecha: fuera |
| Sugerencia automática de vínculos (IA) | **NO** | Un score de "probabilidad de vínculo" sin evidencia citada es snake oil aquí; el typeahead sobre entidades reales basta |
| WebGL/3D/shaders | **NO** | Stack fijo (canvas 2D vanilla); costo alto, valor decorativo |
| Force-directed en ingesta | **NO** | No determinista; ley del render |
| Streaming token-a-token del informe | **NO** | Complejidad sin valor HITL: el informe se revisa completo o no |
| Sonido/gamificación | **NO** | Ruido |
| Edición de evidencia desde el radar | **NO** | Fabricar procedencia está prohibido por ley del repo |

## 7. Orden de ejecución y gates

**Orden:** C1 → C2 → C3 → **T1 → T2 → T3** → C4 → C5 → C6 → T4 → C7+T5 → T6(opc.)

Racional: primero el núcleo del chord (C1-C3, el defecto estructural), luego
el salto de la cabina (T1-T3, el mayor valor nuevo), después pirotecnia y
pulido — el orden inverso (pirotecnia primero) sería maquillar antes de
operar. C4 exige que C2 esté estable; C5/C6 no bloquean a nadie; la
accesibilidad va antes del opcional porque es vara, no adorno.

**Gate POR FASE (innegociable, de CLAUDE.md):**
1. `python3 -m ruff check .` limpio · `npx eslint static` 0 errores.
2. `python3 -m pytest tests/ -q` verde (baseline 348+; toda métrica nueva
   con doble corrida).
3. Verificación EN VIVO: Flask contra BD sembrada + Playwright, captura
   Nocturne Y Daylight; consola sin errores.
4. Commit convencional en inglés (un cambio lógico), push con backoff a
   `claude/gnosis-autogenes-i-85bwsd`. Actualizar §0.1. Sin PR salvo pedido.

## 8. Instrucciones de arranque y verificación para el ejecutor (Opus 4.8)

1. **Arranque:** checkout de la rama; instalar deps (`ruff pytest networkx
   pandas pydantic openpyxl xlrd python-dateutil`, luego
   `--ignore-installed blinker flask anthropic requests`, `playwright`,
   **y `python-dotenv`** — faltó en el contenedor esta sesión y tumba 73
   tests con ModuleNotFoundError). Baseline: 348 passed, 1 skipped.
2. **Andamiaje (recrear en el scratchpad, es barato):** `seed_demo.py` —
   BD en disco con 40 vehículos (VW/AUDI/SEAT/PORSCHE, 3 aduanas, 3 países),
   5 artefactos (3 fríos), 8 entidades (2 huérfanas), 4 relaciones, 1
   evento en ventana, faltantes/errores; nota: `facturas_errores` usa
   `filename/error_message`, no `factura/motivo`. Variante "grande" para
   C1/C2: 50 artefactos / 200 entidades (bucle en el mismo script).
   `shot.py` — Playwright con chromium de
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, tema vía
   `localStorage['gestell-theme'] = 'dark'|'light'` ANTES del goto final,
   `networkidle` + 3500 ms, captura pageerror/console. Flask:
   `JARVIS_DB_PATH=<db> GNOSIS_PORT=5055 python3 app.py` (5055; 5060 es
   puerto unsafe de Chromium). Reiniciar Flask tras tocar Python.
3. **Método AAA (vara §3.3):** el contraste no se estima — se computan los
   ratios de los pares token/fondo usados por chord y triage en ambos temas
   (script corto sobre los valores de `styles.css`) y se citan en el commit
   de C2; umbral AAA 7:1 texto normal, 4.5:1 texto grande/marcas gráficas
   esenciales.
4. **Los cuatro flujos de T2 se verifican con Playwright de verdad**
   (click → formulario → confirmar → assert del re-fetch y de la bitácora),
   no solo con captura estática.
5. **Honestidad de cierre de fase:** lo descartado (p. ej. rotación idle) se
   anota en §0.1 con el porqué medido, igual que hizo PROPUESTA_GRAFO §0.1.

## 9. Leyes transversales (recordatorio, no negociable)

Pipelegado intocable · toda escritura por `Sustrato` con procedencia y
bitácora · determinismo con doble corrida · NetworkX confinado a caminos ·
local-first, cero peticiones externas · tokens CSS, magenta solo
`--danger`/`--telos-on` · AAA ambos temas · motion desde tokens, sin flashes
>5 Hz, reduced-motion estático · copy UI en español sin emojis; código y
commits en inglés · sin console.log ni código muerto · gramática de tarjeta
en todo número: **cifra + unidad + periodo + benchmark → so-what → now-what
derivado → fuente**.
