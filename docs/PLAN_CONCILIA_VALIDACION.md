# PLAN — CONCILIA & VALIDACIÓN: de motores de lectura a flujo de investigación

**Estado: PROPUESTA — nada de este documento se construye sin el visto bueno del
operador (Jesús).** Ejecutor previsto: Opus 4.8, sobre la rama designada
`claude/gnosis-autogenes-i-85bwsd-2zxb65` con espejo en
`claude/gnosis-autogenes-i-85bwsd` (cada commit se empuja a ambas).

Este plan eleva CONCILIA (F9) y VALIDACIÓN (F10) desde su estado actual —
dos motores de lectura excelentes pero pasivos — hacia el hueco que el propio
`docs/BENCHMARK_PALANTIR.md:27-32` declara como el valor central de Palantir
que GNOSIS aún no tiene: **el flujo de investigación** (detectar → disponer →
documentar → defender → vigilar en el tiempo). Todo dentro de las leyes de
`CLAUDE.md`; ninguna propuesta las relaja.

---

## 0. Diagnóstico honesto

### 0.1 Lo que ya es fuerte — no se rehace

- **CONCILIA** (`autogenes/concilia.py`): 8 clases de hallazgo tipadas,
  monetización honesta por divisa sin conversión, flujo tri-fuente, dossier
  dockeable, `estado_vin`, partición por fila para SINAPSIS, regla de
  casamiento compartida con la proyección (`_JOIN_PAR`, `concilia.py:39-44`)
  — el grafo y el motor no pueden contradecirse. `docs/AUDITORIA.md:118-128`
  lo declara limpio: sin concatenación SQL, sin conversión de moneda, sin
  estimación, órdenes deterministas.
- **VALIDACIÓN** (`autogenes/validacion.py`): 16 reglas deterministas que se
  reportan también en cero (la conformidad plena es un hecho que se muestra),
  `conformidad_pct`, certificado dockeable, honestidad ejemplar en la regla
  NO evaluada (`C.O + USA = J`, `validacion.py:12-15`).
- La integración existente: hallazgos como nodos Δ en el grafo
  (`proyeccion.py:115-185`), urgencias en el Radar (`metabolismo.py:161-186`),
  composición cruzada en SINAPSIS (`error_confirmado`, `sinapsis.py:156-186`),
  hechos citables para el informe (`hechos.py:53-93`).

### 0.2 Las siete carencias medibles

1. **Sin ciclo de vida.** Un hallazgo no se puede disponer: no hay
   `nuevo → en_gestión → resuelto/descartado` como el que QUALIA ya tiene
   (`ag_qualia_anomalias`, `sustrato.py:117-141`). La resolución es implícita
   (arregla los datos y el hallazgo desaparece), invisible e inauditable.
   `docs/RUTA_CRITICA_AUTOGENES.md` (decisión 7) especifica UN ciclo de vida
   para las cuatro lentes; hoy solo QUALIA lo tiene. **Este es el hueco del
   "flujo de investigación" — la carencia número uno.**
2. **El pedimento es fuente nominal, no real.** La conciliación se llama
   tri-fuente pero el pedimento solo participa como FK nula
   (`sin_pedimento`). No hay verificación declarado-contra-vendido: lag
   temporal factura↔pedimento (R8 de la ruta crítica), pedimentos huérfanos,
   consistencia por patente/aduana (R9).
3. **VALIDACIÓN valida poco.** Sin dígito verificador VIN (ISO 3779 lo define
   como aritmética pura), sin validación de fechas, sin moneda contra
   catálogo, sin la leyenda de preferencia (columna `leyenda` de
   `extraccion_facturas` sin explotar), sin veredicto en capas
   (`pasa/observado/rechazado` que la ruta crítica especifica). Y ninguna
   defensa contra los insumos envenenados que `docs/AUDITORIA.md:87-114`
   documenta: precios `0,00` fabricados por `PDFs_v2.py:813+` entran al motor
   como ceros reales.
4. **Cada sesión es una isla.** No hay historia: `conformidad_pct`,
   `valor_en_riesgo_mxn` y `pct_conciliado` viven solo en el presente. El
   operador no puede ver *cuándo cambió el proceso* — el lenguaje SPC que la
   planta VW ya habla (`docs/PLAN_SUPRA_PALANTIR.md`, A3). Solo NOMOS tiene
   backtest transversal (`nomos.py:100-134`); los otros dos motores, no.
5. **El dossier no es un expediente.** `dockear_dossier` y
   `dockear_certificado` congelan JSON en `ag_productos` — correcto pero
   intocable para un tercero: sin vista imprimible, sin cadena hallazgo →
   filas → PDF fuente, sin índice de cobertura, sin sello verificable. El
   entregable que el equipo legal/aduanal toca ante un requerimiento del SAT
   (A8 de SUPRA_PALANTIR) no existe.
6. **La defensibilidad no se mide.** El motor dice "piso, no techo" cuando
   hay PDFs ilegibles, pero no cuantifica: ¿qué fracción del valor en riesgo
   está respaldada por documento legible? (A4 · COBERTURA). Para un auditor,
   que el sistema declare su propia fragilidad ES la credibilidad.
7. **Deuda de paridad con QUALIA.** VALIDACIÓN no tiene tool de Jarvis (solo
   `conciliacion` existe, `jarvis/tools_grafo.py:60-65`); `estado.py` no
   publica `conformidad_pct`; ninguno de los dos tableros tiene export
   PNG/CSV, ni dossier drawer compartido, ni selección cruzada `?sel=` — las
   convenciones que los 8 instrumentos QUALIA ya establecieron.

### 0.3 Dónde se gana a Palantir — y dónde no se compite

Se gana profundizando las seis dimensiones que `BENCHMARK_PALANTIR.md:63-83`
ya legisla (procedencia citable, reproducibilidad, honestidad epistémica,
soberanía local, dominio, accesibilidad) **aplicadas al grano aduanal que
Foundry no baja a tocar**: el expediente de defensa por hallazgo, la
conformidad como serie SPC, la cobertura documental declarada, y un ciclo de
vida donde el sistema **contradice al operador cuando los datos no le dan la
razón** (§2, O1.3). No se compite en multi-analista, GIS profundo ni escala
petabyte — fuera por diseño, no por derrota.

---

## 1. Principios rectores (las leyes, aplicadas a este plan)

1. Los motores siguen siendo **lectura pura y determinista**; toda métrica
   nueva lleva test de doble corrida idéntica.
2. Toda escritura nueva (disposiciones, productos) pasa por **`Sustrato`**
   con bitácora WORM. Ninguna ruta escribe `ag_*` directo.
3. **Cero snake oil**: ningún detector nuevo inventa monto, umbral ni
   confianza. Los métodos estadísticos permitidos son bandas MEDIDAS
   (min–max, mediana±k·MAD con k declarado en ficha técnica), jamás un score
   opaco. Montos solo de CONCILIA/NOMOS, por divisa, sin conversión.
4. **El pipelegado no se toca.** Los detectores de insumos envenenados viven
   en el borde (los motores), leyendo lo materializado.
5. Visual: mock-first (HTML aislado → captura Nocturne+Daylight → visto bueno
   → instrumento real), solo tokens, magenta solo `--danger`/`--telos-on`,
   AAA ambos temas, `prefers-reduced-motion` degrada a estático, sin
   `Math.random` en render. Copy de UI en español registro accesible; la
   matemática se declara en ficha técnica plegable, no se grita.
6. **Verificar antes de legislar**: ninguna regla nueva de OLA 2 se
   implementa sin inspeccionar primero los datos reales (semántica de
   `leyenda`, formato de fechas, dirección del lag). Si el dato contradice la
   premisa, la regla se descarta y se documenta por qué — el precedente es
   `C.O + USA = J`.

---

## 2. Las olas

Orden por valor de negocio por unidad de esfuerzo. Cada ola es entregable y
demostrable por sí sola; ninguna deja el sistema a medias.

### OLA 0 — Deuda de paridad (S) — puede ejecutarse primero o en paralelo

- **O0.1 Tool Jarvis `validacion`** (lectura, mismo patrón que
  `conciliacion` en `jarvis/tools_grafo.py`): el operador pregunta por la
  conformidad en el chat y recibe reglas + violaciones citables.
- **O0.2 Métrica en el landing**: `estado.py` publica `conformidad_pct`;
  la constelación (`constelacion.js`) muestra conformidad en el nodo
  VALIDACIÓN como ya muestra `conciliado_pct` en CONCILIA.
- **O0.3 Export PNG/CSV en ambos tableros** reutilizando `qualia_export.js`
  (exhibit con pie de fuente: sesión, fecha, método). Sin visual nuevo: es
  cablear la convención existente.
- **O0.4 Selección cruzada `?sel=`** y dossier drawer compartido
  (`qualia_dossier.js`) en ambos tableros: clic en un chasis abre la ficha
  de negocio con sus hallazgos abiertos — la misma ficha que QUALIA ya usa.

**Aceptación:** paridad instrumental completa con QUALIA; cero regresiones
en tests existentes.

### OLA 1 — Ciclo de vida de hallazgos: el flujo de investigación (M)

La pieza central del plan.

- **O1.1 Esquema.** Nueva tabla `ag_disposiciones` en
  `database/models_autogenes.py`: `id`, `session_id`, `motor`
  CHECK ∈ (`concilia`,`validacion`,`nomos`), `clave`, `estado`
  CHECK ∈ (`nuevo`,`en_gestion`,`resuelto`,`descartado`), `nota`, `ts`,
  UNIQUE(`session_id`,`motor`,`clave`). **Sin columna de monto** — la
  disposición jamás monetiza; el monto vive en el hallazgo del motor.
  `ag_qualia_anomalias` NO se migra: ya embarcó, funciona, y la migración es
  churn sin valor (se documenta la coexistencia en QUALIA_ARQUITECTURA).
- **O1.2 Puerta única.** `Sustrato.disponer_hallazgo(motor, clave, estado,
  nota)` — upsert + bitácora WORM, calcado de `disponer_anomalia`
  (`sustrato.py:117-141`). Endpoint POST por tablero. La disposición es a
  nivel de hallazgo/regla (misma granularidad que QUALIA); la curación por
  unidad es la lente ERRORES y queda explícitamente fuera (§3).
- **O1.3 Estado declarado vs estado medido — el diferenciador honesto.**
  El motor re-deriva los hallazgos en vivo; la lectura los une a las
  disposiciones y **contrasta**: un hallazgo marcado `resuelto` que sigue
  vivo se muestra como contradicción ("marcado resuelto — pero sigue
  midiéndose"); una disposición cuya clave ya no existe se muestra como
  "resuelto y verificado por el motor". Palantir registra lo que el usuario
  dice; GNOSIS además responde si los datos le dan la razón. Copy exacto a
  visto bueno del operador.
- **O1.4 Consecuencias aguas abajo.**
  - Radar (`metabolismo.py`): las urgencias cuentan solo hallazgos NO
    dispuestos (`nuevo`/`en_gestion`); lo resuelto/descartado deja de gritar
    — gestión de atención real.
  - Grafo (`proyeccion.py`): los nodos Δ cargan `estado`; `grafo.js` pinta
    los dispuestos con tinta fantasma (contexto, no alarma) — presupuesto de
    tinta PANOPTES.
  - UI de tableros: pill de estado + nota en cada tarjeta, filtro por estado.
- **Tests:** puerta única (escritura fuera de Sustrato imposible), WORM,
  contraste declarado/medido en ambos sentidos, doble corrida de las
  lecturas.

**Aceptación:** un hallazgo puede gestionarse de punta a punta con rastro
WORM; el Radar distingue lo nuevo de lo gestionado; la contradicción
declarado/medido es visible y testeada.

### OLA 2 — Detectores nuevos: el pedimento como fuente real + fidelidad de insumos (M/L)

Cada detector es función pura en su motor, con doble corrida, refs citables
y clave estable (para el ciclo de vida de OLA 1). Orden de implementación =
orden de lista. **Protocolo: verificar semántica en datos reales ANTES de
codificar cada uno** (principio 6); el que no pase verificación se descarta
con nota en este documento.

En CONCILIA:

- **D1 `pedimento_sin_unidades`**: pedimentos de la sesión que ninguna fila
  DWH cita — declarado sin vendido. Determinista puro.
- **D2 `incoherencia_temporal`** (R8): `fecha_pedimento` anterior a
  `fecha_factura` en pares vinculados = hecho duro citable. El lag medido se
  reporta como distribución (percentiles medidos, método en ficha técnica),
  no como umbral inventado. *Gate: verificar formato/parseabilidad de ambas
  fechas; las fechas ilegibles se convierten en regla de VALIDACIÓN, no se
  ignoran.*
- **D3 `vin_inter_sesion`** (R7 completo): el mismo chasis vendido en más de
  una `processing_session` — reimportación o doble conteo histórico, con
  sesiones citadas (mes/año). Lectura transversal read-only; el precedente
  es `backtest_regla` (`nomos.py:100-134`).
- **D4 `patente_primeriza`** (R9, versión honesta): distribución de
  pedimentos por patente/aduana + señal de patente nunca vista en la
  historia de sesiones. Diferencia de conjuntos medida, no "score de
  riesgo".

En VALIDACIÓN:

- **D5 `importe_cero_sospechoso`**: `amount` que parsea exactamente a 0 en
  PDF (los `0,00` fabricados que AUDITORIA documenta en `PDFs_v2.py:813+`)
  y `precio` 0 en DWH → veredicto `observado`, tratados como ilegibles para
  toda monetización (no son ceros reales). El detector de borde contra el
  insumo envenenado, sin tocar el pipelegado.
- **D6 `j_sin_leyenda`**: fila PDF con `j_y_n = J` y `leyenda` vacía — la
  premisa de `C.O + USA = J` se vuelve parcialmente verificable con la
  columna que ya existe. *Gate: inspeccionar qué contiene `leyenda`
  realmente; si no porta la leyenda de trato, la regla se descarta y se
  documenta (mismo criterio que la regla USA original).*
- **D7 `vin_digito_verificador`**: aritmética ISO 3779 pura (tabla de
  transliteración + pesos), **aplicada SOLO a VINs de fabricación
  norteamericana (primer carácter 1–5)** — los VIN europeos no obligan el
  dígito y validarlos sería ruido masivo. Veredicto `observado`. La
  restricción de alcance se declara en la ficha técnica de la regla.
- **D8 `moneda_fuera_catalogo`**: `moneda` contra un catálogo ISO 4217
  mínimo sembrado con fuente declarada (las divisas del dominio: MXN, USD,
  EUR, BRL, JPY, INR + las observadas en historia). `observado`.

**Aceptación:** cada detector con test de doble corrida + test de refs
citables; los descartados por verificación, documentados con evidencia; el
flujo tri-fuente pasa a ser tri-fuente de verdad.

### OLA 3 — Expediente de defensa + cobertura (M)

El entregable que el equipo legal toca. Consume OLA 1 (estado) y opcionalmente
OLA 2 (más detectores = más expedientes).

- **O3.1 COBERTURA por hallazgo** (A4): campos derivados puros —
  `con_precio`/`sin_precio` (ya existen), % de unidades cuyo par PDF extrajo
  legible, % del valor del hallazgo respaldado por documento legible, y a
  nivel sesión: fracción del `valor_vendido_mxn` con respaldo documental
  pleno + el complemento declarado ("el N% del valor de esta sesión descansa
  en PDFs ilegibles"). El "piso, no techo" cuantificado.
- **O3.2 Expediente imprimible** (A8): vista servidor
  `/autogenes/expediente/<producto_id>` que renderiza el Producto dockeado
  (dossier CONCILIA o certificado VALIDACIÓN) como documento de defensa:
  hallazgo → filas completas → PDFs fuente (filename, y página cuando el
  artefacto la tenga) → regla y su norma → cronología de bitácora →
  cobertura. Hoja de estilos `@media print` con tokens — el navegador
  imprime a PDF; **cero dependencias nuevas, cero build step, cero assets
  externos.**
- **O3.3 Sello verificable** (C1-lite): el cuerpo del Producto lleva sha256
  de su JSON canónico; endpoint `verificar` que lo re-deriva. "Este
  expediente es re-derivable y su hash lo prueba" — la firma que ningún
  competidor da.

**Aceptación:** de "junta de pánico + semana de PDFs" a expediente
imprimible en minutos; hash verificable con test; cobertura con doble
corrida.

### OLA 4 — CONTROL: la sesión en su historia (S/M)

SPC transversal (A3) — el idioma de calidad que VW ya habla.

- **O4.1 Series por sesión**, cálculo puro en vivo (las sesiones son pocas;
  precedente transversal: `backtest_regla`): `conformidad_pct`,
  `valor_en_riesgo_mxn`, `pct_conciliado`, violaciones por regla.
- **O4.2 Señales medidas**: valor fuera del min–max histórico, o fuera de
  mediana±k·MAD con k fijo y declarado en ficha técnica. Nada de Western
  Electric sin declararlo; ningún pronóstico puntual.
- **O4.3 Superficie**: banda "la sesión en su historia" en ambos tableros
  (small multiples canvas, tokens, estático bajo reduced-motion) + señal en
  el Radar cuando el proceso cambió de régimen. Mock-first.

**Aceptación:** el operador ve si esta sesión es normal o anómala respecto a
su propia historia, con método declarado; doble corrida.

### OLA 5 — Convergencia NOMOS + veredicto en capas + uplift visual (M)

- **O5.1 Convergencia con NOMOS.** El tablero VALIDACIÓN muestra TRES
  familias: estructura (fija), catálogo (fija), norma de negocio (fijas +
  reglas NOMOS activas evaluadas vía `nomos.evaluar_reglas`, con su P&L y
  deep-link a NOMOS). Las reglas duras NO se migran a `ag_reglas` (son
  invariantes del dominio, no opiniones del operador); se unifica la
  presentación, no el almacenamiento.
- **O5.2 El volante insight→regla** (F11 ola 2 de la ruta crítica): desde un
  `error_confirmado` de SINAPSIS, botón "proponer regla" que prellena
  `Sustrato.crear_regla(origen='insight')` a un clic del operador. El ciclo
  detectar → confirmar → legislar se cierra.
- **O5.3 Veredicto en capas** `pasa/observado/rechazado` por regla, con el
  mapeo documentado (obligatorios/catálogo = rechazado; dígito verificador,
  leyenda, moneda, importe cero = observado). El mapeo exacto y su copy van
  a visto bueno del operador antes de codificar.
- **O5.4 Uplift visual VALIDACIÓN** (mock-first obligatorio): hoy es el
  tablero visualmente más débil (lista de tarjetas). Forma héroe propuesta:
  **retícula de conformidad** — cada fila DWH/PDF una celda coloreada por su
  peor veredicto (reutilizando el patrón de retícula de SINAPSIS,
  `sinapsis.js:169-310`), foco único = `conformidad_pct` monumental, ≥85%
  del lienzo, tinta fantasma para lo conforme. CONCILIA conserva su Sankey
  (es bueno); recibe pills de estado (OLA 1) y chip de cobertura (OLA 3).

**Aceptación:** una sola página responde "¿qué norma rige y quién la viola?"
con las tres familias; el volante insight→regla funciona con rastro WORM;
capturas antes/después en ambos temas.

---

## 3. Lo que NO se hace (y por qué)

- **R4 monetizado (arancel recuperable por preferencia no usada):** exigiría
  un catálogo fracción→tasa que NO existe en la base. Inventarlo es snake
  oil. Queda **condicionado**: si el operador aporta el catálogo arancelario
  como artefacto con fuente, se habilita; mientras, el tablero lo declara
  como ignorancia conocida (patrón C2 · LO-NO-SABIDO). No prometer lo que no
  se puede citar.
- **Conversión de divisas:** jamás, bajo ninguna ola. Por divisa, siempre.
- **Scoring ML / confianzas opacas:** nada. Solo aritmética citable y bandas
  medidas con método declarado.
- **Curación por unidad / re-extracción asistida de PDFs:** es la lente
  ERRORES de la ruta crítica — otro plan, otro alcance. Aquí solo se
  detecta y dispone a nivel hallazgo.
- **Migrar `ag_qualia_anomalias` a la tabla general:** churn sin valor de
  negocio; coexistencia documentada.
- **Watchlists como subsistema propio (R10/B3·CENTINELA):** una watchlist de
  chasis/factura ES una regla NOMOS (`campo=chasis`). Si se quiere azúcar de
  autoría ("vigilar este VIN" a un clic), es una extensión de O5.2, no un
  motor nuevo. CENTINELA completo (suscripciones + notificación) queda para
  el plan SUPRA_PALANTIR.
- **Multi-usuario, asignaciones, GIS, tiempo real:** fuera por diseño
  (`BENCHMARK_PALANTIR.md:96-103`).

## 4. Riesgos y condiciones de parada

1. **Semántica de datos incierta** (`leyenda`, formatos de fecha, dirección
   del lag): parar, inspeccionar datos reales, y si sigue ambiguo, preguntar
   a Jesús con la evidencia en la mano. Nunca codificar la duda.
2. **Insumos envenenados aguas arriba** (AUDITORIA §87-114): este plan los
   DETECTA en el borde (D5), no los corrige — corregir extracción exige las
   fixtures ancladas a PDFs reales que AUDITORIA recomienda, y eso es
   territorio del pipelegado (intocable). Si un detector de borde revela
   envenenamiento masivo, reportarlo antes de seguir.
3. **Rendimiento transversal** (D3, D4, OLA 4 leen todas las sesiones): si
   la historia crece, medir antes de optimizar; no cachear sin declarar la
   caché y su invalidación.
4. **Copy de negocio** (contradicción declarado/medido, veredicto en capas):
   siempre a visto bueno del operador antes de embarcar — es su idioma ante
   el SAT.

## 5. Instrucciones de ejecución para Opus 4.8

1. **Leer primero:** `CLAUDE.md` (las leyes), este plan completo,
   `docs/QUALIA_ARQUITECTURA.md` (los patrones a calcar: puerta única,
   dossier drawer, export, ficha técnica) y `docs/PLAN_QUALIA_UPLIFT.md`
   §gramática de acordes (la vara visual).
2. **Ramas:** desarrollar en `claude/gnosis-autogenes-i-85bwsd-2zxb65`,
   espejar cada commit a `claude/gnosis-autogenes-i-85bwsd`. Nunca resetear;
   apilar. Push con `-u` y reintentos exponenciales ante fallo de red.
3. **Orden:** OLA 0 → 1 → 2 → 3 → 4 → 5. Dentro de cada ola, el orden
   listado. No abrir una ola sin cerrar los gates de la anterior. OLA 0
   puede intercalarse si desbloquea demos.
4. **Por tarea de motor:** test primero (incluida doble corrida idéntica
   para toda métrica nueva), implementación pura, luego superficie. Por
   tarea visual: mock HTML aislado → captura headless Nocturne+Daylight
   (deviceScaleFactor 2) → visto bueno de Jesús → instrumento real →
   captura antes/después.
5. **Verificación de datos (OLA 2):** antes de cada detector, inspeccionar
   las columnas implicadas en la base real de la sesión sembrada (harness de
   preview en scratchpad; recrearlo si la sesión no lo tiene). Documentar en
   el commit qué se verificó. Detector que no pasa verificación → se
   descarta y se anota en §3 de este documento con la evidencia.
6. **Gates antes de declarar cada tarea terminada:**
   `python3 -m ruff check .` y `npx eslint static` (0 errores),
   `python3 -m pytest tests/ -q` verde (baseline 315), captura en ambos
   temas si hubo cambio visual, re-lectura del diff contra las leyes.
7. **Commits:** Conventional Commits en inglés, un cambio lógico por commit
   (`feat(concilia): …`, `feat(validacion): …`, `feat(sustrato): disposition
   gate`, `docs(plan): …`). Nunca mezclar olas en un commit. Sin PR salvo
   petición explícita de Jesús.
8. **Parar y preguntar** (AskUserQuestion) ante: semántica de datos ambigua
   tras inspección, cualquier esquema nuevo más allá de `ag_disposiciones`,
   el mapeo de veredictos (O5.3), el copy de contradicción (O1.3), o
   cualquier tentación de tocar el pipelegado.
9. **Actualizar este documento** al cierre de cada ola: estado, decisiones,
   detectores descartados con evidencia. El plan es rector, no decorativo.

## Bitácora de ejecución

- **OLA 1 — COMPLETA** (commits `a01da80` backend, `d757e76` visual).
  Ciclo de vida de hallazgos de punta a punta: tabla `ag_disposiciones` (sin
  columna de monto), puerta `Sustrato.disponer_hallazgo` + bitácora WORM,
  lectura pura `autogenes/disposiciones.py` que contrasta declarado vs medido
  (`contradice`, `resoluciones_verificadas`), endpoints por tablero,
  severidad como fuente única en los motores. UI: `static/ciclo_vida.js`
  compartido (ledger de triaje, filtro, control segmentado, traza de
  procedencia, banda de contradicción, tira de verificados) en ambos
  tableros; ghost-ink de los Δ dispuestos en `grafo.js`; Radar cuenta solo
  violaciones abiertas. Se arregló de paso un bug latente: `concilia.css`
  citaba tokens fantasma (`--s1/--s2/--linea`) que nunca resolvían — las
  tarjetas ahora rinden como su diseño original previó. Verificado en vivo
  (POST → re-deriva → contradicción) en Nocturne y Daylight. 14 tests nuevos;
  suite 478 verde. Decisión de diseño ratificada por el operador: pills en
  acento, magenta sólo en la contradicción, selección en acento (no magenta).
  - Pendiente menor: la disposición de NOMOS (motor admitido por el esquema)
    no tiene UI aún — se atará cuando NOMOS deje de estar «Latente».
  - **Rediseño del caudal (post-O1):** la «Anatomía del caudal» pasó de un
    Sankey-tabla (chips con texto truncado, sin foco, no escalaba) a una
    **escalera de derivaciones tipo P&ID** en SVG determinista: espina
    VENDIDO→CONCILIADO→LLEGADO, cada fuga es una estación con código FG,
    severidad, monto y título COMPLETO; sólo la fuga en foco arde, el resto
    es fantasma; la estación es blanco de clic accesible (teclado) y su foco
    sincroniza con la lista y la ficha. Crece por peldaños — escala por
    construcción. Color desde tokens (el cambio de tema no redibuja). Medio:
    SVG (no canvas) — decisión consciente avisada, pues vuelve imposible el
    bug de texto truncado y es vanilla (no toca la ley de sin-bundler).
- **OLA 2 — COMPLETA** (commits `4990887`, `9023dd5`, `f1b5008`). El
  antes/después completo del backend vive en
  `docs/OLA2_CONCILIA_VALIDACION_ANTES_DESPUES.md`. Resumen: la verificación
  de datos reales (gate del plan) descartó 2 detectores como ruido (D4
  patente desalineada, D6 leyenda solo-fila-0) y reformó 2 (D2 fechas →
  regla `val-dwh-fecha`; D7 dígito verificador → `val-*-vin-chars` I/O/Q).
  Embarcaron: CONCILIA `pedimento_sin_unidades` + `vin_inter_sesion`, y el
  endurecimiento de honestidad (ceros fabricados/vacíos ya no cuentan como
  $0 real — `valor_en_riesgo` sin cambio, conteos "sin precio" crecen);
  VALIDACIÓN +6 reglas (16→22): fecha, precio-cero, importe-cero, vin-chars
  ×2, moneda-cat. La regla de casamiento y los 8 hallazgos originales,
  intactos. 486 tests verdes; verificado end-to-end en la escalera del
  caudal (9 estaciones, escala por construcción) y en VALIDACIÓN.
- **OLA 0 — pendiente** (paridad con QUALIA: tool Jarvis de validación,
  métrica de conformidad en el landing, export PNG/CSV, `?sel=`). No
  bloquea; se intercalará cuando se pida.

## 6. Criterios de aceptación globales

- Ningún número nuevo sin unidad, periodo y fuente; ningún monto fuera de
  CONCILIA/NOMOS; toda métrica nueva con doble corrida verde.
- `Sustrato` sigue siendo el único escritor de `ag_*`; bitácora WORM cubre
  toda disposición; `ruff` + `eslint` limpios; suite completa verde.
- El flujo completo es demostrable: detectar (motores) → disponer (OLA 1) →
  documentar (dossier/certificado) → defender (expediente imprimible con
  sello) → vigilar (SPC + Radar) — el hueco del benchmark, cerrado en el
  grano aduanal donde Palantir no baja.
