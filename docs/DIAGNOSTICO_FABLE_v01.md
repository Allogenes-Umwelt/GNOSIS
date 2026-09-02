# Diagnóstico — bugs, debilidades y plan de ejecución para Opus 5

> **v1 · 2026-09-02 · Autor: Fable 5.1 (análisis; cero código).**
> Ejecutor previsto: **Opus 5**, por olas, según `docs/estandares/backend-engineering.md` §14.
> Árbol analizado: `claude/gnosis-hardening-debugging-ip8iwg` @ `4aa848d` (539 verdes, CI verde en los seis pasos).
> **Método:** cada hallazgo se leyó en el código; la cita `archivo:línea` es verificable con `sed -n`. Donde solo hay sospecha se dice *verificar*, no se afirma. Ningún número de este documento se estimó: o se midió o se marca como pendiente de medir.

---

## 0. Resumen ejecutivo

GNOSIS está **bien construido donde más importa** — los motores son puros, deterministas y cubiertos al 93 %; la ley de puerta única se cumple (`grep 'INSERT INTO ag_'` fuera de `sustrato.py` solo devuelve `qualia.py`, telemetría declarada en ADR-0004); NetworkX está confinado (verificado: QUALIA usa su propia proyección en `autogenes/qualia.py:41`, no `red.py`).

Las debilidades se concentran en **tres fronteras**, no en los motores:

| Frontera | Qué falla | Gravedad |
|---|---|---|
| **LLM** (`jarvis/`) | La ofuscación se evade con una expresión SQL trivial; la conversación se guarda **desofuscada**; el modelo lee cualquier sesión y su propio historial en claro | **crítica** |
| **Red** (`app.py`) | Descargas de negocio con nombre fijo y tickets con traceback servidos **sin autenticación** en `0.0.0.0` | **alta** |
| **Proceso** (gunicorn ×2) | Estado del chat en memoria de proceso: dos workers = dos conversaciones. (El sello de bitácora se creyó afectado por una carrera; el ejecutor midió que no era alcanzable — ver H5 y §8) | **alta** |

Hallazgos: **2 críticos · 5 altos · 12 medios · 5 bajos**, más **una corrección a la auditoría previa** (§4). Plan en **8 olas + remates** (§5). Lo que no se toca y por qué, en §6.

---

## 1. Hallazgos críticos

### H1 · `consulta_sql` deja al modelo leer toda la base y evadir la ofuscación

**Dónde.** `jarvis/tools.py:462-495` (la tool); `jarvis/ofuscation.py:60-78` (`mask_row`); `jarvis/tool_executor.py:12` (`consulta_sql` ∈ `DETAIL_TOOLS`).

**Qué.** La tool acepta cualquier `SELECT` filtrado por una lista negra de palabras (`INSERT|UPDATE|…`) y un rechazo de `PRAGMA`. No hay ámbito de sesión, no hay allowlist de tablas ni de funciones. La ofuscación posterior (`mask_row`) enmascara **por nombre de columna** (`factura`, `chasis`, `numero_pedimento`, `patente`) y, como defensa secundaria, **por forma** con `_VIN_RE = ^[A-HJ-NPR-Z0-9]{17}$` — anclado, mayúsculas, longitud exacta.

**Escenario de fallo (cada línea es una consulta que el modelo puede emitir y que devuelve el identificador real):**

```sql
SELECT lower(chasis) AS c FROM importaciones           -- minúsculas: la regex es solo mayúsculas
SELECT substr(chasis,1,8)||'-'||substr(chasis,9) AS c  -- 18 chars: no casa ^…{17}$
SELECT chasis||' ' AS c FROM importaciones             -- un espacio al final basta
SELECT hex(chasis) AS c FROM importaciones             -- 34 chars hex
SELECT factura AS f FROM importaciones                 -- 'f' no está en sensitive_fields; una factura no tiene forma de VIN
SELECT * FROM importaciones WHERE session_id = 3       -- otra sesión, sin restricción
SELECT content FROM chat_conversations                 -- ver H2: texto desofuscado
SELECT accion, detalle FROM ag_bitacora                -- la bitácora entera, todas las sesiones
```

Además, `'LIMIT' not in normalized.upper()` (`tools.py:483`) se satisface con un literal que contenga la palabra, así que el tope de 100 filas es evadible; el truncado a 15 000 caracteres (`tool_executor.py:69`) acota el volumen por turno, no la fuga.

**Por qué es crítico.** Es la única ley del repo formulada como "nunca": *los identificadores nunca viajan en claro a un LLM* (`docs/architecture/adr/0007-ofuscacion-antes-del-llm.md`). Hoy basta una llamada de tool para violarla, y el modelo elige libremente sus consultas.

**Raíz.** La ofuscación se aplica **tarde y por sintaxis** (nombre/forma de columna) cuando debería aplicarse **por semántica en la frontera**: el conjunto de identificadores reales de la sesión es conocido y finito.

**Fix que disloca el problema (para Opus).**
1. **Sandbox real para `consulta_sql`:** conexión de solo lectura (`sqlite3.connect('file:…?mode=ro', uri=True)`) + `conn.set_authorizer(...)` con allowlist de tablas (nunca `chat_conversations`, `ag_bitacora`, `sqlite_master`, `app_config`) y de funciones; el predicado de sesión inyectado por **vistas por sesión** (`v_importaciones` = `… WHERE session_id = :activa`) sobre las que el modelo consulta, en vez de confiar en que lo escriba.
2. **Enmascarado por conjunto de identificadores** en un solo punto — `ToolExecutor.execute`, sobre `result_str` ya serializado: cargar `{chasis, factura, pedimento, patente}` reales de la sesión y sustituir **toda ocurrencia** (search, no match; case-insensitive; también dentro de texto libre). Esto cubre alias, expresiones, JSON anidado y los resultados de grafo sin listas especiales.
3. Mantener `mask_row` como segunda capa; retirar la regex anclada o convertirla en búsqueda.

**Prueba (roja primero).** `tests/test_ofuscacion_bypass.py`: el corpus de consultas de arriba, ejecutado vía `ToolExecutor`, no debe devolver ningún valor de un conjunto sembrado de VIN/facturas reales; una consulta a otra `session_id` debe ser rechazada; `SELECT … FROM chat_conversations` debe ser rechazada por el authorizer.

**Estructural → ADR-0011** ("ofuscación por conjunto de identificadores en la frontera de serialización").

---

### H2 · La conversación se persiste desofuscada — y H1 la lee

**Dónde.** `jarvis/chat_handler.py:60-66` (`final_text = unmask_text(...)`) → `:140-160` (`_save_conversation` guarda `assistant_response` ya desofuscado y `user_message` crudo). Esquema en `database/models.py:261-271`.

**Escenario.** Turno 1: el modelo recibe `[VIN-001-A1B2C3]`, responde citándolo, el handler lo desofusca y **guarda el VIN real** en `chat_conversations.content`. Turno 2: `consulta_sql("SELECT content FROM chat_conversations")` — el modelo lee el VIN real que nunca debió ver. Sin H1, sigue siendo identificador en claro en reposo, indexado por `idx_chat_session`.

**Fix.** Persistir el texto **enmascarado** (tokens) y el mapa token→real de la conversación en su propia tabla (o no persistirlo y aceptar que el historial guardado muestre tokens); desenmascarar solo al presentar al operador. Retirar el `print` (`:160`) — ver H8.

**Prueba.** Tras un turno con un VIN sembrado, `SELECT content FROM chat_conversations` no contiene ninguna cadena del conjunto de identificadores reales.

---

## 2. Hallazgos altos

### H3 · El chat vive en la memoria de UN worker; gunicorn corre DOS

**Dónde.** `app.py:1225-1246` (`_chat_handler` / `_chat_proveedor` globales de módulo); `docker/Containerfile:72` (`--workers 2`, sync, un hilo); `app.py:1275-1294` (`/api/v1/admin/llm` POST pone `_chat_handler = None` **solo en el worker que atendió**).

**Escenario reproducible.**
- Dos peticiones consecutivas de chat caen en workers distintos → el modelo ve **la mitad del historial** (cada worker tiene su `self.messages`).
- `POST /api/v1/chat/reset` reinicia un worker; el otro conserva la conversación y su mapa de ofuscación.
- `POST /api/v1/admin/llm {"llm_default":"claude"}` y luego `GET /api/v1/admin/llm` varias veces: `activo` **alterna** entre proveedores según el worker.
- `self.messages` crece sin cota (`chat_handler.py:44-48`, nunca se poda): coste por turno creciente hasta que el proveedor rechaza el contexto → 500.

**Corrección a la auditoría previa.** `docs/architecture/auditoria-backend.md` marca 12-factor "procesos sin estado" como ✅. **Es ⚠️:** el chat es estado de proceso. Debe corregirse la celda.

**Fix.** Sacar el estado del proceso: conversación en SQLite (ya existe `chat_conversations`; falta el mapa de ofuscación por `chat_session_id`, enmascarado en reposo — ver H2), identidad de conversación por cookie firmada (`SECRET_KEY` ya existe), ventana acotada de N turnos. La configuración LLM ya vive en SQLite (`database/config.py`): el handler debe **releerla por petición** o cachearla con versión, no en un global.

**Estructural → ADR-0012** ("estado conversacional en SQLite, no en el proceso").

**Prueba.** Con dos `app.test_client()` sobre procesos distintos no se puede simular fácilmente; sí se puede: construir dos `ChatHandler` sobre la misma base y verificar que el segundo ve el historial del primero.

---

### H4 · `/download/<filename>` sirve outputs de negocio y tracebacks sin autenticación, en toda la LAN

**Dónde.** `app.py:1023-1025` (`send_from_directory(DOWNLOAD_FOLDER, filename)`, sin candado); nombres **fijos** de salida en `app.py:769, 894, 932, 948, 953, 956, 975, 998, 1001, 1170-1205` (`facturasProcesadas.xlsx`, `Concentrado1.xlsx`, `Concentrado2.xlsx`, `Estadistico.xlsx`, `ZipGeneral.zip`, `Historico_*`); tickets con traceback en `app.py:192-215`, enlazados desde `templates/error.html:16`; candado solo para métodos mutantes en `app.py:118-130`; el contenedor escucha en `0.0.0.0:5001` (`Containerfile:72`) y `docker/.env.example:20-24` aconseja dejar `GNOSIS_TOKEN` vacío.

**Escenario.** Cualquier equipo de la misma red: `GET http://<host>:5001/download/ZipGeneral.zip` → el concentrado aduanal completo del último mes, con VIN, facturas y precios. Sin token, sin log. `send_from_directory` impide el traversal, pero no hace falta: los nombres son adivinables.

**Nota sobre la lista de diferidos.** `docs/AUDITORIA.md` decía «`/processing` limpia todo `downloads`». Hoy no es así: `app.py:863-866` limpia solo los directorios de *staging* de subida. La entrada está desactualizada y debe corregirse; el problema real es el de arriba.

**Fix.** (1) Candado también para `GET /download/*` y `/errores/download` — o, más simple y más honesto: **exigir `GNOSIS_TOKEN` siempre que se escuche en `0.0.0.0`** (el contenedor siempre lo hace) y corregir `.env.example`. (2) Tickets fuera del árbol servible (ya recomendado). (3) Sufijo de sesión/timestamp en los nombres de salida y un endpoint que liste solo lo de la sesión activa.

**Prueba.** `tests/test_http_rutas.py`: con `GNOSIS_TOKEN` fijado, `GET /download/x` sin header → 401/403; ticket generado por un 500 no aparece bajo `DOWNLOAD_FOLDER`.

---

### H5 · La cadena de sellos de la bitácora tiene una carrera que produce falsas alarmas

**Dónde.** `autogenes/sustrato.py:104-121` (`_registrar`): `SELECT hash … ORDER BY id DESC LIMIT 1` → `INSERT` → `SELECT ts` → `UPDATE hash`. Verificador en `:135-155`.

**Mecánica.** *(Corregido por el ejecutor el 2026-09-02 — ver §8.)* La
bifurcación es real como mecanismo: forzando a mano que dos escritores lean el
mismo `prev_hash` antes de que ninguno inserte, `verificar_bitacora` devuelve
`{valido: False, motivo: "cadena"}` — una alarma de manipulación por uso
normal. **Pero no era alcanzable con este código**: todo método que llama a
`_registrar` escribe ANTES, así que la transacción implícita de `sqlite3` ya
tenía el candado de escritura cuando se leía el sello, y el segundo escritor
se bloqueaba (`database is locked`) en vez de bifurcar. Medido: cero métodos
de `Sustrato` registran sin escribir primero.

Lo que sí era cierto es que la garantía estaba **prestada**: dependía de la
transacción implícita de `sqlite3` y de que todo método futuro recordara
escribir antes de registrar. `isolation_level=None`, el `autocommit` de Python
3.12 o un método que solo registre la retiraban en silencio. Eso es el mismo
hallazgo que **H10**, y el arreglo es el de H10.

Segundo modo: un fallo entre el `INSERT` y el `UPDATE hash` (`:113-121`) deja una fila con `hash NULL`; el verificador la salta (`:142`) pero la siguiente fila lleva `prev_hash = ""` (`:110`) → "cadena" rota **para siempre**, indistinguible de una manipulación.

Tercero — **no hay superficie**: `grep verificar_bitacora rutas/ static/ templates/` no devuelve nada. La única propiedad de evidencia forense del sistema no es visible para quien la necesita.

`atomico()` (`:80-101`) y `integrar_propuesta` (`BEGIN IMMEDIATE`) ya resuelven esto para sus casos; el resto de mutaciones unitarias no lo usa (`grep -c 'atomico()'`: solo `ingesta.py`, 4 sitios).

**Fix.** (1) Toda mutación de `Sustrato` abre con `BEGIN IMMEDIATE` — envolver cada método público en `with self.atomico()`; así el `SELECT prev` ocurre bajo el candado. (2) Calcular el sello **antes** del `INSERT` y escribirlo en la misma sentencia (usar `ts` generado en Python y una posición `MAX(id)+1` bajo el candado, o dejar de incluir `id` en el sello y encadenar solo por contenido + `prev_hash`). (3) El verificador distingue tres estados: `sellado`, `sin_sellar` (historia previa), `hueco` (fila con `prev_hash` y sin `hash`) — y reporta el primero. (4) Exponer `GET /api/v1/autogenes/bitacora/verificar` y un chip en el expediente de defensa (`autogenes/sello.py` ya sabe presentar un sello).

**Prueba.** Dos conexiones a la misma base en memoria compartida (`file:…?mode=memory&cache=shared`), dos `Sustrato` intercalando `_registrar`: la cadena debe verificar `valido: True`. Simular el hueco (UPDATE hash=NULL en una fila): el verificador debe decir `hueco`, no `cadena`.

---

### H6 · El texto del operador viaja en claro; `resolve_input` es código muerto

**Dónde.** `jarvis/chat_handler.py:44-48` (`user_message` se añade tal cual); `jarvis/ofuscation.py:97-102` (`resolve_input`, `grep -rn resolve_input`: sin llamadores).

**Escenario.** El operador pega «¿qué pasa con el chasis WVWZZZ3CZWE123456?» → el VIN sale al proveedor en claro. La ley de ADR-0007 no distingue entre lo que dice el modelo y lo que dice el operador.

**Fix / decisión de Jesús.** O bien enmascarar la entrada contra el conjunto de identificadores de la sesión (el mismo mecanismo de H1, aplicado al mensaje del usuario), o bien declarar la excepción en ADR-0007. Recomendación: enmascarar — el conjunto es conocido. Borrar `resolve_input` o usarlo.

---

### H7 · Toda tool acepta `session_id` libre: el modelo elige la sesión

**Dónde.** `jarvis/tools.py:13-17` (`_get_session`: `int(session_id)` sin validar existencia ni pertenencia); `jarvis/prompts.py:31` anima al modelo a comparar meses.

**Escenario.** El operador consulta "el mes activo"; el modelo, por su cuenta, pasa `session_id=2` y responde con cifras de otro mes sin decirlo. No es solo fuga (H1): es **número equivocado con cara de correcto** — snake oil involuntario.

**Fix.** El ámbito lo fija la petición del operador, no el modelo: el handler recibe la lista de sesiones permitidas (por defecto la activa) y las tools la reciben inyectada; un `session_id` fuera de la lista se rechaza con error explícito. Comparar meses sigue siendo posible cuando el operador lo pide desde la UI.

---

## 3. Hallazgos medios

### H8 · Sin `logging`: 34 `print(` y ningún nivel

`grep -c 'print('`: `app.py` 18, `database/backup_proton.py` 8, `database/backup.py` 3, `database/persistence.py` 2, `rutas/tableros.py` 1, `rutas/autogenes.py` 1, `jarvis/chat_handler.py` 1. `grep -l 'import logging'`: **nadie**. Bajo gunicorn van a stdout sin nivel, sin petición, sin filtro. Es el paso 1 concreto del ❌ de observabilidad de la auditoría. **Fix:** `logging` con formato estructurado a stderr, `request_id` por petición, niveles; los tickets siguen existiendo pero fuera del árbol servible (H4).

### H9 · El tablero principal degrada a pantalla vacía sin avisar

`app.py:590-598`: `except Exception` → `print` → `render_template('main.html', **_empty)`. Un bug en cualquier consulta del dashboard se presenta como "no hay datos". Viola la ley de copy de error (*qué falló + por qué + qué hacer*). **Fix:** estado de error visible con el número de ticket; nunca un vacío que parece verdad.

### H10 · Atomicidad por convención implícita

Las mutaciones unitarias de `Sustrato` son atómicas **solo** porque `sqlite3` en modo legado abre una transacción implícita en el primer DML y `_commit()` la cierra. Con `isolation_level=None` o el `autocommit` de Python ≥ 3.12, esa garantía desaparece en silencio. **Fix:** el mismo de H5 — `with self.atomico()` en cada mutación pública. (Se pliega en la ola de H5.)

### H11 · Excepciones tragadas donde una razón importa

- `rutas/autogenes.py:1398-1405` `_snapshot_telemetria`: `except Exception: pass` — un `TypeError` de programación muere igual que un fallo de muestreo. Registrar a WARNING.
- `autogenes/ingesta.py:156`: si `pdfplumber` falla, se sigue a OCR sin dejar rastro. Un artefacto que acaba con 0 fragmentos y sin `motivo` es **evidencia muda** — zero snake oil pide declararlo ("sin capa de texto; OCR intentado: N páginas").
- `autogenes/hechos.py:197` lleva `noqa` con razón: correcto, no tocar.

### H12 · `/api/v1/admin/llm` sin candado en GET; POST sin candado si el token está vacío

`app.py:1249-1268` (GET expone proveedores/default/activo — no claves) y `:1271-1294` (POST cambia el proveedor). Con `GNOSIS_TOKEN` vacío (lo que `.env.example` aconseja) cualquiera en la LAN cambia el proveedor a `ollama` (sin ofuscación distinta, pero sí un modelo que el operador no eligió). **Fix:** candado en `/api/v1/admin/*` **para todo método**, y la decisión de H4 sobre el token.

### H13 · Carreras de fetch: el arreglo C5 no se generalizó

`nomos.js` recibió el token de secuencia (auditoría C5). Conteo `fetch(` / guardas (`AbortController|seq|stale`): `metabolismo.js` 9/0, `concilia.js` 5/0, `vinculos.js` 5/0, `validacion.js` 4/0, `qualia_maquina.js` 4/0, `qualia_terreno.js` 3/0, `qualia.js` 3/0, `nomos.js` 3/0 (solo el backtest está guardado), `ingesta.js` 11/4, `grafo.js` 5/3. **Escenario:** cambiar de sesión dos veces rápido; la respuesta lenta de la primera pinta encima de la segunda. **Fix:** un helper compartido `fetchUltimo(clave, url)` (AbortController + secuencia) en un módulo común, adoptado en todas las superficies; prueba Playwright con respuestas retrasadas (Chromium ya está en el contenedor).

### H14 · `esc()` está definido 19 veces

`grep -c 'function esc('`: 19 archivos; `qualia_comun.js` es compartido pero solo 11 plantillas lo cargan. 259 asignaciones a `innerHTML`; 94 líneas sin `esc(` en la misma línea. **Muestra leída (5 de 94): todas correctas** — `ingesta.js:498-511`, `metabolismo.js:519-521`, `:649-650`, `concilia.js:66` escapan cada valor de documento y solo concatenan índices y números. No es un hallazgo de XSS; es un **riesgo de deriva**: 19 copias divergirán. **Fix:** un `gestell_comun.js` (`esc`, `fetchUltimo`, tema); un script de lint frontend que marque `innerHTML` sin `esc(` ni literal (SAST barato); revisar las 89 líneas no muestreadas.

### H15 · Dos superficies animan sin respetar `prefers-reduced-motion`

`grep -L 'prefers-reduced-motion|reducedMotion'` sobre los 7 archivos con `requestAnimationFrame|setInterval`: **`static/sinapsis.js`** y **`static/tbv_rutas.js`**. Ley de `CLAUDE.md` ("degrada a estático"). *Verificar* leyendo ambos: puede que consulten el media query con otro nombre. Si no, fix pequeño.

### H16 · El respaldo puede ser parcial y decir que fue bien

`database/backup.py:22-28`: `wal_checkpoint(TRUNCATE)` es best-effort; con un worker leyendo, el checkpoint no completa, se imprime un WARN y **se copia el archivo sin la cola del WAL**. El hallazgo D3 quedó medio cerrado. **Fix:** `sqlite3.Connection.backup()` (API de respaldo en línea: instantánea consistente sin depender del checkpoint) + `PRAGMA integrity_check` sobre la copia + **una prueba que restaure y compare** (benchmark "restores tested", hoy ⚠️).
`database/backup_proton.py`: huérfano (`grep backup_proton`: nadie lo importa), sin prueba, ruta absoluta de otra máquina (`:9`), `md5` (`:29`), `subprocess` a rclone = egreso de red (`:98,110`). Decisión de Jesús: borrar, o mover a `scripts/` con configuración por entorno.

### H17 · Sesión fantasma al dockear evidencia — *verificar*

`rutas/comun.py:29-44` (`_asegurar_sesion`) crea una `processing_session` con el mes/año del **reloj** si no hay ninguna. Si después el pipeline procesa ese mismo mes, ¿crea otra sesión o reutiliza? Si crea otra, la evidencia dockeada queda en una sesión sin dato aduanal y la conciliación no la ve. **Verificar** la unicidad de `create_session(month, year)` en `database/persistence.py` antes de decidir.

### H18 · Doce rutas sin ninguna mención en tests; tres de escritura

Censo automático (nombre de ruta vs `tests/`): 121 rutas, **12 sin mención** (11 en `app.py`, 1 en `rutas/autogenes.py`). Escritura sin test: `POST /procesar/historico`, `POST /procesar/reprocesar` (pipelegado: el contrato HTTP sí es testeable — 400 sin archivos, candado — aunque el cuerpo no), `POST /api/v1/admin/llm` (totalmente testeable: validación, persistencia en `app_config`, reinicio del handler).

### H19 · Proveedores LLM: modelo por defecto viejo, sin reintentos

`jarvis/llm_interface.py:32`: `model="claude-sonnet-4-5-20250929"` fijo — generación anterior; DeepSeek sí tiene `DEEPSEEK_MODEL` (`:149`) y Anthropic no tiene equivalente por entorno (`claude_model` sí existe como config en BD, `app.py:1275`). `:161-168`: un 429/5xx/timeout aborta el turno (ya diferido en `AUDITORIA.md`). **Fix:** `ANTHROPIC_MODEL` por entorno con un default de la generación actual (decisión de Jesús: cuál); reintento acotado con backoff en 429/5xx/timeout (la completions POST es idempotente para este uso).

---

## 4. Hallazgos bajos y correcciones a documentos

- **H20** `autogenes/analisis_vw.py:159`: `for k in set(a) | set(b)` en un producto punto — el orden de suma en coma flotante puede cambiar el último bit entre procesos con `PYTHONHASHSEED` distinto; si ese score desempata un orden, el orden cambia. Fix de una palabra: `sorted(...)`. *Verificar* si `tests/test_analisis_vw.py:253` (usa `subprocess`) ya cubre exactamente esto.
- **H21** `app.py:74` dice «50 MB»; `app.py:111` fija 300 MB. Comentario obsoleto.
- **H22** `jsonify({'error': str(e)}), 500` en casi todas las rutas expone el texto interno de la excepción. Un operador, bajo riesgo; pero contradice el contrato de error honesto. Unificar en un helper que registre (H8) y devuelva mensaje + ticket.
- **H23** Las 14 `S608` restantes son literales fijos o allowlists (`tools.py:451` valida `campo`; `sustrato.py:387` `permitidos`; `persistence.py:44` `_STATS_COLUMNAS`; el resto, listas de tablas). **No son inyección.** Cuando se activen las reglas `S`, cada una lleva `# noqa: S608 — <razón>`; ese es el valor de activar la regla.
- **H24** `docs/AUDITORIA.md` — entrada diferida «`/processing` limpia todo `downloads`»: inexacta hoy (ver H4). Corregir.
- **H25** `docs/architecture/auditoria-backend.md` — celda 12-factor: ✅ → ⚠️ por H3. Corregir con la evidencia.

---

## 5. Plan de ejecución para Opus 5 — por olas

Regla de cada ítem: **prueba roja primero**, luego el fix, luego verde; commit por ítem, en inglés, Conventional; ADR en el mismo commit cuando es estructural; `docs/architecture/` se toca en el mismo diff si cambia una caja (la compuerta de staleness lo exige). Tamaño: S (< 1 h de trabajo enfocado), M (media jornada), L (jornada+). Sin horas: el tamaño es relativo.

| Ola | Ítems | Tamaño | Cierra |
|---|---|---|---|
| **1 · Frontera LLM** | H1 (sandbox + enmascarado por conjunto), H2 (persistir enmascarado), H6 (entrada), H7 (ámbito de sesión). ADR-0011. Corpus de evasión como prueba permanente. | **L** | los 2 críticos + 2 altos |
| **2 · Estado del chat** | H3 (conversación en SQLite, cookie, ventana), H20-ish poda. ADR-0012. Corregir celda 12-factor (H25). | **M** | 1 alto |
| **3 · Superficie de red** | H4 (candado en descargas, tickets fuera, nombres por sesión), H12 (admin bajo candado), corregir `.env.example` y AUDITORIA (H24). | **M** | 1 alto + 1 medio |
| **4 · Bitácora forense** | H5 + H10 (`atomico()` en toda mutación; sello en el INSERT; tres estados; ruta + chip). Prueba de concurrencia con dos conexiones. | **M** | 1 alto + 1 medio |
| **5 · Observabilidad mínima** | H8 (logging), H9 (tablero honesto), H11 (razones), H22 (helper de error). Actualizar la fila de observabilidad de la auditoría. | **M** | 3 medios + 1 bajo |
| **6 · Frontend** | H13 (`fetchUltimo` compartido + Playwright), H14 (`gestell_comun.js` + lint de `innerHTML`), H15 (reduced-motion en 2 archivos). | **M** | 3 medios |
| **7 · Datos** | H16 (backup en línea + integridad + prueba de restauración; destino de `backup_proton`), H17 (verificar sesión fantasma). | **S–M** | 2 medios |
| **8 · Proveedores + pruebas** | H19 (modelo por entorno, reintentos), H18 (tests de admin/llm y contrato HTTP de `/procesar/*`). | **S–M** | 2 medios |
| **Remates** | H20, H21, H23 (activar `ruff --select S` con `noqa` razonados — cierra la fila SAST ❌ de la auditoría). | **S** | 3 bajos + 1 fila de auditoría |

**Orden y por qué.** La ola 1 va primera porque es la única que rompe un "nunca" del repo y porque su fix (enmascarar por conjunto en la frontera) **simplifica** las olas 2 y 8 (el mapa de ofuscación deja de ser por-tool). La ola 3 antes que la 4 porque la exposición en red es hoy real y la carrera de la bitácora es probabilística. Las olas 5-8 son independientes entre sí y pueden intercalarse con trabajo de producto.

**Auditoría de fin de campaña (§14.4).** Al cerrar: repetir `docs/architecture/auditoria-backend.md` completa; las filas que deben cambiar de veredicto son **SAST** (❌→✅), **12-factor** (⚠️→✅), **observabilidad** (❌→⚠️), **restauraciones** (⚠️→✅), **cobertura** (medir `jarvis/`, hoy 0-44 %).

---

## 6. Lo que NO se toca, y por qué

- **Pipelegado** (`PDFs_*`, `concentrado*`, `Estadistico`): ley. Las 13 sospechas de `docs/AUDITORIA.md` siguen esperando PDFs reales delante de Jesús.
- **PyPDF2**: mismo motivo; `requirements.txt` lo explica en el sitio.
- **NetworkX**: **verificado que no hace falta tocar nada** — la telemetría QUALIA usa `autogenes/qualia.py:41` (proyección dict), no `red.py`; ADR-0005 se cumple. Se sospechó y se descartó con evidencia.
- **Escapado del frontend**: la muestra leída es correcta; la ola 6 revisa el resto por completitud, no por sospecha.
- **`_extraer_zip_seguro`** (`app.py:79-89`): sin zip-slip — CPython sanea `..` en `_extract_member`; el tope de expansión se calcula sobre tamaños declarados y `ZipExtFile` no lee más allá de ellos. No es hallazgo.
- **`editar_entidad`**: allowlist en `sustrato.py:387`; la `S608` es falso positivo.

---

## 7. Cómo verificar este diagnóstico (para quien no confíe en él)

```bash
# H1: la regex de VIN es anclada y solo mayúsculas
sed -n '10,13p' jarvis/ofuscation.py
# H2: se guarda el texto ya desofuscado
sed -n '58,66p;140,160p' jarvis/chat_handler.py
# H3: estado en global de módulo; dos workers
sed -n '1225,1246p' app.py; grep -n workers docker/Containerfile
# H4: descarga sin candado; candado solo en métodos mutantes
sed -n '1023,1025p;118,130p' app.py
# H5: SELECT prev fuera del candado
sed -n '104,121p' autogenes/sustrato.py; grep -rn verificar_bitacora rutas/ static/ templates/
# H8: prints sin logging
grep -c 'print(' app.py database/*.py jarvis/*.py rutas/*.py; grep -l 'import logging' app.py rutas/*.py autogenes/*.py database/*.py jarvis/*.py
# H13: fetch sin guardas
for f in static/metabolismo.js static/concilia.js static/vinculos.js; do echo "$f $(grep -c 'fetch(' $f) $(grep -c 'AbortController\|_seq\|stale' $f)"; done
```

---

## 8. Correcciones del ejecutor (Opus 5 · 2026-09-02)

Este documento se escribió leyendo el código; al ejecutarlo, dos afirmaciones
no sobrevivieron a la medición. Se corrigen aquí en vez de dejarlas en pie: un
diagnóstico que no se corrige a sí mismo envejece igual que un diagrama.

- **H5 · la carrera de la bitácora era LATENTE, no activa.** El mecanismo de
  bifurcación existe y se reprodujo a mano, pero no era alcanzable: todo
  método que registra escribe primero, de modo que la transacción implícita de
  `sqlite3` ya tenía el candado. El segundo escritor se bloqueaba
  (`database is locked`), no bifurcaba. La gravedad real era la de H10 —una
  garantía prestada a un detalle del driver— y así se arregló: `_registrar`
  abre `BEGIN IMMEDIATE` cuando no hay transacción, así que la invariante
  ya no depende de quién llame ni de la versión de Python.
  Lo que **sí** estaba roto en H5 y se confirmó con pruebas rojas: un `hash`
  nulo (muerte entre el `INSERT` y el `UPDATE`) se reportaba como `cadena`
  rota **para siempre**, indistinguible de una manipulación; y la verificación
  no tenía superficie (404). Ambas cerradas.

- **H4 · la entrada de `AUDITORIA.md` sobre `/processing` era inexacta**, como
  el propio documento sospechaba. `app.py` limpia los directorios de *staging*
  de subida, no `downloads`. Corregido en la fuente. Lo real y aún abierto es
  que las salidas usan nombres fijos.

Mantiene su veredicto todo lo demás que se ejecutó: H1, H2, H6, H7 (ola 1),
H3 (ola 2), H4 y H12 (ola 3), H5-parcial y H10 (ola 4).

---

## 9. Estado de ejecución (Opus 5 · 2026-09-02)

| Hallazgo | Estado | Dónde |
|---|---|---|
| H1 · evasión de la ofuscación | **cerrado** | ADR-0011 · `jarvis/identidades.py`, `sandbox.py` |
| H2 · conversación persistida en claro | **cerrado** | `chat_handler` guarda enmascarado |
| H3 · estado del chat en el proceso | **cerrado** | ADR-0012 · hilo en cookie firmada, historia en SQLite |
| H4 · descargas sin candado | **cerrado** | candado sobre lectura sensible; tickets fuera del árbol servible |
| H5 · cadena de la bitácora | **cerrado (corregido)** | carrera latente, no activa — §8; ADR-0013 |
| H6 · entrada del operador sin enmascarar | **cerrado** | `ChatHandler._enmascarar` |
| H7 · sesión elegida por el modelo | **cerrado** | `jarvis/ambito.py` |
| H8 · sin logging | **cerrado** | `registro.py`, cero `print` (con prueba) |
| H9 · tablero mudo | **cerrado** | declara el fallo y su referencia |
| H10 · atomicidad implícita | **cerrado** | `BEGIN IMMEDIATE` explícito |
| H11 · excepciones tragadas | **cerrado** | telemetría e ingesta registran su razón |
| H12 · admin sin candado | **cerrado** | `/api/v1/admin/*` bajo candado |
| H13 · carreras de fetch | **abierto** | requiere verificación en navegador; ver abajo |
| H14 · `esc()` ×19 | **abierto** | hygiene; el gate de `innerHTML` queda propuesto |
| H15 · reduced-motion | **descartado** | falso positivo: los dos rAF señalados son planificación de redibujo, no animación; los dos bucles reales (`grafo.js`, `qualia_cascada.js`) YA lo respetan |
| H16 · respaldo | **cerrado** | API en línea + `integrity_check` + prueba de restauración |
| H17 · sesión fantasma | **cerrado** | `create_session` reutiliza una sesión vacía del mismo mes |
| H18 · rutas sin prueba | **cerrado** | `admin/llm` y contrato de `/procesar/*` |
| H19 · proveedores | **cerrado** | reintentos acotados; `ANTHROPIC_MODEL` por entorno |
| H20 · suma sobre `set` | **cerrado** | `sorted()` |
| H21 · comentario obsoleto | **cerrado** | — |
| H22 · `str(e)` sin rastro | **cerrado (adaptado)** | se conserva el texto; se añade log + referencia |
| H23 · SAST | **cerrado** | `ruff --select S` como compuerta HARD |

**Lo que queda, y por qué queda.** H13 y H14 son frontend sin pruebas
automatizadas: tocar diez superficies de lienzo a ciegas cambia un riesgo
medido por uno no medido. El patrón está descrito (`fetchUltimo` con
`AbortController` + token de secuencia, un `gestell_comun.js` con `esc`) y la
verificación correcta es con la app levantada y Playwright, no con `sed`.

**Decisiones que siguen siendo del operador:** rotar la llave DeepSeek
(sigue siendo el ítem número uno de todo este documento), subir PyPDF2 con
PDFs reales delante, qué id de modelo debe ser el default de Anthropic, y
qué hacer con `database/backup_proton.py`.
