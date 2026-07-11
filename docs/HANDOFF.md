# HANDOFF — estado vivo del proyecto (supersede HANDOFF_F11)

Estado al cierre del hito **13 tableros** (2026-07-11), branch
`claude/gnosis-autogenes-i-85bwsd` (221 tests verdes; ruff limpio en
`autogenes/ tableros/ tests/ jarvis/` — mismo alcance que CI).
Historia previa: `HANDOFF_F7.md`, `HANDOFF_F11.md`,
`RUTA_CRITICA_AUTOGENES.md`, `MASTER_DATA_FALLBACK.md`.

## Qué está VIVO

**F1–F10** (detalle en HANDOFF_F11): sustrato AUTOGENES (`sustrato.py`
único escritor de `ag_*`, proyección read-time, ingesta citada con
quórum, SÍNTESIS, Radar), QUALIA (topología pura + 7 instrumentos),
Gnosis AI sobre el grafo (7 tools con ley de citas), CONCILIA (motor de
hallazgos + Caudal + dossier), VALIDACIÓN (16 reglas + certificado).

**F11 · SINAPSIS** — `autogenes/sinapsis.py`: `componer_insights` puro
sobre salidas de motores (conjunciones que ningún motor ve solo),
`componer_reticula` (lattice de refinamiento de particiones sobre los
veredictos por fila de CONCILIA — Hasse en canvas), `dockear_insight`
(producto citado). Dashboard bipartito SNP-03; cada insight liga
«regla →» que pre-llena NOMOS vía URLSearchParams (`origen=insight`).

**F12 · NOMOS** — `autogenes/nomos.py` + tabla `ag_reglas` (Sustrato:
`crear_regla`/`alternar_regla`/`leer_reglas`, allowlist de campos
{pais_code, j_y_n, auto_code, factura, chasis}, ley aditiva).
`evaluar_regla` = unidad AND McCulloch-Pitts honesta (entradas 0/1,
θ=n, pesos unitarios), `backtest_regla` contra las filas reales de la
sesión. UI bipartita NMS-04 con lenguaje SOLO de negocio (nada de
neuronas/oráculos), diagrama respirando en panel derecho 3fr.

**F13 · CRONOS** — `autogenes/cronos.py`: time travel ADITIVO del
sustrato por `created_at` (`momentos` desde la bitácora WORM,
`estratos`, `estado_en`). Límites declarados por el motor: los borrados
no resucitan, las entidades fusionadas muestran su forma actual, las
tablas aduanales no llevan timestamp por fila (CRONOS viaja el
SUSTRATO). UI CRN-05.

**Endurecimiento** — CI (`.github/workflows/ci.yml`: ruff + pytest),
`/api/v1/autogenes/exportar` (bundle JSON), `/api/v1/autogenes/bitacora`,
gate opcional `GNOSIS_TOKEN` → header `X-Gnosis-Token` en mutaciones.

**MASTER DATA FALLBACK GNOSIS:AUTOGENES** — congelado en `3249704`;
anchor-branch remoto `master-data-fallback-gnosis-autogenes` (el tag
git solo puede pushearlo el operador: 403 de org para tokens de
sesión). Recetas de restauración en `docs/MASTER_DATA_FALLBACK.md`.

**TBV · Tableros VW de negocio** (nota «Acuerdos VW Gnosis Front») —
paquete `tableros/` (NO autogenes): `fechas.py` (parseo tolerante que
jamás adivina), `dominio.py`, `maduracion.py`, `rechazos.py`,
`cupo.py`, `rutas.py`. Cinco páginas bipartitas (insight izquierda,
lienzo pirotécnico derecha) + índice `/tableros`:

- **TBV-01 Maduración** — espectro de ticks reales por marca,
  percentiles nearest-rank, toggle de marca. Negativos (venta antes de
  importar) = anomalía declarada.
- **TBV-02 Dominio** — escalera de rangos (bump) por
  mes/trim/sem/año; sin ventas = None, jamás se interpola.
- **TBV-03 Rutas** — Web Mercator a mano, teselas
  `tile.openstreetmap.org` (autorizar ese dominio), arcos país→aduana
  por volumen real. Origen = centroide del país (declarado); puertos
  marítimos con coordenadas OFICIALES SEMAR (comentadas GMS por
  entrada en `rutas.py`); lo no ubicable va a `sin_geo`, no se dibuja.
  Sin teselas → retícula declarada (degradación honesta).
- **TBV-04 Rechazos** — Pareto de razones (facturas_errores +
  faltantes), acumulado, guía 80%, archivos citados; error_type vacío
  se confiesa.
- **TBV-05 Cupo** — cascada de agotamiento de seguimiento_mensual,
  corte en el mes de la sesión, futuros excluidos y declarados (sin
  proyección por acuerdo; el what-if vive solo en CONCILIA).

Las cinco tarjetas viven además en el **Selector de Análisis** del
dashboard principal (13 tableros) con **miniaturas reales** dibujadas
de sus propios APIs (`SW_TBV` + `tbvMini*` en `main.html`).

**Endurecimiento (ola de blueprints)** — contrato de errores honesto:
los `HTTPException` (404/405/413) conservan su código y las rutas `/api/`
responden JSON (antes todo se enterraba como 500). `tests/test_http_rutas.py`
importa la app REAL contra una DB temporal y ejerce cada familia de rutas
(páginas 200, APIs GET 200 JSON, POST-only 405, desconocida 404, sin
sesión 404) — es el contrato que protege el split. `app.py` bajó de
2848→1702 líneas: las herramientas del pipeline legado se importan
perezosamente (la app importa sin tabula/bokeh/matplotlib, CI corre la
red HTTP con deps mínimas) y `ruff.toml` declara el E402 deliberado
(load_dotenv antes de imports). Paquete `rutas/`:
- `rutas/comun.py` — helpers de sesión compartidos (`_sesion_activa`,
  `_etiqueta_sesion`, `_con_sesion`: contrato de estado vacío honesto).
- `rutas/tableros.py` — blueprint TBV (10 rutas).
- `rutas/autogenes.py` — blueprint del sustrato completo (~45 rutas +
  `AUTOGENES_SECCIONES`).
Lo que sigue en `app.py`: pipeline legado `/procesar` (acoplado al stack
pesado y a uploads/downloads — se deja a propósito), sessions/insumos,
admin/llm, chat, errores, dashboard raíz y error handlers. Extraer esas
familias menores es continuación trivial con el mismo patrón.

## Leyes que NO se negocian

1. **Cero snake oil**: todo número es salida de motor; sin datos se
   declara por qué. Nunca estimar montos ni convertir monedas.
2. **Procedencia**: entidades extraídas citan fragmentos reales;
   saneadores EN SERVIDOR; productos jamás fabrican evidencia.
3. **Brand OS**: tokens siempre, hex jamás; magenta `--danger` SOLO
   para hechos medidos (selección ≠ alerta); re-dibujo en
   `#theme-toggle`+60ms; `esc()` para texto de documento;
   prefers-reduced-motion degrada sin quitar información.
4. El operador dirige lo visual con capturas reales antes/después y
   aprueba dirección antes de código nuevo.
5. Secrets solo en `.env` (gitignoreado; recrear cada sesión).
   **Sigue pendiente: rotar la llave DeepSeek que viajó por chat.**
6. Commits Conventional; push SOLO a
   `claude/gnosis-autogenes-i-85bwsd`.

## Pendientes (en orden)

1. **Operador**: rotar llave DeepSeek; autorizar dominio
   `tile.openstreetmap.org`; pushear el tag inmutable
   (`git tag -a master-data-fallback-gnosis-autogenes 3249704 &&
   git push origin master-data-fallback-gnosis-autogenes`); decidir
   merge a main.
2. **Coordenadas terrestres TBV-03**: Nuevo Laredo, Colombia, Cd.
   Juárez, Tijuana, AICM y Toluca siguen con ancla de ciudad — ANAM/
   DOF/CILA bloquean fetch automatizado (403 WAF); los 9 puertos
   marítimos ya son SEMAR oficial. Si el operador comparte el catálogo
   de recintos de Barbelo, alinear.
3. **Endurecimiento diferido restante**: extraer a blueprints las
   familias menores que aún viven en `app.py` (sessions/insumos, chat,
   admin/llm, errores) — trivial con el patrón de `rutas/`; el pipeline
   legado `/procesar` se deja por su acople al stack pesado. Subir
   Flask/pypdf (PyPDF2 está deprecado); batching de extracción; quórum
   paralelo. (Hecho ya: red de rutas HTTP, status honestos, `app.py`
   ruff-limpio y en CI, split de tableros + autogenes.)

## Gotchas de entorno (ahorran horas)

- Preview: `preview_server.py` en el scratchpad (puerto 5077, seeds
  deterministas TBV incluidos). Matar y relanzar tras tocar backend o
  templates; esperar ~6-9 s y `curl` antes de Playwright.
- Los scripts de captura usan rutas RELATIVAS: lanzar `node cap_*.js`
  DESDE el scratchpad o los PNG caen en el cwd (¡nunca commitear
  capturas!). El heredoc con `cd` resetea el cwd del shell al salir.
- Playwright: require desde `/opt/node22/lib/node_modules/playwright`;
  Chromium en `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`;
  tema vía `localStorage['gestell-theme']` + reload.
- Tests: el schema PRE-SIEMBRA marcas/paises (SELECT, no INSERT);
  `numero_pedimento` es UNIQUE por sesión; `PRAGMA foreign_keys` es
  no-op a media transacción (`conn.commit()` antes de togglear).
- La red del sandbox bloquea dominios no listados (p. ej.
  `tile.openstreetmap.org` → el tablero degrada a retícula; en el
  entorno del operador con el dominio autorizado cargan las teselas).
