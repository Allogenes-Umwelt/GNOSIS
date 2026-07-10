# RUTA CRÍTICA — GNOSIS: FUNCIONALIDAD AUTOGENES

**Branch:** `AUTOGENES I` (`claude/gnosis-autogenes-i-85bwsd`)
**Versión:** 1.0 · 2026-07-10 · aprobada por el operador (Julio)
**Fuente de referencia:** `autogenes/ref_karelen/` (snapshot de KARELEN, HEAD `4291d78`)

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
4. **Qualia: port completo** (~40 archivos) + enhancements de servidor (ver F7).
5. **Los saneadores de citas viven en servidor** (`sanearPropuesta`,
   `sanearInforme`, `sanearNarrativa`, `sanearQuiz/Resumen/Cronologia`):
   ningún modelo, sea cual sea el proveedor, puede fabricar procedencia.
6. Los `.test.ts` de KARELEN son la especificación: cada módulo portado
   cierra con su suite pytest equivalente.

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

---

## Fases

Cadena crítica: **F1 → F2 → F3**. F4-F9 cuelgan de F1-F2 y se paralelizan.

### F0 · Fundación del branch — (S) ✅ este commit
Snapshot de KARELEN en `autogenes/ref_karelen/` (244 archivos, no se
importa) + este documento.

### F1 · Núcleo ontológico — (L) · bloquea todo
- Tablas en `SCHEMA_SQL` (`models.py`): `ag_artefactos`, `ag_fragmentos`,
  `ag_entidades`, `ag_relaciones`, `ag_eventos`, `ag_productos`,
  `ag_bitacora`, todas con `session_id` + índices.
- Servicio Python con el vocabulario de mutación del store de KARELEN
  (`store/autogenes.ts`): upsert por nombre/alias, merge aditivo, cascada de
  procedencia, fusión de entidades, bitácora, import/merge saneado.
- Modernización estructural que esta fase arrastra: app factory +
  blueprints (`aduanas`, `autogenes`, `chat`, `api`, `admin`), tabla de
  migraciones versionadas, SQLite en WAL + `foreign_keys=ON`.
- Espec: `ref_karelen/types/autogenes.ts` (→ Pydantic) y los tests del store.

### F1.5 · Capa de proveedor LLM — (M) · antes de cualquier fase con modelo
- `DeepSeekProvider` (API OpenAI-compatible) como default; `AnthropicProvider`
  queda como fallback activable en admin; `OllamaProvider` se conserva.
- Normalización de tool-calling: `TOOL_DEFINITIONS` en formato interno único
  traducido por proveedor; respuestas normalizadas en `chat_handler`.
- Tabla `config` + panel admin mínimo (selector de proveedor/modelo).

### F2 · Proyección — el grafo por sesión — (M)
- Port de `lib/ontologia.ts` + `lib/grafo.ts`: proyectar los datos aduanales
  existentes a ontología **en lectura** (nunca doble escritura): sesión como
  núcleo → pedimentos → vehículos → facturas → PDFs como artefactos; las
  filas de `extraccion_facturas` citan su PDF como fragmento.
- Semilla natural: el JOIN de `get_historico_concentrado2()`.
- Capa NetworkX: constructor de grafo por sesión + caché.
- **Aquí nace el palantir por aplicación** — cada sesión ya tiene grafo sin
  escribir datos nuevos.

### F3 · Lienzo del grafo + Vínculos — (L)
- `GrafoCanvas` → vanilla JS (d3-force vendoreado en `static/`, Canvas 2D,
  anillos concéntricos por tipo, gestos táctiles, `prefers-reduced-motion`).
- `capacidades/caminos` → Python sobre NetworkX (camino más corto con citas,
  vecindario por grados, hubs). Vista `/autogenes/grafo` extiende `base.html`.
- Productos: dockear caminos guardados como `Producto{clase:"camino"}`.

### F4 · Ingesta + mapa de ingesta — (M) · paralelizable con F3
- Vista de ingesta reusando el pipeline PDF existente (pdfplumber/pypdf);
  cada PDF procesado se registra como artefacto + fragmentos por página.
- `extraerGrafo`: endpoint Flask de extracción de entidades citadas
  (DeepSeek) con `sanearPropuesta` portado; flujo de revisión HITL antes de
  integrar.
- Mapa de ingesta: `DendrogramaCanvas` (dendrograma circular de la ontología,
  Canvas puro) → vanilla JS desde el port de `arbolOntologia`.

### F5 · Radar — (S)
- `capacidades/senales` + `capacidades/calidad` → Python.
- Vista: vencimientos, fuentes frías, colas de adjudicación, salud del grafo,
  edad del backup. Recibe también los hallazgos de F9.

### F6 · Síntesis — (M)
- `capacidades/informe` (digesto) → Python; endpoint LLM con `sanearInforme`.
- El informe se dockea como `Producto{clase:"informe"}` citado al grafo.

### F7 · Qualia — port completo + enhancements de servidor — (XL)
- `capacidades/signature` (topología: comunidades, puentes, renormalización,
  persistencia H0) y `capacidades/anomalias` (9 detectores) → Python sobre
  NetworkX + numpy/scipy (Louvain, articulación, betweenness exacta,
  espectral).
- Store propio (`ag_qualia_*`: lotes, telemetría, baseline, fusiones) +
  endpoint narrativo con saneador (el modelo interpreta topología ya
  computada, nunca recomputa).
- Los 8 lienzos (Red/Topología, Terreno, Orbe, Cascada, Horizonte, Cuerdas,
  Espectral, Máquina C2) → vanilla JS, en ese orden de prioridad.
- **Enhancements servidor:** (a) snapshots automáticos tras cada
  ingesta/mutación → series temporales reales; (b) baselines cruzados entre
  sesiones por marca/país/aduana; (c) cómputo exacto pesado; (d) alertas
  proactivas de los detectores publicadas al Radar y al chat; (e) drift
  topológico entre sesiones.

### F8 · Gnosis AI sobre el grafo — (M) · paralelizable desde F3
- Herramientas nuevas: `expediente_entidad`, `camino_entre`, `vecindario`,
  `senales_caso`, `resumen_grafo`, `hallazgos_pendientes`.
- Respuestas con citas verificables: afirmación → fragmento → página → PDF.
- Actualizar `prompts.py` (esquema `ag_*`) y ofuscación donde aplique.

### F9 · CONCILIA — motor de conciliación y valor de negocio — (L) · paralelizable con F5-F7
Convierte GNOSIS en detector de fugas y riesgo con importe:
1. **Conciliación tri-fuente continua** (DWH=vendido, facturas=llegado,
   pedimentos=declarado): estado vivo por VIN (`conciliado / falta factura /
   falta venta / conflicto precio / conflicto país / conflicto J-N`),
   escrito al grafo como afirmaciones en competencia.
2. **Motor de reglas declarativas** (tabla `reglas_negocio`, editable en
   admin, evaluada en cada ingesta). Catálogo inicial: R1 faltantes ·
   R2 conflicto de precio · R3 origen/moneda incoherente · R4 preferencia
   J/N no aprovechada (arancel recuperable por fracción) · R5 incrementables
   fuera de banda histórica · R6 run-rate de cupo (agotamiento anticipado o
   caducidad sin uso) · R7 VIN inválido/duplicado inter-sesión · R8 desfase
   factura↔pedimento · R9 anomalía por patente (agente aduanal) ·
   R10 watchlists.
3. **Monetización**: impacto estimado en MXN por hallazgo, con supuestos
   explícitos y configurables (tabla de tasas por fracción como insumo
   admin). Sin magnitud no hay hallazgo prioritario.
4. **Cola de gestión**: ciclo de vida `nuevo → en gestión → resuelto /
   descartado`, nota del operador, traza en bitácora.
5. **Informe de Valor mensual** (reusa F6): top hallazgos por impacto, cada
   afirmación citada al PDF.
6. **Proyección y what-if de cupos**: forecast run-rate + estacionalidad del
   `seguimiento_mensual` histórico, con bandas; escenarios vía el motor de
   cascada.

### Transversal · Robustecimiento del backend (se reparte en F1-F9)
1. gunicorn + `/health` + logging estructurado (con F1).
2. Upgrade Flask 3.x / Werkzeug / `pypdf` moderno; pines completos (con F1).
3. Jobs en background para el pipeline (tabla de trabajos + hilo ejecutor,
   endpoint de progreso) (con F4).
4. Gate de operador (auth mínima) antes de exponer vistas nuevas (con F3).
5. Pydantic en las fronteras de API (desde F1, incremental).
6. pytest + ruff + GitHub Actions en el branch (desde F1).
7. Backups programados (`backup.py` al scheduler) + export/import de bundle
   JSON por sesión (con F5).

### Fase II (post-F8/F9, no en la ruta crítica)
- Time-travel del grafo (bitácora como event-log → grafo "como estaba el
  15 de mayo" + diff entre fechas/sesiones).
- Agente investigador con dimmer de autonomía (`proponer_plan`, D6 de
  KARELEN): el modelo propone mutaciones, el operador gradúa la
  auto-aprobación; deletes nunca delegados.
- Resolución de entidades inter-sesión (mismo proveedor/patente a través de
  meses) con adjudicación HITL.
- Capa geo (aduanas/orígenes en maplibre-gl, opt-in de red).

---

## Matriz de dependencias

```
F0 ─ F1 ─┬─ F1.5 ─┬─ F4 (extracción LLM)
         │        ├─ F6 · F7 (narrativa) · F8
         └─ F2 ──┬─ F3 ── F8
                 ├─ F4 (proyección en mapa)
                 ├─ F5 ←─ hallazgos de F9
                 ├─ F6
                 ├─ F7
                 └─ F9
```

Tamaños: S = corto, M = medio, L = grande, XL = el mayor (Qualia completo).

## Regla de trabajo

El operador aprueba dirección antes de escribir código nuevo de cada fase.
Commits convencionales, pequeños y enfocados, siempre en
`claude/gnosis-autogenes-i-85bwsd`. Ningún secreto en el repo.
