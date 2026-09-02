# Diagnóstico v02 — escala, revisión de la ejecución y espacio del grafo

> **v2 · 2026-09-02 · Autor: Fable 5.1 (análisis; cero código).** Sucede a
> `DIAGNOSTICO_FABLE_v01.md` (23 hallazgos, 21 cerrados por Opus 5).
> Ejecutor previsto: **Opus 5**, por olas.
> Árbol analizado: `claude/gnosis-hardening-debugging-ip8iwg` @ `1a89071` (593 verdes, CI verde).
> **Método:** lo que se afirma sobre coste se **midió** en este contenedor con un
> banco de pruebas desechable (§7 lo reproduce); lo que no se pudo medir aquí
> (OCR, PDFs reales) se marca como *no medido* y se razona con aritmética
> declarada. Cada cita `archivo:línea` es verificable.

---

## 0. Resumen ejecutivo

Tres preguntas, tres respuestas cortas:

**¿Aguanta miles de documentos?** La ingesta **sí**, y mejor de lo que el v01
suponía: hay un camino por lotes con staging en disco, tandas acotadas por
tiempo, OCR por páginas y dedupe por contenido (`autogenes/lotes.py`), y el
banco mide **~2 200 documentos/segundo, plano hasta 8 000**. Lo que **no**
aguanta es lo que viene *después* de ingerir:

| Camino | Medido | Veredicto |
|---|---|---|
| Ingesta (`ingestar_texto`, 2-3 fragmentos/doc) | 0,40-0,52 s por cada 1 000 docs, sin crecimiento | ✅ lineal |
| **Resolución de entidad** (`upsert_entidad`) | 4,8 s → 13,5 → 22,2 → **31,3 s** por cada 1 000 a medida que E crece de 0 a 4 000 | ❌ **cuadrática** |
| Proyección del grafo (`construir_grafo`) a 8 000 docs | **20 001 nodos** (16 000 son artefactos+fragmentos), 1,16 s, **sin caché**, en cada lente/snapshot/tool | ⚠️ lineal, pagado en todas partes |
| Enmascarado por conjunto (ola 1 de Opus) a 15 000 identificadores | `enmascarar_troceado` **2,33 s por llamada de tool** | ❌ regresión a escala |
| `synchronous=FULL` → `NORMAL` | 0,46 s → 0,23 s por 1 000 docs | 2× disponible |

**¿Qué dejó la ejecución de Opus?** Cerró 21 de 23 con pruebas rojas primero
y corrigió dos afirmaciones mías. Introdujo **una regresión de escala** (el
enmascarado, arriba) que sus pruebas —con dos identificadores— no podían ver,
y dos puntos que hay que declarar (§2).

**¿Hay espacio para elevar el grafo?** Mucho, y está bien delimitado. Hoy
AUTOGENES es **doce grafos mensuales** con resolución de entidad por nombre
exacto, relaciones con tipo libre, procedencia a nivel de página y sin
búsqueda de texto. Lo que lo convierte en *un* grafo de conocimiento está en
§4: identidad entre sesiones, vocabulario de predicados, procedencia a nivel
de span, confianza derivada (no afirmada) y FTS5 — todo local, determinista
y sin red, como mandan las leyes.

Plan: **9 olas** (§5). La primera es la resolución de entidad: es el único
hallazgo que convierte "miles de documentos" en horas de espera.

---

## 1. Escala — miles de documentos

### Lo que ya está bien (y no hay que tocar)

- **Lotes por goteo** (`autogenes/lotes.py`): ZIP → staging en disco por
  streaming → manifiesto atómico → tandas de ≤ 4 s / ≤ 300 archivos → un
  solo snapshot al cerrar. Reanudable por dedupe de contenido. Tope de 50 000
  entradas y 2 GB descomprimidos. Es un diseño correcto.
- **OCR acotado** (`ingesta.py:76-127`): por tandas de 8 páginas, tope de
  300, truncación **declarada** en el resultado. Alguien ya pagó la bomba de
  RAM y lo escribió.
- **Escrituras atómicas** por documento (`with s.atomico()`), dos filas de
  bitácora por documento (no por fragmento).
- **Cliente secuencial** (`ingesta.js:262-305`): un archivo a la vez, cancelable,
  `lote=1` para diferir el snapshot.

**Corrección a mi v01:** el dedupe por hash (`artefacto_por_hash`,
`ingesta.py:26`) no tiene índice y yo esperaba coste cuadrático. **Medido:
0,47 s con índice vs 0,46 s sin él a 6 000 artefactos.** No es un hallazgo.

### S1 · La resolución de entidad es cuadrática — el único bloqueo real

**Dónde.** `autogenes/sustrato.py:356-395` (`upsert_entidad`) y `:295-299`
(`_entidades`).

**Qué.** Cada `upsert_entidad` ejecuta `SELECT * FROM ag_entidades WHERE
session_id = ?`, construye un `Entidad` pydantic **por cada fila**, y busca
en Python el nombre normalizado o un alias. Es O(E) por llamada, con una
constante alta (pydantic por fila).

**Medido.** Insertando entidades nuevas de una en una:

| Tramo | Tiempo por 1 000 | Por llamada |
|---|---|---|
| E: 0 → 1 000 | 4,8 s | ~5 ms |
| E: 1 000 → 2 000 | 13,5 s | ~13 ms |
| E: 2 000 → 3 000 | 22,2 s | ~22 ms |
| E: 3 000 → 4 000 | 31,3 s | ~31 ms |

Crecimiento lineal por llamada ⇒ **cuadrático en total**. Aritmética
declarada: 5 000 documentos × ~30 entidades por propuesta ≈ 150 000 upserts
a un coste medio de ~100 ms (E ≈ 15 000) ≈ **4 horas** de solo escanear
entidades, sin contar el LLM ni al operador.

**Además es no determinista en el empate.** `_entidades()` no lleva
`ORDER BY`; si dos entidades comparten un alias, cuál gana depende del orden
físico de filas. Con índice único desaparece.

**Fix que disloca.** El índice `idx_ag_entidades_nombre (session_id, nombre)`
ya existe y no se usa porque la comparación es sobre `_norm(nombre)` y sobre
alias serializados en JSON. Hacer la resolución **en SQL**:
1. Columna `nombre_norm` (rellenada por migración) + tabla
   `ag_entidad_alias (session_id, alias_norm, entidad_id)` con índice único
   `(session_id, alias_norm)`. Cada nombre y cada alias es una fila.
2. `upsert_entidad` → `SELECT entidad_id FROM ag_entidad_alias WHERE
   session_id = ? AND alias_norm = ?` — O(log E), y el UNIQUE hace el empate
   imposible por construcción.
3. `editar_entidad` mantiene la tabla; `_integrar_lote` ya precarga
   `por_nombre` en memoria para el lote — se conserva.
4. Todo por `Sustrato`, con bitácora; migración idempotente que rellena desde
   `nombre` y `alias`.

**Prueba.** `tests/test_escala.py` (marcada `slow`): 20 000 entidades
sembradas, el upsert 20 001 < 5 ms; y **ratio**, no valor absoluto —
`t(2N)/t(N) < 2` — para que no sea flaky en CI. Doble corrida idéntica con
dos entidades que comparten alias.

**Estructural → ADR** (nueva tabla).

### S2 · La proyección materializa cada fragmento como nodo y nadie la cachea

**Dónde.** `autogenes/proyeccion.py:215-320` (`construir_grafo`);
`autogenes/qualia.py:41-60` (`red_de_sesion`: construye TODO y luego filtra
`FONTANERIA_DOCUMENTAL`); llamadores sin caché: `qualia.py:53`, `:90`,
`red.py:72`, `rutas/autogenes.py:1672`. `grep _cache autogenes/proyeccion.py`:
vacío.

**Medido a 8 000 documentos:** 20 001 nodos, de los que **16 000 son
artefactos y fragmentos**; 1,16 s por construcción; `red_de_sesion` en lente
negocio 0,98 s (paga la fontanería y la tira); `registrar_snapshot` 1,06 s.
Lineal ⇒ a 50 000 documentos ≈ 7 s **por cada** lente, snapshot, tool de
chat que toque el grafo (`resumen_grafo`, `vecindario`, `conciliacion`…),
`metabolismo`, `chord`. La única caché es la de la lente NetworkX (`red.py`),
que sí usa `version_de_sesion` (1,4 ms — barata, está bien hecha).

**Fix.**
1. `construir_grafo(..., incluir_documental=False)` que **no ejecute** las
   consultas de artefactos/fragmentos cuando la lente es negocio (hoy las
   ejecuta y filtra).
2. Caché de la proyección por `version_de_sesion` en proceso, con el mismo
   patrón que `red._cache`.
3. Para la lente completa, tope de nodos documentales con **rollup declarado**
   (`+N más`), el patrón que `arbol_ontologia` ya usa (`MAX_HOJAS_POR_RAMA`).

**Prueba.** Proyección negocio a 20 000 docs < 200 ms; segunda llamada sin
mutación < 5 ms (caché); el rollup declara el resto.

### S3 · El lienzo recibe los documentos sin tope

**Dónde.** `rutas/autogenes.py:1665-1672` (`/api/v1/autogenes/grafo`, solo
`limite_vehiculos`); `static/grafo.js:2390` (por defecto 150 vehículos —
bien) pero **ningún límite de documentos**; `grafo.js:542` (`sim.correr(10)`
para > 400 nodos).

**Escenario.** 5 000 PDFs de 3 páginas → 20 000 nodos documentales en el JSON
y en la simulación de fuerzas del navegador. No se midió en navegador; la
aritmética basta: el payload son megabytes y la simulación es O(n²) por paso.

**Fix.** `limite_documentos` en el servidor (por defecto: los 200 artefactos
más citados + nodo agregado `+N más`), mismo contrato honesto que S2.3.

### S4 · `synchronous=FULL`: el 2× que está gratis

`database/__init__.py:25-28` no fija `synchronous`. En WAL, `NORMAL` es
durable ante caída del proceso (solo una caída de energía puede perder las
últimas transacciones) y **medido** dobla la ingesta (0,46 → 0,23 s / 1 000).
Dado el carácter forense de la bitácora, es una decisión del operador; si se
adopta, va como PRAGMA por conexión con el porqué escrito.

### S5 · El techo real es el OCR, y es de un solo hilo — *no medido*

`ingesta.py:76-127`: Tesseract página a página, en el hilo del request. Una
tanda de 4 s se corta **entre** archivos (`lotes.py:167`), no dentro de uno:
un escaneo de 300 páginas es un solo request de minutos (bajo el timeout de
1 800 s de gunicorn, pero ocupa un worker de los dos). No hay Tesseract en
este contenedor, así que no se midió; con 1-3 s/página típicos, 2 000
facturas escaneadas de 3 páginas ≈ **2-5 horas secuenciales**.

**Fix.** (1) OCR de cada tanda de 8 páginas en un `multiprocessing.Pool`
(Tesseract es un proceso externo: paraleliza sin GIL) — N× con N núcleos;
(2) progreso por página en el manifiesto; (3) prueba con un PDF escaneado
sintético marcada `skipif` sin Tesseract, como ya hace `test_ingesta_ocr`.

### S6 · La extracción lee 24 fragmentos y no lo dice

**Dónde.** `autogenes/extraccion.py:23` (`MAX_FRAGMENTOS = 24`), `:122-128`
(`_bloque_fragmentos` corta a `[:MAX_FRAGMENTOS]`), `:139-215`
(`extraer_de_artefacto`: el resultado **no lleva** `aviso` ni `cobertura`).

**Escenario.** Un contrato de 60 páginas se extrae de sus primeras 24 y la
propuesta llega como si cubriera el documento. Es exactamente lo que ZERO
SNAKE OIL prohíbe — y contrasta con el OCR, que sí declara su truncación.

**Y la escala operativa.** La extracción es HITL por documento (`/extraer` →
revisar → `/integrar`), 1-2 llamadas LLM por documento. A miles de
documentos el cuello no es la máquina: es el operador revisando una propuesta
por documento. Esto es una decisión de producto (§6), no un bug.

**Fix.** (1) `cobertura: {fragmentos_leidos, fragmentos_total}` en el
resultado, y `aviso` cuando hay recorte — inmediato y barato; (2) extracción
por **ventanas** de 24 con solape, fusionadas por `_integrar_lote` (que ya
deduplica por nombre); (3) un modo por lotes con política de integración
bajo el *dimmer* de autonomía — el patrón `proponer_plan` de KARELEN — es
decisión del operador.

### Lo que se midió y NO es problema

`listar_artefactos` 0,04 s a 8 000; `version_de_sesion` 1,4 ms;
`resumen_red` 0,01 s y `persistencia_h0` 0,00 s a 4 000 nodos;
`embedding_espectral` 0,46 s (y solo bajo demanda, `rutas/autogenes.py:1256`);
16 000 filas de bitácora y 14 MB en disco a 8 000 docs. El join de CONCILIA
con `SUBSTR(factura)` que el v01 pedía medir se resuelve por `chasis`
indexado en ambos lados y el `SUBSTR` solo filtra después — no es un
producto cartesiano.

---

## 2. Revisión de la ejecución de Opus 5

Cerró 21 de 23 con la disciplina pedida (prueba roja primero, ADR por cambio
estructural, corrección del registro cuando midió algo distinto a lo que yo
afirmé — H5, H15). Lo que queda:

### R1 · `enmascarar_troceado` compila una regex por identificador en cada llamada — **alta**

**Dónde.** `jarvis/identidades.py` (`enmascarar_troceado`): `re.compile` por
identificador, `.sub` sobre el texto entero, en cada llamada. Se invoca por
**cada resultado de tool** (`tool_executor.py:110-111`) y por **cada mensaje
del operador** (`chat_handler.py:123-126`).

**Medido** sobre 12 KB de texto:

| Identificadores | `enmascarar_texto` | `enmascarar_troceado` |
|---|---|---|
| 150 | 0,00 s | 0,03 s |
| 1 500 | 0,01 s | 0,23 s |
| 15 000 | 0,16 s | **2,33 s** |

Una sesión con 10 000 vehículos tiene ~15 000 identificadores. Un turno con
dos tools ≈ 3 × 2,3 s ≈ **7 s de regex** antes de hablar con el proveedor.
Las pruebas de la ola 1 usaban dos identificadores: correctas, y ciegas a esto.

**Fix (algorítmico, no de caché).** Normalizar el **texto** una vez —
quitar separadores conservando un mapa de índices— y buscar por **ventanas de
las longitudes que existen** (VIN = 17, factura ≈ 12, pedimento = 15 sin
espacios) contra el conjunto en un `set` → coste O(len(texto) × nº de
longitudes distintas), **independiente de cuántos identificadores haya**.
Cubre el troceado, las variantes de mayúsculas y el hex (buscando también la
forma hex de cada ventana). `enmascarar_texto` puede quedarse.

**Prueba.** 15 000 ids sobre 12 KB en < 50 ms; el corpus de evasión de
`test_frontera_llm.py` intacto.

### R2 · Los identificadores se cargan tres veces por turno — media

`chat_handler._precargar_tokens` y `_enmascarar` llaman ambos a
`_identificadores()` (seis `SELECT DISTINCT`), y `ToolExecutor._ids_de_sesion`
los carga otra vez (esa sí cacheada). Cargar una vez por turno y compartir.
Barato; entra con R1.

### R3 · La historia reconstruida pierde los resultados de tool — media, declarar

`chat_handler._historia` (`:81-105`) reenvía solo los turnos `user`/`assistant`
de texto; los bloques `tool_use`/`tool_result` intermedios no se persisten.
Consecuencia: el modelo no "recuerda" una cifra que obtuvo por tool salvo que
la haya dicho. Es una decisión razonable de ventana — pero ADR-0012 no la
declara. Añadir la frase.

### R4 · `create_session` reutiliza sesión vacía del mismo mes — *verificar* contra `/procesar/historico`

El fix de H17 (`database/persistence.py:19-52`) es correcto para el caso
medido. Falta verificar que `procesar_historico` (`app.py`) no dependa de
crear sesiones mensuales frescas aunque exista una vacía; si lo hace, pasar
`reutilizar_vacia=False` ahí. Diez minutos con el código; no se leyó.

### R5 · Lo que Opus dejó abierto y sigue abierto

H13/H14 (frontend: carreras de fetch y `esc()` ×19) — su razón para no
tocarlo a ciegas es buena. El camino es levantar la app con Playwright
(Chromium ya está en el contenedor) y **primero** escribir la prueba de
carrera que hoy no existe. Sigue siendo ola propia (§5, ola 9).

### R6 · Falso positivo mío que Opus detectó, y otro que no

H15 (reduced-motion) era falso positivo y lo demostró. **H16 (respaldo):
tampoco pudo reproducir la pérdida** y lo dijo; el cambio a la API en línea
sigue siendo correcto porque elimina la dependencia del checkpoint. Lo
registro aquí para que el v01 no se lea como si todo hubiera sido cierto.

---

## 3. Defectos y mejoras nuevas (fuera de escala)

### D1 · `ag_eventos.entidades` liga por NOMBRE en JSON y se busca con `LIKE` — media

`database/models_autogenes.py:82-95`; `autogenes/consultas.py:187-202`
(`entidades LIKE '%"nombre"%'`). Herencia del hallazgo D1 de `AUDITORIA.md`.
Renombrar una entidad desliga sus eventos; un nombre que contiene a otro
casa de más. **Fix:** tabla `ag_evento_entidad (evento_id, entidad_id)` por
id, migración que resuelve nombres una vez, y el `LIKE` desaparece. Entra
con G3.

### D2 · `nombre LIKE ?` con comodín inicial en entidades — baja

`consultas.py:148`: el índice `(session_id, nombre)` no sirve con `%…%`. A
20 000 entidades es un escaneo de milisegundos; se resuelve con G6 (FTS5).

### D3 · Sin comprobación de disco libre antes de expandir un lote — baja

`lotes.py:117-140`: el tope es 2 GB descomprimidos, sin mirar cuánto queda
en el volumen `gnosis_uploads`. Un `shutil.disk_usage` antes de expandir, con
mensaje honesto. Cinco líneas.

### D4 · El id de modelo de reserva sigue siendo el de la generación anterior — pendiente del operador

`jarvis/llm_interface.py` (`MODELO_DE_RESERVA`). Opus lo hizo configurable por
entorno y dejó el valor. Es tuyo.

---

## 4. El grafo de conocimiento — dónde está y hasta dónde puede llegar

Lo que hay es sólido y raro de ver: procedencia obligatoria, puerta única,
bitácora sellada, proyección determinista, topología propia (comunidades,
articulación, espectral, H0), telemetría OODA, reglas con P&L, expediente de
defensa con sello re-derivable, exportación JSON. Sobre eso, los límites que
convierten un *grafo de evidencia mensual* en un *grafo de conocimiento*:

### G1 · La identidad de una entidad muere en su sesión — **alta**

**Evidencia.** `ag_entidades(session_id, …)` (`models_autogenes.py:42-62`):
cada mes es un espacio de nombres. `upsert_entidad` resuelve por
`_norm(nombre)` = `strip().lower()` (`sustrato.py:57`) y alias exactos.
`analisis_vw.py` compara entre sesiones **marcas, países y aduanas** del
dato aduanal — no entidades extraídas. No hay similitud, ni bloqueo, ni
identidad canónica.

**Consecuencia.** "Volkswagen de México S.A. de C.V.", "VW MEXICO" y
"Volkswagen Mexico" son tres nodos; y el mismo proveedor en doce meses son
doce nodos sin arista entre ellos. Un grafo que no sabe que dos cosas son la
misma no es de conocimiento; es un índice.

**Uplift (local, determinista, HITL).**
1. **Canonicalización**: plegado Unicode, minúsculas, retirada de sufijos
   legales de un catálogo (`S.A.`, `de C.V.`, `S. de R.L.`…), tokens
   ordenados → `nombre_canon`. Determinista y citable.
2. **Bloqueo + similitud** (trigramas / Jaccard sobre tokens, umbral
   declarado) que **propone** fusiones al operador; nunca fusiona sola una
   entidad `operador` (ley aditiva de ADR-0004). Las fusiones van por
   `Sustrato` con bitácora y son reversibles (se conserva el alias).
3. **Identidad entre sesiones**: tabla `ag_identidades (id_canon, …)` y
   columna `identidad_id` en `ag_entidades`, resuelta por `nombre_canon` al
   integrar. Con eso, "todo lo que sabemos de este proveedor" cruza los meses
   y CONCILIA/NOMOS pueden razonar por proveedor y no por fila.
   **Estructural → ADR.**

### G2 · Las relaciones no tienen vocabulario — **alta**

**Evidencia.** `tipos.py:78` (`Relacion.tipo: str`), `:132`
(`PropuestaRelacion.tipo: str`); el prompt de extracción pide "relaciones
tipadas" sin lista (`extraccion.py:30-38`); las entidades **sí** llevan
`CHECK (tipo IN (…))`. `grep TIPOS_RELACION`: vacío.

**Consecuencia.** "importa por", "importa vía", "importa a través de" son
tres predicados. No se puede preguntar "todos los proveedores de X" ni
escribir una regla sobre el grafo (G8).

**Uplift.** Vocabulario cerrado del dominio (`emite_factura`, `importa_por`,
`ampara` (pedimento→vehículo), `transporta`, `representa`, `audita`,
`pertenece_a`, `ubicado_en`, `vigente_en`…) + tabla de mapeo de lo que dice
el modelo al predicado, con `otro` que **conserva** `tipo_crudo`. El
sandbox y las tools lo exponen. **Estructural → ADR.**

### G3 · Sin validez temporal en las relaciones; eventos ligados por nombre — media

**Evidencia.** `ag_relaciones` (`migrations.py:39-57`) no tiene
`valido_desde/hasta`; `ag_eventos.entidades` es JSON de nombres (D1).
`cronos._red_en` (`cronos.py:80-120`) reconstruye por `created_at` — "aditiva",
declarado.

**Uplift.** `valido_desde`/`valido_hasta` opcionales en relaciones, tabla
`ag_evento_entidad` por id (D1). Con eso, "¿quién era el agente aduanal en
julio?" es una consulta, no una lectura.

### G4 · La procedencia es de página, no de span — media

**Evidencia.** `Fragmento` = texto por página/bloque (`tipos.py:51-56`);
`evidencia` = lista de ids de fragmento. Una cita señala una página de 12 000
caracteres.

**Uplift.** `evidencia` como `{fragmento_id, inicio, fin}` (compatible: el id
suelto sigue valiendo), el prompt pide la **cita textual**, y el saneador
**verifica que el span exista en el fragmento** — anti-fabricación que
endurece la ley de procedencia, y permite resaltar en pantalla y en el
expediente. `sanear_propuesta` (`extraccion.py:64-88`) es el sitio.

### G5 · La confianza la afirma el modelo — media

**Evidencia.** `peso` = 0,5 por defecto, lo que diga el LLM
(`tipos.py:79,133`); `informe.py:367` cuenta artefactos, no fuentes
independientes por afirmación.

**Uplift.** Confianza **derivada** en tiempo de lectura: nº de artefactos
distintos que citan la relación, acuerdo de quórum, `origen`; mostrada con su
derivación. Es lo que ZERO SNAKE OIL pide de un número: que sea citable a
algo. `peso` del modelo se conserva como `peso_declarado`.

### G6 · No hay búsqueda de texto — media, y barata

**Evidencia.** `grep 'MATCH\|fts'` en `autogenes/`: nada. Entidades por
`LIKE` (D2); fragmentos no se buscan salvo a través de entidades.

**Uplift.** **FTS5** — viene dentro de SQLite, cero dependencias, local —
sobre `ag_fragmentos.texto` como tabla de contenido externo mantenida por
triggers; `bm25` con parámetros fijos es determinista. Da (a) "documentos que
mencionan X" al operador y (b) una tool `buscar_fragmentos` al modelo por el
sandbox (allowlist). Es el uplift con mejor relación valor/coste de esta lista.

### G7 · La bitácora registra prosa, no eventos — media

**Evidencia.** `_registrar(accion, detalle)` con `detalle` libre
("Entidad X (synesis)"); `cronos` reconstruye solo por `created_at`.

**Uplift.** `detalle` como JSON estructurado `{op, tabla, id, antes, después}`
(la cadena de sellos lo cubre igual). Convierte la bitácora WORM en un
**event log**: reconstrucción exacta en T, diff entre dos momentos, y
auditoría que responde "qué cambió" en vez de "cuántas cosas había".

### G8 · Las reglas viven sobre filas, no sobre el grafo — media

**Evidencia.** `sustrato.crear_regla` (`:616-640`) admite condiciones sobre
`{pais_code, j_y_n, auto_code, factura, chasis}`; `nomos.py:37-54` las evalúa
por fila. NOMOS es un motor de reglas aduanal excelente; no ve el grafo.

**Uplift.** Condiciones de **patrón** (`tipo de entidad` + `predicado` +
umbral: "proveedor con > N facturas sin pedimento que las ampare") evaluadas
determinísticamente sobre la proyección; el disparo es un hallazgo con citas.
Depende de G2.

### G9 · Se exporta, no se importa — baja

`rutas/autogenes.py:952` (`/exportar`, JSON re-importable "auditable fuera de
GNOSIS"); no hay `/importar`. Con `Sustrato` como única puerta, un importador
que respete procedencia es corto, y es la pieza que hace posible fusionar
sesiones (G1) y restaurar un caso desde el bundle.

---

## 5. Plan por olas para Opus 5

Reglas de siempre: prueba roja primero; ADR en el mismo commit cuando es
estructural; vista de `docs/architecture/` en el mismo diff si cambia una
caja. Las pruebas de rendimiento afirman **ratios**, no segundos (CI no es un
banco de pruebas).

| Ola | Ítems | Tamaño | Por qué en este orden |
|---|---|---|---|
| **1 · Resolución de entidad** | S1 (+ empate determinista). ADR. | **L** | Único hallazgo que convierte miles de docs en horas. Todo lo demás del grafo (G1, G2) se apoya en esta tabla. |
| **2 · Enmascarado a escala** | R1, R2, R3 (declarar). | **M** | Regresión introducida; se cierra antes de que llegue una sesión grande. |
| **3 · Proyección** | S2, S3. | **M** | Lo paga cada lente, snapshot y tool. |
| **4 · Extracción honesta** | S6.1-2 (cobertura declarada, ventanas). S6.3 es decisión del operador. | **M** | Zero snake oil. |
| **5 · FTS5** | G6, D2. | **M** | Mejor valor/coste del grafo; habilita la tool de búsqueda. |
| **6 · Vocabulario + span + confianza** | G2, G4, G5. ADR. | **L** | Los tres tocan `extraccion.py` y `tipos.py`: un solo cambio de contrato. |
| **7 · Identidad entre sesiones** | G1, G9. ADR. | **L** | Depende de la ola 1 y de la 6. Es el salto de "doce grafos" a "un grafo". |
| **8 · Tiempo y reglas** | G3, D1, G7, G8. | **L** | Depende de G2. |
| **9 · Frontend con navegador** | R5 (H13/H14), primero la prueba Playwright de carrera. | **M** | El camino que Opus dejó descrito. |
| **Remates** | S4 (si el operador lo aprueba), S5 (OCR paralelo; prueba `skipif`), D3, R4 (verificar). | **S-M** | — |

**Auditoría de fin de campaña.** Repetir el banco de §7 al cerrar la ola 3 y
al cerrar la 7; las filas que deben cambiar en
`docs/architecture/auditoria-backend.md`: *EXPLAIN en consultas calientes*
(hoy ❌) pasa a ✅ con los planes de S1/S2 registrados.

---

## 6. Decisiones que son del operador, no del ejecutor

- **HITL por documento a miles de documentos** (S6.3): mantener la revisión
  humana por documento, o abrir un modo por lotes con integración automática
  bajo el dimmer de autonomía. Es una ley, no un ajuste.
- **`synchronous=NORMAL`** (S4): 2× de ingesta a cambio de que una caída de
  *energía* (no de proceso) pueda perder las últimas transacciones.
- **Vocabulario de predicados** (G2): la lista la define quien conoce el
  dominio aduanal. El ejecutor puede proponer la semilla; no decidirla.
- **Umbral de fusión de entidades** (G1): qué similitud propone una fusión.
- **Modelo de reserva de Anthropic** (D4), **PyPDF2**, **llave DeepSeek**,
  **`backup_proton.py`**: siguen donde estaban.

---

## 7. Cómo reproducir las mediciones

Banco desechable, sin tocar el repo (base en `tempfile`, `database.DB_PATH`
reasignado). En este contenedor (Python 3.11, SQLite en WAL):

```
A · 8 000 docs por ingestar_texto        → 0,40-0,52 s / 1 000, plano
A2 · mismo tramo con índice (session,hash) → 0,47 s (sin ganancia: no era el cuello)
A3 · mismo tramo con synchronous=NORMAL  → 0,23 s (2×)
B · upsert_entidad, E 0→4 000            → 4,8 / 13,5 / 22,2 / 31,3 s por 1 000
C · listar_artefactos a 8 000            → 0,04 s
D · construir_grafo a 8 000 docs         → 20 001 nodos (8 000 artefacto, 8 000 fragmento, 4 000 entidad), 1,16 s
    red_de_sesion negocio                → 4 001 nodos, 0,98 s
    resumen_red / espectral / H0         → 0,01 / 0,46 / 0,00 s
    registrar_snapshot                   → 1,06 s
    version_de_sesion                    → 1,4 ms
E · enmascarado, 12 KB de texto          → 150 / 1 500 / 15 000 ids:
    enmascarar_texto                     → 0,00 / 0,01 / 0,16 s
    enmascarar_troceado                  → 0,03 / 0,23 / 2,33 s
```

El script es el bloque `python3 - <<'PY'` de la sesión que produjo este
documento; Opus debe convertirlo en `tests/test_escala.py` (marcado `slow`,
afirmando ratios) como primera tarea de la ola 1, para que estas cifras no
vuelvan a ser una lectura de una tarde sino una compuerta.
