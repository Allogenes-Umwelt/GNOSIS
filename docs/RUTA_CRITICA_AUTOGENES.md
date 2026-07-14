# RUTA CRÍTICA — GNOSIS: FUNCIONALIDAD AUTOGENES

**Branch:** `AUTOGENES I` (`claude/gnosis-autogenes-i-85bwsd`)
**Versión:** 1.1 · 2026-07-10 · aprobada por el operador (Jesús)
**Fuente de referencia:** `autogenes/ref_karelen/` (snapshot de KARELEN, HEAD `4291d78`)

Cambios v1.1: hub AUTOGENES en el header (F3); motor de hallazgos único con
cuatro lentes — F9 CONCILIA, F10 VALIDACIÓN + ERRORES EN DATOS, F11 SINAPSIS,
F12 NOMOS; quórum multi-modelo y red team del grafo; carpeta de defensa;
regla de checkpoint visual con el operador.

---

## Tesis

Portar el sustrato AUTOGENES de KARELEN (Radar, Síntesis, Qualia, Vínculos,
mapa de ingesta) al backend/frontend existente de GNOSIS para convertirlo en
un **palantir por aplicación**: cada `processing_session` (corrida de
importación VW) se vuelve un caso de investigación con su propio grafo de
evidencia — vehículo (VIN) ↔ pedimento ↔ catálogo ↔ marca ↔ país ↔ factura ↔
PDF fuente — con ley de procedencia intacta, reglas de negocio monetizadas y
un chat que razona sobre el grafo citando hasta la página del PDF.

## Decisiones de arquitectura (aprobadas)

1. **Grafo server-side, lienzos client-side.** SQLite es la verdad (tablas
   `ag_*` escopadas por `session_id`, ley de procedencia, bitácora,
   cascadas); NetworkX es la lente — proyección en memoria por sesión, bajo
   demanda, con caché invalidada en cada mutación. Nunca se persiste el
   objeto NetworkX. Los lienzos (grafo de fuerzas d3, dendrograma, mapa)
   viven en vanilla JS en `static/`, alimentados por endpoints JSON (mismo
   patrón que `viz_data`).
2. **Unidad "aplicación" = `processing_session`.** Todo el sustrato se
   escopea por sesión; los baselines históricos cruzan sesiones solo en
   lectura.
3. **LLM: DeepSeek (pro v4) como default; Claude como fallback activable en
   admin.** Capa de proveedor única (`LLMProvider`) con esquemas de
   herramientas normalizados (formato interno → Anthropic / OpenAI-compatible).
   Llaves solo por variables de entorno (`DEEPSEEK_API_KEY`,
   `ANTHROPIC_API_KEY`); selector persistido en tabla `config`.
   **Quórum multi-modelo**: extracciones de alto impacto (montos,
   preferencias, VINs) pueden correr en ambos proveedores y solo se
   auto-acepta la coincidencia; el desacuerdo va a cola HITL.
4. **Qualia: port completo** (~40 archivos) + enhancements de servidor (F7).
5. **Los saneadores de citas viven en servidor** (`sanearPropuesta`,
   `sanearInforme`, `sanearNarrativa`, `sanearQuiz/Resumen/Cronologia`):
   ningún modelo, sea cual sea el proveedor, puede fabricar procedencia.
6. Los `.test.ts` de KARELEN son la especificación: cada módulo portado
   cierra con su suite pytest equivalente.
7. **Motor de hallazgos único, cuatro lentes.** Conciliación (coherencia
   entre fuentes), Validación (conformidad contra la norma), Errores en
   datos (calidad de la captura), Sinapsis (conocimiento nuevo). Un solo
   ciclo de vida (`nuevo → en gestión → resuelto / descartado`), severidad,
   monetización cuando aplique, evidencia citada, publicación al Radar y al
   chat. Cada lente es una familia de reglas con dashboard propio.
8. **Checkpoint visual obligatorio**: el diseño visual de cada dashboard se
   detiene con el operador antes de construirse — el operador dirige la
   propuesta visual; no se implementa UI sin su visto bueno.

## Leyes no negociables (heredadas de KARELEN)

- Toda entidad/relación/evento extraído **cita fragmentos**; lo de origen
  operador lleva `origen` como procedencia.
- **Cascada de procedencia**: borrar un artefacto poda su evidencia; lo
  extraído que se queda sin evidencia muere, lo curado por el operador
  sobrevive.
- **Bitácora append-only** en toda mutación; ni el undo la reescribe.
- **Merge aditivo**: una escritura automática enriquece, nunca sobreescribe
  lo curado. Deletes jamás delegados al modelo.
- **Afirmaciones en competencia**: cuando dos fuentes discrepan (DWH vs
  factura), ambas afirmaciones persisten con su fuente y el conflicto es
  visible — nunca se resuelve en silencio.
- **El modelo propone, el servidor verifica, el operador decide**: toda
  hipótesis, regla o extracción generada por LLM se recomputa/valida en
  servidor antes de publicarse.

---

## Fases

Cadena crítica: **F1 → F2 → F3**. F4-F12 cuelgan de F1-F2 y se paralelizan
según la matriz.

### F0 · Fundación del branch — (S) ✅
Snapshot de KARELEN en `autogenes/ref_karelen/` (244 archivos, no se
importa) + este documento. Commit `0070860`.

### F1 · Núcleo ontológico — (L) · bloquea todo · EN CURSO
- **F1a — repo ejecutable**: el checkout está aplanado; restaurar la
  estructura de paquetes que el código espera: `database/` (models,
  persistence, backup + `__init__.py` con `DB_PATH`/`get_connection`/
  `init_db` — ausente del snapshot, se escribe nuevo), `jarvis/`
  (llm_interface, chat_handler, tools, tool_executor, ofuscation, prompts),
  `templates/`, `static/`. Dockerfile a gunicorn + `/health`.
- **F1b — esquema AUTOGENES**: tablas `ag_artefactos`, `ag_fragmentos`,
  `ag_entidades`, `ag_relaciones`, `ag_eventos`, `ag_productos`,
  `ag_bitacora` con `session_id` + índices; SQLite en WAL +
  `foreign_keys=ON`; tabla de migraciones versionadas.
- **F1c — servicio de sustrato**: vocabulario de mutación del store de
  KARELEN (`store/autogenes.ts`): upsert por nombre/alias, merge aditivo,
  cascada de procedencia, fusión de entidades, bitácora, import saneado.
- **F1d — pytest** de la ley de procedencia (espec: `store/autogenes.test.ts`).
- Espec de tipos: `ref_karelen/types/autogenes.ts` → Pydantic.

### F1.5 · Capa de proveedor LLM — (M) · antes de cualquier fase con modelo
- `DeepSeekProvider` (API OpenAI-compatible) default; `AnthropicProvider`
  fallback activable en admin; `OllamaProvider` se conserva.
- Tool-calling normalizado: `TOOL_DEFINITIONS` en formato interno único
  traducido por proveedor; respuestas normalizadas en `chat_handler`.
- Tabla `config` + panel admin mínimo (selector proveedor/modelo).
- Infraestructura de quórum multi-modelo (decisión 3).

### F2 · Proyección — el grafo por sesión — (M)
- Port de `lib/ontologia.ts` + `lib/grafo.ts`: proyectar los datos aduanales
  existentes a ontología **en lectura** (nunca doble escritura): sesión como
  núcleo → pedimentos → vehículos → facturas → PDFs como artefactos; las
  filas de `extraccion_facturas` citan su PDF como fragmento.
- Semilla natural: el JOIN de `get_historico_concentrado2()`.
- Capa NetworkX: constructor de grafo por sesión + caché invalidada por
  mutación.
- **Aquí nace el palantir por aplicación.**

### F3 · Hub AUTOGENES + lienzo del grafo + Vínculos — (L)
- **Botón AUTOGENES en el header** (`base.html`): abre el hub del sustrato —
  Grafo · Ingesta · Radar · Vínculos · Síntesis · Qualia · CONCILIA ·
  VALIDACIÓN · ERRORES · SINAPSIS — cada sección un dashboard propio que se
  enciende al cerrar su fase. **Diseño visual: checkpoint con el operador
  antes de construir (decisión 8).**
- `GrafoCanvas` → vanilla JS (d3-force vendoreado en `static/`, Canvas 2D,
  anillos concéntricos por tipo, gestos, `prefers-reduced-motion`).
- `capacidades/caminos` → Python sobre NetworkX (camino más corto con citas,
  vecindario por grados, hubs). Vista `/autogenes/grafo`.
- Productos: dockear caminos guardados como `Producto{clase:"camino"}`.

### F4 · Ingesta + mapa de ingesta — (M) · paralelizable con F3
- Vista de ingesta reusando el pipeline PDF existente (pdfplumber/pypdf);
  cada PDF procesado se registra como artefacto + fragmentos por página.
- `extraerGrafo`: endpoint de extracción de entidades citadas (DeepSeek) con
  `sanearPropuesta` portado; revisión HITL antes de integrar.
- Mapa de ingesta: `DendrogramaCanvas` (dendrograma circular, Canvas puro)
  → vanilla JS desde el port de `arbolOntologia`.

### F5 · Radar — (S)
- `capacidades/senales` + `capacidades/calidad` → Python.
- Vista: vencimientos, fuentes frías, colas de adjudicación, salud del
  grafo, edad del backup. Recibe los hallazgos de F9-F11.

### F6 · Síntesis — (M)
- `capacidades/informe` (digesto) → Python; endpoint LLM con `sanearInforme`.
- El informe se dockea como `Producto{clase:"informe"}` citado al grafo.

### F7 · Qualia — port completo + enhancements de servidor — (XL)
- `capacidades/signature` (topología: comunidades, puentes, renormalización,
  persistencia H0) y `capacidades/anomalias` (9 detectores) → Python sobre
  NetworkX + numpy/scipy.
- Store propio (`ag_qualia_*`: telemetría en `ag_qualia_snapshots`, baseline
  del operador en `ag_qualia_base`) + endpoint narrativo con saneador.
  (Nota v1.2: las tablas `lotes`/`fusiones` que este plan preveía NO se
  portaron — vestigio de la referencia KARELEN; el store real son esas dos.)
- Los 8 lienzos (Red/Topología, Terreno, Orbe, Cascada, Horizonte, Cuerdas,
  Espectral, Máquina C2) → vanilla JS, en ese orden de prioridad.
- **Enhancements servidor:** (a) snapshots automáticos tras cada
  ingesta/mutación; (b) baselines cruzados entre sesiones por
  marca/país/aduana; (c) cómputo exacto pesado; (d) alertas proactivas al
  Radar y al chat; (e) drift topológico entre sesiones.

### F8 · Gnosis AI sobre el grafo — (M) · paralelizable desde F3
- Herramientas nuevas: `expediente_entidad`, `camino_entre`, `vecindario`,
  `senales_caso`, `resumen_grafo`, `hallazgos_pendientes`.
- Respuestas con citas verificables: afirmación → fragmento → página → PDF.
- Actualizar `prompts.py` (esquema `ag_*`) y ofuscación donde aplique.

### F9 · Motor de hallazgos + CONCILIA — (L) · paralelizable con F5-F7
**El motor se construye una vez aquí** y lo comparten F10-F12: hallazgo con
severidad, impacto MXN (supuestos explícitos configurables), evidencia
citada, ciclo de vida `nuevo → en gestión → resuelto / descartado`, nota del
operador, traza en bitácora, publicación al Radar/chat. **Carpeta de
defensa**: export a un clic del dossier de auditoría por hallazgo (cadena
hallazgo → regla → base normativa → fragmentos → PDFs).

**CONCILIA — lente de coherencia entre fuentes** (dashboard propio):
1. Conciliación tri-fuente continua (DWH=vendido, facturas=llegado,
   pedimentos=declarado): estado vivo por VIN, escrito al grafo como
   afirmaciones en competencia.
2. Reglas iniciales: R1 faltantes · R2 conflicto de precio · R3
   origen/moneda incoherente · R4 preferencia J/N no aprovechada (arancel
   recuperable por fracción) · R5 incrementables fuera de banda · R6
   run-rate de cupo (agotamiento anticipado o caducidad sin uso) · R7 VIN
   inválido/duplicado inter-sesión · R8 desfase factura↔pedimento · R9
   anomalía por patente · R10 watchlists.
3. Informe de Valor mensual (reusa F6): top hallazgos por impacto, citados.
4. Proyección y what-if de cupos (run-rate + estacionalidad; motor de
   cascada).

### F10 · VALIDACIÓN + ERRORES EN DATOS — (M) · sobre el motor de F9
**VALIDACIÓN — lente de conformidad (la glosa preventiva):** validadores
declarativos al ingreso con veredicto `pasa / observado / rechazado`:
estructurales (dígito verificador VIN, WMI del grupo, formatos, moneda ISO),
de catálogo (fracción↔modelo, país válido por marca, AUTO registrado), de
negocio/normativos (leyenda de preferencia para J, secuencia de fechas,
completitud por tipo de documento). Entregable: **expediente certificado por
sesión** — % de documentos que pasan, observaciones abiertas, sello "listo
para auditoría".

**ERRORES EN DATOS — lente de calidad de captura:** (1) observatorio de la
taxonomía de errores existente (`facturas_errores`) con tendencia por
mes/marca/emisor y priorización cuantificada de mejoras al parser; (2)
outliers estadísticos (precios fuera de distribución, fechas imposibles,
factores 10x, duplicados blandos); (3) **curación asistida por LLM (HITL)**:
re-lectura de PDFs fallidos con propuesta de extracción, cola de curación,
lo aprobado entra con procedencia `operador`; tasa de recuperación como KPI;
(4) drift de calidad por proveedor/mes.

### F11 · SINAPSIS — recombinación e insights — (L) · depende de F7 y F9
1. Motor de recombinación tras cada ingesta: cruces sistemáticos de
   dimensiones (marca × país × aduana × agente × fracción × moneda × J/N ×
   mes): asociaciones, cohortes, estacionalidad, concentración (HHI) +
   señales topológicas de Qualia (comunidad nueva, puente, centralidad).
2. LLM como generador de hipótesis sobre el digesto estadístico+topológico;
   **cada hipótesis se recomputa contra SQL/NetworkX antes de publicarse**
   — sin sostén y tamaño de efecto, muere en servidor.
3. **Grafo auto-reconfigurable**: cada insight compila a una `VistaInsight`
   declarativa (subconjunto, reagrupamiento, resaltado) y el GrafoCanvas se
   reconfigura animado para mostrar el insight; carrusel de insights con
   narrativa citada.
4. **Flywheel insight → regla**: un insight aceptado se promueve con un clic
   a regla permanente (CONCILIA/VALIDACIÓN/watchlist). El sistema descubre →
   el operador aprueba → el sistema vigila para siempre.
5. **Red team del grafo**: pase adversarial periódico que intenta refutar
   los hallazgos/insights activos; lo que sobrevive sube de confianza.

### F12 · NOMOS — la ontología de reglas de negocio — (M) · depende de F9 y F11
Las reglas dejan de ser configuración y se vuelven ciudadanos del grafo:
1. **Regla como Entidad** tipo `regla`: definición (DSL declarativa cerrada),
   dueño, versión, vigencia, estado (`borrador → activa → suspendida →
   retirada`), y aristas a todo lo que toca (norma que la fundamenta,
   hallazgos que produjo, tipos que vigila).
2. **P&L por regla**: MXN detectados / recuperados (de la cola de gestión),
   tasa de falsos positivos, costo de atención. El portafolio de reglas se
   gestiona por retorno.
3. **Backtesting obligatorio**: toda regla nueva se corre contra las
   sesiones históricas antes de activarse ("habría detectado X MXN en 12
   meses").
4. **Normativa como evidencia**: Ley Aduanera, reglas de comercio exterior,
   anexos T-MEC, circulares VW se ingestan como artefactos; cada regla cita
   su fragmento normativo → alertas defendibles + análisis de impacto ante
   cambio regulatorio.
5. **Autoría en lenguaje natural gobernada**: LLM compila la regla a DSL →
   validación contra la ontología → backtest → activación por el operador.
6. **Herencia y cobertura**: reglas generales del grupo → especializaciones
   por marca/país; detección de conflictos entre reglas; **mapa de
   cobertura** en el GrafoCanvas: territorio vigilado vs territorio ciego.

Flywheel completo: SINAPSIS descubre → NOMOS legisla → el motor vigila → la
gestión mide → el P&L retroalimenta → el mapa de cobertura dice dónde falta
→ SINAPSIS busca ahí.

### Transversal · Robustecimiento del backend (se reparte en F1-F12)
1. gunicorn + `/health` + logging estructurado (con F1).
2. Upgrade Flask 3.x / Werkzeug / `pypdf` moderno; pines completos (con F1,
   incremental).
3. Jobs en background para el pipeline (tabla de trabajos + hilo ejecutor,
   endpoint de progreso) (con F4).
4. Gate de operador (auth mínima) antes de exponer vistas nuevas (con F3).
5. Pydantic en las fronteras de API (desde F1, incremental).
6. pytest + ruff + GitHub Actions en el branch (desde F1).
7. Backups programados + export/import de bundle JSON por sesión — semilla
   de la **federación GESTELL**: bundles saneados intercambiables entre
   aplicativos-palantir sin compartir identificadores sensibles (con F5).

### Fase II (posterior, no en la ruta crítica)
- Time-travel del grafo (bitácora como event-log → grafo "como estaba el 15
  de mayo" + diff entre fechas/sesiones).
- Agente investigador con dimmer de autonomía (`proponer_plan`, D6 de
  KARELEN); deletes nunca delegados.
- Resolución de entidades inter-sesión con adjudicación HITL.
- Capa geo (maplibre-gl, opt-in de red).
- Federación GESTELL completa.

---

## Matriz de dependencias

```
F0 ─ F1 ─┬─ F1.5 ─┬─ F4 (extracción LLM) · F6 · F7 (narrativa) · F8
         │        └─ F10 (curación LLM) · F11 (hipótesis) · F12 (autoría NL)
         └─ F2 ──┬─ F3 (hub + lienzo) ── F8
                 ├─ F4 · F5 · F6 · F7
                 └─ F9 (motor + CONCILIA) ─┬─ F10 (VALIDACIÓN + ERRORES)
                                           ├─ F11 (SINAPSIS, requiere F7)
                                           └─ F12 (NOMOS, requiere F11)
F5 (Radar) muestra hallazgos de F9-F11.
```

Tamaños: S = corto, M = medio, L = grande, XL = el mayor (Qualia completo).

## Regla de trabajo

El operador (Jesús) aprueba dirección antes de escribir código nuevo de cada
fase, y **todo diseño visual de dashboard se detiene con él antes de
construirse**. Commits convencionales, pequeños y enfocados, siempre en
`claude/gnosis-autogenes-i-85bwsd`. Ningún secreto en el repo — llaves solo
por variables de entorno locales (`.env` está en `.gitignore`).
