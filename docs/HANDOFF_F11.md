# HANDOFF — retomar en F11 · SINAPSIS

Estado al cierre de la sesión del 2026-07-11, branch
`claude/gnosis-autogenes-i-85bwsd` (187 tests verdes, ruff limpio en
`autogenes/ tests/ jarvis/`).

## Qué está VIVO (F1–F10 completos)

- **Sustrato AUTOGENES** (F1–F6): `sustrato.py` único escritor de `ag_*`,
  proyección read-time (`proyeccion.py`), grafo/lienzos, ingesta con
  extracción citada + quórum, SÍNTESIS (informe citado + saneador),
  caminos, Radar, metabolismo.
- **QUALIA** (F7): topología pura (`topologia.py`, sin NetworkX adentro,
  determinista), anomalías vs base del operador (`anomalias.py`,
  `qualia.py`), cascada what-if, horizonte, 7 instrumentos
  (`/autogenes/qualia*`: red, orbe, cuerdas, terreno, cascada,
  horizonte, máquina C2 con lectura SYNESIS + **dockear el parte**).
- **Gnosis AI sobre el grafo** (F8): 7 tools de grafo en
  `jarvis/tools_grafo.py` → `autogenes/consultas.py` (expediente,
  camino, vecindario, resumen, señales, hallazgos, conciliacion) con
  citas fragmento→página→PDF, ofuscación recursiva de chasis, ley de
  citas en `prompts.py`. DeepSeek default (`llm_interface.py`).
- **CONCILIA** (F9): `concilia.py` — motor de hallazgos sobre los
  verdictos del pipeline legado (misma regla de casamiento que la
  proyección: chasis + prefijo factura 8), monetización honesta por
  moneda, valor en riesgo por unidad DISTINTA, what-if de cupos con
  run-rate medido, dossier de defensa (producto sin tope), lookup por
  VIN (`estado_vin`). Dashboard CNC-01 con **Anatomía del Caudal**
  (Sankey canvas determinista, chips magenta por hallazgo, tap⇄ficha).
- **VALIDACIÓN** (F10): `validacion.py` — 16 reglas deterministas
  (obligatorios, VIN 17 ISO 3779, catálogo, país, norma BRA=N/IND=N;
  «USA=J» deliberadamente NO evaluada: la premisa C.O. no está en las
  tablas), reglas en cero se reportan, certificado dockeable, urgencia
  de norma en el Radar (crítica solo con jn-norma = glosa segura).
  Dashboard VLD-02.

## Leyes que NO se negocian

1. Cero snake oil: todo número es salida de motor; sin base/historia no
   hay hallazgos y se dice por qué. Nunca estimar montos ni convertir
   monedas.
2. Procedencia: entidades extraídas citan fragmentos reales; saneadores
   corren EN SERVIDOR; productos jamás fabrican evidencia (los que citan
   filas aduanales llevan `evidencia=[]`).
3. Brand OS: acento real solo en SVG/canvas; texto en `--acc-text`;
   magenta `--danger` SOLO para alertas medidas (la selección no es
   alerta); tokens siempre, hex jamás; temas Nocturne/Daylight con
   re-lectura en `#theme-toggle`+60ms; prefers-reduced-motion degrada
   sin quitar información; esc() para todo texto de documento.
4. El operador dirige lo visual con capturas reales antes/después.
5. Secrets solo en `.env` (gitignoreado; recrearlo cada sesión — el
   contenedor es efímero). **Pedir a Julio rotar la llave DeepSeek.**
6. Commits Conventional, push SOLO a `claude/gnosis-autogenes-i-85bwsd`.

## F11 · SINAPSIS (siguiente) — dirección A PROPONER antes de codificar

Insights por recombinación verificada: cruzar motores existentes
(CONCILIA × QUALIA × VALIDACIÓN × grafo) buscando conjunciones que
ningún motor ve solo — p. ej. "el puente crítico del grafo es también
la unidad en disputa J/N", "el cupo se agota antes que el run-rate de
llegadas conciliadas". Cada insight DEBE ser: (a) verificado contra los
motores que lo componen, (b) citado, (c) descartable por el operador,
(d) convertible en regla (volante insight→regla, antesala de NOMOS
F12). El grafo que se reconfigura: los insights dockeados como
productos que re-anclan entidades. Obtener aprobación de dirección de
Julio ANTES de escribir código.

## Después de F11

F12 NOMOS (reglas como ciudadanos del grafo, P&L por regla,
backtesting) · endurecimiento backend (blueprints, auth, CI, backups,
Pydantic en fronteras API, upgrades Flask/pypdf, jobs en background) ·
pendientes menores: vendorizar Bootstrap, batching de extracción >24
fragmentos, quórum paralelo, UI de bitácora.

## Verificación visual

`preview_server.py` en el scratchpad (puerto 5077; siembra
`preview.db`, espeja todas las rutas; `PREVIEW_LIVE_LLM=1` + exportar
`.env` para LLM vivo — OJO: `load_dotenv` de app.py apunta al PADRE del
repo, exporta a mano). Matar y relanzar tras editar backend/templates.
Capturas con Chromium `/opt/pw-browsers/chromium-1194/...`, tema vía
`localStorage['gestell-theme']` + reload. Si los scripts no existen,
recréalos (siembran con `Sustrato` y llaman las rutas reales).
