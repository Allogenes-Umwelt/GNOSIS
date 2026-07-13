# Propuesta v3 — el grafo de AUTOGENES: de visor de clase mundial a instrumento de investigación superior a Palantir en su dominio

> **v3 · 2026-07-13.** Sustituye a v2 (`c7fb7bf`); autocríticas en §1.
> Ejecutor: Opus 4.8 — el arranque operativo está en §12. **Cero código de
> producción aquí.** Toda afirmación sobre el estado actual está verificada
> con evidencia `archivo:línea`. Documento compañero:
> `docs/BENCHMARK_PALANTIR.md` (qué significa "superior a Palantir" en
> medibles, y dónde no competimos por diseño).
>
> **Marco de decisión (B0):** la pregunta es qué convierte al grafo en un
> instrumento de investigación y decisión superior a Palantir en el dominio
> aduanal-automotriz, en cuatro frentes: insight de red accionable, flujo de
> investigación, estética y navegabilidad/accesibilidad. Decisión que
> informa: el orden de las próximas sesiones de ejecución. Decisor: Julio.
> Evidencia que cambiaría la respuesta: profiling que contradiga §6-L3, o
> sesiones reales cuya estructura degenere las métricas (§4) — en cuyo caso
> las superficies se degradan declaradas, nunca muestran números vacíos.

---

## 0. Resumen ejecutivo — la respuesta primero

**Qué se construye: tres pistas.**

- **Pista I (Insight):** red de flujo derivada *país → aduana → marca* con
  pesos 100% medidos + siete análisis que responden preguntas de negocio
  (intermediación, corte mínimo, redundancia de rutas, HHI, lift de
  anomalías, similitud conductual, deriva entre sesiones), surfaceados con un
  selector de lente y un panel VW donde **cada tarjeta cumple la gramática:
  cifra + unidad + periodo + benchmark → so what → now what derivable →
  fuente citada**.
- **Pista L (Lienzo):** navegación de clase mundial (deep-link, historial,
  minimapa), la lista del 1% de estética/accesibilidad (§7) y rendimiento
  solo donde el profiling lo exija.
- **Pista P (Investigación — lo nuevo de v3, la brecha real contra
  Palantir):** el flujo completo del analista sobre el lienzo:
  investigaciones guardadas y reabribles, search-around tipado, selección
  múltiple con operaciones de grupo, **what-if de caída en el lienzo
  principal** (el motor ya existe completo en `cascada.py` — solo falta
  surfacearlo), facetas con histograma vinculado, modo diff de sesiones,
  mapa esquemático de flujos, paleta de comandos y vigilancia con delta
  medido. Dos de sus fases son casi gratis (P3, P7).

**Qué se rehúsa (§4.2 y benchmark §4):** closeness, PageRank protagonista,
betweenness sobre la proyección de procedencia (casi-árbol → teatro), FDEB,
WebGL por defecto, GIS real, multi-analista, y cualquier insight con monto o
confianza no derivable de filas reales.

**Por qué este orden (§9):** I1→I2 es la cadena crítica del valor; P3+P7 son
victorias baratas inmediatas (servidor hecho); L1 es prerrequisito de P1;
P4/P6 son las fases caras y van al final.

---

## 0.1 Estado de ejecución (vivo — actualícese al cerrar cada fase)

**Completado** (rama `claude/gnosis-autogenes-i-85bwsd`):
- **Sesión 0** — `CLAUDE.md` + gates ruff/ESLint sin build step; y el bug de
  `ingesta.js` (ReferenceError de `imgs`) que el linter atrapó.
- **P3** — what-if de caída en el lienzo (surfacea `cascada.py`, ya hecho):
  nodo que arde + aristas que caen + veredicto medido, ambos temas AAA.
- **P7** — paleta de comandos Ctrl/Cmd+K, operación sin ratón.
- **I1** — red de flujo derivada país→aduana→marca + `intermediacion`
  (Brandes) y `min_corte` (Edmonds–Karp) puras y deterministas en
  `topologia.py`; `analisis_vw.py` + `GET /api/v1/autogenes/analisis`.
- **I2** — panel VW en `/autogenes/vinculos`: la red de flujo traducida a
  negocio con la gramática de tarjeta obligatoria. Verificado en vivo.
- **L1** — navegación: estado deep-linkable en el hash (reproduce la vista
  exacta; el snapshot que P1 guardará), minimapa con rectángulo de viewport,
  e historial de foco (Alt+←/→). Los tres verificados en vivo.
- **A1/A2/A3** — accesibilidad: modo tabla (la alternativa WCAG real —
  payload como tabla ordenable, canvas aria-hidden mientras está activa),
  controles de vista por teclado (+/−/0), y la región viva del inspector.
- **P1** — investigaciones guardadas: el estado del lienzo + nota del
  operador como `Producto{investigacion}` por la puerta del Sustrato
  (procedencia/WORM), reabrible; migración del CHECK de `ag_productos`;
  excluidas de la proyección (son meta, no hallazgo). Verificado en vivo.
- **P2** — selección múltiple: shift-clic + lazo rectangular, resalte de la
  selección, resumen MEDIDO en la línea de estado (nodos, vehículos, valor
  Σ sin doble conteo) y operaciones de grupo (aislar/limpiar) en la paleta.
  Verificado en vivo. Incluye el search-around tipado (aislar vecinos por
  kind desde la paleta).
- **I3** — benchmark de pares: similitud conductual marca~VW (coseno sobre
  features de origen/aduana/preferencia) + brecha de preferencia J/N vs pares
  en rutas idénticas (en unidades, sin montos). Verificado en vivo.
- **I4** — deriva entre sesiones + rutas esperadas-pero-ausentes (vs pares y
  vs sesión previa). Cierra la Pista I. Verificado en vivo.
- **P5** — diff de sesiones: selector de referencia + tarjeta de deriva en el
  panel VW (no en el lienzo — las rutas de flujo no mapean a la procedencia,
  como el selector de lente). Verificado con una BD de dos sesiones.

**Decisiones de ejecución (concurridas por el operador):**
- **El selector de lente estructural del lienzo se DESCARTA** (se mueve a §4.2).
  Razón medida al ejecutar I1: las métricas de flujo (intermediación, corte,
  HHI) viven en la red DERIVADA cuyos nodos (`aduana:*`, `marca:<nombre>`) no
  existen en el lienzo de procedencia (sin nodos aduana, `marca:<id>`), así que
  no mapean. Y las únicas métricas que el lienzo sí tiene —grado, centralidad,
  comunidad— ya se codifican por tamaño (centralidad) y posición (comunidad):
  recolorearlas es re-decir en color lo que el ojo ya recibe, sin responder
  ninguna pregunta de negocio nueva. Se re-evalúa solo si el lienzo gana
  métricas nuevas por nodo (p. ej. lift Δ proyectado) o si la red de flujo se
  dibuja como vista propia.
- **E2 (rampa cromática CVD-safe de comunidad) se reubica a L2** como un commit
  suelto de pulido — no necesita el aparato del selector para existir.

**Siguiente:** L3 (culling + persistencia de posiciones) y el pulido §7
(halos, alfa por peso, rampa E2), luego las fases caras P4 (facetas +
histograma), P6 (mapa esquemático) y P8 (vigilancia, sobre P1+I4).

---

## 1. Autocríticas — v1 y v2, porque el documento debe practicar lo que exige

**v1** (resumen; detalle en historia git): auditoría sólida, entregable débil —
sin BLUF, títulos-tema, eje estético subatendido, accesibilidad sobrestimada,
sin paralelización ni tallas, sin HHI/lift/redundancia, sin puente
grafo→deck, y un token citado que no existe (`--coral`; el real es
`--danger`→`--telos-on`, `styles.css:72`).

**v2 — lo que le faltaba y v3 corrige:** v2 hizo el grafo **legible y
honesto**, pero lo dejó como *visor*. El valor central de Palantir no es el
dibujo: es el **flujo de investigación**, y v2 no competía ahí:

1. **Sin capa de investigación.** Nada de guardar/reabrir/anotar un análisis
   en curso. El deep-link (L1) guarda una *vista*, no una *investigación*.
2. **What-if sin surfacear pese a estar construido.** `cascada.py` computa
   caída simulada con islas antes/después, relaciones caídas, peso
   estructural y ondas BFS para la animación — puro, testeado (spec
   `tests/test_cascada.py`) y ya expuesto en
   `/api/v1/autogenes/qualia/cascada` (`rutas/autogenes.py:488-521`). v2 ni
   lo mencionó. Es la mejora de mayor valor/costo de toda la propuesta.
3. **Selección única.** Todo el modelo de interacción es un solo `sel`
   (`grafo.js:659`); sin lasso, sin operaciones de grupo — el gesto analítico
   más básico de Gotham.
4. **Sin facetas ni vistas vinculadas.** Los filtros son por kind
   (leyenda); no hay filtrado por propiedades (precio, J/N, aduana, mes) ni
   histograma ligado a la selección.
5. **Sin pivote tipado.** "Expandir" solo abre racimos ν×N; no existe
   search-around por tipo de enlace.
6. **Sin vigilancia.** El operador no puede marcar nodos y recibir el delta
   medido al llegar la sesión siguiente.

---

## 2. La vara: "clase mundial / superior a Palantir" en medibles

El grafo alcanza la vara cuando **todo** lo siguiente pasa:

| Eje | Medible | Verificación |
|---|---|---|
| Funcional | Toda cifra visible con unidad, periodo y fuente; cero números huérfanos | Test que recorre tarjetas/panel y falla ante cifra sin metadatos |
| Funcional | Misma BD → mismas coordenadas y mismas cifras (doble corrida) | Test de igualdad exacta |
| Insight | Cada lente responde una pregunta de negocio nombrada, con evidencia enlazada | Tabla §4 (pregunta ↔ lente ↔ fuente) |
| Investigación | Guardar una investigación y reabrirla reproduce estado + notas + tarjetas exactos | Test de ida y vuelta (P1) |
| Investigación | What-if de caída a ≤2 gestos desde cualquier nodo estructural, con impacto 100% medido | Revisión de flujo (P3) |
| Investigación | El diff de dos sesiones es legible en el lienzo en un vistazo (ganado/perdido) | Captura por tema (P5) |
| Navegable | Pegar una URL reproduce la vista exacta | Playwright ida y vuelta (L1) |
| Navegable | Toda acción alcanzable sin ratón (teclado + paleta de comandos) | Auditoría guiada (A1 + P7) |
| Estético | AAA de contraste en ambos temas para todo texto y rampa | Auditoría automatizable sobre tokens |
| Estético | Halo de etiquetas, números tabulares, easing con degradación reduced-motion | Captura Playwright por tema |
| Rendimiento | p95 ≤ 16 ms/frame con cap por defecto (150 vehículos), **medido antes de optimizar** | Trace Playwright; L3 solo actúa si se viola |
| Honestidad | Cero montos/confianzas inventados; degradación declarada ante estructura insuficiente | Gate B5 por fase (§9) |

---

## 3. Estado real — auditoría condensada con evidencia

### 3.1 Lo que ya es fuerte (no re-hacer)

- **Layout determinista y O(n·k).** Posiciones iniciales por ángulo áureo +
  seed, sin `Math.random()` (`fuerzas.js:22-34`); repulsión por rejilla
  espacial (`fuerzas.js:70-104`). La crítica "no determinista / O(n²)" es
  falsa.
- **LOD multinivel** (`grafo.js:751,819,849-859`) y **hairball domado**
  (colapso σ + meta-nodos ν×N con agregados, `grafo.js:384-472`).
- **Motor de topología determinista y testeado** (`topologia.py`, 23 tests):
  comunidades, puentes, centralidad, escalera de renormalización, H0,
  espectral. Anotación ya en el payload (`proyeccion.py:188-206`).
- **What-if completo server-side** (`cascada.py`; API
  `rutas/autogenes.py:488-521`). Solo falta el surfacing (P3).
- **Puerta única de escritura** (`Sustrato.dockear_producto`,
  `sustrato.py:379`) con clases tipadas (`tipos.py:31`) — la capa de
  investigación (P1) se persiste por ahí, extendiendo el Literal en el borde.
- **Monetización honesta resuelta donde existe** (CONCILIA:
  `concilia.py:24-27`). Regla para todo lo nuevo: los pesos ($) solo salen de
  CONCILIA/NOMOS; ningún análisis de red inventa montos.

### 3.2 Los huecos confirmados

1. **El análisis no responde preguntas de negocio ni se surfacea.** Único
   surfacing: `centralidad` modula radio (`grafo.js:19-28`). No existen
   intermediación, min-cut, HHI ni lift en ningún motor; `networkx` solo
   sirve camino/vecindario/hubs (`caminos.py:61-140`).
2. **La proyección es un casi-árbol** (`proyeccion.py:311-343`): centralidades
   globales sobre ella las domina la jerarquía por construcción. El insight
   vive en la red derivada (I1). Trade-off central de la propuesta.
3. **Sin flujo de investigación** (§1, puntos 1-6): sin guardar/reabrir, sin
   multi-selección, sin facetas, sin pivote tipado, sin vigilancia, what-if
   escondido en QUALIA.
4. **Navegación:** sin minimapa, historial ni estado deep-linkable
   (`grafoAPI`, `grafo.js:1443`; sin `pushState`/`hashchange`).
5. **Accesibilidad:** teclado = solo Escape (`grafo.js:1355-1365`);
   `<canvas role="img">` sin alternativa de datos (`autogenes_grafo.html:38`);
   sin región viva. Toolbar con `aria-label`/`aria-pressed` — base decente,
   incompleta.
6. **Estética a escala:** la comunidad posiciona (`fuerzas.js:44-66`) y curva
   aristas (`grafo.js:700-708`) pero no colorea — `colorNodo` es identidad
   por kind (`grafo.js:108-119`); alfa de arista fijo 0.3 (`grafo.js:695`);
   etiquetas sin halo; sin export de exhibit.
7. **CRONOS no viaja el pipeline aduanal** (`cronos.py:14-16`): la deriva es
   entre sesiones, y la UI lo declara.

---

## 4. El catálogo de algoritmos — cada uno con su pregunta de negocio

**Ley de implementación:** toda métrica que alimente un panel numérico citado
se implementa **pura y determinista** en `topologia.py` /
`autogenes/analisis_vw.py` (nuevo), con test 1:1 y doble corrida idéntica.
`networkx` queda confinado a `caminos.py` y no alimenta cifras de panel.
Trade-off aceptado: ~200-300 líneas propias + tests a cambio de
reproducibilidad cross-run/cross-plataforma — la ley de citación lo exige.

### 4.1 Los que ENTRAN — por valor/peso

| # | Algoritmo | Pregunta de negocio | Motor/caso | Superficie | Talla |
|---|---|---|---|---|---|
| 1 | **Red de flujo derivada** país→aduana→marca (pesos: unidades y valor Σ medidos) | — (sustrato de todo) | Todos | API `/api/v1/autogenes/analisis` | M |
| 2 | **HHI de concentración** (Σ share² por orígenes/aduanas/pedimentos de una marca) | "¿Qué tan dependiente es VW de un origen/aduana?" | Riesgo | Tarjeta + lente | **S** |
| 3 | **Lift de anomalías por ruta/aduana** (share Δ ÷ share volumen, `n` mínimo declarado) | "¿Dónde auditar primero?" | CONCILIA/VALIDACIÓN (triage) | Tarjeta + recoloreo | **S** |
| 4 | **Intermediación (Brandes)** sobre red de flujo | "¿Qué aduana es el broker del flujo VW?" | Operación | Lente + tarjeta | M |
| 5 | **Corte mínimo (Edmonds–Karp)**, capacidad = volumen medido | "¿Qué conjunto mínimo de rutas corta X% del suministro?" — descriptivo del pasado, se declara | Riesgo suministro | Tarjeta + resaltado del corte | M |
| 6 | **Redundancia de rutas** (caminos arista-disjuntos = max-flow unitario; código compartido con #5) | "¿Cuántas rutas independientes tiene VW por origen?" | Riesgo suministro | Tarjeta | S |
| 7 | **Comunidades sobre red de flujo** (`detectar_comunidades` ya existe) | "¿Qué ecosistema origen-aduana forma VW y con quién?" | Competitivo | Lente cromática + tarjeta | S |
| 8 | **Similitud conductual marca~VW** (coseno sobre features normalizados) + **Jaccard ponderado de rutas** | "¿Qué marcas se comportan como VW y en qué?" | Benchmark pares | Ranking con porqué por feature | M |
| 9 | **Brecha de preferencia J/N vs pares en rutas idénticas** — **en unidades/share, jamás pesos** (no hay tasas arancelarias como dato; verificado) | "¿VW usa la preferencia menos que sus pares?" | Oportunidad arancelaria | Tarjeta comparativa | S |
| 10 | **Deriva entre sesiones** + **rutas esperadas-pero-ausentes** (2 definiciones medidas: vs sesión previa propia; vs pares misma sesión) | "¿Qué cambió este mes y qué ruta falta?" | Temporal | Franja en panel + P5 | M |
| 11 | **Ego-network VW** (densidad, alcance; opcional Burt) | "¿La red propia de VW es redundante o frágil?" | Riesgo | Tarjeta secundaria | S (opc.) |
| 12 | **Co-citación de entidades** | "¿Qué proveedores/agentes co-aparecen entre marcas?" (forense) | Sustrato ag_* | Condicional a sustrato poblado | S (cond.) |
| 13 | **Caída simulada (ya existe: `cascada.py`)** — islas antes/después, relaciones caídas, peso estructural, ondas BFS; volumen afectado = suma de unidades de los nodos desconectados (medido) | "¿Qué pasa si cae esta aduana/marca?" — simula la red propia, jamás predice el mundo (docstring `cascada.py:6-11`) | DECIDIR / riesgo | P3 en el lienzo principal | **S** (server hecho) |

Notas de honestidad: HHI con bandas de referencia etiquetadas como convención;
lift suprimido bajo muestra mínima (se declara, no se muestra ruido); sin
p-values — solo razones medidas con denominadores visibles; min-cut/redundancia
describen "los flujos medidos de esta sesión" y la UI lo dice textual.

### 4.2 Los que NO entran

| Descartado | Razón |
|---|---|
| Closeness | En (casi-)árbol ≈ inverso de profundidad; trivial |
| PageRank protagonista | Correlaciona con el grado ponderado visible; a lo sumo recoloreo alternativo |
| Betweenness sobre la proyección de procedencia | La jerarquía gana por construcción (§3.2-2). Teatro |
| Louvain/Leiden vía networkx para el render | Rompe la ley de determinismo; el label propagation propio cumple |
| k-core, asortatividad | No mapean a ninguna decisión del operador |
| FDEB / bundling jerárquico | Caro y engañoso: sugiere flujos agregados que no existen como dato |
| WebGL por defecto | Solo si el presupuesto de frame (§2) se viola tras L3 |
| Selector de lente estructural en el lienzo | Descartado al ejecutar I1 (ver §0.1): las métricas de flujo no mapean a los nodos del lienzo, y las del lienzo ya se codifican por tamaño/posición. Re-codificar en color no responde ninguna pregunta nueva |
| GIS real, multi-analista, escala petabyte | Fuera por diseño — ver `BENCHMARK_PALANTIR.md` §4 |

---

## 5. Pista I — el motor de insight (cadena crítica del valor)

### I1 · La red derivada y sus métricas — sin esto, todo lo demás es teatro [L]

Nuevo módulo `autogenes/analisis_vw.py` (lectura pura, estilo
`proyeccion.py`): red de flujo desde los agregados ya proyectados
(`proyeccion.py:243-309`) + `pedimentos.aduana`. Extiende `topologia.py` con
`intermediacion` (Brandes) y `min_corte` (Edmonds–Karp; redundancia gratis con
capacidad unitaria). HHI y lift en `analisis_vw.py` (aritmética sobre
agregados). Ruta `GET /api/v1/autogenes/analisis` cacheada por
`version_de_sesion` (`red.py:35`).
**Archivos:** nuevo `autogenes/analisis_vw.py`; `autogenes/topologia.py`;
`rutas/autogenes.py`; `tests/test_analisis_vw.py` + ampliar
`tests/test_topologia.py`.
**Aceptación:** doble corrida idéntica; caso a mano documentado para
intermediación y min-corte; todo peso = suma de filas medidas (assert);
estructura degenerada → "estructura insuficiente" declarado; suite verde.
**Riesgos:** grafo degenerado (degradación declarada); confundir red derivada
con procedencia — se documenta como vista estructural, no evidencia primaria.

### I2 · El surfacing: panel VW [M] · HECHO

> **Nota de ejecución.** La parte (a), el selector de lente en el lienzo, se
> DESCARTÓ (§0.1, §4.2): las métricas de flujo no mapean a los nodos del
> lienzo. El corazón de I2 —el panel VW que traduce la red de flujo a
> negocio— se entregó completo. Lo de abajo describe (b), lo construido.

Panel VW en `/autogenes/vinculos` con la **gramática obligatoria de tarjeta**:

> **CIFRA** (unidad, periodo) contra **BENCHMARK** → **SO WHAT** (una frase)
> → **NOW WHAT** (acción derivable: "auditar los 3 pedimentos de la aduana
> X", nunca recomendación inventada) → **FUENTE** (n filas, sesión, motor).

Cada tarjeta enlaza a `enfocar`/`resaltar` del `grafoAPI`. Sin VW en la
sesión: se declara y se ofrece la marca de mayor volumen como sujeto.
**Archivos:** `static/grafo.js`, `static/vinculos.js`,
`templates/autogenes_grafo.html`, `templates/autogenes_vinculos.html`,
`static/styles.css`.
**Aceptación:** test de gramática (falla ante cifra sin unidad/periodo/fuente);
cambiar lente no recarga payload; "probable/estimado/proyectado" prohibidos en
el panel (única proyección permitida: `cupos_what_if`, que declara método).
**Riesgo dominante de toda la propuesta:** sobre-afirmar. Mitigación: cada
frase se somete a "¿de qué fila sale este número?"; sin respuesta, no existe.

### I3 · Benchmark de pares: similitud + brecha J/N [S–M]

Features normalizados por marca (mix origen, mix aduana, split J/N, mix
modelos, valor medio unitario) → coseno contra VW + Jaccard ponderado de
rutas; ranking con porqué feature a feature; umbral de `n` mínimo declarado.
Brecha J/N en unidades/share sobre rutas idénticas — sin pesos (§4.1-9).
**Archivos:** `analisis_vw.py`, `vinculos.js`, template, tests.

### I4 · Deriva entre sesiones y rutas ausentes [M]

`deriva_vw(sesion_ref, sesion_actual)`: rutas ganadas/perdidas, delta de share
por aduana, volumen y valor — todo medido. Ausencias con las dos definiciones
de §4.1-10, cada una con baseline citado. UI declara "comparación entre
sesiones, no time-travel" (`cronos.py:14-16`). Requiere ≥2 sesiones; con una,
degrada honesto. **Archivos:** `analisis_vw.py`, `rutas/autogenes.py`,
`vinculos.js`, tests. Es el prerrequisito de datos de P5 y P8.

---

## 6. Pista L — el lienzo (paralelizable con I hasta I2)

### L1 · Navegación: el grafo se vuelve citable como URL [M]

Estado deep-linkable (hash/query, claves cortas, defaults omitidos): sesión,
nodo, viewport `k/x/y`, filtros, kind aislado, racimos expandidos, lente
activa. `replaceState` con debounce; `pushState` en saltos de foco. Historial
de foco (pila atrás/adelante sobre `enfocar`, `grafo.js:1455`). Minimapa
(canvas pequeño + rectángulo de viewport, clic salta, rAF de baja frecuencia,
chrome por tokens). **Prerrequisito de P1** (una investigación guarda este
estado).
**Archivos:** `static/grafo.js`, `templates/autogenes_grafo.html`,
`static/styles.css`, smoke en `tests/test_estado_y_landing.py`.
**Aceptación:** ida y vuelta por URL exacta (Playwright); reduced-motion
respetado; sin regresión de frame perceptible.

### L2 · El 1% de estética y accesibilidad — ejecuta la lista §7 [M, divisible]

Commits pequeños independientes, uno por ítem.

### L3 · Rendimiento solo si se mide la necesidad [S+S+spike]

1. **Culling por viewport** (sí): `dibujar()` itera todo sin test de
   visibilidad (`grafo.js:678,745`).
2. **Persistencia de posiciones** (sí): cachear el asentamiento por
   `version_de_sesion`; solo ahorra arranque (ya son deterministas).
3. **Spike zoom semántico ↔ `escalera_renorm`** (tras I2; una sesión; se
   descarta sin culpa si no convence).
4. **WebGL: rechazado por defecto** — solo si p95 ≤ 16 ms se viola tras 1+2.

---

## 7. La lista del 1% — estética (E) y accesibilidad (A), con anclas

Cada ítem, un commit. Todo por tokens (`static/styles.css`); sin hex/px crudos.

**Estética:**
- **E1 · Halo de etiqueta:** scrim del fondo del tema (~85% alfa, token) tras
  las etiquetas del canvas (`grafo.js:849+`).
- **E2 · Lente cromática de comunidad CVD-safe:** hoy la comunidad no colorea
  (§3.2-6). Rampa categórica accesible como tokens nuevos, AAA en ambos
  temas. Solo como lente (I2); la identidad por kind se conserva.
- **E3 · Alfa de arista por peso** (√peso) en vez del 0.3 fijo
  (`grafo.js:695`).
- **E4 · Z-order por estado:** aristas resaltadas se dibujan al final.
- **E5 · Números tabulares** (`font-variant-numeric: tabular-nums`) en
  tarjetas, panel y línea de estado.
- **E6 · Easing de cámara** en zoom por botón y encuadre; instantáneo bajo
  reduced-motion (flag ya existe, `grafo.js:58`).
- **E7 · Estados vacíos con siguiente acción** ("Procesa una sesión en Áreas
  para poblar el grafo").
- **E8 · Export de exhibit:** PNG del encuadre actual (`canvas.toBlob`) con
  pie generado — sesión, lente, fecha, fuente — + "copiar enlace" del
  deep-link. El puente grafo → deck/memo (estándar B3/B4).
- **E9 · Cursor semántico completo** (grab/grabbing/pointer/crosshair;
  auditar cobertura, parcial en `grafo.js:1359`).

**Accesibilidad (meta AAA):**
- **A1 · Teclado completo:** hoy solo Escape (`grafo.js:1355-1365`). Tab
  enfoca lienzo; flechas ciclan vecinos (orden determinista); Enter abre
  dossier; `+`/`-` zoom; `0` encuadre. Anillo de foco por token.
- **A2 · Región viva** `aria-live="polite"`: anuncia la selección
  ("Volkswagen · marca · 220 vehículos · comunidad 3").
- **A3 · Modo tabla — la alternativa accesible real:** el mismo payload como
  tabla HTML ordenable (etiqueta, kind, grado, métrica de lente).
  `role="img"` (`autogenes_grafo.html:38`) no basta para un grafo de datos.
- **A4 · Objetivo táctil:** hit mínimo ~22 px de pantalla para hojas
  (`nodoEn`, `grafo.js:893`).
- **A5 · Auditoría reduced-motion completa** (flag cubre corona/anillos,
  `grafo.js:58,205-287`; cubrir partículas y latido).
- **A6 · Contraste AAA verificado** para E2 y etiquetas, ambos temas,
  auditoría automatizable sobre tokens.

---

## 8. Pista P — el instrumento de investigación (la brecha Palantir)

Referencia: `BENCHMARK_PALANTIR.md` §1 mapea cada fase a la capacidad que
cierra. Orden interno por valor/costo: **P3 y P7 primero** (baratas), luego
P1→P2, P5 tras I4, P4 y P6 al final. Ninguna fase escribe fuera de la puerta
del Sustrato; las notas del operador llevan `origen=operador` (ley de
procedencia).

### P3 · What-if en el lienzo principal — la mejora de mayor valor/costo [S]

El servidor está **hecho**: `simular_caida` devuelve islas antes/después,
relaciones caídas, desconectados, peso estructural y ondas BFS
(`cascada.py:49+`), expuesto en `/api/v1/autogenes/qualia/cascada`
(`rutas/autogenes.py:488-521`). Falta el surfacing: acción "simular caída" en
la tarjeta dossier de nodos estructurales (aduana propuesta en I1, pedimento,
marca, país) → overlay del radio de impacto (las ondas alimentan el pulso,
respetando reduced-motion) + mini-panel con métricas medidas y **volumen
afectado = suma de unidades de los nodos desconectados**. Copy honesto
obligatorio (ya es ley del motor, `cascada.py:6-11`): "simulación sobre la
red de esta sesión — no predice el mundo".
**Archivos:** `static/grafo.js`, `static/styles.css`, template; posible ajuste
menor en `rutas/autogenes.py` si la red del what-if debe ser la de flujo (I1)
además de la de sesión. **Aceptación:** ≤2 gestos desde la tarjeta; overlay
reversible con Escape; cifras idénticas a la API; reduced-motion estático.

### P7 · Paleta de comandos (Ctrl+K) [S]

Búsqueda de nodos (reusa el índice del typeahead) + acciones nombradas en
español (lentes, modos, encuadre, export, modo tabla). Keyboard-first; ata con
A1 y con la vara "todo sin ratón".
**Archivos:** `static/grafo.js` (o módulo nuevo `static/paleta.js`),
template, `styles.css`. **Aceptación:** toda acción de toolbar disponible en
la paleta; foco atrapado correctamente; Escape cierra.

### P1 · Investigaciones guardadas — el caso deja de ser efímero [M]

Guardar el estado completo de análisis como
`Producto{clase:'investigacion'}`: estado del lienzo (el deep-link de L1),
tarjetas fijadas (el pin ya existe, `grafo.js:1190`), notas del operador
ancladas a nodos, y lente activa. Persistencia **solo** vía
`Sustrato.dockear_producto` (`sustrato.py:379`), extendiendo
`ClaseProducto` (`tipos.py:31`) — cambio de borde, permitido. Reabrir una
investigación restaura todo; la lista de investigaciones vive en
`/autogenes/vinculos` o en el propio lienzo.
**Archivos:** `autogenes/tipos.py` (Literal), `autogenes/sustrato.py` (si la
validación lo pide), `rutas/autogenes.py` (guardar/listar/abrir),
`static/grafo.js`, `static/vinculos.js`, templates, tests.
**Aceptación:** ida y vuelta exacta (test §2); las notas citan su nodo y
llevan origen=operador; borrar una investigación no toca evidencia (es un
Producto, no procedencia). **Riesgo:** acoplar el formato del snapshot al
detalle del render — mitigación: el cuerpo guarda el *estado semántico*
(ids, lente, filtros), nunca coordenadas de píxel.

### P2 · Search-around tipado + selección múltiple [M]

(a) Expansión por tipo de enlace desde la tarjeta: "expandir solo marcas /
solo países / n saltos" — generaliza el expandir-racimo actual usando
`vecindario` (`caminos.py:104-123`) con filtro de kind/tipo. (b) Selección
múltiple: shift-clic y lasso rectangular; operaciones de grupo: aislar,
expandir, exportar la selección como tabla (reusa A3), sumar unidades/valor
medidos de la selección en la línea de estado.
**Archivos:** `static/grafo.js`, `rutas/autogenes.py` (parámetro de filtro en
vecindario), `caminos.py` (filtro tipado), tests.
**Aceptación:** expansión determinista (orden estable); la suma de la
selección reconcilia con las filas fuente; lasso accesible también por
teclado (Shift+flechas agrega vecinos).

### P5 · Modo diff de sesiones sobre el lienzo [M — depende de I4]

Overlay con la deriva de I4: aristas/nodos ganados en un token semántico,
perdidos en otro (nunca magenta fuera de `--danger`), share deltas en las
tarjetas. Selector de sesión de referencia (la infraestructura de referencia
ya existe en QUALIA drift, `rutas/autogenes.py:469-485`).
**Aceptación:** todo delta reconcilia con `deriva_vw`; leyenda del diff
explícita; degrada honesto con <2 sesiones.

### P4 · Facetas por propiedades + histograma vinculado [L — la fase cara]

Filtros por propiedades de las filas subyacentes (rango de precio, J/N,
aduana, mes) aplicados al grafo, y un panel de histograma ligado a la
selección con brushing bidireccional (seleccionar nodos → distribución;
cepillar el histograma → resaltar nodos). Es la capacidad "linked views" de
Palantir y la más costosa de la pista: requiere que el payload lleve (o la
API sirva) los atributos por nodo de forma consultable.
**Archivos:** `proyeccion.py` (atributos por nodo si faltan),
`rutas/autogenes.py`, `static/grafo.js` + módulo nuevo de histograma,
templates, `styles.css`, tests.
**Aceptación:** todo conteo del histograma reconcilia con las filas; el
brushing es reversible; AAA; sin regresión de frame.
**Riesgo:** scope creep hacia un mini-BI — mitigación: exactamente cuatro
facetas (precio, J/N, aduana, mes) y un histograma; lo demás ya vive en los
tableros TBV.

### P6 · Mapa esquemático de flujos [M]

Vista opcional: geometría mundial **simplificada y empaquetada en el repo**
(asset estático — cero tiles ni peticiones externas, ley local-first) con
arcos país→México ponderados por volumen/valor medidos y color por lente.
Declarado en la UI como esquemático, no GIS. Comparte tarjetas y deep-link.
**Archivos:** asset nuevo en `static/`, módulo `static/mapa.js`, template,
ruta de datos (reusa la red de flujo I1), `styles.css`, tests smoke.
**Riesgo:** tentación GIS (proyecciones, zoom de mapa) — mitigación: es un
diagrama con geografía de fondo, y así se documenta.

### P8 · Vigilancia con delta medido [M — depende de P1 + I4]

El operador marca nodos como vigilados dentro de una investigación (P1). Al
abrir una sesión nueva, el panel reporta el delta medido de cada vigilado
(volumen, valor, rutas, hallazgos Δ) contra la sesión de la investigación,
vía `deriva_vw` (I4). Sin alertas push ni daemons: el reporte se computa al
abrir, local-first.
**Aceptación:** cada delta cita ambas sesiones; vigilados sin contraparte en
la sesión nueva se reportan como "ausente en sesión actual" (hallazgo, no
error).

---

## 9. Orden de ejecución y gate de entrega

**Secuencia recomendada** (dos sesiones pueden avanzar en paralelo, una por
pista; los archivos solo colisionan donde se indica):

1. **Victorias baratas primero:** P3 y P7 (talla S, servidor hecho) — valor
   Palantir-grade visible en la primera sesión de ejecución.
2. **Pista I:** I1 → I2 → I3 → I4 (cadena crítica del insight).
3. **Pista L:** L1 → L2(§7) en paralelo con I1 (archivos disjuntos hasta I2);
   L3 al final, condicionado a medición.
4. **Pista P (resto):** P1 (tras L1) → P2 → P5 (tras I4) → P4 → P6 → P8
   (tras P1+I4).
5. El spike de zoom semántico (L3-3) espera a I2 para no pelear por
   `grafo.js`.

**Gate B5 por fase — nada se declara terminado sin:**

- [ ] Lógica: responde su pregunta de negocio; MECE; cada superficie pasa
      "so what / now what".
- [ ] Números: toda cifra reconcilia a fila fuente y sobrevive el sniff test;
      unidades/periodo/moneda etiquetados.
- [ ] Robustez: degradación declarada ante datos degenerados o muestra chica;
      doble corrida idéntica.
- [ ] Procedencia: fuente citada, supuestos explícitos, reproducible.
- [ ] Defensa: cada número defendible ante un revisor hostil.
- [ ] Pulido: cero typos, tokens sin excepciones, AAA ambos temas, suite
      verde (`python3 -m pytest tests/ -q`).

---

## 10. Leyes transversales (no negociables)

- **Cero snake oil.** Todo número citable a fila/fragmento/pedimento. Montos
  ($) solo de CONCILIA/NOMOS (`concilia.py:24-27`). Única proyección
  permitida: `cupos_what_if`. El what-if de P3 simula la red propia y lo
  declara — jamás predice el mundo.
- **Determinismo** del render y de todo panel numérico; `networkx` confinado
  a `caminos.py`.
- **Puerta única de escritura:** toda persistencia nueva (investigaciones,
  notas, vigilancia) pasa por `Sustrato` con procedencia
  (`origen=operador`).
- **Pipelegado intocable:** `concentrado1.py`, `concentrado2.py`,
  `Estadistico.py`, `PDFs_*.py`.
- **Local-first:** cero peticiones externas — incluido el mapa P6 (asset
  empaquetado).
- **Design system:** solo tokens; magenta vía `--danger`/`--telos-on`
  (`styles.css:72`); AAA; motion desde tokens, sin flashes >5 Hz;
  reduced-motion degrada a estático.
- **Idioma:** copy de UI en español accesible sin emojis; código, comentarios
  y commits en inglés. Conventional commits, un cambio lógico por commit.

---

## 11. Verificación

- **Tests:** `python3 -m pytest tests/ -q`. Línea base del repo: 315 (312 + 1
  skip en contenedores sin OCR). Cada fase añade tests deterministas 1:1,
  incluida la doble corrida de igualdad exacta en toda métrica nueva.
- **App:** `docker/compose.yaml` → `http://127.0.0.1:5001`. Rebuild Podman:
  `podman rm -f gnosis; podman rmi -f gnosis:local; podman-compose -f
  docker/compose.yaml up -d --build`.
- **Visual:** Flask contra BD sembrada + Playwright (chromium en
  `/opt/pw-browsers`): captura por lente/tema para AAA, halo, rampa, diff y
  mapa; trace de frame para el presupuesto §2 antes de tocar L3.
- **Reproducibilidad:** igualdad exacta de coordenadas y cifras entre dos
  corridas — la prueba operativa de la ley.

---

## 12. Arranque para el ejecutor (Opus 4.8)

Plan de sesiones sugerido; cada sesión termina con suite verde, gate B5 y
push a la rama designada. Documentos rectores: este, `BENCHMARK_PALANTIR.md`
y `EVALUACION_ESTANDAR_A.md`.

| Sesión | Contenido | Entregable visible |
|---|---|---|
| 0 | `CLAUDE.md` + ruff/ESLint sin build step (plan en `EVALUACION_ESTANDAR_A.md` §4) | Disciplina de repo instalada |
| 1 | **P3 + P7** (what-if en lienzo + paleta de comandos) | Dos capacidades Palantir-grade funcionando |
| 2 | **I1** (red de flujo + Brandes + min-cut/redundancia + HHI + lift + API) | El motor de insight, testeado |
| 3 | **I2** (lente + panel VW con gramática de tarjeta) + E2 (rampa CVD-safe) | El insight legible para negocio |
| 4 | **L1** (deep-link + historial + minimapa) + primeros ítems E/A de §7 | Grafo citable como URL |
| 5 | **P1** (investigaciones guardadas) + **A1/A2/A3** (teclado, aria-live, modo tabla) | El caso persiste; accesible |
| 6 | **I3 + I4** (similitud, brecha J/N, deriva y ausencias) | Benchmark de pares y temporal |
| 7 | **P2** (search-around + multi-selección) + resto de §7 | El gesto analítico completo |
| 8 | **P5** (diff visual) + **L3-1/2** (culling + persistencia, si el trace lo pide) | Comparación entre meses en el lienzo |
| 9+ | **P4** (facetas + histograma), **P6** (mapa), **P8** (vigilancia), spike zoom semántico | Cierre de la pista P |

Regla de oro para el ejecutor: ante cualquier conflicto entre una fase y una
ley de §10, gana la ley; ante ambigüedad de alcance, elegir la interpretación
más chica que pase el gate y dejar la ambición para la fase siguiente.
