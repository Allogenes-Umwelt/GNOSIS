# Propuesta — Ingesta (F4) y Radar (F5) de AUTOGENES: de correctos a instrumentos

Modelo: `docs/PROPUESTA_GRAFO.md`. Misma disciplina: BLUF, vara medible, fases
priorizadas por impacto/costo con archivos/aceptación/trade-offs/riesgos,
gramática de tarjeta para todo panel numérico, cero snake oil. Verificado en
vivo (Playwright contra BD sembrada, ambos temas) — las capturas citadas viven
en el scratchpad de la sesión.

## 0. Resumen ejecutivo — la respuesta primero

**El Radar ya es fuerte; la Ingesta muestra lo que no debe.** La vista
metabólica del radar (`metabolismo.js`) es un instrumento honesto y pulido:
gauge de avance, fugas por etapa con detalle accionable, riel de urgencias.
No se re-hace; se pule (benchmark en el gauge, detalle por defecto). La
Ingesta, en cambio, tiene un defecto estructural: su **"Mapa de Ingesta" no es
un mapa de ingesta** — renderiza el árbol de ontología completo
(`/api/v1/autogenes/arbol` → `proyeccion.arbol_ontologia`), dominado por las
hojas VIN de los vehículos aduanales, y sepulta lo único que importa en esa
página (qué documentos entraron, cuáles siguen fríos, qué entidades
produjeron) en una rama minúscula con etiquetas encimadas. Además falla el
contraste AAA en Daylight y desperdicia un tercio de la pantalla.

El grueso del trabajo es Ingesta (una vía documento-céntrica que sí responde
"qué traje y qué falta metabolizar"); el Radar recibe pulido menor. La tensión
"dos lecturas" (señales crudas vs metabolismo) se resuelve por decisión, no por
código nuevo: `senales_de_sesion` es el proveedor de datos/conteo, el
metabolismo es la vista — **no se construye una segunda vista**.

## 1. La vara — cuándo Ingesta y Radar son "instrumentos"

Se alcanza cuando **todo** lo siguiente pasa:

1. **La Ingesta responde su propia pregunta sin ruido.** Un operador abre
   `/autogenes/ingesta` y ve, sin scroll ni interpretación, cuántas fuentes
   entraron, cuántas siguen frías (nadie las citó) y qué entidades produjo cada
   una. Cero hojas VIN aduanales compitiendo por la tinta.
2. **Legible en ambos temas, AAA.** Cada etiqueta y arista del mapa pasa
   contraste AAA en Nocturne y Daylight; ninguna etiqueta se recorta ni colisiona.
3. **La bandeja distingue frío de metabolizado** de un vistazo, es ordenable y
   filtrable; una fuente fría no se ve igual que una ya extraída.
4. **Cero pantalla muerta.** Ningún panel queda vacío en el estado inicial.
5. **Todo panel numérico cumple la gramática de tarjeta** (§5): cifra+unidad+
   periodo+benchmark → so-what → now-what derivado → fuente. Ningún número
   inventa monto ni confianza.
6. **Determinismo y procedencia intactos:** toda cifra citable a fila/fragmento;
   toda escritura por `Sustrato`; doble corrida idéntica en métricas nuevas.
7. **Gates verdes:** ruff limpio, eslint 0 errores, pytest verde, capturas AAA
   en ambos temas por fase.

## 2. Auditoría con evidencia

### 2.1 Ingesta — lo fuerte y los huecos

**Fuerte (no re-hacer):** el flujo HITL es sólido —
`extraccion.py:64` sanea la propuesta contra los ids reales (un modelo no
fabrica procedencia); `sustrato.integrar_propuesta` vuelve a sanear (cinturón y
tirantes); el quórum de dos modelos (`extraccion.py:127`) marca acuerdo por
entidad; la cola secuencial y el guard `extraccionEnVuelo`
(`ingesta.js:23,131`) evitan doble costo de modelo; OCR híbrido para escaneados
(`ingesta.py:86`). El backend de la bandeja (`ingesta.py:212`) ya computa
`entidades` por artefacto. Esto queda.

**Huecos confirmados (evidencia):**

- **H1 · El mapa muestra el grafo entero, no la ingesta.**
  `autogenes_ingesta.html:45` carga `dendro.js`, que consume
  `/api/v1/autogenes/arbol` (`dendro.js:228`) →
  `proyeccion.arbol_ontologia` (`proyeccion.py:218`): núcleo → pedimentos →
  **vehículos (VIN)** → marca/país. En la captura `ing_noct.png` las 40 hojas
  VIN de AUDI/PORSCHE/SEAT dominan el lienzo y los cinco artefactos reales
  quedan aplastados en la rama "fuentes" inferior. La página de ingesta repite
  —peor— lo que ya viven el grafo (`/autogenes/grafo`) y el landing
  (constelación de similitud). **Defecto de mayor impacto.**
- **H2 · Contraste AAA roto en Daylight.** `dendro.js:29` usa `--line-2`
  (`#777`) para aristas y `colores.t3` para etiquetas, con alpha 0.42 en aristas
  (`dendro.js:126`). En `ing_day.png` las hojas VIN y sus aristas son casi
  invisibles sobre blanco. Viola la ley AAA de CLAUDE.md.
- **H3 · Colisión y recorte de etiquetas.** En la rama "fuentes" las etiquetas
  de artefacto se enciman con las de entidad (`dendro.js` pinta hojas a la
  derecha sin evitar colisión). Recortes: bandeja a 20 chars
  (`ingesta.js:53`, "pedimento\_veracruz.p"), nodos a 24 (`dendro.js:178`,
  "Agencia Aduanal del Golf").
- **H4 · La bandeja ignora el frío.** `ingesta.js:53-55` pinta "N frag · M ent"
  pero una fuente con 0 entidades (fría) se ve igual que una metabolizada. El
  dato de frialdad existe (`senales.fuentes_frias`) y no se usa aquí. Sin orden
  ni filtro; "Extraer de todos" es todo-o-nada.
- **H5 · Un tercio muerto.** "Revisa e Integra" (`autogenes_ingesta.html:56`)
  está vacío hasta que hay extracción (`ing_noct.png`): una columna en blanco
  en el estado por defecto.
- **H6 · Redibujo O(archivos).** En el lote/ZIP, `ingesta.js:110` llama
  `pintarArtefactos() + recargarMapa()` por cada archivo dentro del bucle
  secuencial: reconstruye el árbol de ontología completo N veces para N
  archivos. Debe reconstruirse una vez al terminar.

### 2.2 Radar — lo fuerte y los huecos

**Fuerte (no re-hacer):** la vista metabólica es un instrumento real. El motor
(`metabolismo.py`) es puro y determinista: etapas Fuente→Fragmento→Entidad→
Relación→Producto, `fuga = recibido − procesado` por etapa, `salud` = media de
procesado/potencial sobre etapas con sustrato. Las fugas son accionables (cada
una enlaza a la página que la resuelve, `metabolismo.py:88,94,100`). El riel de
urgencias funde vencimientos, negocio, anomalías Qualia y violaciones de norma
(`metabolismo.py:113-147`). El frontend congela animación con
`prefers-reduced-motion` (`metabolismo.js:22,276`) y relee color por tema.
`test_metabolismo.py` fija la doble corrida. En `rad_day.png`/`rad_noct.png` se
ve limpio y AAA en ambos temas. **Esto queda casi intacto.**

**Huecos confirmados (evidencia):**

- **R1 · "Dos lecturas, una huérfana" — es una decisión, no un bug.**
  `/api/v1/autogenes/radar` (señales crudas, `rutas/autogenes.py:902`) solo lo
  consume `constelacion.js:102` para un **conteo** (`E.senales`). La lista cruda
  (vencimientos/fuentes\_frías/huérfanas/anomalías navegables) nunca se muestra:
  el metabolismo ya la subsume (fuentes\_frías→fuga de extracción, huérfanas→
  fuga de vinculación, vencimientos/anomalías→urgencias). **Decisión:
  `senales` es el proveedor de datos y de la fracción del satélite Radar en la
  constelación; NO se construye una segunda vista.** Se documenta y punto.
- **R2 · El gauge no cumple la gramática de tarjeta.**
  `metabolismo.js:110-114` pinta "54% AVANCE DEL CASO / 11 PENDIENTES": tiene
  cifra+unidad pero **sin benchmark** (¿vs sesión previa?) ni now-what explícito
  en el propio número. `_snapshot_telemetria` ya persiste estado por sesión —
  hay de dónde derivar un delta honesto.
- **R3 · Detalle muerto por defecto.** `metabolismo.js:306` deja el panel de
  detalle en su hint vacío hasta que se toca una fuga; podría abrir la fuga
  mayor por defecto (el estado inicial ya sería útil).

## 3. Fases — priorizadas por impacto/costo

Tamaños: **S** ≈ ½ sesión, **M** ≈ 1, **L** ≈ 1–2. Orden = valor/peso
descendente. Cada fase: verificada en vivo (ambos temas), tests, commit+push.

### F-I1 · La vía de ingesta documento-céntrica — la mejora de mayor valor [L]
**Qué:** reemplazar, SOLO en la página de ingesta, el árbol de ontología
completo por un **mapa de la vía de ingesta**: por artefacto, sus fragmentos y
las entidades que produjo (derivado de `ag_artefactos`/`ag_fragmentos`/
`ag_entidades.evidencia`). Las fuentes frías (sin entidad que las cite) se
marcan con anillo `--danger`; las metabolizadas, vivas. Responde de un vistazo:
"qué traje, qué está frío, qué produjo cada fuente".
**Archivos:** nueva proyección pura `arbol_ingesta(conn, session_id)` en
`autogenes/proyeccion.py` (o módulo nuevo `ingesta_mapa.py`) — read-only,
determinista, reusa el conjunto de citados de `senales`; nueva ruta GET
`/api/v1/autogenes/mapa_ingesta`; `dendro.js` consume la nueva forma (misma
gramática de árbol, sin VINs); `test_mapa_ingesta.py` (doble corrida).
**Aceptación:** el mapa no contiene ningún nodo `vehiculo`/`marca`/`pais`;
cada fuente fría lleva marca de frío; doble corrida idéntica.
**Trade-off:** ~120-180 líneas propias + test a cambio de que la página deje de
duplicar el grafo. **Riesgo:** re-inventar `arbol_ontologia` — mitigación:
compartir el patrón de árbol y el saneo, no copiarlo.

### F-I2 · Contraste AAA del mapa en Daylight [S]
**Qué:** subir aristas/etiquetas/nodos-marco del dendro a tokens que pasen AAA
en ambos temas (magenta solo vía `--danger`). **Archivos:** `dendro.js:24-33`
(paleta), `static/styles.css` si falta un token de arista legible en claro;
`ing_day.png` re-capturado. **Aceptación:** contraste AAA medido en Daylight
sobre etiquetas y aristas. **Riesgo:** ninguno material.

### F-I3 · La bandeja distingue frío, ordena y filtra [S]
**Qué:** marcar visualmente la fuente fría (0 entidades / no citada), ordenar
"frías primero", filtro "solo frías". Reusa `fuentes_frias`.
**Archivos:** `ingesta.py:212` (marcar `fria`), `ingesta.js:43-70`, tokens CSS.
**Aceptación:** una fría se ve distinta y se puede aislar. **Riesgo:** ruido
visual — mitigación: un solo signo tokenizado, sin color nuevo.

### F-I4 · Cero pantalla muerta en Ingesta [S]
**Qué:** el panel "Revisa e Integra" en estado inicial muestra un resumen de
ingesta (fuentes, frías, última integración) en vez de un hint solitario.
**Archivos:** `autogenes_ingesta.html:56-68`, `ingesta.js`.
**Aceptación:** ningún panel vacío al cargar. **Riesgo:** competir con el mapa —
mitigación: resumen textual compacto, no otro lienzo.

### F-I5 · Redibujo una sola vez por lote [S]
**Qué:** en el bucle secuencial, refrescar bandeja+mapa una vez al terminar el
lote (no por archivo). **Archivos:** `ingesta.js:97-114`.
**Aceptación:** un ZIP de N archivos reconstruye el mapa 1 vez, no N.
**Riesgo:** perder feedback intermedio — mitigación: el aviso textual de
progreso ya existe (`ingesta.js:105`); solo se difiere el redibujo pesado.

### F-R1 · Benchmark honesto en el gauge del radar [S]
**Qué:** añadir "▲/▼ N pts vs sesión previa" al gauge, derivado de los snapshots
de telemetría; si no hay sesión previa, se declara "sin base previa" (no se
inventa). **Archivos:** `metabolismo.py` (leer snapshot previo, puro),
`metabolismo.js:87-115`, test de doble corrida.
**Aceptación:** el delta es derivable y citable; sin previa, lo dice.
**Trade-off:** cumple la gramática de tarjeta sin snake oil. **Riesgo:** acoplar
al formato del snapshot — mitigación: leer solo el campo de avance.

### F-R2 · Detalle del radar útil por defecto [S]
**Qué:** abrir la fuga mayor en el panel de detalle al cargar (en vez del hint
vacío). **Archivos:** `metabolismo.js:304-330,353-369`.
**Aceptación:** el panel dice algo accionable sin un clic. **Riesgo:** ninguno.

## 4. Qué NO hacer (descartes honestos)

- **No una segunda vista de "señales crudas".** El metabolismo ya subsume los
  datos; una página aparte sería duplicación pura (R1).
- **No re-construir la vista metabólica.** Es un instrumento funcional; tocarla
  más allá del pulido F-R1/F-R2 es riesgo sin retorno.
- **No GIS ni mapa geográfico en Ingesta.** La vía es un árbol de procedencia,
  no un mapa de coordenadas.
- **No montos ni "confianza de extracción" inventados.** El único juicio de
  acuerdo es el quórum medido (dos modelos coinciden o no); nada más.
- **No tocar el pipelegado ni escribir `ag_*` fuera de `Sustrato`.**

## 5. Gramática de tarjeta (obligatoria para todo panel numérico)

Todo número mostrado en Ingesta o Radar cumple:
**cifra + unidad + periodo + benchmark → so-what → now-what derivado → fuente.**
Ejemplo (gauge tras F-R1): "54% avance del caso · sesión 07/2026 · ▼6 pts vs
06/2026 → 11 elementos sin metabolizar → toca la fuga mayor para resolver ·
derivado de ag\_\* de la sesión". Un número sin unidad/periodo/fuente es un bug,
no un adorno.

## 6. Orden de ejecución y gate

Orden por valor/peso: **F-I1 → F-I2 → F-I3 → F-I4 → F-I5 → F-R1 → F-R2.**
Gate por fase (de CLAUDE.md): `ruff check .` limpio · `npx eslint static` 0
errores · pytest verde (doble corrida en métricas nuevas) · captura AAA en
Nocturne y Daylight · commit convencional + push. Sin PR salvo que Julio lo pida.
