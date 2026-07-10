# HANDOFF — GNOSIS · AUTOGENES → F7 · Qualia

Retomas el trabajo de **GNOSIS · AUTOGENES** exactamente donde quedó. Todo el
desarrollo vive en el branch **`claude/gnosis-autogenes-i-85bwsd`** — desarrolla,
commitea y pushea SIEMPRE ahí, tanto en `/home/user/GNOSIS` como (si aplica)
`/home/user/KARELEN`. Si el branch no existe localmente, créalo desde ese mismo
nombre remoto. Nunca pushees a otro branch.

## Quién soy y cómo trabajas conmigo

- Me llamo **Jesús** (el `CLAUDE.md` de KARELEN dice "Julio" — está mal, ignóralo).
- **NUNCA escribas código sin mi autorización explícita.** Apruebo dirección por fase.
- El operador (yo) dirige **TODO el diseño visual de los dashboards**: antes de
  construir cualquier UI te detienes y me muestras opciones/mock; no la
  construyes hasta que elija.
- Verifica siempre lo visual con **capturas reales** (Chromium headless) antes de
  declarar algo terminado. Muéstrame antes/después.
- Sé **riguroso, honesto y objetivo — no afable**. Empuja con razones.
- Secretos SOLO en `.env` local (gitignoreado), jamás en el repo.
- Commits convencionales; termina cada mensaje de commit con:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CCAb64NhrJH2BkF6fJ4VYc
  ```
  No pongas el id del modelo en ningún artefacto del repo.

## Qué es esto

Porté el sustrato de grafo de evidencia AUTOGENES desde KARELEN (Next.js/TS,
"UMWELT") a GNOSIS (Python 3.11 / Flask, analítica aduanal de importación de
autos del Grupo VW México). Meta: convertir GNOSIS en "un súper Palantir por
aplicación". GNOSIS = un solo `app.py`, `sqlite3` crudo (sin ORM), Jinja2 +
Bootstrap 5 + JS vanilla. Grano de trabajo = `processing_session`; grano de
entidad = vehículo por `chasis` (VIN) + `auto_code`, agrupado por `pedimento`.
La referencia congelada de KARELEN está vendida en `autogenes/ref_karelen/`
(los `.test.ts` son la especificación de comportamiento de cada port a Python).

Lee primero `docs/RUTA_CRITICA_AUTOGENES.md` (v1.1): la ruta crítica aprobada
F0–F12 + los dashboards CONCILIA/VALIDACIÓN/SINAPSIS/NOMOS + el endurecimiento
de backend.

## Invariantes de arquitectura (no negociables)

- **Ley de procedencia:** las entidades extraídas ("synesis") DEBEN citar ids de
  fragmento reales; las del operador cargan su `origen` como procedencia; borrar
  una fuente hace cascada podando la evidencia. Los saneadores corren en
  servidor para que un modelo no pueda fabricar procedencia.
- **SQLite es la verdad.** NetworkX es una lente en memoria construida por sesión
  bajo demanda, cacheada, nunca persistida (clave de caché = marca de agua de
  bitácora + conteos + fingerprint de contenido).
- **Capa LLM:** DeepSeek (API OpenAI-compatible) es el DEFAULT; Claude/Anthropic
  es fallback activable solo en admin; Ollama es opción offline. El formato
  interno de mensajes es estilo Anthropic; converters traducen a OpenAI en la
  frontera de DeepSeek. **Quórum:** corre 2 proveedores distintos disponibles y
  marca acuerdo por entidad; con uno solo degrada a un modelo (`quorum=False`) —
  nunca bloquea. El quórum se reserva para extracción/hallazgos; los informes se
  redactan con el proveedor activo.
- **Brand OS** (`static/styles.css`): el cian GNOSIS es la singularidad activa.
  Color real `--acc-solid` SOLO en fills SVG/canvas; texto y gráfico fino usan la
  variante AAA por modo `--acc-text` (el canvas lee `--acc-text` y la re-lee al
  alternar tema). Magenta `--danger` reservado para alertas REALES. Temas
  Nocturne (oscuro, default) ↔ Daylight (claro). `prefers-reduced-motion` congela
  toda animación. Visuales deterministas (nada de `Math.random`). Lenguaje de
  trazo Z.O.E./Shinkawa: facetas, dog-legs con ticks de codo, corchetes,
  esquirlas.
- **Restricción de red:** el proxy del entorno BLOQUEA CDNs y `api.deepseek.com`.
  NO hay dependencias JS externas (motor de fuerzas propio en `static/fuerzas.js`)
  y las llamadas LLM en vivo fallan aquí. Para probar el LLM en vivo hay que
  habilitar `api.deepseek.com` en la política de red, y recrear
  `/home/user/GNOSIS/.env` con `DEEPSEEK_API_KEY` (efímero, gitignoreado — no
  existe en sesión nueva; **rota la llave**). Mientras tanto se verifica con
  proveedores guionados.

## Qué YA está hecho (backend probado + UI verificada visualmente)

Backend del sustrato en `autogenes/`: `tipos.py` (Pydantic), `sustrato.py`
(ÚNICO escritor de las tablas `ag_*`, con toda la ley de mutación y la cascada de
procedencia), `proyeccion.py` (proyecta tablas aduanales + `ag_*` a
`{nodos, enlaces}` de solo-lectura), `red.py` (lente NetworkX cacheada),
`estado.py` (métricas vivas), `caminos.py` (F3: camino más corto citado,
vecindario, hubs), `ingesta.py` + `extraccion.py` (F4: ingestar PDF/TXT,
extracción citada con quórum y saneador HITL), `senales.py` (F5), `informe.py`
(F6). Esquema en `database/models_autogenes.py` (tablas `ag_artefactos`/
`fragmentos`/`entidades`/`relaciones`/`eventos`/`productos`/`bitacora`, todas
scoped por `session_id`). Capa LLM en `jarvis/llm_interface.py` +
`jarvis/quorum.py`. Config en `database/config.py`.

Frontend autocontenido en `static/`: `fuerzas.js` (motor de fuerzas), `grafo.js`
(lienzo del caso), `vinculos.js` (F3), `dendro.js` + `ingesta.js` (F4),
`constelacion.js` (navegador de constelación P3₂) + `constelacion.css` (layout
compartido `.ag-landing`/`.ag-panel`/`.gr-*`), `veredicto.js` (terminal héroe del
home), `sintesis.js` + `sintesis.css` (F6). Plantillas `autogenes*.html`.
`main.html` y `base.html` ya integran la constelación y el nav "Autogenes".

Fases completadas:

- **F0–F3:** sustrato, proyección, lente NetworkX, estado vivo, constelación
  navegable, lienzo del grafo, Vínculos (caminos citados dockeables).
- **F4 · Ingesta:** `/autogenes/ingesta` — leer PDF/TXT → artefacto+fragmentos,
  extracción citada por documento con revisión HITL, dendrograma de la ontología.
- **F5 · Radar de atención (señales):** vencimientos, fuentes frías, huérfanas,
  negocio.
- **Diagrama radar** (Radar · Avance del Caso), ruta `/autogenes/radar`: diagrama
  de flujo por etapas Fuentes→Fragmentos→Entidades→Relaciones→Productos que
  muestra, por etapa, lo recibido vs lo procesado y lo que queda pendiente, más un
  medidor central "AVANCE DEL CASO %" y un riel de urgencias. Toda la copia
  visible es funcional/instruccional, sin jerga. Archivos:
  `templates/autogenes_radar.html`, `static/metabolismo.js`,
  `autogenes/metabolismo.py` (nombres de archivo heredados — candidatos a
  renombrar a `radar.*`; **NO reintroduzcas ninguna metáfora en la copia visible,
  hay un test que lo vigila**).
- **F6 · Síntesis (RECIÉN TERMINADA):** informe ejecutivo citado.
  - Backend `autogenes/informe.py`: `construir_digesto` (proyección acotada del
    grafo, muestreo round-robin de fragmentos), `sanear_informe` (ley de
    procedencia: un punto sobrevive solo si cita fragmentos/entidades reales),
    `redactar_informe` (lee el grafo, llama al proveedor activo, SANEA en servidor
    y devuelve también el digesto), `dockear_informe` (dockea como
    `Producto{clase:"informe"}` con evidencia/entidades ancladas, re-saneando).
    Endpoints `/api/v1/autogenes/sintetizar` y `/sintesis/dockear`.
  - UI `static/sintesis.js` + `sintesis.css` + `templates/autogenes_sintesis.html`
    en `/autogenes/sintesis`: split de TRES columnas Digesto ◂ Informe ▸ Cita
    (grid propio `.sn-marco` `300px 1fr 320px` — **NO uses `.gr-marco` que es de 2
    columnas**), con trazas de cita dog-leg Z.O.E. del punto del informe a su nodo
    de procedencia en el digesto; acento AAA por modo, congela con reduced-motion.
    Verificado en Nocturne y Daylight.

**Tests:** `python3 -m pytest tests/ -q` → **63 en verde**. Lint:
`ruff check autogenes/ tests/`. JS: `node --check static/<archivo>.js`.
(El import de `app.py` falla por una dependencia opcional `tabula` preexistente e
inconexa; `app.py` compila con `python3 -m py_compile app.py`. Los ~30 errores de
ruff en `app.py` son preexistentes; mantén limpio SOLO `autogenes/` y `tests/`.)

## Qué falta (ruta crítica) — próxima fase = F7

- **F7 · Qualia (la XL):** port completo (~40 archivos de KARELEN): topología de
  red (comunidades, puentes, renormalización), anomalías, su propio store,
  endpoint narrativo, ~8 canvases; mejoras de servidor (snapshots automáticos,
  baselines entre sesiones, drift). Su instrumento en la constelación ya enlaza
  `/autogenes/qualia`. **ES LA SIGUIENTE FASE** — confirma autorización conmigo
  antes de escribir código, y detente conmigo en el diseño visual de sus canvases
  antes de construir UI.
- **F8 · Gnosis AI sobre el grafo:** nuevas tools SQL/grafo (`expediente_entidad`,
  `camino_entre`, `vecindario`, `senales_caso`, `resumen_grafo`,
  `hallazgos_pendientes`) que responden con citas fragmento→página→PDF; DeepSeek
  default vía la capa de proveedores.
- **F9 · CONCILIA:** motor de hallazgos + conciliación tri-fuente (DWH vendido vs
  facturas llegadas vs pedimentos declarados), hallazgos monetizados, dossier de
  defensa, afirmaciones en competencia, what-if de cupos. (Nota: un visual de
  balance de flujo pre/post encaja bien con la conciliación de CONCILIA.)
- **F10 · VALIDACIÓN + ERRORES**, **F11 · SINAPSIS** (insights por recombinación
  verificada, grafo que se reconfigura, volante insight→regla), **F12 · NOMOS**
  (reglas de negocio como ciudadanos del grafo, P&L por regla, backtesting, mapa
  de cobertura).
- **Endurecimiento transversal de backend** (gunicorn/health hechos; falta:
  separar `app.py` en blueprints, upgrades Flask/pypdf, jobs en background, auth
  de operador, Pydantic en las fronteras de API, CI en GitHub Actions, backups +
  export a bundle JSON).

## Cómo verificar lo visual

Herramienta local (scratchpad, **NO en el repo**): `preview_server.py` siembra
una `preview.db` con ~140 vehículos + sustrato de ejemplo y espeja todas las
rutas AUTOGENES; para F4/F6 monkeypatchea `seleccionar_proveedor` con un
proveedor guionado (el LLM en vivo está bloqueado). `shot_sintesis.py` captura
con Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, puerto 5077);
el tema se controla con `localStorage['gestell-theme']='light'|'dark'` + reload,
**NO con `color_scheme` del SO**. IMPORTANTE: el preview cachea módulos y
plantillas — mátalo y relánzalo (`pkill -9 -f preview_server.py`; relaunch) tras
editar backend o plantillas. Si no tienes esos scripts, recréalos: siembran una
sesión con `Sustrato` y llaman las mismas rutas del app.

## Habilitar DeepSeek (para LLM en vivo)

1. **Política de red del entorno:** agrega a la allowlist de salida
   `api.deepseek.com` (HTTPS / 443). Es el único host del proveedor
   (`https://api.deepseek.com/v1/chat/completions`). No hace falta abrir CDNs.
2. **En CADA sesión nueva** (el contenedor es efímero y `.env` está gitignoreado):
   recrea `/home/user/GNOSIS/.env` con `DEEPSEEK_API_KEY=sk-...`. **Rota la llave**
   antes (la anterior viajó por chat). Fallback opcional de Claude:
   `ANTHROPIC_API_KEY` en `.env` + `llm_fallback_claude=on` en admin.

## Arranque sugerido

Empieza **F7 · Qualia** leyendo `autogenes/ref_karelen` (los archivos de Qualia y
sus `.test.ts`) para inventariar el port, PERO primero **pídeme autorización** y
propónme la **dirección visual** de los canvases de Qualia — no construyas UI
hasta que yo elija. Recuerda: para probar el LLM en vivo, habilita
`api.deepseek.com` en la política de red y recrea `/home/user/GNOSIS/.env` con
`DEEPSEEK_API_KEY`.
