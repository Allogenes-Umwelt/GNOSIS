# PLAN — QUALIA UPLIFT (F7+)

**Versión:** 1.0 · 2026-07-14 · aprobado por el operador (Jesús)
**Branch:** `claude/gnosis-autogenes-i-85bwsd` · **Ejecuta:** por fases, con
checkpoint visual del operador antes de construir cualquier UII de Q3.
**Fuentes:** auditoría de motor (`autogenes/qualia.py`, `topologia.py`,
`anomalias.py`, `horizonte.py`, `cascada.py`, `qualia_narrativa.py`) +
auditoría de los 7 lienzos (`static/qualia*.js`, `templates/autogenes_qualia*`)
+ `docs/BENCHMARK_PALANTIR.md` + `docs/PROPUESTA_GRAFO.md` v3.

---

## Tesis

QUALIA es hoy la parte más esotérica de AUTOGENES: un observatorio bellísimo y
matemáticamente riguroso que **habla en topología abstracta, no en negocio**, y
que **no descarga sus hallazgos en el flujo de investigación**. El uplift la
convierte en una sala de control estructural donde **cada instrumento responde
una pregunta de negocio nombrada, en español de negocio, con drill-down a la
entidad real (VIN / pedimento / documento), y cada señal termina en el motor de
hallazgos o en el Radar** — sin degradar el determinismo ni esconder la
matemática (que se **declara**, no se grita).

## Lo que NO se toca (la esencia que ya es 1% mundial)

- El motor puro-Python, determinista y sin dependencias
  (`topologia.py`/`cascada.py`/`anomalias.py`). Es la ventaja competitiva
  (reproducibilidad multiplataforma), no una limitación. **No se introduce
  NetworkX/numpy/three.js ni dependencia JS nueva.**
- Las metáforas visuales (terreno, orbe, cuerdas, red, cascada, horizonte,
  máquina): funcionan como lenguaje. Se les cambia el **idioma** y se les da
  **salida** y **monumentalidad**, no la forma. Todo cambio de forma pasa por el
  checkpoint visual del operador.
- La ley de la proyección: la matemática sigue corriendo sobre una proyección;
  el negocio entra por la **superficie** (dossier, lente), no dentro de la
  matriz — así se preservan el determinismo y los tests existentes.
- La disciplina de marca: solo tokens; magenta SOLO `--danger`/`--telos-on`
  (alerta real, no selección); AAA en ambos temas; `prefers-reduced-motion`
  degrada a estático; nada de `Math.random` en el render.

## Leyes que el uplift respeta (heredadas)

1. **Cero snake oil.** Ninguna señal estructural inventa MXN. Un puente que cae
   no "vale $" por sí mismo; solo la conjunción con CONCILIA monetiza (vía
   SINAPSIS, como ya ocurre). Las anomalías QUALIA entran al motor de hallazgos
   con `monetizado=False` **por ley permanente**.
2. **Procedencia.** Todo drill-down cita fragmento→página→PDF; los saneadores
   corren en servidor.
3. **Determinismo.** Toda métrica nueva o modificada cierra con test de doble
   corrida idéntica.
4. **Puerta única de escritura.** Cualquier persistencia (hallazgos, notas,
   productos) pasa por `Sustrato`.

---

## La vara: la gramática del chord de Ingesta (no su forma)

El chord de Ingesta es el referente de calidad. Lo que se replica NO es el
anillo — es su **receta**, aplicada a la metáfora propia de cada instrumento:

1. **Forma héroe ≥ ~85% del lienzo.** Nada de figuras tímidas en el 35% central.
2. **Un punto focal con la cifra que importa** (el chord tiene "100% · 5
   fuentes" en el centro).
3. **Presupuesto de tinta:** el héroe en acento luminoso (`--acc-text`), el
   contexto en fantasma (`--line-ghost`). Jerarquía, no uniformidad.
4. **Etiquetas sin colisión** — guías/leaders radiales, nunca texto encimado.
5. **Negocio en los nombres** — entidades de negocio, no `factura_x.pdf`.

## El fix estructural previo e innegociable: la lente de negocio

Diagnóstico con evidencia visual: hoy el "concentrador principal" de la Red, el
"monolito" del Orbe y el titular de la Máquina son todos
**`factura_wolfsburg_0425.pdf`**. La proyección QUALIA
(`qualia.red_de_sesion`) mezcla la **fontanería documental** (artefactos,
fragmentos) con las **entidades de negocio**, así que los documentos dominan
toda métrica estructural — una tautología (claro que la factura toca todo lo que
menciona). **Hacer el Orbe monumental sin esto haría monumental un nombre de
archivo.**

**La lente de negocio (Q2):** la red QUALIA por default excluye la fontanería
documental (artefactos/fragmentos quedan a un clic, como evidencia citable);
hubs, puentes y monolitos pasan a ser VOLKSWAGEN, Aduana Veracruz, Patente 3648.
Es determinista, testeable con doble corrida, y es el cambio que **más
des-esoteriza QUALIA** — más que el copy y más que el glow. Se expone un toggle
declarado para ver la capa documental cuando se quiera. `resumen_red`,
detectores y SINAPSIS operan sobre la lente de negocio.

---

## Diccionario de traducción (idioma de negocio)

La regla: la matemática **se declara** en una "ficha técnica" plegable por
instrumento (método + umbral + límites) — eso ES zero snake oil. Lo que se
prohíbe es **gritar el nombre del método** como título o etiqueta de usuario.

| Hoy en pantalla (jerga) | Etiqueta de usuario | Dónde vive el término técnico |
|---|---|---|
| PROYECCIÓN ESPECTRAL (FIEDLER) | «disposición por afinidad» | ficha técnica: "embedding de Fiedler" |
| ESCALA DE RENORMALIZACIÓN | «nivel de agrupamiento» | ficha técnica: "renormalización" |
| FORMA RENORMALIZADA | «vista agrupada» | ficha técnica |
| espectral (toggle) | «por afinidad» | ficha técnica |
| MASA | «peso en la red» | ficha técnica: "centralidad de vector propio" |
| monolito | «concentrador principal» | ficha técnica |
| baricentro | «centro de gravedad del caso» | ficha técnica |
| exponente / ley de potencias | «concentración: pocos concentran, muchos orbitan» | ficha técnica: "exponente ley de potencias" |
| GRADO 4.0 | «4 vínculos directos» | ficha (cifra cruda ok) |
| densidad 0.0417 | «tejido: disperso · moderado · denso» | ficha técnica: "densidad" + cifra |
| componentes | «islas del caso» | ficha técnica: "componentes conexos" |
| peso estructural 40% | «si cae, se pierde el 40% de los vínculos del caso» | — |
| saltos antes ∞ | «hoy no hay ruta entre ambos» | — |
| fibras (Cascada) | «vínculos» | — |
| Detectores del Terreno: `HUBS`, `LEY`, `PUENTES+`, `PUENTES−`, `ISLAS`, `TEJIDO`, `RÁFAGA`, `RITMO`, `FUENTES` | frases (ya existen como `definicion` en `qualia_terreno.js:15-34`; se **promueven** de tooltip a etiqueta): «Concentrador nuevo», «Cambió quién concentra», «Puente nuevo», «Puente que cayó», «Islas», «El tejido se apretó», «Pico de actividad», «Cambió el ritmo», «Desvío en fuentes» | ficha técnica por cresta |

**Vocabulario prohibido en UI** (vigilado por `tests/test_qualia_copy.py`):
`fiedler`, `espectral`, `renormaliz*`, `eigen`/`autovalor`, `laplacian*`,
`monolito`, `baricentr*`, `betti`, `persistencia h0`. Permitidos SOLO dentro de
una ficha técnica declarada (el test excluye ese contenedor y las URLs de API).

---

## Fases de ejecución

Cada fase cierra con los gates: `ruff check .` + `npx eslint static` (0
errores) · `pytest tests/` verde (métricas nuevas con doble corrida) · captura
headless antes/después en Nocturne **y** Daylight · un commit convencional por
cambio lógico. **Q3 se detiene con el operador antes de construir cada
instrumento** (mock/captura → visto bueno → construir).

### Q0 · Plan + ley de idioma [S] — este documento
- Este `PLAN_QUALIA_UPLIFT.md`.
- `tests/test_qualia_copy.py`: ratchet de cuarentena sobre la jerga de UI.
  Verde ahora (documenta la deuda exacta), rojo si aparece jerga nueva; cada
  fase que limpia una etiqueta borra su entrada de cuarentena (una entrada
  obsoleta también falla → fuerza la limpieza).
- Corregir el doc drift de `RUTA_CRITICA` (tablas fantasma `lotes`/`fusiones`).

### Q1 · Cimientos [M] — sin rediseño visual
- `static/qualia_comun.js`: extraer `esc/alfa/leerColores/tamano`, DPR, brackets
  y la relectura de tema — hoy duplicados 7×. `leerColores` con fallbacks
  **por tema** (no la paleta oscura hardcodeada que hoy pintaría mal en
  Daylight ante un fallo de token).
- Gramática de gestos única: hover = vista previa · click = seleccionar+ficha ·
  Enter/doble = abrir dossier · rueda = zoom · arrastre = pan. Clamps y márgenes
  unificados.
- Accesibilidad: `aria-label` por `<canvas>` + **modo tabla** por instrumento
  (la vara AAA del benchmark) + navegación por teclado sobre las listas ya
  existentes.
- Tests de ruta HTTP para las 8 APIs qualia (hoy: cero cobertura de ruta).

### Q2 · Lente de negocio [M] — el fix estructural
- Proyección QUALIA sin fontanería documental por default; toggle declarado
  para la capa documental. `resumen_red`/detectores/SINAPSIS sobre la lente de
  negocio. **Doble corrida.** SINAPSIS migra su join de etiqueta→id (arregla la
  fragilidad de `sinapsis.py:83,107`).
- Verificación antes/después: los hubs/monolitos deben pasar de nombres de PDF
  a entidades de negocio.

### Q3 · Uplift visual por instrumento [L→XL] — la fase pirotécnica
Aplica la gramática del chord. **Orden por severidad de la auditoría visual**,
cada uno con checkpoint del operador:
1. **Orbe** — monumental (≥85%), profundidad real, los tres concentradores con
   etiquetas guiadas sin colisión. Enciende `contribuciones_centralidad` (el
   "por qué pesa", hoy motor muerto).
2. **Cascada** — reusar el layout de filotaxis de la Red en vez del blob
   espectral central; **jamás** etiquetar fragmentos («p. 1», «p. 2»).
3. **Cuerdas** — arcos por comunidad en tinta luminosa jerarquizada (grosor y
   opacidad = peso), no tinta fantasma uniforme.
4. **Terreno** — malla siempre presente + estado de calma **con forma** (un
   certificado de sesión sana, no pantalla apagada).
5. **Horizonte** — rediseño con **ejes absolutos rotulados con unidades**
   (absorbe la vieja deuda de honestidad de eje: hoy dos trazas normalizadas
   cada una a su máximo, sin eje Y, ilegibles y no comparables).
6. **Red** — desenredo del centro (spaghetti de punteadas), inset de
   agrupamiento mayor, título que no choque con las pestañas.
7. **Máquina** — titulares de negocio.
El copy del diccionario entra aquí, instrumento por instrumento.

### Q4 · Dossier + drill-down [L] — el mayor valor de cierre
- Endpoint dossier-de-nodo sobre `consultas.expediente_entidad` (F8, ya existe):
  dado el id de nodo, su tarjeta de negocio (kind, VIN/pedimento/marca/país, Σ
  unidades medidas, hallazgos CONCILIA/VALIDACIÓN abiertos que lo tocan,
  fragmentos citables). Cacheado por sesión como la lente NetworkX.
- Hover/click/Enter en Red, Orbe, Cuerdas, Cascada y crestas del Terreno abren
  la tarjeta con salto a Vínculos/documento. Selección compartida entre pestañas
  vía query param.

### Q5 · Export + cierre del lazo [M]
- Export en los 7: CSV de los datos del instrumento + PNG "exhibit" con pie de
  fuente (sesión, fecha, método) — alineado con L2-E8 del plan del grafo.
- Anomalías QUALIA entran al motor de hallazgos con ciclo de vida
  (`nuevo→en gestión→resuelto/descartado`) y nota del operador
  (`monetizado=False`).
- Deriva entre sesiones se evalúa al abrir sesión y publica alerta al Radar
  (hoy el endpoint `/qualia/drift` no tiene consumidor). Aviso de edad de la
  referencia y del cap de 200 snapshots (hoy trunca en silencio).
- `desviacion_fuentes` (FIX/UDI/cupos, hoy motor muerto y ya habla negocio) se
  enciende como décimo detector del Terreno.

### Q6 · DERIVA — el octavo instrumento [M]
- UI para `/qualia/drift`: sesión actual vs referencia, ganado/perdido en tokens
  semánticos (nunca magenta fuera de `--danger`). Coordinar con P5 del plan del
  grafo para no duplicar.
- `persistencia_h0` (hoy motor muerto): o alimenta una "huella de cohesión"
  comparable entre sesiones (fingerprint estructural determinista, ideal para
  deriva), o **se borra**. Mantener motores muertos es deuda, no reserva.

### Q7 · Cascada con volumen [S]
- "Volumen afectado = Σ unidades de los nodos desconectados" en la simulación de
  caída (derivable y citable, no proyección). Coordinar con P3 del plan del
  grafo (surfacing del what-if en el lienzo principal): un solo motor, dos
  superficies.

**Orden:** Q0→Q1→Q2→Q3 en serie. Q4/Q5 paralelizables tras Q3. Q6/Q7 al final.

## Motores muertos a resolver (no dejar deuda viva)

- `persistencia_h0` (`topologia.py:316`) → Q6 (huella de cohesión) o borrar.
- `contribuciones_centralidad` (`:450`) → Q3 (Orbe "por qué pesa").
- `desviacion_fuentes` (`anomalias.py:189`) → Q5 (décimo detector).
- `matriz_adyacencia` (`:124`) → borrar si sigue sin uso al cerrar Q3.

## Riesgos declarados

1. El renombrado de copy puede romper tests que asertan strings → se migran en
   el mismo commit.
2. El dossier agrega una llamada por interacción → se cachea por sesión.
3. Q2/Q4 tocan `sinapsis.py` (join por id) → sus tests de doble corrida son el
   guardrail.
4. La lente de negocio cambia lo que aparece en pantalla → verificación
   antes/después obligatoria; el toggle documental preserva la capa completa.
