# PLAN — Vínculos y Síntesis por encima de Palantir (ejecución: Opus 4.8)

> v1 · 2026-07-14 · Autor: auditoría de código en rama
> `claude/gnosis-autogenes-i-85bwsd`. Compañero de `BENCHMARK_PALANTIR.md` y
> `PLAN_SUPRA_PALANTIR.md`; NO los reemplaza — este plan cubre SOLO las dos
> superficies Vínculos (F: `vinculos.js`+`caminos.py`+`analisis_vw.py`) y
> Síntesis (F6: `sintesis.js`+`informe.py`), a profundidad de implementación.
>
> **Método:** cada afirmación sobre el estado actual es verificable
> `archivo:línea` en este repo. La columna Palantir se basa en capacidades
> públicamente documentadas de Gotham/Foundry (corte enero 2026); donde la
> comparación es dudosa, se declara.

---

## 0. Veredicto honesto del estado actual

### Vínculos hoy — visor excelente, flujo de investigación incompleto

Lo que YA supera a Palantir (no tocar, no regresionar):
- **Tarjetas de negocio medidas** (`analisis_vw.py`): HHI, corte crítico
  (max-flow/min-cut), redundancia, brecha J/N, rutas ausentes, deriva entre
  sesiones — con gramática cifra→so-what→now-what→fuente y cero estimación.
  En Foundry esto es un proyecto de implementación; aquí es el producto.
- **Camino citado y dockeable** (`caminos.py:61-101`): cada salto con su
  arista tipada y sus citas; recomputado en servidor, jamás dictado por el
  cliente.

Lo que está POR DEBAJO de Gotham (el gap a cerrar):
1. **Un solo camino, sin alternativas.** `camino_mas_corto` devuelve UNA ruta.
   Gotham muestra rutas alternativas y deja restringir ("pasando por X",
   "evitando Y"). Sin alternativas, el operador no sabe si el camino que ve
   es frágil (único) o robusto (uno de muchos) — y esa es LA pregunta aduanal.
2. **El costo del camino es topológico, no de negocio** (`caminos.py:72-76`:
   1.0 relación / 1.6 estructural). Un camino por 3 unidades pesa igual que
   uno por 700. El grafo de flujo con volumen medido YA existe
   (`analisis_vw.red_flujo`) y no alimenta los caminos.
3. **El lienzo no habla con Vínculos.** `grafo.js` emite un solo evento
   (`grafo:listo`, línea 377). No puedes hacer clic en dos nodos del lienzo
   para trazar — hay que teclear en un datalist. En Gotham, seleccionar dos
   objetos y "find path" es EL gesto central.
4. **Las tarjetas no tocan el lienzo.** "Corte crítico: vigilar DEU→Veracruz"
   es texto; el lienzo al lado no lo resalta. Las vistas vinculadas
   (selección↔detalle) son el corazón del flujo Palantir y aquí no existen
   entre panel y lienzo.
5. **`?marca=` existe en la API** (`rutas/autogenes.py`, api_autogenes_analisis)
   **pero la UI no tiene selector de marca** — el panel queda clavado en la
   marca de mayor volumen.

### Síntesis hoy — la mejor UI de citación del mercado, con un motor que ignora sus propias señales

Lo que YA supera a Palantir:
- **Trazas de cita punto→fragmento en vivo** (`sintesis.js`): ningún vendor
  dibuja la línea física entre la afirmación y su evidencia. Circuito
  inverso (nodo→puntos que lo citan) incluido. AAA, reduced-motion.
- **Saneamiento doble en servidor** (`informe.py:167-183` + re-saneo al
  dockear): el modelo NO puede fabricar procedencia. AIP no promete esto.

Lo que está POR DEBAJO — y es grave:
1. **El digesto ignora los motores.** `construir_digesto` (`informe.py:62-120`)
   envía al modelo entidades/relaciones/eventos/fragmentos… y NADA de lo que
   el sistema ya midió: ni hallazgos monetizados de CONCILIA, ni violaciones
   de VALIDACIÓN, ni reglas NOMOS disparadas, ni anomalías QUALIA, ni el
   análisis de red de `analisis_vw`. **El "informe ejecutivo" es más débil que
   los dashboards del propio sistema.** Un briefing de Foundry sí integra sus
   señales. Este es el defecto #1 de todo el plan.
2. **Muestreo arbitrario y no declarado.** 60 entidades / 18 fragmentos, en
   orden de llegada y round-robin (`informe.py:30-34, 81-92`). En un caso de
   200 entidades el informe ve el 30% — y la UI no dice cuánto quedó fuera.
   Viola el espíritu de zero snake oil: el silencio también es una cifra.
3. **La cita se verifica por EXISTENCIA, no por SUSTENTO.** `sanear_informe`
   poda ids inventados, pero si el modelo escribe "el amparo cubre 90
   unidades" citando un fragmento que dice 60, el punto sobrevive. No hay
   verificación de fidelidad afirmación↔evidencia.
4. **HITL de todo-o-nada.** El operador dockea el informe entero o nada; no
   puede descartar/editar un punto. Palantir briefing es editable; aquí la
   revisión humana prometida (HITL) no tiene grano.
5. **El informe vive solo en la app.** Sin export imprimible con citas. El
   destinatario real (legal, dirección, SAT) nunca entra a /autogenes/sintesis.

### La barra "1% mundial", operacionalizada honestamente

"1% mundial" no es medible directo; lo que SÍ es medible y este plan compra:
(a) cerrar todos los ⬜/🔶 de link-analysis y reporting del benchmark interno
en estas dos superficies; (b) tres propiedades que ningún competidor firma:
**verificación de fidelidad determinista** de cada afirmación contra su
evidencia, **cobertura declarada** del informe (qué % del caso representa y
QUÉ quedó fuera, con lista), y **doble corrida idéntica** en toda métrica
nueva. Con (a)+(b), en el dominio aduanal-automotriz de un caso por sesión,
no hay producto documentado que entregue ese paquete. Eso es lo máximo que se
puede afirmar sin snake oil — y es suficiente.

---

## 1. Workstream V — Vínculos como flujo de investigación

### V1 · Caminos alternativos con costo de negocio — `caminos.py`
**Qué:** extender `camino_mas_corto` a `caminos()` que devuelve hasta K=3
rutas: la más corta topológica (actual, se conserva), la de **mayor volumen
medido** (peso = 1/unidades sobre aristas de flujo cuando existan; declarar
el método en la respuesta), y la mejor **evitando un nodo/arista** que el
operador marque (`?evitar=`). Añadir `?via=` (camino forzado por un nodo:
concatenación de dos shortest paths, declarada como tal).
**Cómo:** todo dentro de `caminos.py` (ley: NetworkX confinado ahí).
`nx.shortest_simple_paths` para las K rutas; cortar en K=3 SIEMPRE (es
generador — no materializar más). El costo de negocio se construye leyendo
volumen desde las filas de flujo (reusar la consulta de `analisis_vw._filas_flujo`
vía import — es lectura pura) SOLO para aristas país→aduana→marca; aristas
sin volumen conservan el costo topológico y la respuesta lo declara
(`"metodo": "volumen medido en N de M saltos"`).
**API:** `GET /api/v1/autogenes/camino` gana `?k=`, `?evitar=`, `?via=` —
retrocompatible (sin params = comportamiento actual EXACTO; los tests
existentes de `test_caminos.py` no se tocan, solo se agregan).
**UI:** el panel "Camino citado" lista las alternativas como pestañas
(1/2/3) con su método y costo declarados; clic alterna el resaltado.
**Gates:** doble corrida idéntica del ranking de rutas; test de que K rutas
son simples y distintas; test `evitar` excluye de verdad; ruff/eslint/pytest.
**Tamaño: M.**

### V2 · Del lienzo a los extremos — `grafo.js` + `vinculos.js`
**Qué:** clic en un nodo del lienzo en /autogenes/vinculos lo fija como
"desde" (primer clic) / "hasta" (segundo), con feedback visual en los inputs;
tercer clic reinicia. Botón "⇄" para invertir extremos.
**Cómo:** `grafo.js` emite `grafo:nodo` (CustomEvent con {id, etiqueta, kind})
en el mismo lugar donde hoy resuelve el clic para el inspector — NO cambiar
la semántica del inspector, solo emitir además. `vinculos.js` escucha y llena.
El evento es aditivo: las demás vistas que montan grafo.js no se ven
afectadas (nadie más lo escucha).
**Gates:** eslint; verificación en vivo con Playwright (clic-clic-trazar);
cero regresión del inspector en /autogenes/grafo.
**Tamaño: S.**

### V3 · Tarjetas → lienzo (vistas vinculadas) + selector de marca — `vinculos.js`
**Qué:** cada tarjeta de negocio con estructura identificable (corte crítico,
brokers, rutas ausentes, concentración de origen) gana un botón "ver en
lienzo" que resalta los nodos/aristas correspondientes vía
`lienzo.grafoAPI.resaltar(...)` (API ya existente, `vinculos.js:98`). El
servidor debe devolver los IDS de nodo del grafo en el payload de
`/api/v1/autogenes/analisis` (hoy devuelve etiquetas de negocio; añadir
`nodo_ids` por tarjeta donde aplique — los ids del grafo de proyección, no
los de la red de flujo interna). Añadir `<select>` de marca (la API ya
acepta `?marca=`); listar marcas desde el propio payload (añadir
`marcas_disponibles` al análisis, derivado de las filas de flujo — medido).
**Honestidad:** si una tarjeta describe estructura que el lienzo no proyecta
(p.ej. una ruta de la red de flujo sin arista equivalente en el grafo de
evidencia), el botón no aparece — jamás resaltar "lo más parecido".
**Gates:** doble corrida del payload extendido; Playwright: clic en "ver en
lienzo" del corte crítico resalta exactamente los nodos declarados.
**Tamaño: M.**

### V4 · El porqué del camino — `caminos.py` + panel
**Qué:** cada camino devuelto gana una lectura comparativa medida:
"alternativa 2 mueve 640 unidades vs 90 de la más corta; comparten 2 de 4
saltos". Fila de comparación en el panel (saltos, citas totales, unidades
donde el método aplique, solape entre rutas).
**Cómo:** métricas puras derivadas de las rutas de V1 (conteos y sumas — sin
NetworkX nuevo). El solape es |aristas∩|/|aristas∪| declarado como Jaccard.
**Gates:** doble corrida; unidades solo donde hay volumen medido (jamás
inventar para aristas sin flujo).
**Tamaño: S** (depende de V1).

---

## 2. Workstream S — Síntesis como el mejor informe citado del mercado

### S1 · Digesto 2.0: los motores entran al informe — `informe.py` + módulo nuevo `autogenes/hechos.py`
**Qué:** el defecto #1. Crear `hechos_medidos(conn, session_id) -> list[Hecho]`
en un módulo nuevo puro (`autogenes/hechos.py`): agrega las salidas VIVAS de
los motores existentes como hechos deterministas con su procedencia:
- CONCILIA: hallazgos monetizados (los montos $ SÍ pueden citarse — la ley
  los permite de CONCILIA/NOMOS) con sus referencias.
- VALIDACIÓN: reglas violadas con conteo de filas y regla citada.
- NOMOS: reglas activas disparadas con su P&L medido.
- QUALIA: anomalías contra la base del operador (si hay base fijada).
- `analisis_vw`: corte crítico, HHI en banda alta, brecha J/N, rutas ausentes
  de la marca foco.
Cada `Hecho` = {texto_neutro, cifra+unidad+periodo, fuente (motor + ids de
fila/fragmento/regla), evidencia: [fragment_ids donde exista]}. **Leer los
módulos motor antes de escribir: usar sus funciones públicas, no duplicar
queries.** Si un motor no tiene datos, el hecho no existe (cero relleno).
**Integración al informe:** el digesto gana una sección `hechos_medidos`
(tope ~20, priorizados: monetizados primero, luego por severidad declarada
del motor). El prompt (`PROMPT_SISTEMA`) instruye: los hechos medidos son la
columna vertebral del informe; el modelo los teje y contextualiza pero NO los
altera; cada punto que use un hecho cita `hecho:<id>` además de sus
fragmentos. En el saneo, `hecho:<id>` se resuelve a la procedencia real del
hecho (server-side) — el modelo no puede desanclarlo.
**Muestreo honesto:** entidades priorizadas por grado en la proyección
determinista (NO NetworkX — usar `topologia.py`), fragmentos priorizados por
nº de entidades que los citan (hot primero), y el payload declara cobertura:
`digesto_cubre: {entidades: "60 de 214", fragmentos: "18 de 3020", hechos:
"20 de 31"}` — la UI lo muestra bajo el título del informe.
**Gates:** `hechos.py` puro y determinista con test de doble corrida; test de
que un hecho jamás aparece sin sus ids fuente; test de saneo de `hecho:<id>`
inventado (muere); tests existentes de `test_informe.py` intactos; UI en vivo
con JARVIS_MOCK mostrando hechos tejidos.
**Tamaño: L. Es el corazón del plan — ejecutar PRIMERO.**

### S2 · Verificación de fidelidad afirmación↔evidencia — `informe.py`
**Qué:** pase determinista post-saneo: de cada punto se extraen los tokens
duros (números con o sin separadores, VINs pattern 17-alfanum, fechas, montos)
y se verifica que cada uno exista en (a) el texto de sus fragmentos citados,
(b) el hecho medido citado, o (c) el digesto de entidades/eventos citados.
Punto con tokens no rastreables → `verificado: false` con la lista de tokens
huérfanos. La UI marca esos puntos ("cifra no rastreada a la evidencia") en
`--warn`; NO se eliminan por default (el operador decide en S3) pero un
config `sintesis_estricta` los poda en servidor.
**Por qué determinista y no segundo LLM:** reproducible, testeable, gratis, y
no introduce una segunda opinión opaca. (El quórum sigue reservado a
extracción, como declara `informe.py:19-21` — esa decisión se mantiene.)
**Gates:** suite de casos: número correcto pasa, número alterado falla,
número con formato distinto (1,234 vs 1234) pasa (normalizar), VIN parcial
falla. Doble corrida. Cero falsos "verificado".
**Tamaño: M** (después de S1; verifica también los hechos tejidos).

### S3 · HITL con grano: editar/descartar por punto — `sintesis.js` + `informe.py`
**Qué:** antes de dockear, cada punto gana acciones: descartar (no viaja al
dock) y editar texto (input inline). Al dockear, el servidor re-sanea Y
re-verifica (S2) el texto editado; un punto editado queda marcado
`editado_por_operador: true` en el cuerpo del producto (procedencia del
cambio, consistente con origen=operador del sustrato).
**Gates:** test: punto editado con cifra nueva no rastreable queda
`verificado:false` aunque el operador lo haya escrito (la ley aplica a todos);
punto descartado no aparece en el producto; dockear con todo descartado = 422
honesto.
**Tamaño: M.**

### S4 · Informe imprimible con sello — plantilla + CSS de impresión
**Qué:** botón "imprimir/exportar" en /autogenes/sintesis: hoja de estilos
`@media print` que rinde el informe con sus citas al pie por punto (fuente ·
página · id de fragmento), la línea de cobertura del digesto (S1), los
marcadores de verificación (S2), etiqueta de sesión, y un sello re-derivable:
`sha256(cuerpo_saneado + session_id)` impreso al pie con la leyenda "re-córrelo
y da el mismo hash". Sin librerías nuevas, sin PDF server-side — la impresión
del navegador basta y respeta local-first.
**Gates:** Playwright print-to-pdf visual; el hash es estable entre corridas
(determinismo); AAA en impresión (negro sobre blanco, sin depender de color).
**Tamaño: S.**

### S5 · Lo que el informe NO cubre — `informe.py` + UI
**Qué:** el anti-snake-oil como feature: junto al informe, la lista medida de
lo que quedó fuera — hechos medidos no tejidos por el modelo (ids de S1 no
citados en ningún punto), entidades calientes fuera del digesto, hallazgos
monetizados no mencionados. Cifra dura arriba: "Este informe cubre 14 de 22
hechos medidos". Un clic en un hecho no cubierto lo muestra con su evidencia
(sin regenerar el informe).
**Por qué:** ningún vendor declara la sombra de su propio resumen; para un
auditor, esa declaración ES la credibilidad (línea C2 del plan supra).
**Gates:** conteo exacto por diferencia de conjuntos (determinista, doble
corrida); si el modelo cubrió todo, la sección dice "0 fuera" (no se oculta).
**Tamaño: S.**

---

## 3. Orden de ejecución, dependencias, y qué NO hacer

### Orden recomendado (cada paso shippeable, commit por paso)
```
1. S1  digesto 2.0 + hechos.py     ← el mayor salto de sustancia
2. S2  fidelidad determinista      ← la honestidad que nadie firma
3. V2  lienzo→extremos             ← quick win de flujo (S)
4. V3  tarjetas→lienzo + marca     ← vistas vinculadas
5. V1  caminos alternativos        ← el gap Gotham de fondo
6. V4  porqué del camino           ← remata V1
7. S3  HITL por punto              ← el grano de revisión
8. S5  lo-no-cubierto              ← cierra la honestidad
9. S4  imprimible + sello          ← el entregable externo
```
Dependencias duras: V4←V1 · S2←S1 · S5←S1 · S3←S2 (re-verificación al editar).

### Prohibiciones explícitas (además de CLAUDE.md, que manda)
- NO tocar el pipelegado ni escribir `ag_*` fuera de `Sustrato`.
- NO usar NetworkX fuera de `caminos.py`; toda métrica de panel nueva es pura
  y determinista (en `topologia.py`/`analisis_vw.py`/`hechos.py`) con test de
  doble corrida.
- NO introducir librerías nuevas (ni de PDF, ni de NLP, ni de grafos).
- NO segundo LLM para verificación (S2 es determinista por decisión).
- NO montos/confianzas fuera de CONCILIA/NOMOS; NO resaltar en lienzo
  estructura "aproximada" (V3); NO ocultar truncaciones ni coberturas.
- NO regenerar el informe silenciosamente: cada redacción es acción del
  operador.
- NO abrir PR. Commits Conventional en inglés, uno por paso del orden.

### Protocolo de verificación por paso (no negociable)
1. `python3 -m ruff check .` limpio · `npx eslint static` 0 errores ·
   `python3 -m pytest tests/ -q` verde (baseline al iniciar: 396).
2. Tests nuevos: doble corrida para toda métrica; los contratos existentes
   (`test_caminos.py`, `test_informe.py`, `test_analisis_vw.py`) NO se
   modifican salvo adición.
3. Verificación en vivo con DB sembrada (receta del hand-off: seed_big por
   `models.SCHEMA_SQL`+`AG_SCHEMA_SQL`+`Sustrato`; Flask con
   `JARVIS_DB_PATH`+`JARVIS_MOCK=1`; recuerda: Flask 2.0.3 usa `FLASK_APP=app`,
   no `--app`; Playwright con `domcontentloaded`, el CDN de Bootstrap está
   bloqueado y sus errores de consola se ignoran).
4. Para S1/S2 con LLM real: SOLO si Jesús provee llave, como env var efímera,
   jamás escrita a disco/repo/log, borrada al terminar.
5. Releer el diff contra las LEYES antes de cada commit.

### Lo que seguirá por debajo de Palantir al terminar (declarado, por diseño)
Multi-analista en tiempo real, GIS profundo, escala petabyte, marketplace de
integraciones. Están fuera por las mismas leyes (local-first, un operador,
determinismo) que hacen posible lo de arriba. No prometer lo contrario en
ninguna UI ni doc.
