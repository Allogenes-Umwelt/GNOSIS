# PLAN PANOPTES — El Grafo del Caso a clase mundial

**Estado:** planificación aprobada en dirección por el operador (Jesús). Este
documento ES el entregable de la sesión de diseño: especifica el uplift
completo del Grafo AUTOGENES y las instrucciones de implementación. Nada de
código se escribió al producirlo; la implementación arranca solo con el visto
bueno explícito del operador, fase por fase.

**Codename:** PANOPTES (Argos Panoptes, el que todo lo ve) — el grafo como
instrumento óptico total del caso.

**Objetivo:** llevar `/autogenes/grafo` por encima de Palantir Gotham/Foundry
en lo visual y lo navegable: cero hairball a cualquier escala, nodos con
lenguaje visual propio (no círculos genéricos), navegación semántica por
tarjetas y despliegue funnel, y todo el sistema montado sobre los tokens
GESTELL sin un solo hex crudo en componentes.

---

## 0 · Fuentes de verdad de este plan

| Qué | Dónde |
|---|---|
| Sistema S1S1R1 (tokens, glow⇄burn, partículas sinápticas, glifos griegos TELOS) | Nota técnica del operador `NOTAS1S1R1designsystem.md` (subida a la sesión) |
| Referencia visual 1 — ojo-sensor biomech (anillos concéntricos maquinados, núcleo incandescente, barras de luz verticales) | Artbook Armored Core V *the FACT*, colofón |
| Referencia visual 2 — lineart técnico anotado (callouts círculo + línea guía) | Artbook AC, página de bocetos |
| Referencia visual 3 — fin funnels desplegados alrededor del cuerpo, anotación con círculos y líneas guía | Página RX-93 / Hi-ν Gundam |
| Referencia visual 4 — duotono carmesí/naranja, funnel con cables-estela (newtype) | Póster Xi Gundam U.C.0105–0153 |
| Grafo actual | `static/grafo.js` (480 líneas), `static/fuerzas.js` (motor determinista), `autogenes/proyeccion.py::construir_grafo`, `templates/autogenes_grafo.html` |
| Analítica de red YA existente, pura y determinista | `autogenes/topologia.py` (comunidades, puentes de articulación, centralidad de vector propio, embedding espectral, renormalización) |
| Tokens canónicos | `static/styles.css` `:root` + `[data-theme="light"]` |
| Endpoints ya cableados que el grafo aún no explota | `/api/v1/autogenes/vecindario`, `/camino`, `/hubs` (hoy solo los consume Vínculos) |

Lo que este plan NO toca (leyes de la casa): el pipelegado
(`PDFs_v2.py`/`PDFs_Final_v3.py`/`concentrado*`), `sustrato.py` como único
escritor de `ag_*`, la ley de procedencia, ZERO SNAKE OIL (ni montos
estimados ni conversión de divisas), la ofuscación hacia el LLM, y el
determinismo del layout (mismo grafo → misma apertura, siempre).

---

## 1 · Taxonomía de glifos griegos — adaptación del sistema TELOS al caso VW

El S1S1R1 define 6 glifos para compliance de personas (α Ψ Ω Δ ⊕ Σ). El caso
GNOSIS es aduanal-automotriz: el sujeto no es una persona sino la **sesión de
importación**, y las alertas no son hits OFAC sino **anomalías deterministas
de conciliación/validación**. La adaptación conserva la regla de fondo del
sistema: *cada glifo es una clase de objeto con aristas legítimas, fuentes y
peso propio* — no es ornamento.

### 1.1 · Mapa canónico `kind → glifo`

| Glifo | Nombre | Entidad VW | Kind actual en proyección | Color del nodo | Peso `w` (alimenta A4·COBERTURA) |
|---|---|---|---|---|---|
| **α** | Alpha · Caso | La sesión de importación (mes/año). Ego del análisis, único. | `nucleo` | Fijo `--t1` (letra `--bg`) + halo pulsante | — (ego; rinde su índice directo) |
| **Π** | Pi · Pedimento | Declaración aduanal, documento rector. | `pedimento` | Frame `--t1` con singularidad `--acc-text` | 1.0 |
| **ν** | Nu · Vehículo | La unidad atómica: un chasis/VIN importado. | `vehiculo` | Frame `--line-2` (hoja) | 1.0 |
| **μ** | Mu · Marca | Hub agregador de marca (VW, Audi, SEAT…). | `marca` | Frame `--t1` | 0.85 |
| **⊕** | Plus circulado · Geográfico | País de origen. | `pais` | Fijo `--cobalt` (token nuevo, §2) | 0.85 |
| **Σ** | Sigma · Fuente | Artefacto documental: factura PDF, nota, estructurado. No aporta anomalía: modula la cobertura documental. | `artefacto` | Fijo `--acc-text` (cyan GNOSIS), forma cuadrada se conserva | 0.40 |
| **σ** | sigma minúscula · Fragmento | Sub-evidencia (unidad de procedencia). Colapsado por defecto dentro de su Σ (§4). | `fragmento` | `--line-2`, cuadrado pequeño | vía Σ |
| **Δ** | Delta · Anomalía | Hallazgo materializado por regla determinista: descuadre CONCILIA (chasis sin factura, factura sin pedimento), validación fallida, regla NOMOS disparada. Cada Δ carga `regla_id` + fuente + evidencia. | **kind nuevo** `anomalia` (§3) | Por severidad: `--warn` / `--danger` + glow⇄burn | **1.20** (evidencia > inferencia) |
| **Ψ / Ω / ε** | Psi/Omega/Epsilon · Entidad extraída | Entidad citada por extracción LLM sobre documentos: Ψ si `tipo` mapea a persona, Ω si organización/empresa (proveedor, agente aduanal), ε genérica. | `entidad` (subtipo por `tipo`) | `--acc-text` con relleno translúcido (vivo) — se conserva | 1.0 |
| **Φ** | Phi · Producto | Entregable dockeado (informe, camino, dossier, certificado). | `producto` | Frame `--t1` con singularidad | — |

Banda de portada canónica GNOSIS: **`α Π ν μ ⊕ Δ Σ Φ`** (para leyenda,
documentación y cualquier cabecera del instrumento).

### 1.2 · Reglas de color de letra (adaptación de `telosNodeLetterColor`)

- **Fijos:** α, ⊕, Σ, Φ, Π, μ, ν → letra en el color de contraste del nodo
  (`--bg` sobre relleno claro, `--t1` sobre trazo).
- **Por severidad:** Δ hereda el color de su nivel (`--warn`/`--danger`,
  variantes AAA por modo ya existentes). Ψ/Ω/ε solo cambian de color si están
  citadas por un Δ activo (la anomalía "contamina" a quien la protagoniza,
  visible pero sin duplicar el glow, §5.1).
- El glifo se dibuja DENTRO del nodo con `--font-mono`, tamaño proporcional
  al radio, solo cuando el radio en pantalla ≥ 9 px (LOD, §6.3). Debajo del
  umbral el glifo desaparece y queda la forma.

### 1.3 · ZERO SNAKE OIL aplicado a Δ

Un Δ **solo** nace de una regla determinista con id y fuente verificable
(motores ya existentes: `concilia.py`, `validacion.py`, `nomos.py`). Nunca de
un score inventado, nunca de un umbral monetario estimado. Si un dato falta,
el Δ dice exactamente qué falta ("factura sin pedimento que la ampare"), no
cuánto "vale" el hueco. Los pesos `w` alimentan el índice de cobertura
(A4·COBERTURA del PLAN_SUPRA_PALANTIR) — un índice de *qué tan probado está
el caso*, jamás un monto.

---

## 2 · Tokens nuevos (única adición a `styles.css`; primitivo → semántico)

Todo lo nuevo entra como token primero. Componentes jamás llevan hex/px
crudos (los fallbacks `var(--x, #hex)` en JS de canvas siguen permitidos como
red de seguridad, patrón ya establecido en `grafo.js::leerColores`).

```
:root (Nocturne)
  --cobalt: #3D5AFE;            /* geográfico ⊕ — S1S1R1 §1 */
  --cobalt-on: #8C9EFF;         /* variante AAA sobre --bg oscuro */
  --glow-crit: var(--danger);   /* glow/burn usan la escala semántica */
  --glow-warn: var(--warn);
  --gr-halo: rgba(var(--acc-rgb), 0.9);   /* glow base del canvas */

[data-theme="light"] (Daylight)
  --cobalt-on: #2A3EB1;         /* AAA sobre #FAFAF8 */
  --burn-ring-crit: … (deriva de --danger de Daylight)
  --burn-ring-warn: … (deriva de --warn de Daylight)
```

Los valores exactos AAA se validan con contraste en implementación (regla:
≥ 4.5:1 texto, ≥ 3:1 gráfico fino). Motion: se reutilizan las duraciones
E4 existentes; los ciclos de glow/burn (1.6 s crítico / 2.4 s alto, S1S1R1
§3.1) entran como `--e4-glow-crit: 1.6s; --e4-glow-high: 2.4s;`.

---

## 3 · Cambios en la proyección (`proyeccion.py`) — el grafo dice más sin escribir nada

`construir_grafo` sigue siendo pura y read-time. Tres extensiones:

1. **Campo `glifo` y `severidad` por nodo.** El servidor resuelve el mapa
   §1.1 (incluido el subtipo Ψ/Ω/ε por `tipo` de entidad) y lo emite en el
   payload. El cliente no adivina taxonomía.
2. **Nodos Δ (kind `anomalia`).** La proyección consulta los motores
   deterministas ya existentes (CONCILIA: chasis sin factura / factura sin
   vehículo que la cite; VALIDACION: reglas fallidas; NOMOS: reglas del
   operador disparadas) y proyecta cada hallazgo como nodo Δ con aristas
   `cita` hacia los nodos implicados (el ν huérfano, la Σ sin amparo, el Π
   descuadrado). Extra del nodo: `{regla_id, motor, detalle}`. Nota de ley:
   `sustrato.py` sigue siendo el único escritor — Δ es proyección read-time,
   no fila nueva en `ag_*`.
3. **Analítica topológica en el payload.** Adaptador fino
   `proyeccion → red` (formato `topologia.py`: `{nodos, enlaces}` con pesos)
   y se anexa por nodo: `comunidad` (int), `puente` (bool, articulación) y
   `centralidad` (float normalizado). Todo con los motores YA existentes de
   `topologia.py` — deterministas y sin dependencias.

**Sobre networkx:** está en `requirements.txt` pero NO se usa para esto.
Razón: la ley de determinismo (mismo grafo → misma apertura y mismas cifras)
ya la garantiza `topologia.py`, que fue escrito exactamente para eso; los
algoritmos de comunidad de networkx no son deterministas entre plataformas
sin fijar semillas y ordenamientos. networkx queda como lente opcional
server-side para consultas futuras (k-shortest-paths en Vínculos, por
ejemplo) — se propone si esa necesidad llega, no antes.

Payload nuevo (aditivo, retrocompatible):

```
nodo:   { id, kind, glifo, etiqueta, tipo?, grado, seed, extra?,
          severidad?: "warn"|"danger", comunidad: int,
          puente: bool, centralidad: float }
enlace: { id, source, target, kind, peso, tipo? }
meta:   { comunidades: int, umbral_colapso: {...} }   ← nuevo bloque raíz
```

---

## 4 · Matar el hairball de verdad — divulgación progresiva en 3 capas

El problema real: cientos de ν + halo de cientos/miles de σ en un solo plano
de fuerzas. La solución no es esconder — es **jerarquizar lo que se renderiza
y expandir localmente**. Presupuesto duro: **≤ 300 nodos visibles** en
cualquier estado; 60 fps sostenidos.

### 4.1 · Capa 1 — Colapso jerárquico con meta-nodos (el corazón)

- **σ colapsados por defecto**: los fragmentos NO se renderizan como nodos.
  Cada Σ lleva un badge `×N σ` (contador en el anillo exterior del nodo,
  estilo marcador `+n` del dendro). Toggle "fragmentos" en los controles del
  lienzo (off por defecto) los despliega SOLO para la Σ seleccionada — nunca
  el halo global entero. El toggle pedido por el operador queda subsumido
  aquí: global-off / local-on-demand.
- **ν colapsados por racimo**: cuando un Π (o un par μ×⊕) tiene más de
  `umbral_colapso` vehículos (propuesta: 24), se renderiza UN meta-nodo
  `ν×N` (forma de ν con contador, radio ∝ √N). Clic → expansión local
  animada (los ν reales brotan del meta-nodo, layout local en abanico);
  segundo clic o "colapsar" en su tarjeta los repliega. Solo un racimo
  expandido a la vez por defecto.
- El selector "150/400/todos" actual se reemplaza por este sistema: ya no
  hay que elegir a ciegas cuántos ν cargar — se cargan TODOS al payload y el
  colapso decide qué se dibuja. (El `limite_vehiculos` del API se conserva
  como válvula de escape para sesiones monstruosas.)

### 4.2 · Capa 2 — La topología manda el layout (comunidades como sectores)

Con `comunidad` en el payload (§3.3), `fuerzas.js` gana una fuerza nueva y
determinista: **sector angular por comunidad**. A cada comunidad se le asigna
un arco del círculo (proporcional a su tamaño, orden estable por id) y sus
nodos reciben una fuerza tangencial suave hacia su sector. Resultado: los
racimos se separan visualmente SIN romper el sistema de anillos por kind que
ya existe — el grafo pasa de nube a rosa de los vientos.

- Nodos `puente` (articulación) se dibujan con énfasis (doble anillo): son
  los puntos donde el caso se parte en dos — oro analítico.
- `centralidad` modula el radio base (sustituye el `sqrt(grado)` actual por
  una señal mejor) y la prioridad de etiqueta en el LOD.

### 4.3 · Capa 3 — Motor: repulsión por rejilla + aristas curvas

- **Repulsión O(n·k) por rejilla espacial** (bucket grid determinista, celda
  = radio de corte): sustituye el par-a-par O(n²) de `fuerzas.js`. Con el
  colapso de la Capa 1 el n visible ya es chico, pero esto asegura que el
  modo "todos expandido" (auditoría) no muera. Sin aleatoriedad: mismo orden
  de iteración, mismos resultados.
- **Aristas curvas por comunidad (bundling ligero)**: aristas intra-comunidad
  rectas; aristas inter-comunidad se curvan (quadratic bezier con control
  hacia el centroide medio de ambas comunidades). Menos cruces percibidos,
  lectura de "cableado" limpia — y es puro dibujo, cero costo de layout.

---

## 5 · Lenguaje visual de nodos — el ojo-sensor (referencia AC *the FACT*)

Los nodos dejan de ser círculos con trazo. Construcción canónica en canvas,
tres tiers:

### 5.1 · Tier HUB (α, μ, Π, ⊕, Φ y todo nodo con centralidad alta)

El "ojo-sensor": anillos concéntricos maquinados + núcleo incandescente.

```
r_ext  : anillo exterior, trazo 1.2, alpha 0.9        (la carcasa)
r_mid  : anillo medio a 0.72·r, trazo 0.7, alpha 0.45 (el mecanizado)
        + 8–12 marcas radiales cortas (ticks) entre r_mid y r_ext,
          alpha 0.3 — el "iris" maquinado del sensor AC
r_core : núcleo a 0.34·r, RELLENO con gradiente radial
         (centro --acc-text → borde transparente) — la incandescencia
glifo  : letra griega centrada en --font-mono, color según §1.2
```

Para α además: halo exterior `r+14` pulsante 3.5 s (port del halo del
sujeto, S1S1R1 §3.3), quieto bajo `prefers-reduced-motion`.

### 5.2 · Tier MEDIO (Σ, Ψ/Ω/ε, Δ, meta-nodos ν×N)

Anillo simple + núcleo + glifo. Σ conserva la forma cuadrada (Frame:
documental) con el cuadrado interior al 0.4 como núcleo. Δ usa triángulo
(vértice arriba) — la señal de alerta clásica — con glifo Δ dentro y color
por severidad.

### 5.3 · Tier HOJA (ν, σ expandidos)

Como hoy: forma mínima sin glifo (círculo chico ν, cuadrado chico σ). El
glifo aparece solo al hover/selección o zoom > umbral. Cero glow (la ley de
rendimiento actual se conserva: glow masivo mata lectura y fps).

### 5.4 · Glow ⇄ Burn — el mismo estado, dos renders por tema (S1S1R1 §3.1)

Regla de oro portada tal cual: **glow (Nocturne) y burn (Daylight) son la
MISMA alerta**, nunca ambos.

- **Quién:** SOLO Δ con severidad `warn` o `danger` (equivalente exacto de la
  regla "solo Ψ y Δ alto/crítico"; en GNOSIS las anomalías son los Δ).
- **Nocturne (canvas):** halo relleno que respira — círculo extra detrás del
  nodo a `r+22`, `shadowBlur` + alpha oscilante (ciclo 1.6 s danger / 2.4 s
  warn), color `--glow-crit`/`--glow-warn`.
- **Daylight (canvas):** anillo de trazo que titila — mismo radio, sin
  relleno, `stroke-opacity` oscilante con los mismos ciclos, color burn
  derivado de la escala semántica light.
- **`prefers-reduced-motion`:** anillo estático al 100% de opacidad — la
  información (hay anomalía y su nivel) nunca se pierde, solo la animación.
- El tema se detecta con el listener ya existente (`#theme-toggle` +
  `leerColores`); el render elige glow o burn por frame según
  `data-theme` — cero DOM extra, es canvas.

### 5.5 · Afterburn de selección (las barras de luz verticales del AC)

El nodo seleccionado recibe, además del anillo punteado giratorio actual,
**2–4 barras de luz verticales cortas bajo el nodo** (rectángulos delgados
con gradiente que se desvanece hacia abajo, color `--acc-text`, alpha 0.5).
Es la firma "afterburn/thruster" de la referencia: la selección se ve
encendida, no solo marcada. Estático bajo reduced-motion; con motion, un
shimmer sutil de alpha (ciclo ≥ 2 s, jamás > 5 Hz).

---

## 6 · Sistema de tarjetas — el callout técnico anotado (referencias 2 y 3)

Sustituye la interacción actual "clic → inspector lateral estático" por el
lenguaje de anotación de los artbooks: **círculo sobre la pieza + línea guía
+ ficha técnica**.

### 6.1 · Anatomía de la tarjeta

- **HTML overlay posicionado sobre el canvas** (no texto en canvas: nitidez,
  selección de texto, accesibilidad, copy/paste). Contenedor absoluto dentro
  de `.gr-lienzo`; el canvas dibuja solo la **línea guía**: del borde del
  nodo (con un circulito de anclaje, como los callouts del Hi-ν) hasta la
  esquina de la tarjeta, con un quiebre ortogonal (estilo lineart técnico,
  no curva).
- **Estructura** (todo tokens, `--font-mono` para micro-labels, `.tnum` para
  datos):

```
┌─────────────────────────────┐
│ ν · VEHÍCULO      [fijar] × │   glifo + kind (micro-label mono)
│ 3VW2K7AJ5EM388202           │   etiqueta (t1, mono, tnum)
│ ───────────────────────────│
│ pedimento   24 47 3801 ...  │   filas dato (clave t3 / valor t1)
│ marca       VOLKSWAGEN      │
│ país        BRA             │
│ precio      178 450.00 USD  │   ← SOLO si existe; jamás estimado
│ amparo      Σ F-8842.pdf    │   ← fila de procedencia, SIEMPRE
│ ───────────────────────────│
│ VECINDARIO · CAMINO A… ·    │   acciones (verbo, máx 3 palabras)
│ AISLAR RAMA · ABRIR EN CASO │
└─────────────────────────────┘
```

- **Acciones cableadas a lo que YA existe:** VECINDARIO →
  `/api/v1/autogenes/vecindario` + `grafoAPI.resaltar`; CAMINO A… → modo
  "elige el segundo nodo" + `/api/v1/autogenes/camino`; AISLAR RAMA → modo
  duotono (§7.2); ABRIR EN → deep-link a la sección dueña (Σ → Ingesta,
  Δ → Concilia/Validación, Φ → Síntesis). Nada de endpoints nuevos en F3.
- **Fijar (pin):** hasta 2 tarjetas fijadas simultáneas — comparación de dos
  nodos lado a lado, cada una con su línea guía viva (se re-anclan al pan/
  zoom). La tercera selección recicla la más vieja no fijada.
- **Ley de seguridad conservada:** todo texto que venga de extracción pasa
  por `esc()` (ya existe en `grafo.js`); las tarjetas la heredan.
- **Colocación:** algoritmo simple de cuadrantes — la tarjeta se abre en el
  cuadrante del viewport opuesto al nodo, y evita encimarse con la otra
  fijada. En móvil (< 640 px): la tarjeta se dockea como bottom-sheet y la
  línea guía se omite; touch targets ≥ 48 px siempre.
- El panel Inspector lateral actual se conserva como fallback accesible
  (`aria-live` ya está) y se sincroniza con la tarjeta activa; puede
  plegarse por defecto una vez que las tarjetas prueben ser suficientes.

### 6.2 · Contenido por glifo

Cada glifo define sus filas canónicas (el servidor ya manda `extra`):
α (totales del caso + índice de cobertura cuando A4 exista), Π (patente,
aduana, fecha, N vehículos, N anomalías), ν (chasis, auto_code, precio si
existe + moneda, su Π, su Σ de amparo), Σ (archivo, tipo, ×N σ, entidades
extraídas que la citan), Δ (regla_id, motor, detalle, los nodos implicados
como chips navegables), Ψ/Ω/ε (tipo, origen, evidencia: N fragmentos → sus
Σ), ⊕ (país, N vehículos, marcas presentes), Φ (clase, fecha, anclas).

### 6.3 · LOD de glifos y etiquetas (ajuste del actual)

La lógica de etiquetas LOD existente se conserva y se le suma: glifo visible
si radio pantalla ≥ 9 px; prioridad de etiqueta por `centralidad` (no solo
`grado`); etiquetas de σ nunca (solo tarjeta).

---

## 7 · Modo FUNNEL y modo DUOTONO — la navegación newtype

### 7.1 · Despliegue funnel (referencias 3 y 4)

Al seleccionar un nodo, su vecindario **se despliega como funnels**: los
top-K vecinos por peso de arista (K = 8 por defecto) avanzan suavemente
hacia un anillo orbital alrededor de la selección (radio `r_sel + 90`,
posiciones angulares estables por id), mientras el resto del grafo recede
(alpha bajo, el "apagado" actual). Las aristas activas se vuelven
**cables-estela**: curvas con caída (catenaria simple, control point
desplazado hacia "abajo" en pantalla) — la firma de los cables del Xi y los
fin funnels desplegados.

- **Partículas sinápticas sobre los cables activos** (port exacto S1S1R1
  §3.2c): spawn 5%/tick sobre un cable aleatorio del despliegue, velocidad
  0.004–0.007/frame, color = nodo origen, máx 30 vivas, SOLO Nocturne
  (Daylight sin partículas), rAF cancelable, y nada bajo reduced-motion.
- Escape (Esc / tap en fondo / botón centrar): los funnels regresan a su
  posición de layout con la misma animación. Bajo reduced-motion todo esto
  es instantáneo y estático (posición final directa).
- Implementación: los K vecinos reciben `fx/fy` temporales animados (el
  motor ya respeta nodos fijados); no se toca la simulación global.

### 7.2 · Modo duotono / aislar (referencia 4, el póster Xi)

"AISLAR RAMA" desde la tarjeta (o desde la leyenda, §8): el subgrafo aislado
(rama del árbol, comunidad, o resultado de vecindario/camino) se dibuja a
**color pleno de acento** y TODO lo demás cae a una sola tinta plana
(`--line-ghost`-ish, sin glow, sin glifos, sin etiquetas) — el corte duotono
del póster. Un botón de estado persistente arriba del lienzo ("AISLANDO:
μ VOLKSWAGEN · ×74 — salir") deja claro el modo y cómo volver. Formaliza y
eleva el sistema `resalte` que ya existe en `grafoAPI`.

---

## 8 · Leyenda viva y navegación

- **La leyenda actual se vuelve la banda de glifos** `α Π ν μ ⊕ Δ Σ Φ` con
  contadores reales (`Δ 12 · warn 9 / danger 3`). Cada chip: clic = atenuar
  ese glifo (toggle), doble clic / long-press = aislarlo (duotono §7.2).
  Chips con estado visible (activo/atenuado) y touch ≥ 48 px.
- **Breadcrumb de foco** bajo la cabecera: `α 03/2025 → μ VW → Π 24-47… →
  ν 3VW2…` — cada paso navegable (enfoca ese nodo). Se llena con la cadena
  de selecciones.
- **Búsqueda con typeahead**: el input actual gana un dropdown (máx 8
  resultados, glifo + etiqueta, navegable con teclado) sobre los nodos del
  payload; Enter = enfocar + tarjeta.
- **Teclado**: Tab/flechas ciclan por vecinos del nodo seleccionado, Enter
  abre tarjeta, Esc cierra/sale de modos. El canvas ya tiene `role="img"`;
  se le suma el patrón de `aria-activedescendant` sobre una lista oculta de
  nodos para lectores de pantalla.

---

## 9 · Presupuesto de rendimiento y calidad (definición de "world class")

| Métrica | Presupuesto |
|---|---|
| Nodos visibles simultáneos | ≤ 300 (colapso lo garantiza) |
| FPS durante interacción (drag/zoom) | 60 sostenidos; sin GC visible |
| Frame con todo desplegado en modo auditoría | ≤ 16 ms con rejilla O(n·k) |
| Apertura del grafo (payload → primer frame asentado) | < 1.2 s con sesión real |
| Determinismo | mismo grafo → misma apertura, píxel-estable |
| Contraste | AAA texto (≥ 4.5:1), gráfico fino ≥ 3:1, ambos temas |
| Reduced motion | TODO estado legible en estático; cero información perdida |
| Flashing | nada > 5 Hz (ciclos mínimos definidos: 1.6 s) |
| Hex crudos en componentes | 0 (solo tokens; fallbacks var() en canvas ok) |

---

## 10 · Fases de implementación (para Opus 4.8, en orden, un commit por pieza)

Cada fase termina con: `ruff check` limpio, `python3 -m pytest -q` en verde
(300+ tests, se AGREGAN tests por fase), verificación Playwright con
screenshots leídos, y diff revisado contra tokens/convenciones. El operador
aprueba cada fase antes de la siguiente.

### F1 · Taxonomía + payload (backend puro, sin UI)
- `proyeccion.py`: campos `glifo`, `severidad`, `comunidad`, `puente`,
  `centralidad` + nodos Δ desde CONCILIA/VALIDACION/NOMOS + bloque `meta`.
  Adaptador `proyeccion → topologia.Red`.
- Tests: `tests/test_proyeccion*.py` — mapa kind→glifo exhaustivo, Δ solo
  con regla_id+fuente, determinismo de comunidad/centralidad (dos corridas
  idénticas), retrocompatibilidad del payload (campos viejos intactos).
- Commit: `feat(grafo): glyph taxonomy, anomaly nodes and topology fields in projection`

### F2 · Hairball — colapso + sectores + motor
- `grafo.js`: meta-nodos ν×N con expansión local, σ colapsados con badge,
  toggle fragmentos (off por defecto), retiro del selector 150/400/todos.
- `fuerzas.js`: fuerza de sector angular por comunidad; repulsión por
  rejilla determinista. Aristas curvas inter-comunidad (dibujo).
- Commit por pieza: `feat(grafo): hierarchical collapse with local expansion`,
  `feat(fuerzas): community sectors and grid repulsion`,
  `feat(grafo): curved inter-community edges`.

### F3 · Nodos ojo-sensor + glow⇄burn + afterburn
- `grafo.js`: render por tiers (§5), glifos en nodo, Δ triángulo con
  severidad, glow/burn por tema con reduced-motion, afterburn de selección,
  halo α. `styles.css`: tokens §2.
- Commit: `feat(grafo): sensor-eye node language with theme-gated glow/burn`

### F4 · Tarjetas callout
- Overlay HTML + línea guía en canvas + pin ×2 + acciones cableadas a
  vecindario/camino/aislar/deep-links + bottom-sheet móvil + sincronía con
  el inspector. `esc()` en todo texto extraído.
- Commit: `feat(grafo): technical callout cards with leader lines`

### F5 · Funnel + duotono + leyenda viva + navegación
- Despliegue funnel con cables-estela y partículas sinápticas (Nocturne),
  modo duotono/aislar, banda de glifos con contadores y filtros, breadcrumb,
  typeahead, teclado/aria.
- Commits: `feat(grafo): funnel deployment with synaptic particles`,
  `feat(grafo): duotone isolate mode and live glyph legend`,
  `feat(grafo): keyboard navigation and search typeahead`

Tamaños: F1 M · F2 L · F3 M · F4 L · F5 L. Ruta mínima demostrable si el
operador quiere ver valor rápido: F1 → F3 (el grafo ya SE VE otra cosa) →
F2 → F4 → F5.

---

## 11 · Instrucciones operativas para Opus 4.8 (briefing de implementación)

Contexto: eres el implementador de este plan en el repo GNOSIS
(Allogenes-Umwelt/GNOSIS). El operador es Jesús. Este documento es la
especificación; ante ambigüedad, la dirección la marca el operador — propón
y espera visto bueno. NUNCA arranques una fase sin su aprobación explícita.

1. **Rama:** todo en `claude/gnosis-autogenes-i-85bwsd`. Nunca otra. Push
   con `git push -u origin claude/gnosis-autogenes-i-85bwsd`, reintentos
   exponenciales solo ante fallo de red. NO abras PR salvo orden expresa.
   El actualizador Docker del operador tira de esta rama: no dejes la punta
   rota jamás (cada commit debe dejar la app funcional).
2. **Leyes (violarlas = trabajo rechazado):** ZERO SNAKE OIL (ni montos
   estimados ni conversión de divisas; lo que falta se declara); el
   pipelegado no se toca; `sustrato.py` único escritor de `ag_*`; ley de
   procedencia; ofuscación de chasis/factura hacia el LLM intacta; secretos
   solo en `.env`; identificador de modelo fuera de commits/PR/código;
   Conventional Commits en inglés, foco chico; sin `console.log` ni código
   comentado; UI en español registro accesible, sin emojis ni exclamaciones.
3. **Tokens:** cero hex/px crudos en componentes. Valor nuevo → token
   primero en `styles.css` (primitivo → semántico), luego consumo. En
   canvas, lee con `getComputedStyle` (patrón `leerColores` existente) y
   fallback `var(--x, #hex)` solo como red de seguridad.
4. **Determinismo:** nada de `Math.random()` en layout ni en analítica que
   alimente cifras. Partículas sinápticas son la ÚNICA excepción permitida
   (son ornamento cancelable, no información); aísla su aleatoriedad.
5. **Verificación por fase (obligatoria antes de declarar hecho):**
   `ruff check` limpio; `python3 -m pytest -q` en verde con los tests
   nuevos de la fase; levantar Flask directo
   (`FLASK_SECRET_KEY=v DEEPSEEK_API_KEY= FLASK_APP=app.py python3 -m flask
   run -p 5057` en background) y verificar con Playwright headless
   (chromium en `/opt/pw-browsers/`), screenshots en ambos temas
   (Nocturne y Daylight) al scratchpad y LEERLOS antes de reportar; si la
   DB está vacía, sembrar una fila mínima en `processing_sessions` y datos
   sintéticos suficientes para ver colapso/expansión (mínimo: 2 Π, 40 ν en
   un Π para forzar meta-nodo, 2 Σ con σ, 2 Δ de severidades distintas,
   3 entidades). Verifica también `prefers-reduced-motion` (emulación
   Playwright) y viewport móvil 390×844.
6. **Alcance por fase:** implementa la fase completa y NADA de la
   siguiente. Si el plan te queda chico o encuentras una contradicción con
   el código real, para y repórtala con propuesta — no improvises
   arquitectura.
7. **Al cerrar cada fase:** resumen corto al operador (qué se ve distinto,
   qué falta), screenshots, y espera. El operador valida en su Docker.

---

## 12 · Riesgos y decisiones abiertas (para el visto bueno del operador)

1. **Retiro del selector 150/400/todos** (§4.1) — se sustituye por colapso.
   ¿De acuerdo, o lo quieres conservar en paralelo una fase de transición?
2. **Umbral de colapso ν×N = 24** — ajustable; ¿tienes intuición de negocio
   para otro valor?
3. **Inspector lateral**: ¿se pliega por defecto cuando las tarjetas landen
   (F4), o se retira del todo en F5?
4. **Δ desde NOMOS**: proyectar reglas del operador disparadas como Δ mete
   "sus" reglas al grafo junto a las de CONCILIA/VALIDACION. ¿Los tres
   motores desde F1, o CONCILIA primero y el resto después?
5. **K del despliegue funnel = 8** — ajustable por gusto visual.
