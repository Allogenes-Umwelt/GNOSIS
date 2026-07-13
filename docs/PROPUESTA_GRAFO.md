# Propuesta de ejecución — el grafo de AUTOGENES a calidad mundial

> Plan de ejecución para Opus 4.8. Sin código de producción en este documento:
> es el mapa de fases, archivos, enfoque técnico, criterios de aceptación,
> trade-offs y riesgos. Todo verificado contra el árbol en `215aea3`
> (rama `claude/gnosis-autogenes-i-85bwsd`).
>
> **Ley que gobierna todo lo de abajo:** cero snake oil. Ningún insight puede
> inventar un monto ni una confianza. Todo número que se muestre debe ser
> derivable de filas reales y citable a su fragmento/pedimento/fila. La
> topología que alimenta el *render* es determinista (mismo grafo abre
> idéntico). El pipelegado (`concentrado1.py`, `concentrado2.py`,
> `Estadistico.py`, `PDFs_*.py`) no se toca.

---

## 0. Estado real del grafo — auditoría con evidencia

Antes de proponer nada, corrijo la crítica de arranque contra el código. Buena
parte de ella describe un grafo que ya no existe; aceptarla sin verificar habría
llevado a "arreglar" cosas que ya funcionan.

### 0.1 Lo que la crítica de arranque acierta

- **No hay minimapa, ni historial de foco, ni estado del grafo deep-linkable.**
  Confirmado. `cont.grafoAPI` (`static/grafo.js:1443`) expone exactamente
  `nodos / resaltar / limpiar / encuadrar / enfocar`. No hay pila de historial.
  La URL solo lleva `?session_id` (`rutas/autogenes.py:932`); el estado visual
  del lienzo —nodo seleccionado, zoom, filtros de leyenda, `kind` aislado,
  racimos expandidos— **no** está en la URL. No existe `pushState`,
  `hashchange` ni `URLSearchParams` en `grafo.js`. La acción "abrir"
  (`grafo.js:1205`) hace `window.location.href` a otra sección: es navegación
  entre páginas, no un enlace al estado del grafo.

- **No hay focus+context real.** El foco solo atenúa (binario) lo que no es
  vecino (`grafo.js:659,745`). No hay lente de distorsión (fisheye) ni
  degradado por distancia topológica.

- **El análisis de red existe pero NO se surfacea como insight accionable, y
  no responde preguntas de VW.** Este es el hueco grande y lo amplío en §0.3.

- **Las aristas no tienen *edge bundling* real.** Cierto, con matiz: las
  aristas inter-comunidad ya se curvan con un desplazamiento perpendicular
  fijo (`grafo.js:700-708`), lo que reduce algo el cruce. Pero no es *bundling*
  jerárquico ni FDEB.

### 0.2 Lo que la crítica de arranque se equivoca (evidencia)

- **"El layout de fuerzas no es determinista en posiciones."** **Falso.**
  `fuerzas.js:5-6,22-34`: las posiciones iniciales salen del ángulo áureo por
  índice dentro de cada `kind` más un matiz del `seed` del nodo. Sin
  `Math.random()`. El mismo grafo abre idéntico. La cabecera del archivo lo
  declara y el código lo cumple. Lo que **sí** es cierto: las posiciones
  *finales* no se persisten —se recomputan en cada apertura— pero son
  reproducibles porque tanto el seed como la comunidad (que viene del motor
  determinista, `proyeccion.py:199`) son estables.

- **"No escala / techo O(n²) sin Barnes-Hut/quadtree."** **Impreciso.**
  `fuerzas.js:70-104` ya implementa una rejilla espacial uniforme (celda = radio
  de corte): solo compara pares dentro de la misma celda y las 8 vecinas →
  O(n·k), no O(n²), con las MISMAS fuerzas (los pares más lejanos que el corte
  ya se descartaban). No es Barnes-Hut/quadtree, pero el efecto sobre la
  complejidad es equivalente para este caso. La diferencia honesta: la rejilla
  con corte fijo (`corte=430`) **descarta** la repulsión de largo alcance;
  Barnes-Hut la **aproximaría** en vez de descartarla. Es una aproximación
  física distinta, no un problema de complejidad.

- **"No hay LOD semántico más allá del umbral de glifo."** **Impreciso.** El
  LOD ya es multinivel: detalle "mecha" se apaga con `r*k < 13`
  (`grafo.js:751`), el glifo central aparece con `r*k >= 7` (`grafo.js:819`),
  y las etiquetas se filtran por tier + zoom + centralidad (`grafo.js:849-859`).
  Lo que falta es *zoom semántico* que cambie **qué** se muestra —enganchar el
  zoom a la escalera de renormalización, que ya existe en el servidor
  (`topologia.escalera_renorm`, usada en `/api/v1/autogenes/qualia/red`) pero
  **no** en el lienzo principal `/autogenes/grafo`.

### 0.3 El hueco real y más caro: el análisis no está orientado a VW ni se surfacea

Esto es lo que de verdad separa el grafo de "clase mundial". Evidencia:

- `proyeccion._anotar_analitica` (`proyeccion.py:188-206`) anota en cada nodo
  `comunidad`, `puente` (punto de articulación) y `centralidad` (vector propio).
  `radioDe` (`grafo.js:19-28`) usa `centralidad` para el tamaño. Hasta ahí
  llega el surfacing: **no hay selector de lente, no hay recoloreo por métrica,
  no hay panel que traduzca a negocio.**

- El motor `topologia.py` es fuerte y determinista, pero su catálogo de
  métricas es: comunidades (label propagation), puentes de articulación
  (Tarjan), centralidad de vector propio, distribución de grado, embedding
  espectral, persistencia H0, escalera de renormalización. **No existe
  intermediación (betweenness), ni PageRank, ni closeness, ni max-flow/min-cut.**
  `networkx` (vía `red.py` / `caminos.py`) se usa **solo** para camino más
  corto, vecindario y hubs por grado (`caminos.py:61-140`).

- **La proyección es un casi-árbol.** `núcleo → pedimento → vehículo`, y cada
  `vehículo → marca` y `vehículo → país` (`proyeccion.py:311-343`). Los únicos
  nodos que crean caminos transversales son `marca` y `país` (dos vehículos de
  pedimentos distintos se conectan a través de su marca o su país común).
  **Consecuencia dura:** sobre este grafo, casi cualquier centralidad global
  (betweenness, closeness, PageRank) está dominada por la jerarquía —
  `núcleo`, `marca` y `país` saldrán altos **por construcción**, no por
  hallazgo. Calcular betweenness sobre la proyección tal cual es teatro. El
  insight de VW **no vive en el grafo de procedencia**; vive en una **red de
  flujo derivada** (§2). Este es el trade-off central de toda la propuesta y
  hay que ser explícito con Julio: sin red derivada, las lentes de red son
  bonitas y vacías.

### 0.4 Datos disponibles hoy para el ángulo VW (sin inventar nada)

Ya proyectados y citables:

- `pedimento`: `patente`, `aduana`, `fecha_pedimento`, y agregado `n_vehiculos`
  y `valor` (`proyeccion.py:252-256,243-247`).
- `marca_agg`: `volumen`, `valor_sigma`, `pref_j`, `pref_n`, `modelos`,
  `origenes`, `modelo_lider`, `lider_n` (`proyeccion.py:262-292`).
- `pais_agg`: `volumen`, `valor_sigma`, `pref_j`, `pref_n`, `marcas`
  (`proyeccion.py:294-309`).
- El JOIN tri-fuente por vehículo trae `pais_code`, `marca_id`, `pedimento_id`
  y el PDF que lo ampara (`proyeccion.py:313-322`).

Con esto se puede construir honestamente la red **país → aduana → marca**
ponderada por volumen/valor **medidos**. Ahí sí las lentes de red significan
algo. Lo que **no** hay: capacidades de cupo por aduana como dato primario
(hay `cupos_what_if` sobre run-rate medido, `concilia.py`), y timestamp por fila
en las tablas aduanales (ver §5, límite de CRONOS).

---

## 1. Evaluación honesta de cada métrica de red propuesta

Antes de las fases, la criba: qué vale la pena y qué no. "Grafo de proyección" =
el grafo de procedencia actual; "red de flujo" = la red derivada país–aduana–marca
de la Fase 2.

| Métrica | Pregunta de negocio VW | ¿Vale? | Justificación honesta |
|---|---|---|---|
| Betweenness sobre grafo de proyección | ¿qué nodo es cuello de botella? | **NO** | casi-árbol; lo domina la jerarquía (§0.3). Sin insight. |
| **Betweenness sobre red de flujo** | ¿qué **aduana** concentra/broker-iza el flujo de VW? | **SÍ** | en la red país–aduana–marca la intermediación separa brokers reales. Brandes, determinista. |
| **Comunidades sobre red de flujo** | ¿qué orígenes+aduanas forman el ecosistema de VW? | **SÍ** | `detectar_comunidades` ya existe; aplicarla a la red de flujo da clústers accionables. |
| **Similitud conductual (marca ~ VW)** | ¿qué marcas se comportan como VW? | **SÍ** | vector por marca (mix país, mix aduana, split J/N, mix modelo, valor medio) → distancia coseno normalizada → ranking. No usa red: son features de `marca_agg`. Barato y accionable. |
| **Ego-network de VW** | densidad, alcance y brokerage propios de VW | **SÍ (barato)** | subgrafo a 2 grados de `marca:VW`; métricas locales. `vecindario()` ya hace el 80%. |
| **Min-cut país→VW** | ¿qué conjunto mínimo de aduanas/rutas, si cae, corta el suministro de VW? | **SÍ, con caveat** | capacidad = volumen **medido**. Es descriptivo del pasado observado, **no** predictivo. Se declara así. |
| PageRank | ¿importancia por flujo? | **Marginal** | correlaciona fuerte con el grado ponderado (valor/volumen) que ya se tiene. Poco valor incremental salvo como recoloreo alternativo. **No** es prioridad. |
| Closeness | ¿alcance medio? | **NO** | en (casi-)árbol ≈ inverso de la profundidad; trivial. Descartar. |
| Rutas esperadas-pero-ausentes | ¿falta una ruta país–aduana que VW debería tener? | **SÍ, con disciplina** | "esperada" = **medida contra un baseline observado**, nunca una predicción. Dos definiciones limpias en §5. |
| Deriva temporal mes a mes (CRONOS) | ¿cambió la red de VW? | **SÍ pero por sesiones, NO por CRONOS** | CRONOS viaja el **sustrato** `ag_*`, no el pipeline aduanal, que **no tiene timestamp por fila** (`cronos.py:14-16`). La deriva de la red VW se hace comparando **sesiones** (cada una = un mes procesado) con `qualia.drift_sesiones`, no con CRONOS. |

**Descarte explícito (no hacer):** closeness; PageRank como métrica destacada;
betweenness sobre la proyección; FDEB / edge bundling jerárquico completo
(§4, caro y engañoso); rewrite a WebGL salvo que el profiling lo exija (§4).

---

## 2. Fase 1 — La red de análisis derivada (el corazón del ángulo VW)

**Objetivo:** construir, de forma pura y determinista, la red de flujo
país–aduana–marca desde los agregados ya proyectados, y las métricas que
**solo ahí** significan algo. Sin esto, todo el "surfacing" posterior sería
snake oil.

**Enfoque técnico:**

- Nuevo módulo `autogenes/analisis_vw.py` (lectura pura, sin escritura, estilo
  `proyeccion.py`/`topologia.py`). Construye
  `red_flujo = {nodos, enlaces}` con `kind ∈ {pais, aduana, marca}` y aristas
  ponderadas por volumen y por valor Σ **medidos** (dos pesos: unidades y
  monto, nunca estimados). Nodo `aduana` derivado de `pedimento.aduana`.
- Extender `autogenes/topologia.py` con dos primitivas **puras y
  deterministas**, con test 1:1 (como el resto del motor):
  - `intermediacion(red)` — betweenness de Brandes (O(V·E)), orden de nodos
    estable, sin `networkx`.
  - `min_corte(red, fuente, sumidero)` — max-flow/min-cut (Edmonds–Karp sobre
    capacidad = volumen), determinista por orden de arista.
- **Decisión de diseño sobre `networkx` (punto abierto del arranque):** para
  estas lentes se implementa en `topologia.py` **puro**, NO `networkx`. Razón:
  la ley de citación exige que cualquier número que aparezca en un panel sea
  reproducible cross-run/cross-plataforma; Brandes y Edmonds–Karp son
  deterministas y baratos sobre la red de flujo (decenas de nodos, no miles).
  `networkx` se queda **solo** en `caminos.py` (camino/vecindario/hubs), donde
  ya está y no alimenta paneles numéricos citados. Trade-off: más código propio
  (≈150-200 líneas + tests) a cambio de la garantía de reproducibilidad. Se
  paga; es la ley del motor.
- Nueva API `GET /api/v1/autogenes/analisis` en `rutas/autogenes.py`: devuelve
  `red_flujo` + `{intermediacion, comunidad, resumen}` por lente. Cacheable por
  la misma `version_de_sesion` que `red.py:35`.

**Archivos afectados:**
- Nuevo: `autogenes/analisis_vw.py`.
- `autogenes/topologia.py` (+ `intermediacion`, `min_corte`).
- `rutas/autogenes.py` (nueva ruta `/api/v1/autogenes/analisis`).
- Nuevos tests: `tests/test_analisis_vw.py`, ampliar `tests/test_topologia.py`.

**Criterios de aceptación:**
- La red de flujo se construye solo de agregados existentes; ningún peso es
  estimado (assert: todo peso = suma de filas medidas).
- `intermediacion` y `min_corte` dan el MISMO resultado en dos ejecuciones y en
  dos plataformas (test de reproducibilidad con red fija).
- Sobre una BD sembrada con VW + otras marcas, la aduana con mayor betweenness
  en la red de flujo es explicable a mano (se documenta el caso de prueba).
- Suite verde; cobertura nueva ≥ la media del repo.

**Trade-offs:** implementar Brandes/Edmonds–Karp a mano en vez de `networkx`
cuesta código y tiempo; se acepta por reproducibilidad. La red de flujo es una
**vista derivada** —hay que documentar que no es procedencia y no se cita como
evidencia primaria, sino como lectura estructural sobre datos citables.

**Riesgos:**
- *Grafo degenerado* (una sola aduana, un solo país): las métricas colapsan a
  trivial. Mitigación: la API declara `n_nodos`/`densidad` y el panel muestra
  "estructura insuficiente para esta lente" en vez de un número vacío.
- *Confundir la red de flujo con el render:* mantener explícito que Fase 1 no
  toca `grafo.js`; solo produce datos.

---

## 3. Fase 2 — Surfacing: selector de "lente" + panel VW

**Objetivo:** convertir los números de la Fase 1 en insight que un operador de
VW lee sin saber teoría de grafos. Aquí se cumple "insight accionable".

**Enfoque técnico:**

- **Selector de lente** en `/autogenes/grafo`: un control que recolorea y
  redimensiona los nodos por la métrica elegida (grado ponderado / centralidad
  de vector propio / intermediación / comunidad). El tamaño ya se modula por
  `centralidad` (`grafo.js:19-28`); se generaliza a una función
  `metricaActiva(n)` y una rampa de color por token (sin hex crudo; magenta solo
  vía `--coral`/`--danger`). La leyenda pasa a explicar la lente activa.
- **Panel VW** en `/autogenes/vinculos` (candidato natural, ya monta el mismo
  `grafoAPI`, `static/vinculos.js`): una columna que traduce a lenguaje llano,
  cada afirmación con su cita:
  - "El **75%** del volumen de VW (N unidades medidas) pasó por la aduana **X**;
    es el mayor broker de tu flujo." → deriva de betweenness + volumen en la red
    de flujo; N es conteo real de filas.
  - "VW comparte ecosistema (comunidad) con los países **A, B** y la aduana
    **X**." → de `comunidad` sobre la red de flujo.
  - "Corte crítico: si caen las aduanas **{X, Y}**, se interrumpe el **62%** del
    suministro de VW (medido)." → de `min_corte`, porcentaje = volumen del corte
    / volumen total, ambos medidos.
- Cada tarjeta del panel enlaza a `enfocar(id)`/`resaltar(...)` del `grafoAPI`
  para que "leer" y "ver en el lienzo" sean el mismo gesto.

**Archivos afectados:**
- `static/grafo.js` (función `metricaActiva`, recoloreo por lente, leyenda).
- `static/vinculos.js` + `templates/autogenes_vinculos.html` (panel VW).
- `static/styles.css` (tokens de rampa por métrica; nada de px/hex crudo).
- `templates/autogenes_grafo.html` (control selector de lente).

**Criterios de aceptación:**
- Toda cifra del panel es reproducible desde la API y trazable a filas
  (test: cada porcentaje = numerador/denominador medidos, sin redondeo que
  invente precisión).
- Copy 100% en español, registro accesible, sin emojis. Contraste AAA en ambos
  temas (Nocturne/Daylight). `prefers-reduced-motion` degrada a estático.
- Cambiar de lente no recarga el grafo (mismo payload, solo recoloreo) y es
  reversible.
- Si no hay marca VW en la sesión, el panel lo dice honestamente y ofrece la
  marca de mayor volumen como sujeto.

**Trade-offs:** el selector de lente añade estado visual; hay que decidir si ese
estado entra en el deep-link (Fase 0). Recomendado: sí, la lente activa es parte
del estado deep-linkable.

**Riesgos:**
- *Sobre-afirmar.* El mayor riesgo del proyecto. Mitigación de proceso: cada
  frase del panel se revisa contra "¿de qué fila sale este número?"; si no hay
  respuesta, no se muestra. Ninguna frase con "probable", "estimado" o
  "proyectado" salvo `cupos_what_if`, que ya declara su método.

---

## 4. Fase 3 — Similitud conductual (marca ~ VW)

**Objetivo:** responder "¿qué marcas se comportan como VW?" con un método
transparente. Barato, alto valor de negocio, sin teoría de grafos.

**Enfoque técnico:**

- En `autogenes/analisis_vw.py`: por marca, un vector de features **normalizados**
  desde `marca_agg`/`pais_agg`: distribución de país de origen, distribución de
  aduana, split preferencia J/N, mix de modelos, valor medio por unidad. Distancia
  coseno (o L2 sobre features normalizados) contra el vector de VW → ranking de
  las marcas más parecidas, con el **porqué** (qué features acercan a cada una).
- Nada de esto es una red; es un feature-vector determinista. Se expone en la
  misma API `/api/v1/autogenes/analisis` bajo `similitud_conductual`.
- Surfacing mínimo: lista ordenada en el panel VW ("Marcas que se comportan como
  VW: …, porque comparten origen alemán y preferencia N"). Opcional y de bajo
  costo: un pequeño radial de features comparado.

**Archivos afectados:** `autogenes/analisis_vw.py`, `static/vinculos.js`,
`templates/autogenes_vinculos.html`, `tests/test_analisis_vw.py`.

**Criterios de aceptación:**
- El ranking es estable (mismo orden en dos corridas) y explicable feature a
  feature.
- Cada "porque…" cita las features concretas, no una intuición.
- Robusto a marcas con poco volumen: se declara `n` y se degrada
  ("muestra insuficiente para comparar").

**Trade-offs:** la elección de features y su normalización es una decisión de
modelado; hay que documentarla y dejarla visible (no una caja negra). Sin
ponderaciones ocultas.

**Riesgos:** *falsa precisión* con marcas de bajo volumen. Mitigación: umbral de
`n` mínimo declarado.

---

## 5. Fase 4 — Deriva temporal de VW (entre sesiones)

**Objetivo:** "¿cómo cambió la red de VW mes a mes?" — con honestidad sobre qué
es posible.

**Límite duro (declararlo en la UI):** CRONOS reconstruye el **sustrato** `ag_*`
por `created_at`; las tablas aduanales (`importaciones`, `extraccion_facturas`)
**no llevan timestamp por fila** (`cronos.py:14-16`). Por tanto la evolución de
la red país–aduana–marca de VW **no** se saca de CRONOS. Se saca comparando
**sesiones** procesadas (cada sesión = un mes), que es exactamente lo que ya hace
`qualia.drift_sesiones`.

**Enfoque técnico:**

- Nueva función en `analisis_vw.py`: `deriva_vw(sesion_a, sesion_b)` que compara
  las redes de flujo de VW de dos sesiones y reporta, todo **medido**: rutas
  país–aduana ganadas/perdidas, cambio de share por aduana, cambio de volumen y
  valor.
- **Rutas esperadas-pero-ausentes** — dos definiciones limpias, ninguna
  predictiva:
  1. *Ausencia vs. baseline propio:* par país–aduana que VW usó en la sesión
     previa y no en la actual (deriva negativa medida).
  2. *Ausencia vs. pares:* par país–aduana presente para otras marcas en la
     misma sesión pero no para VW (comparación medida, no pronóstico).
- Reutiliza la infraestructura de sesiones existente; expone en
  `/api/v1/autogenes/analisis?deriva=<sesion_ref>`.

**Archivos afectados:** `autogenes/analisis_vw.py`, `rutas/autogenes.py`,
`static/vinculos.js` (o una franja en `/autogenes/cronos`),
`tests/test_analisis_vw.py`.

**Criterios de aceptación:**
- Ninguna ruta "ausente" se marca sin su baseline citado (sesión previa o marcas
  pares de la misma sesión).
- La UI dice explícitamente "comparación entre sesiones, no time-travel del
  pipeline".

**Trade-offs:** requiere ≥2 sesiones procesadas; con una sola, la fase se degrada
a "sin base de comparación".

**Riesgos:** *interpretar deriva como causa.* La UI describe el **qué cambió**,
nunca el **por qué**.

---

## 6. Fase 5 — Navegabilidad (independiente, de bajo riesgo)

**Objetivo:** cerrar los huecos reales de navegación de §0.1. Es puro cliente,
sin backend, sin tocar determinismo. Alto ROI, riesgo bajo — puede ir en
paralelo o incluso primero.

**Enfoque técnico:**

- **Estado del grafo deep-linkable.** Serializar en la URL (query o hash) el
  estado visual: `session_id`, nodo seleccionado, `k`/`x`/`y` del viewport,
  `kind` aislado, filtros de leyenda, lente activa (Fase 2), racimos
  expandidos. `grafo.js` lee el estado al montar y lo escribe con `replaceState`
  al cambiar (con debounce). Convierte cualquier vista en un enlace compartible.
- **Historial de foco.** Pila ligera de nodos enfocados con "atrás/adelante";
  `enfocar()` (`grafo.js:1455`) apila. Copy en español.
- **Minimapa.** Un canvas pequeño con las posiciones de nodos a escala y el
  rectángulo del viewport; clic para saltar. Reusa `nodos` y `vista`; se dibuja
  en el mismo `dibujar()` o en su propio `rAF` de baja frecuencia.
- **(Opcional, evaluar) focus+context.** Una lente fisheye suave alrededor del
  foco. Se propone como *spike* de bajo compromiso: si no mejora legibilidad de
  forma clara, se descarta. No es prioridad frente al minimapa.

**Archivos afectados:** `static/grafo.js`, `templates/autogenes_grafo.html`,
`static/styles.css` (chrome del minimapa por tokens),
`tests/test_estado_y_landing.py` (smoke de que la ruta con estado en URL
renderiza).

**Criterios de aceptación:**
- Pegar una URL reproduce la vista exacta (nodo, zoom, filtros, lente).
- Minimapa refleja el viewport y navega al hacer clic; respeta
  `prefers-reduced-motion`.
- Sin regresión de rendimiento perceptible (minimapa a baja frecuencia).

**Trade-offs:** el estado en URL puede crecer; usar claves cortas y omitir
defaults. `replaceState` (no `pushState`) para no inundar el historial del
navegador, salvo en saltos de foco explícitos.

**Riesgos:** bajos. El mayor: que el estado en URL y el historial de foco se
peleen; se define una sola fuente de verdad (el estado del grafo) y la URL es su
proyección.

---

## 7. Fase 6 — Rendimiento y estética a escala (la más cara, probablemente NO)

**Objetivo:** subir el techo de rendimiento **solo si** el profiling lo exige.
Honestidad: dado que el colapso ya acota el set visible (meta-nodos ν×N,
`grafo.js:384-472`, y `limite_vehiculos=150` por defecto, `grafo.js:1483`), y que
`fuerzas.js` ya es O(n·k), el techo real probablemente no se alcanza en los
tamaños de un caso por sesión. Esta fase es la de **menor** prioridad.

**Enfoque técnico (por orden de coste/beneficio):**

1. **Culling por viewport (barato, canvas 2D).** `dibujar()` hoy itera TODAS las
   aristas (`grafo.js:678`) y TODOS los nodos (`grafo.js:745`) cada frame sin
   comprobar límites. Añadir un test de intersección con el rectángulo visible
   (en coordenadas de mundo) salta lo fuera de pantalla. Mejora directa a alto
   zoom, sin cambiar el motor. **Recomendado.**
2. **Persistir posiciones finales por sesión (barato).** Cachear el resultado de
   la simulación (mismo `version_de_sesion`) para que reabrir no re-simule.
   Mejora el arranque; mantiene el determinismo (las posiciones ya lo son).
   **Recomendado.**
3. **Edge bundling ligero.** NO FDEB completo (caro y engañoso: sugiere flujos
   que no existen). Como mucho, agrupar aristas inter-comunidad por endpoints
   compartidos mejorando la curva ya existente (`grafo.js:700-708`). **Evaluar,
   no prometer.**
4. **WebGL.** Rewrite del render a WebGL/regl. **NO**, salvo que el profiling
   demuestre que canvas 2D es el cuello con datos reales. Coste altísimo (reescribir
   ~1500 líneas de lenguaje visual PANOPTES), riesgo de perder la estética
   actual, y beneficio dudoso dado el colapso. Se documenta como descartado por
   defecto.
5. **Zoom semántico → escalera de renormalización.** Enganchar el nivel de zoom
   a `topologia.escalera_renorm` (ya existe en el servidor, usado en
   `/api/v1/autogenes/qualia/red`) para que alejarse muestre supernodos de
   comunidad y acercarse los expanda. Es más *navegabilidad/estética* que
   rendimiento, pero encaja aquí. **Evaluar tras Fase 2.**

**Archivos afectados:** `static/grafo.js` (culling, persistencia), posible
`autogenes/red.py`/nuevo cache de posiciones, `autogenes/topologia.py` (ya tiene
la escalera).

**Criterios de aceptación:** cualquier cambio de esta fase mantiene el
determinismo y no altera el lenguaje visual PANOPTES. El culling no debe
introducir "popping" perceptible en los bordes.

**Trade-offs:** WebGL cambiaría el techo pero a coste desproporcionado; se
prioriza culling + persistencia, que dan el 80% del beneficio al 10% del coste.

**Riesgos:** el zoom semántico puede confundir si el usuario no entiende que los
nodos "se agrupan"; necesita affordance visual claro (y respetar
`prefers-reduced-motion`).

---

## 8. Orden recomendado y racional de priorización

Priorizado por impacto/coste, no por número de fase:

1. **Fase 5 (navegabilidad)** — riesgo bajo, ROI alto, desbloquea el estado
   deep-linkable que las demás fases reutilizan. Puede ir primero.
2. **Fase 1 (red derivada + betweenness/min-cut)** — es el prerrequisito de todo
   insight VW honesto. Sin ella, §3–§5 no tienen sustrato.
3. **Fase 2 (lente + panel VW)** — convierte Fase 1 en el entregable que Julio
   puede enseñar a VW.
4. **Fase 3 (similitud conductual)** — barata, alto valor, independiente.
5. **Fase 4 (deriva entre sesiones)** — depende de ≥2 sesiones; valor claro
   cuando hay historia.
6. **Fase 6 (rendimiento/WebGL)** — la última, y buena parte probablemente se
   descarta tras profiling. Solo culling + persistencia son "sí" claros.

**Qué NO hacer (resumen):** closeness; PageRank destacado; betweenness sobre la
proyección; FDEB completo; rewrite a WebGL por defecto; cualquier insight con
monto o confianza estimada.

---

## 9. Restricciones transversales (aplican a toda fase de ejecución)

- **Cero snake oil.** Todo número citable a fila/fragmento/pedimento. Ninguna
  confianza ni monto inventado. `cupos_what_if` es la única proyección permitida
  y ya declara su método.
- **Determinismo del render.** La topología que alimenta el lienzo es
  determinista. Las lentes numéricas de panel se implementan puras en
  `topologia.py`/`analisis_vw.py`; `networkx` se queda en `caminos.py`.
- **Local-first / provenance law.** El sustrato no hace red sin aprobación; las
  entidades citan fragmentos.
- **Design system.** Solo tokens (`static/styles.css`), sin hex/px crudos en
  componentes. Disciplina de magenta (`--coral`/`--danger`). AAA en Nocturne y
  Daylight. Motion desde tokens, sin flashes >5 Hz;
  `prefers-reduced-motion` degrada a estático.
- **Idioma.** Copy de UI en español (registro accesible, sin emojis); código,
  comentarios y commits en inglés.
- **Pipelegado intocable.** `concentrado1.py`, `concentrado2.py`,
  `Estadistico.py`, `PDFs_*.py`. Cualquier ajuste va en el borde
  (`app.py` / capas nuevas).
- **Git.** Conventional commits; sin force-push sobre historia ajena.

---

## 10. Verificación por fase

- **Tests:** `python3 -m pytest tests/ -q` (línea base: 312 verdes + 1 skipped
  en este contenedor; los ~2-3 restantes hasta 315 dependen de PyPDF2/Tesseract,
  gated por OCR, no son regresiones). Cada fase añade tests deterministas 1:1 con
  el comportamiento, como el resto del motor.
- **App:** `docker/compose.yaml` → `http://127.0.0.1:5001`. Rebuild en Podman:
  `podman rm -f gnosis; podman rmi -f gnosis:local;
  podman-compose -f docker/compose.yaml up -d --build`.
- **Inspección visual del grafo:** Flask contra una BD sembrada + Playwright
  (chromium en `/opt/pw-browsers`) para capturar el lienzo por lente y verificar
  contraste AAA en ambos temas.
- **Reproducibilidad (crítico):** para toda métrica de panel, un test que
  corre dos veces y compara igualdad exacta; para betweenness/min-cut, además un
  caso a mano documentado.
