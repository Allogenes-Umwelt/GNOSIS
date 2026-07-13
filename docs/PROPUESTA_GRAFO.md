# Propuesta v2 — el grafo de AUTOGENES a clase mundial

> **v2 · 2026-07-13.** Sustituye íntegramente a la v1 (commit `4bc9564`); la
> autocrítica de v1 está en §1. Ejecutor: Opus 4.8. Este documento es el plan
> — **cero código de producción aquí**. Toda afirmación sobre el estado actual
> está verificada contra el árbol con evidencia `archivo:línea`.
>
> **Marco de decisión (B0):** la pregunta es qué convierte al grafo en una
> herramienta de decisión de clase mundial en tres ejes (funcional, estético,
> navegable) y qué análisis de red produce insight accionable para los casos
> de negocio (VW y los motores CONCILIA/VALIDACIÓN/NOMOS). La decisión que
> informa: el orden de las próximas sesiones de ejecución. Decisor: Julio.
> Evidencia que cambiaría la respuesta: profiling que contradiga §6-L3, o una
> sesión real cuya estructura degenere las métricas de §4 (se degrada honesto,
> ver criterios por fase).

---

## 0. Resumen ejecutivo — la respuesta primero

**Qué se construye:** dos pistas paralelas sin colisión de archivos.

- **Pista I (Insight, el diferenciador):** una red de flujo derivada
  *país → aduana → marca* con pesos 100% medidos, sobre la que corren siete
  análisis que sí responden preguntas de negocio (intermediación, corte
  mínimo, redundancia de rutas, concentración HHI, lift de anomalías,
  similitud conductual, deriva entre sesiones) — surfaceados en un selector de
  lente en `/autogenes/grafo` y un panel VW en `/autogenes/vinculos` donde
  **cada tarjeta cumple la gramática: cifra + unidad + periodo + benchmark →
  "so what" → "now what" derivable → fuente citada**.
- **Pista L (Lienzo):** navegación de clase mundial (estado deep-linkable,
  historial de foco, minimapa), la lista del 1% de estética y accesibilidad
  (§7), y rendimiento solo donde el profiling lo justifique.

**Qué se rehúsa (y por qué, §4.2):** closeness, PageRank como métrica
protagonista, betweenness sobre la proyección de procedencia (es un casi-árbol
— daría teatro, no hallazgo), FDEB completo, WebGL por defecto, y cualquier
insight con monto o confianza no derivable de filas reales.

**Por qué este orden:** la cadena crítica del valor es I1→I2 (sin red derivada
no hay insight honesto que surfacear); L1/L2 son paralelizables y de bajo
riesgo; L3 va al final condicionado a medición.

---

## 1. Autocrítica de v1 — era una auditoría sólida con entregable débil

Lo que v1 hizo bien y se conserva: corregir la crítica de arranque con
evidencia (el layout ya era determinista y O(n·k)); detectar que el hueco caro
es el surfacing de insight VW; el veredicto casi-árbol; la criba de métricas.

Lo que estaba mal y v2 corrige:

1. **Sin respuesta primero.** v1 abría con la auditoría; el lector armaba la
   conclusión solo (viola B0/B4). → §0.
2. **Títulos-tema, no aserciones.** "Fase 2 — Surfacing" no afirma nada. → v2
   usa encabezados con contenido.
3. **El eje estético quedó subatendido.** El encargo pide tres ejes; v1 dedicó
   al estético ~3 líneas de tokens. → §7 (la lista del 1%).
4. **Accesibilidad sobrestimada.** v1 asumió cobertura razonable; la evidencia
   dice otra cosa: el teclado del lienzo es **solo Escape**
   (`grafo.js:1355-1365`) y el `<canvas role="img">`
   (`autogenes_grafo.html:38`) no es alternativa de datos para tecnología de
   asistencia. → §7-A.
5. **Sin paralelización ni tallas.** v1 era una lista secuencial sin decir qué
   puede correr en paralelo ni cuánto pesa cada fase. → pistas I/L + tallas
   S/M/L.
6. **Faltaban los algoritmos más legibles para negocio.** HHI de
   concentración, lift de anomalías por ruta y redundancia de caminos
   arista-disjuntos no estaban — y son de los de mayor valor por peso. → §4.
7. **Sin puente grafo → entregable.** El operador consume el grafo pero no
   puede llevarlo a un deck o memo (estándar B3). → export de exhibit, §7-E8.
8. **Sin definición medible de "clase mundial".** → §2.
9. **Dato inexacto:** v1 citaba la disciplina de magenta "vía `--coral`"; ese
   token no existe. La disciplina real es `--danger` → `--telos-on`
   (`styles.css:72`). Corregido en §9.

---

## 2. La vara: "clase mundial" definido en medibles

El adjetivo se prohíbe a sí mismo sin esto (B0: ban naked adjectives). El
grafo es clase mundial cuando **todo** lo siguiente pasa:

| Eje | Medible | Cómo se verifica |
|---|---|---|
| Funcional | Toda cifra visible tiene unidad, periodo y fuente; cero números huérfanos | Test que recorre las tarjetas/panel y falla ante cifra sin metadatos |
| Funcional | Reproducibilidad exacta: misma BD → mismas coordenadas de nodo y mismas cifras de panel | Test de doble corrida con igualdad exacta |
| Insight | Cada lente responde una pregunta de negocio nombrada y enlaza a su evidencia | Revisión contra la tabla §4 (pregunta ↔ lente ↔ fuente) |
| Navegable | Pegar una URL reproduce la vista exacta (nodo, zoom, filtros, lente) | Test Playwright de ida y vuelta |
| Navegable | Cualquier nodo es alcanzable sin ratón (teclado completo) | Auditoría manual guiada + smoke |
| Estético | AAA de contraste en ambos temas para todo texto y rampa nueva | Auditoría automatizable sobre tokens |
| Estético | Etiquetas legibles sobre zonas densas (halo), números tabulares, motion con easing y degradación reduced-motion | Captura Playwright por tema + revisión |
| Rendimiento | Presupuesto p95 ≤ 16 ms/frame con el cap por defecto (150 vehículos), **medido** en hardware de referencia antes de optimizar | Trace de Playwright; L3 solo actúa si se viola |
| Honestidad | Cero montos/confianzas inventados; degradación declarada ante estructura insuficiente | Revisión B5 por fase (§8) |

---

## 3. Estado real — auditoría condensada con evidencia

### 3.1 Lo que ya es fuerte (no re-hacer)

- **Layout determinista y escalable a este tamaño.** Posiciones iniciales por
  ángulo áureo + seed, sin `Math.random()` (`fuerzas.js:22-34`); repulsión por
  rejilla espacial O(n·k) (`fuerzas.js:70-104`). La crítica "no determinista /
  O(n²)" es falsa.
- **LOD multinivel.** Detalle mecha `r*k ≥ 13` (`grafo.js:751`), glifo
  `r*k ≥ 7` (`grafo.js:819`), etiquetas por tier+zoom+centralidad
  (`grafo.js:849-859`).
- **Domado del hairball.** Colapso de fragmentos y meta-nodos ν×N con
  agregados para el dossier (`grafo.js:384-472`).
- **Motor de topología determinista y testeado** (`topologia.py`, 23 tests):
  comunidades, puentes, centralidad de vector propio, escalera de
  renormalización, H0, espectral.
- **Anotación analítica ya en el payload**: `comunidad`, `puente`,
  `centralidad` por nodo (`proyeccion.py:188-206`).
- **Monetización honesta ya resuelta donde existe**: CONCILIA reporta montos =
  suma de precios reales, sin conversión de divisas, con
  `valor_en_riesgo_mxn` de conteo único (`concilia.py:24-27`). Regla para todo
  lo nuevo: **los pesos ($) solo salen de CONCILIA/NOMOS; ningún análisis de
  red inventa montos.**

### 3.2 Los huecos confirmados (lo que las pistas atacan)

1. **El análisis no responde preguntas de VW ni se surfacea.** El único
   surfacing es que `centralidad` modula el radio (`grafo.js:19-28`). No hay
   selector de lente, ni recoloreo por métrica, ni panel que traduzca a
   negocio. Y no existen intermediación, max-flow/min-cut, HHI ni lift en
   ningún motor (`topologia.py` no los tiene; `networkx` solo se usa para
   camino/vecindario/hubs, `caminos.py:61-140`).
2. **La proyección es un casi-árbol** (`proyeccion.py:311-343`): núcleo →
   pedimento → vehículo, con marca/país como únicos transversales. Cualquier
   centralidad global sobre ella la domina la jerarquía **por construcción**.
   El insight vive en una red derivada (§5-I1). Este es el trade-off central.
3. **Navegación:** sin minimapa, sin historial de foco, sin estado
   deep-linkable (`grafoAPI` expone solo
   `nodos/resaltar/limpiar/encuadrar/enfocar`, `grafo.js:1443`; no hay
   `pushState`/`hashchange` en el archivo).
4. **Accesibilidad:** teclado = solo Escape (`grafo.js:1355-1365`);
   `<canvas role="img">` sin alternativa de datos (`autogenes_grafo.html:38`);
   sin región viva que anuncie la selección. La toolbar sí tiene `aria-label`
   y los chips `aria-pressed` (`autogenes_grafo.html:19-30`,
   `grafo.js:1383,1432`) — base decente, cobertura incompleta.
5. **Estética a escala:** la comunidad posiciona (sectores,
   `fuerzas.js:44-66`) y curva aristas (`grafo.js:700-708`) pero **no tiene
   lente cromática** — `colorNodo` es identidad por kind
   (`grafo.js:108-119`). Alfa de arista fijo (0.3) sin escalar por peso
   (`grafo.js:695`). Etiquetas sin halo sobre zonas densas. Sin export de
   exhibit.
6. **CRONOS no viaja el pipeline aduanal** — las tablas aduanales no llevan
   timestamp por fila (`cronos.py:14-16`). La deriva de VW se hace **entre
   sesiones**, no con time-travel. Se declara en la UI.

---

## 4. El catálogo de algoritmos — cada uno con su pregunta de negocio

**Ley de implementación (resuelve el punto abierto de networkx):** toda
métrica que alimente un panel numérico citado se implementa **pura y
determinista** en `topologia.py` / `autogenes/analisis_vw.py` (nuevo), con
test 1:1 y doble corrida idéntica — como el resto del motor. `networkx` se
queda donde está (`caminos.py`: camino/vecindario/hubs) y no alimenta cifras
de panel. Trade-off aceptado: ~200-300 líneas propias + tests a cambio de la
garantía de reproducibilidad cross-run/cross-plataforma que exige la ley de
citación.

### 4.1 Los que ENTRAN — ordenados por valor/peso

| # | Algoritmo | Pregunta de negocio que responde | Caso/motor que alimenta | Superficie | Talla |
|---|---|---|---|---|---|
| 1 | **Red de flujo derivada** país→aduana→marca (pesos: unidades y valor Σ medidos) | — (es el sustrato de todo lo demás) | Todos | API `/api/v1/autogenes/analisis` | M |
| 2 | **HHI de concentración** (Σ share² por dimensión: orígenes, aduanas, pedimentos de una marca) | "¿Qué tan dependiente es VW de un solo origen/aduana?" — riesgo de dependencia | Planeación / riesgo | Tarjeta panel VW + lente | **S** |
| 3 | **Lift de anomalías por ruta/aduana** (share de hallazgos Δ ÷ share de volumen, con `n` mínimo declarado) | "¿Dónde auditar primero?" — la aduana que concentra hallazgos más allá de su volumen | CONCILIA / VALIDACIÓN (triage) | Tarjeta panel + recoloreo Δ | **S** |
| 4 | **Intermediación (Brandes)** sobre la red de flujo | "¿Qué aduana es el broker/cuello de botella del flujo VW?" | Operación / negociación | Lente + tarjeta | M |
| 5 | **Corte mínimo (Edmonds–Karp)** fuente=país(es), sumidero=VW; capacidad = volumen medido | "¿Qué conjunto mínimo de rutas, si cae, corta X% del suministro?" — descriptivo del pasado observado, se declara así | Riesgo de suministro | Tarjeta + resaltado del corte en lienzo | M |
| 6 | **Redundancia de rutas** (caminos arista-disjuntos = mismo max-flow con capacidad unitaria; código compartido con #5) | "¿Cuántas rutas independientes tiene VW por origen?" — "1 sola ruta para el 40% del volumen" es accionable | Riesgo de suministro | Tarjeta | S (gratis tras #5) |
| 7 | **Comunidades sobre la red de flujo** (`detectar_comunidades` ya existe) | "¿Qué ecosistema origen-aduana forma VW y con quién lo comparte?" | Contexto competitivo | Lente cromática + tarjeta | S |
| 8 | **Similitud conductual marca~VW** (coseno sobre features normalizados de `marca_agg`/`pais_agg`) + **solapamiento de rutas** (Jaccard ponderado) | "¿Qué marcas se comportan como VW y en qué exactamente?" | Benchmark de pares | Ranking en panel con el porqué feature a feature | M |
| 9 | **Brecha de preferencia J/N vs pares en las mismas rutas** | "¿VW usa la preferencia arancelaria menos que sus pares en rutas idénticas?" — **en unidades y share, jamás en pesos**: no hay tasas arancelarias como dato en la BD (verificado; solo CONCILIA monetiza sus propios hallazgos, `concilia.py:24-27`) | Oportunidad arancelaria | Tarjeta comparativa | S |
| 10 | **Deriva entre sesiones** (rutas ganadas/perdidas, delta de share por aduana) + **rutas esperadas-pero-ausentes** con 2 definiciones medidas: (a) vs sesión previa propia, (b) vs pares en la misma sesión | "¿Qué cambió en la red de VW este mes y qué ruta falta?" | CRONOS-adyacente (por sesiones) | Franja temporal en panel | M |
| 11 | **Ego-network VW**: densidad, alcance; opcional tamaño efectivo/constraint de Burt | "¿La red propia de VW es redundante o frágil en sus contactos?" | Riesgo | Tarjeta secundaria | S (opcional) |
| 12 | **Co-citación de entidades** (dos entidades que citan el mismo artefacto) | "¿Qué proveedores/agentes co-aparecen entre marcas?" — forense | Sustrato ag_* | Condicional: solo si el sustrato está poblado; si no, se omite honesto | S (condicional) |

Notas de honestidad transversales:

- HHI se reporta con sus bandas de referencia convencionales **etiquetadas
  como convención**, no como norma propia.
- El lift declara `n` y se suprime bajo un umbral mínimo de muestra (número
  chico = ruido; se dice "muestra insuficiente", no se muestra un lift
  espurio). Sin p-values: solo razones medidas con denominadores visibles.
- Min-cut/redundancia describen **el pasado observado**; la UI lo dice
  textualmente ("con los flujos medidos de esta sesión").

### 4.2 Los que NO entran — descartes con razón

| Descartado | Razón |
|---|---|
| Closeness | En un (casi-)árbol ≈ inverso de profundidad; trivial, cero hallazgo |
| PageRank protagonista | Correlaciona con el grado ponderado ya visible; a lo sumo recoloreo alternativo, no tarjeta |
| Betweenness sobre la proyección de procedencia | Casi-árbol: la jerarquía gana por construcción (§3.2-2). Teatro |
| Louvain/Leiden vía networkx para el render | Rompe la ley de determinismo del render; el label propagation propio ya cumple |
| k-core, asortatividad | Académicos aquí; no mapean a ninguna decisión del operador |
| FDEB / bundling jerárquico completo | Caro y engañoso: sugiere flujos agregados que no existen como dato |
| WebGL por defecto | Reescribir ~1,500 líneas de lenguaje visual sin evidencia de cuello; solo si el presupuesto de frame de §2 se viola tras L3 |

---

## 5. Pista I — el motor de insight (la cadena crítica del valor)

### I1 · La red derivada y sus métricas — sin esto, todo lo demás es teatro [L]

**Enfoque:** nuevo módulo `autogenes/analisis_vw.py` (lectura pura, estilo
`proyeccion.py`): construye la red de flujo país→aduana→marca desde los
agregados ya proyectados (`proyeccion.py:243-309`) más `pedimentos.aduana`.
Extiende `topologia.py` con `intermediacion` (Brandes) y `min_corte`
(Edmonds–Karp; la redundancia sale del mismo código con capacidad unitaria).
HHI y lift viven en `analisis_vw.py` (son aritmética sobre agregados, no
grafos). Nueva ruta `GET /api/v1/autogenes/analisis` en `rutas/autogenes.py`,
cacheada por `version_de_sesion` (`red.py:35`).

**Archivos:** nuevo `autogenes/analisis_vw.py`; `autogenes/topologia.py`;
`rutas/autogenes.py`; nuevos `tests/test_analisis_vw.py` y ampliación de
`tests/test_topologia.py`.

**Aceptación:** doble corrida idéntica para toda métrica; un caso a mano
documentado para intermediación y min-corte; todo peso = suma de filas
medidas (assert); estructura degenerada (una aduana, un país) → respuesta
declarada "estructura insuficiente", nunca un número vacío; suite verde.

**Riesgos:** grafo degenerado (mitigado por degradación declarada); confundir
la red derivada con procedencia — se documenta que es vista estructural sobre
datos citables, no evidencia primaria.

### I2 · El surfacing: lente + panel VW — donde el insight se vuelve legible [M]

**Enfoque:** (a) selector de lente en `/autogenes/grafo`: recolorea y
redimensiona por métrica (grado ponderado / centralidad / intermediación /
comunidad / lift Δ), generalizando la modulación que hoy solo usa
`centralidad` (`grafo.js:19-28`); rampa cromática CVD-safe por tokens nuevos
en `styles.css`; la leyenda explica la lente activa. (b) Panel VW en
`/autogenes/vinculos` (`static/vinculos.js`,
`templates/autogenes_vinculos.html`): tarjetas que cumplen **la gramática
obligatoria**:

> **CIFRA** (unidad, periodo) contra **BENCHMARK** (pares/sesión previa/total)
> → **SO WHAT** (una frase) → **NOW WHAT** (acción derivable: "auditar los 3
> pedimentos de la aduana X", nunca una recomendación inventada) →
> **FUENTE** (n filas, sesión, motor).

Cada tarjeta enlaza a `enfocar`/`resaltar` del `grafoAPI` — leer y ver son el
mismo gesto. Si no hay VW en la sesión: se declara y se ofrece la marca de
mayor volumen como sujeto.

**Archivos:** `static/grafo.js`, `static/vinculos.js`,
`templates/autogenes_grafo.html`, `templates/autogenes_vinculos.html`,
`static/styles.css`.

**Aceptación:** test que recorre las tarjetas y falla ante cifra sin
unidad/periodo/fuente; cambiar lente no recarga payload y es reversible; copy
en español accesible; AAA ambos temas; las palabras "probable", "estimado",
"proyectado" están prohibidas en el panel (la única proyección permitida
sigue siendo `cupos_what_if`, que declara su método).

**Riesgo dominante de toda la propuesta:** sobre-afirmar. Mitigación de
proceso: cada frase se somete a "¿de qué fila sale este número?"; sin
respuesta, la frase no existe.

### I3 · Benchmark de pares: similitud + brecha J/N [S–M]

Features normalizados por marca (mix de origen, mix de aduana, split J/N, mix
de modelos, valor medio unitario) → coseno contra VW + Jaccard ponderado de
rutas; ranking con el porqué feature a feature; umbral de `n` mínimo declarado
para marcas chicas. La brecha J/N se reporta en unidades/share sobre rutas
idénticas — sin pesos (§4.1-9). **Archivos:** `analisis_vw.py`,
`vinculos.js`, template, tests. **Aceptación:** ranking estable y explicable;
degradación declarada por muestra insuficiente.

### I4 · Deriva entre sesiones y rutas ausentes [M]

`deriva_vw(sesion_ref, sesion_actual)` compara redes de flujo: rutas
ganadas/perdidas, delta de share por aduana, volumen y valor — todo medido.
Ausencias con las dos definiciones de §4.1-10, cada una con su baseline
citado. La UI declara "comparación entre sesiones, no time-travel del
pipeline" (límite de `cronos.py:14-16`). Requiere ≥2 sesiones; con una, se
degrada honesto. **Archivos:** `analisis_vw.py`, `rutas/autogenes.py`,
`vinculos.js` (franja temporal) o `/autogenes/cronos`, tests.

---

## 6. Pista L — el lienzo (paralelizable con la Pista I; archivos disjuntos hasta I2)

### L1 · Navegación: el grafo se vuelve citable como URL [M]

- **Estado deep-linkable:** serializar en la URL (hash o query, claves cortas,
  defaults omitidos) sesión, nodo seleccionado, viewport `k/x/y`, filtros de
  leyenda, kind aislado, racimos expandidos y lente activa (cuando I2
  llegue). `replaceState` con debounce; `pushState` solo en saltos de foco
  explícitos.
- **Historial de foco:** pila con atrás/adelante sobre `enfocar`
  (`grafo.js:1455`).
- **Minimapa:** canvas pequeño con posiciones a escala + rectángulo de
  viewport; clic salta; rAF de baja frecuencia; chrome 100% por tokens.

**Archivos:** `static/grafo.js`, `templates/autogenes_grafo.html`,
`static/styles.css`, smoke en `tests/test_estado_y_landing.py`.
**Aceptación:** ida y vuelta por URL reproduce la vista exacta (Playwright);
minimapa respeta reduced-motion; sin regresión de frame perceptible.

### L2 · El 1% de estética y accesibilidad — ejecuta la lista §7 [M, divisible]

La lista completa está en §7 para que Opus la ejecute ítem a ítem; es
divisible en commits pequeños independientes (Parte A: un cambio lógico por
commit).

### L3 · Rendimiento solo si se mide la necesidad [S+S+spike]

1. **Culling por viewport** (sí): `dibujar()` itera todas las aristas y nodos
   sin test de visibilidad (`grafo.js:678,745`); añadir intersección con el
   rectángulo visible. Barato, sin cambiar el motor.
2. **Persistencia de posiciones** (sí): cachear el asentamiento por
   `version_de_sesion` para que reabrir no re-simule; las posiciones ya son
   deterministas, así que esto solo ahorra el arranque.
3. **Spike zoom semántico ↔ escalera de renormalización** (evaluar tras I2):
   alejarse muestra supernodos de comunidad (`escalera_renorm` ya existe y ya
   sirve a `/api/v1/autogenes/qualia/red`); necesita affordance clara. Si el
   spike no convence en una sesión, se descarta sin culpa.
4. **WebGL: rechazado por defecto** — solo se reabre si el presupuesto p95 ≤
   16 ms de §2 se viola con culling+persistencia ya aplicados.

---

## 7. La lista del 1% — estética (E) y accesibilidad (A), con anclas

Cada ítem es un commit pequeño independiente. Todo color/espaciado/motion via
tokens (`static/styles.css`); nada de hex/px crudos en componentes.

**Estética:**

- **E1 · Halo de etiqueta:** scrim del color de fondo del tema (~85% alfa,
  token) detrás de las etiquetas del canvas — legibilidad sobre zonas densas
  (zona de etiquetas, `grafo.js:849+`).
- **E2 · Lente cromática de comunidad CVD-safe:** hoy la comunidad no colorea
  (§3.2-5). Rampa categórica accesible para daltonismo, definida como tokens
  nuevos (primitivo→semántico), verificada AAA en Nocturne y Daylight. Se
  activa solo como lente (I2), no como default — la identidad por kind se
  conserva.
- **E3 · Alfa de arista por peso:** escalar el alfa (p. ej. √peso) en vez del
  0.3 fijo (`grafo.js:695`) — la estructura pesa lo que pesa.
- **E4 · Z-order por estado:** las aristas resaltadas (camino/vecindario) se
  dibujan al final, nítidas sobre el fondo atenuado.
- **E5 · Números tabulares:** `font-variant-numeric: tabular-nums` en tarjetas
  dossier, panel y línea de estado — las cifras alinean y dejan de "bailar".
- **E6 · Easing de cámara:** zoom por botón y encuadre con interpolación breve
  (token de motion); instantáneo bajo `prefers-reduced-motion` (el flag ya
  existe, `grafo.js:58`).
- **E7 · Estados vacíos con siguiente acción:** "SIN DATOS" pasa a copy que
  dice qué hacer ("Procesa una sesión en Áreas para poblar el grafo").
- **E8 · Export de exhibit:** botón que exporta PNG del encuadre actual
  (`canvas.toBlob`) con pie generado — sesión, lente activa, fecha, fuente —
  más "copiar enlace" del deep-link (L1). Es el puente directo del grafo al
  deck/memo del estándar B3/B4.
- **E9 · Cursor semántico completo:** grab/grabbing en pan, pointer sobre
  nodo, crosshair en modo camino (parcialmente existe, `grafo.js:1359`);
  auditar cobertura.

**Accesibilidad (meta AAA):**

- **A1 · Teclado completo del lienzo:** hoy solo Escape
  (`grafo.js:1355-1365`). Añadir: Tab enfoca el lienzo; flechas ciclan
  vecinos del nodo enfocado (orden determinista); Enter abre el dossier;
  `+`/`-` zoom; `0` encuadre. Anillo de foco visible por token sobre el nodo
  activo.
- **A2 · Región viva:** `aria-live="polite"` que anuncia la selección
  ("Volkswagen · marca · 220 vehículos · comunidad 3") — el canvas deja de
  ser mudo para lector de pantalla.
- **A3 · Modo tabla (la alternativa accesible real):** el mismo payload como
  tabla HTML ordenable (etiqueta, kind, grado, métrica de la lente activa),
  conmutable junto al lienzo. `role="img"` con `aria-label`
  (`autogenes_grafo.html:38`) **no** es alternativa suficiente para un grafo
  de datos; la tabla sí — y es la respuesta WCAG correcta para canvas.
- **A4 · Objetivo táctil:** radio de hit mínimo ~22 px de pantalla para hojas
  pequeñas (hoy el hit sigue al radio visual, `nodoEn`, `grafo.js:893`).
- **A5 · Auditoría reduced-motion completa:** el flag existe y cubre corona y
  anillos (`grafo.js:58,205-287`); auditar y cubrir también partículas
  sinápticas y latido de foco.
- **A6 · Contraste AAA verificado** para E2 y las etiquetas del canvas en
  ambos temas, con auditoría automatizable sobre los tokens (script de
  verificación en tests o herramienta de repo).

---

## 8. Orden de ejecución y gate de entrega

**Secuencia recomendada** (dos sesiones pueden avanzar en paralelo, una por
pista, sin colisión de archivos hasta I2):

1. Pista I: **I1 → I2 → I3 → I4** (cadena crítica del valor VW).
2. Pista L: **L1 → L2(§7) → L3**, en paralelo con I1; L2 puede intercalarse
   como commits chicos entre fases.
3. El spike de zoom semántico (L3-3) espera a I2 para no pelear por
   `grafo.js`.

**Gate B5 por fase — nada se declara terminado sin:**

- [ ] Lógica: la fase responde su pregunta de negocio; estructura MECE; cada
      superficie nueva pasa "so what / now what".
- [ ] Números: toda cifra reconcilia a fila fuente y sobrevive el sniff test;
      unidades/periodo/moneda etiquetados.
- [ ] Robustez: degradación declarada ante datos degenerados o muestra chica;
      doble corrida idéntica.
- [ ] Procedencia: fuente citada, supuestos explícitos, reproducible.
- [ ] Defensa: cada número defendible ante un revisor hostil.
- [ ] Pulido: cero typos, tokens sin excepciones, AAA en ambos temas, suite
      verde (`python3 -m pytest tests/ -q`).

---

## 9. Leyes transversales (no negociables, aplican a toda fase)

- **Cero snake oil.** Todo número citable a fila/fragmento/pedimento. Montos
  ($) solo los ya monetizados por CONCILIA/NOMOS (`concilia.py:24-27`);
  ningún análisis de red inventa pesos ni confianzas. Única proyección
  permitida: `cupos_what_if`, que declara su método.
- **Determinismo del render y de todo panel numérico.** Métricas de panel
  puras en `topologia.py`/`analisis_vw.py`; `networkx` confinado a
  `caminos.py`.
- **Pipelegado intocable:** `concentrado1.py`, `concentrado2.py`,
  `Estadistico.py`, `PDFs_*.py`. Ajustes solo en el borde.
- **Local-first / provenance law:** el sustrato no hace red sin aprobación;
  las entidades citan fragmentos.
- **Design system:** solo tokens; disciplina de magenta vía
  `--danger`/`--telos-on` (`styles.css:72` — no existe `--coral`); AAA;
  motion desde tokens, sin flashes >5 Hz; reduced-motion degrada a estático.
- **Idioma:** copy de UI en español accesible sin emojis; código, comentarios
  y commits en inglés. Conventional commits, un cambio lógico por commit.

---

## 10. Verificación

- **Tests:** `python3 -m pytest tests/ -q`. Línea base del repo: 315 (312 + 1
  skip en contenedores sin OCR: los gated por PyPDF2/Tesseract). Cada fase
  añade tests deterministas 1:1, incluida la doble corrida de igualdad exacta
  para toda métrica nueva.
- **App:** `docker/compose.yaml` → `http://127.0.0.1:5001`. Rebuild Podman:
  `podman rm -f gnosis; podman rmi -f gnosis:local; podman-compose -f
  docker/compose.yaml up -d --build`.
- **Visual:** Flask contra BD sembrada + Playwright (chromium en
  `/opt/pw-browsers`): captura por lente y por tema para las revisiones AAA y
  de halo/rampa; trace de frame para el presupuesto de §2 antes de tocar L3.
- **Reproducibilidad:** igualdad exacta de coordenadas tras N ticks y de toda
  cifra de panel entre dos corridas — es la prueba operativa de la ley de
  determinismo.
