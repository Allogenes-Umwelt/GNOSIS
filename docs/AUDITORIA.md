# Auditoría de software GNOSIS — registro de hallazgos

Auditoría transversal (5 subsistemas en paralelo): motores AUTOGENES,
`app.py`+`rutas/`, `database/`+`jarvis/`+`tableros/`, JS+plantillas, y el
pipeline legado de extracción. Cada hallazgo se verificó contra el código
real. Este registro documenta lo **corregido** (con test de regresión donde
aplica), lo **diferido** con justificación, y el pipeline legado que
**requiere verificación del operador** antes de tocarse.

Estado: 291 pruebas verdes tras las correcciones; ruff limpio en el alcance
de CI. Commits `84f8c52` (A), `9be4b8a` (B), `1cf0d67` (C), `66b20a5` (D),
`633109a` (E).

---

## Corregido — Seguridad (ola A · `84f8c52`)

| # | Sev | Archivo | Defecto | Corrección |
|---|-----|---------|---------|------------|
| A1 | crítica | `app.py` `errores_delete` | Path traversal: `filename` del JSON → `os.remove` sin sanear (`../../database/gnosis.db` borraba la BD) | `secure_filename` + `int(session_id)` antes de tocar el FS |
| A2 | crítica | `app.py` `reprocesar_pdfs` | Path traversal: nombre original sin sanear en `shutil.copy2`/`os.remove` (escritura/borrado arbitrario) | `secure_filename(orig)` para todas las rutas de disco |
| A3 | alta | `app.py` `_candado_operador` | Bypass: el candado cubría solo `/api/`; `/processing`, `/procesar/*`, `/admin/dedup`, `/errores/delete` quedaban libres | ancla al método mutante (POST/PUT/DELETE/PATCH), no al prefijo |
| A4 | alta | `app.py` `__main__` | `debug=True` + `host=0.0.0.0` → consola Werkzeug (RCE) en toda la red | controlados por entorno; default seguro (127.0.0.1, debug off) |
| A5 | media | `app.py` SECRET_KEY | fallback fijo `'Gestel2025'` firma cookies | clave efímera por proceso si falta la env var |
| A6 | media | `app.py` extractall x2 | zip-bomb sin límite de expansión → DoS de disco | `_extraer_zip_seguro` aborta si lo descomprimido > 2 GB |
| A7 | media | `app.py` `/processing` | `handle_concentrado_error` invocado/`raise`-eado mal → TypeError | `raise ConcentradoError(...)` |

Tests de regresión: traversal bloqueado, candado sobre POST no-/api/,
secret ≠ default (`tests/test_http_rutas.py`).

## Corregido — Fuga de identificadores al LLM (ola B · `9be4b8a`)

| # | Sev | Archivo | Defecto | Corrección |
|---|-----|---------|---------|------------|
| B1 | alta | `jarvis/tool_executor.py` | `conciliacion`, `resumen_grafo`, `senales_caso`, `hallazgos_pendientes` eran tools del modelo pero NO estaban en `GRAFO_DETAIL_TOOLS` → chasis/factura reales al LLM (viola la ley de ofuscación) | añadidas al set de ofuscación recursiva |
| B2 | alta | `jarvis/ofuscation.py` | `mask_row` solo enmascaraba por nombre exacto; `SELECT chasis AS x` filtraba el VIN | defensa por patrón de valor (forma VIN ISO 3779) |
| B3 | media | `jarvis/llm_interface.py` | `data['choices'][0]` a ciegas → crash en respuesta 200-con-error | valida `choices` no vacío, degrada con `RuntimeError` |
| B4 | media | `jarvis/prompts.py` | inyección indirecta: el contenido de documentos se trataba como confiable | el system prompt declara que tool_results son dato, nunca instrucción |

Tests: las 4 tools en el set, `mask_row` bloquea alias VIN
(`tests/test_consultas.py`).

## Corregido — XSS y race en el frontend (ola C · `1cf0d67`)

| # | Sev | Archivo | Defecto | Corrección |
|---|-----|---------|---------|------------|
| C1 | alta | `static/chat.js` | `renderMarkdown` metía la salida del LLM a `innerHTML` sin escapar (persistida en localStorage, re-ejecutable) | escapa entidades antes del markdown |
| C2 | alta | `templates/main.html` (errores) | `filename`/`error_message` crudos en `innerHTML` y en handlers `onclick`/`onchange` inline | escape HTML + `data-*` con listeners delegados |
| C3 | media | `templates/main.html` (`gnosisDeepTables`) | round-trip `textContent`→`innerHTML` revivía HTML de un documento | escapa al reinyectar |
| C4 | media | `templates/errores.html` | `file.name` del re-subido a `innerHTML` sin escapar | escapa antes de `innerHTML` |
| C5 | media | `static/nomos.js` | backtest sin guard de secuencia + `innerHTML +=` → P&L de la regla anterior bajo la nueva | token de secuencia; descarta respuestas tardías |

## Corregido — Correctness y robustez (olas D·`66b20a5` / E·`633109a`)

| # | Sev | Archivo | Defecto | Corrección |
|---|-----|---------|---------|------------|
| D1 | media | `autogenes/consultas.py` | `expediente_entidad` buscaba eventos por id, pero `ag_eventos.entidades` guarda NOMBRES → sección de eventos SIEMPRE vacía en prod (el test lo enmascaraba sembrando por id) | empareja por nombre + alias; test siembra por nombre |
| D2 | media | `autogenes/proyeccion.py` | `max(set(marcas),key=count)` desempata según orden de `set` (PYTHONHASHSEED) → árbol no reproducible | `sorted()` estabiliza el desempate |
| D3 | alta | `database/backup.py` | copia solo el archivo principal; en WAL pierde transacciones del `-wal` | `wal_checkpoint(TRUNCATE)` antes de copiar |
| D4 | baja | `database/persistence.py` | `update_session_stats` interpola el nombre de columna sin allowlist (inyección SQL latente) | valida contra `_STATS_COLUMNAS` |
| E1 | media | `app.py` (4 rutas) | conexión sqlite abierta en `try`, `except` retorna sin cerrarla (fuga fd/lock WAL) | cierre en el `except` |

---

## Diferido — documentado, sin corregir aún

Ítems de menor impacto o cuyo cambio arriesga romper comportamiento; se dejan
para priorización del operador:

- **Tickets de traceback descargables** (`app.py` `handle_generic_error` +
  `/download/<filename>`, media): un 500 escribe el traceback a un directorio
  servible sin auth. Tocar la ruta de descarga arriesga romper descargas
  legítimas (ZipGeneral, Histórico). Recomendación: escribir los tickets fuera
  del árbol servible.
- **DeepSeek sin reintentos** (`jarvis/llm_interface.py`, baja): un 5xx/timeout
  puntual aborta el turno; Anthropic sí reintenta vía SDK.
- **Fecha de 2 dígitos → +2000 incondicional** (`tableros/fechas.py`, baja):
  `31/12/98`→2098. Todos los datos reales son 2000s, pero un pivote de siglo
  sería más correcto.
- **`reprocesar_temp` es un dir fijo** (`app.py`, baja): con >1 worker dos
  reprocesos concurrentes se pisan. Usar `tempfile.mkdtemp` como fase1.
- **`/processing` limpia todo `downloads`** (`app.py`, baja): borra salidas y
  tickets de otras corridas. Subdirectorio por sesión.

---

## Requiere verificación del operador — pipeline legado de extracción

El pipeline heredado (`PDFs_Final_v3.py`, `PDFs_v2.py`, `concentrado1.py`,
`concentrado2.py`, `Estadistico.py`) produce los NÚMEROS ADUANALES reales y
está calibrado al formato exacto de los PDFs de facturas VW, que no se pueden
ver ni testear en este entorno. **Cambiar esta lógica a ciegas arriesga
corromper salidas reales — lo que violaría ZERO SNAKE OIL — así que NO se
auto-corrigió.** Se listan para que Jesús los verifique contra documentos
reales y decida:

| Sev | Archivo:línea | Sospecha | Escenario |
|-----|---------------|----------|-----------|
| alta | `Estadistico.py:1061` | desfase de mes: `month%12+1` filtra el mes+1 bajo la etiqueta del mes actual | "Agotado en diciembre" podría ser data de enero; saldos mensuales corridos |
| alta | `PDFs_Final_v3.py:110` | el primer parser que devuelve un DataFrame gana sin validar contenido | un PDF que casualmente satisface otro parser → filas corruptas |
| alta | `concentrado1.py:214` | `if val_B in val_div` casa por substring en vez de igualdad | AUTO `1234` ⊂ `812340` → coche mal clasificado de marca/país |
| alta | `concentrado1.py:187` | `list_col_J/K` de matches aplanados desalinea PATENTE/PEDIMENTO en `concat(axis=1)` | fila sin patente corre todos los pedimentos |
| alta | `concentrado1.py:195` | guard `len(i) >= 56` no cubre el slice `[81:89]` | pedimento de 56-80 chars → fecha vacía → fila excluida |
| alta | `PDFs_v2.py:813+` | regex de precio exige miles europeos; `950,00` inserta `'0,00'` | precio fabricado 0 propagado a BD como real |
| alta | `PDFs_v2.py:851` | empareja precio↔VIN por índice global; si difieren se rellena `'0,00'` | un bloque sin precio corre todos los importes |
| alta | `PDFs_v2.py:1044` | offsets de chasis por índice fijo `i in [0..8]` en Porsche | factura con >9 vehículos → VIN/auto recortados mal |
| alta | `Estadistico.py:1541` | `return` mezcla conteos anuales con `India` del residuo del último mes | tablero India subcontado |
| media | `concentrado2.py:494` | dedupe silencioso en dict conserva solo el último match | (FACT,CHASIS) en 2 PDFs → datos del último |
| media | `concentrado2.py:487` | `C.O`+`BRA` → `'C.O'` aquí pero `'N'` en versión previa | preferencia arancelaria divergente afecta cupo |
| media | `Estadistico.py:1004` | `int()` de cupo con separadores lanza ValueError → aborta todo | `'1,200 Pieza.'` → crash del estadístico |
| media | varios | `except:` desnudos que asignan `''`/vacío → filas fantasma aceptadas como válidas | bloques de basura entran a la BD |

Recomendación: cubrir estas rutas con casos de prueba anclados a PDFs reales
(fixtures anonimizados) ANTES de modificar cualquier regla de extracción.

---

## Lo que quedó limpio (revisado, sin hallazgos de peso)

Los motores AUTOGENES (`sustrato`, `concilia`, `validacion`, `sinapsis`,
`nomos`, `cronos`, `qualia`, `topologia`, `anomalias`, `caminos`, `informe`,
`ingesta`, `estado`, `metabolismo`) son notablemente cuidadosos: guardas de
división por cero, `session_id` en todos los writes y cascadas, sin
concatenación de input en SQL, sin conversión de moneda ni estimación de
montos, ordenamientos deterministas. Los motores de `tableros/` filtran por
sesión, protegen la división y declaran lo ausente sin interpolar. La API key
de DeepSeek/Anthropic no se registra ni se filtra en logs. El esquema y las
migraciones son idempotentes.
