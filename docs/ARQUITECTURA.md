# Arquitectura de GNOSIS

Documentación de arquitectura del software siguiendo el **modelo C4**
(Context → Container → Component → Code) de Simon Brown, con vistas de
**proceso (BPMN-style)**, **modelo de datos (ER)**, **secuencia**,
**despliegue** y — porque el frontend es la mitad del sistema — un **mapa
completo de superficies visuales**. Los diagramas están en Mermaid (se
renderizan en GitHub y en cualquier visor Mermaid). Estructura del documento
según arc42.

GNOSIS es un sistema de analítica de importaciones aduanales para el Grupo
Volkswagen México: extrae facturas y pedimentos (PDF), reconcilia contra el
DWH, y construye sobre ese dato un **sustrato de ontología unificada
(AUTOGENES)** — un grafo de evidencia con procedencia — más un **flujo de
investigación** completo (detectar → disponer → documentar → defender →
vigilar), una capa de inteligencia (LLM con ofuscación de identificadores) y
tableros de negocio.

Principios rectores (ver también `CLAUDE.md`): **ZERO SNAKE OIL** (todo
número es salida de motor; nada se estima ni se inventa), **ley de
procedencia** (toda entidad extraída cita su fragmento fuente), **sustrato
como único escritor** de las tablas `ag_*`, **bitácora WORM**,
**determinismo del render** (el mismo grafo abre idéntico), y **ofuscación
de identificadores** (chasis/factura) antes de exponerlos a un LLM.

---

## Stack tecnológico

Stack deliberadamente corto — cada pieza está ahí por una decisión
registrada (§Decisiones), no por inercia.

| Capa | Tecnología | Papel | Dónde |
|------|-----------|-------|-------|
| Runtime | Python 3.11 | Todo el backend | — |
| Web | Flask (factory + blueprints) | 121 rutas: 81 AUTOGENES + 11 tableros + 29 shell/pipeline | `app.py`, `rutas/` |
| Datos | SQLite (WAL) — **única verdad** | 14 tablas aduanales + 12 tablas `ag_*` del sustrato | `database/` |
| Tipos | pydantic | Contratos del sustrato (Entidad, Producto, …) | `autogenes/tipos.py` |
| Grafo | NetworkX — **confinado** | Solo lentes de sesión (camino/vecindario/hubs); JAMÁS cifras de panel ni layout | `autogenes/red.py`, `caminos.py` |
| Ingesta | pandas / PyPDF2 / tabula | Bordes de ingesta y pipeline legado | `PDFs_*.py`, `concentrado*.py` |
| LLM | DeepSeek (def.) / Anthropic / Ollama | Gnosis·IA — chat con 26 tools sobre el grafo | `jarvis/` |
| Frontend | **JS vanilla** + Jinja2 — sin build step, sin framework, sin bundler | 33 superficies JS; canvas 2D para campos densos, SVG para diagramas | `static/`, `templates/` |
| Design system | GESTELL/PANOPTES — tokens CSS puros | AAA en ambos temas, magenta disciplinado, motion tokenizado | `static/styles.css` |
| Calidad | pytest (506) + ruff + eslint + CI GitHub Actions | Doble corrida para métricas; gate en cada push/PR | `tests/`, `.github/workflows/ci.yml` |

---

## C4 · Nivel 1 — Contexto del sistema

Quién usa GNOSIS y con qué sistemas externos habla.

```mermaid
C4Context
    title GNOSIS · Diagrama de Contexto

    Person(operador, "Operador (Jesús)", "Analista aduanal VW. Sube facturas/pedimentos, investiga descuadres, defiende ante glosa, consulta el caso.")

    System(gnosis, "GNOSIS", "Analítica de importaciones + sustrato de evidencia AUTOGENES + flujo de investigación + tableros de negocio. Local-first.")

    System_Ext(deepseek, "DeepSeek API", "LLM por defecto para Gnosis·IA (chat sobre el grafo).")
    System_Ext(anthropic, "Anthropic API", "LLM de respaldo, activable en admin.")
    System_Ext(ollama, "Ollama", "LLM local de respaldo offline.")
    System_Ext(osm, "OpenStreetMap", "Teselas de mapa SOLO para el tablero de Rutas (TBV-03).")

    Rel(operador, gnosis, "Sube documentos, investiga, dispone hallazgos, dockea productos", "HTTPS")
    Rel(gnosis, deepseek, "Consulta con tools; identificadores OFUSCADOS", "HTTPS")
    Rel(gnosis, anthropic, "Fallback LLM", "HTTPS")
    Rel(gnosis, ollama, "Fallback offline", "HTTP local")
    Rel(gnosis, osm, "Pide teselas (única excepción de assets externos)", "HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

**Nota de privacidad:** los identificadores sensibles (chasis/VIN, número de
factura, pedimento, patente) **nunca** viajan en claro a un LLM. La capa de
ofuscación (`jarvis/ofuscation.py`) los reemplaza por tokens reversibles
solo en el dispositivo.

---

## C4 · Nivel 2 — Contenedores

Las piezas ejecutables/desplegables y cómo se comunican. GNOSIS corre como
un proceso Flask monolítico con módulos internos bien separados.

```mermaid
C4Container
    title GNOSIS · Diagrama de Contenedores

    Person(operador, "Operador", "Navegador")

    System_Boundary(gnosis, "GNOSIS") {
        Container(spa, "Frontend (Jinja + JS vanilla)", "HTML/Jinja2 + Canvas 2D + SVG", "33 superficies: tableros deep-tech, studio QUALIA, flujo de descuadre, chat. Nocturne/Daylight.")
        Container(flask, "Aplicación Flask", "Python 3.11 / Flask", "Factory + blueprints. 121 rutas, orquestación del pipeline, contrato de errores, candado de operador.")
        Container(motores, "Motores del sustrato", "Python puro", "31 módulos AUTOGENES (grafo de evidencia + flujo de investigación) + 6 tableros de negocio. Deterministas, testeados, sin IO.")
        Container(jarvis, "Gnosis·IA", "Python", "Chat sobre el grafo: selección de proveedor LLM, 26 tools, ofuscación de identificadores, quorum.")
        Container(pipeline, "Pipeline legado (INTOCABLE)", "Python + pandas/tabula/PyPDF2", "Extracción de PDFs → concentrados → estadístico de cupos. Import perezoso; excluido de ruff a propósito.")
        ContainerDb(db, "SQLite", "Base local (WAL)", "Única fuente de verdad: 14 tablas aduanales + 12 tablas ag_* del sustrato.")
    }

    System_Ext(llm, "Proveedores LLM", "DeepSeek / Anthropic / Ollama")
    System_Ext(osm, "OpenStreetMap", "Teselas (solo TBV-03)")

    Rel(operador, spa, "Usa", "HTTPS")
    Rel(spa, flask, "Llama API JSON / carga páginas", "HTTPS")
    Rel(spa, osm, "Teselas del mapa", "HTTPS")
    Rel(flask, motores, "Invoca (read-time)", "in-process")
    Rel(flask, jarvis, "Delega el chat", "in-process")
    Rel(flask, pipeline, "Orquesta fases 1-4", "in-process")
    Rel(motores, db, "Lee; escribe SOLO vía Sustrato", "sqlite3")
    Rel(pipeline, db, "Persiste extracción/concentrados", "sqlite3")
    Rel(flask, db, "Sesiones, stats", "sqlite3")
    Rel(jarvis, motores, "Consulta el grafo vía tools", "in-process")
    Rel(jarvis, llm, "Chat (identificadores ofuscados)", "HTTPS")
```

### Mapa de código → contenedor

| Contenedor | Código |
|------------|--------|
| Frontend | `templates/*.html` (Jinja), `static/*.js` (renderers canvas/SVG), `static/*.css` (tokens GESTELL) |
| Aplicación Flask | `app.py` (factory, pipeline legado, sessions/admin/chat/errores), `rutas/` (blueprints `tableros`, `autogenes`, helpers `comun`) |
| Motores | `autogenes/` (sustrato + 30 capacidades), `tableros/` (dominio, maduración, rechazos, cupo, rutas, fechas) |
| Gnosis·IA | `jarvis/` (llm_interface, tool_executor, tools ×18, tools_grafo ×8, ofuscation, prompts, quorum, chat_handler) |
| Pipeline legado | `PDFs_Final_v3.py`, `PDFs_v2.py`, `concentrado1.py`, `concentrado2.py`, `Estadistico.py` — **no se tocan**; todo ajuste va en el borde |
| SQLite | `database/` (models, models_autogenes, persistence, migrations, backup) |

---

## C4 · Nivel 3 — Componentes de la Aplicación Flask

Interior del contenedor Flask: las familias de rutas (blueprints) y los
cortes transversales.

```mermaid
C4Component
    title GNOSIS · Componentes de la Aplicación Flask

    Container_Boundary(flask, "Aplicación Flask") {
        Component(factory, "Factory + before_request", "app.py", "Crea la app, registra blueprints, candado de operador (X-Gnosis-Token en métodos mutantes), contrato de errores (HTTPException conserva su código; /api responde JSON).")
        Component(bp_tab, "Blueprint tableros", "rutas/tableros.py", "11 rutas: 5 páginas + APIs de negocio (TBV-01..05).")
        Component(bp_auto, "Blueprint autogenes", "rutas/autogenes.py", "81 rutas: landing, grafo, ingesta, QUALIA, CONCILIA, VALIDACIÓN, SINAPSIS, NOMOS, CRONOS, CONTROL, disposiciones, expediente, síntesis, export.")
        Component(comun, "Helpers de sesión", "rutas/comun.py", "_con_sesion (estado vacío honesto = 404 declarado), _etiqueta_sesion, _sesion_activa.")
        Component(legacy, "Rutas /procesar", "app.py", "Fases 1-4 del pipeline; carga de ZIP con extracción acotada.")
        Component(shell, "Sessions/Admin/Chat/Errores", "app.py", "29 rutas: gestión de sesiones, config LLM, proxy de chat, panel de errores.")
    }

    ContainerDb(db, "SQLite", "WAL")
    Container(motores, "Motores", "Python puro")
    Container(jarvis, "Gnosis·IA", "Python")

    Rel(factory, bp_tab, "registra")
    Rel(factory, bp_auto, "registra")
    Rel(bp_tab, comun, "usa")
    Rel(bp_auto, comun, "usa")
    Rel(bp_tab, motores, "invoca (tableros)")
    Rel(bp_auto, motores, "invoca (AUTOGENES)")
    Rel(shell, jarvis, "delega chat")
    Rel(comun, db, "verifica sesión")
    Rel(legacy, db, "persiste")
```

---

## C4 · Nivel 3 — Componentes del sustrato AUTOGENES

El diferenciador: un grafo de evidencia con procedencia **más el flujo de
investigación**. `sustrato.py` es el **único escritor** de las tablas
`ag_*`; todo lo demás lee o propone. Los 31 módulos se organizan en seis
familias:

```mermaid
C4Component
    title AUTOGENES · Componentes del sustrato (por familia)

    Container_Boundary(ley, "Puerta y ley") {
        Component(sustrato, "Sustrato", "sustrato.py", "ÚNICO escritor de ag_*. Artefacto→Fragmento→Entidad→Relación, Evento, Producto, Regla, Disposición. Ley aditiva, bitácora WORM.")
        Component(tipos, "Tipos", "tipos.py", "Contratos pydantic del dominio.")
        Component(dispo, "Disposiciones", "disposiciones.py", "Ciclo de vida O1: anota lo declarado y lo CONTRASTA contra lo medido (contradice / resoluciones_verificadas).")
        Component(sello, "Sello", "sello.py", "Integridad C1-lite: sha256 re-derivable del producto; verificar() = guardado vs re-derivado.")
    }
    Container_Boundary(ing, "Ingesta") {
        Component(ingesta, "Ingesta", "ingesta.py, lotes.py, extraccion.py", "PDF/JPG → fragmentos → entidades citadas; ZIP por goteo con manifiesto.")
    }
    Container_Boundary(grafo, "Proyección y grafo") {
        Component(proyeccion, "Proyección", "proyeccion.py, red.py", "Proyecta el dato aduanal al grafo en tiempo de lectura (sin dual-write). NetworkX solo como lente.")
        Component(topo, "Topología", "topologia.py, caminos.py, consultas.py", "Métricas puras y deterministas; expediente/camino/vecindario con citas.")
        Component(atencion, "Atención", "estado.py, senales.py, metabolismo.py", "Figuras vivas del landing, señales del caso, Radar de urgencias.")
    }
    Container_Boundary(qua, "QUALIA (OODA)") {
        Component(qualia, "QUALIA", "qualia.py, anomalias.py, cascada.py, horizonte.py, qualia_narrativa.py", "OBSERVAR (anomalías vs base) → ORIENTAR → DECIDIR (cascada simulada) → ACTUAR (horizonte).")
    }
    Container_Boundary(desc, "Descuadre (flujo de investigación)") {
        Component(concilia, "CONCILIA F9", "concilia.py", "10 clases de hallazgo tri-fuente monetizados por moneda real; cobertura; dossier sellado.")
        Component(valida, "VALIDACIÓN F10", "validacion.py", "22 tamices deterministas + veredicto en capas (rechazado/observado/pasa) + retícula + certificado sellado.")
        Component(nomos, "NOMOS F12", "nomos.py", "Reglas McCulloch-Pitts del operador (AND, θ=n) + P&L + backtest histórico.")
        Component(sinapsis, "SINAPSIS F11", "sinapsis.py", "Insights por recombinación verificada + lattice de particiones + volante insight→regla.")
        Component(control, "CONTROL A3", "control.py", "SPC transversal: cada métrica citada vs su historia (mediana ± 3·MAD), señal de régimen.")
    }
    Container_Boundary(sint, "Síntesis y tiempo") {
        Component(informe, "Síntesis F6", "informe.py, hechos.py, analisis_vw.py", "Informe ejecutivo citado sobre hechos MEDIDOS; red de flujo de negocio.")
        Component(cronos, "CRONOS F13", "cronos.py", "Time-travel aditivo por created_at sobre la bitácora.")
    }

    ContainerDb(agdb, "Tablas ag_*", "SQLite")

    Rel(ingesta, sustrato, "propone escrituras")
    Rel(dispo, sustrato, "escribe vía")
    Rel(sustrato, agdb, "escribe (único)")
    Rel(proyeccion, agdb, "lee dato proyectado")
    Rel(concilia, agdb, "lee")
    Rel(valida, agdb, "lee")
    Rel(sinapsis, concilia, "recombina salidas")
    Rel(sinapsis, valida, "recombina salidas")
    Rel(nomos, agdb, "evalúa ag_reglas")
    Rel(control, agdb, "lee historia")
    Rel(cronos, agdb, "reconstruye por tiempo")
```

### El acople del descuadre — un ciclo que aprende

Las piezas del flujo de investigación no son islas: forman un ciclo
cerrado donde el patrón detectado se vuelve norma y la norma se vuelve
veredicto.

```mermaid
flowchart LR
    SIN["SINAPSIS<br/>detecta la conjunción<br/>(error confirmado)"] -- "volante insight→regla<br/>(pre-llenada, HITL)" --> NOM["NOMOS<br/>la formaliza como regla M-P<br/>con P&L + backtest"]
    NOM -- "convergencia O5.1<br/>(estrato de su veredicto)" --> VAL["VALIDACIÓN<br/>lattice de conformidad<br/>⊤=U … ⊥=⋂ V̄ᵣ"]
    VAL -- "partición del universo" --> SIN
    CON["CONCILIA<br/>descuadres tri-fuente<br/>monetizados"] -- "protagonistas" --> SIN
    VAL & CON & NOM -- "disposición O1<br/>(ag_disposiciones, WORM)" --> O1{"¿cerrado pero<br/>sigue midiéndose?"}
    O1 -- "sí → ≠ contradicho" --> RADAR["Radar / CONTROL SPC"]
    O1 -- "ya no se mide → verificado" --> RADAR
```

---

## Mapa de superficies frontend

La mitad del sistema es visual. Cada superficie declara su **medio** (canvas
2D para campos densos y continuos; **SVG para diagramas** — donde el texto
truncado debe ser estructuralmente imposible; DOM para formas documentales)
y su **forma visual**. Todo color sale de tokens; el cambio de tema no
redibuja. Ningún render usa `Math.random` — el mismo grafo abre idéntico.

### Núcleo AUTOGENES

| Superficie | Ruta | JS | Medio | Forma visual | Datos |
|---|---|---|---|---|---|
| Constelación (landing) | `/autogenes` | `constelacion.js` | SVG | Constelación de figuras vivas, una por motor, con su métrica citada | `estado.py` |
| Radar | `/autogenes/radar` | `metabolismo.js` | canvas | Pools y reacciones del caso (Fuente→…→Producto), fugas accionables + urgencias | `metabolismo.py` |
| Vínculos (grafo) | `/autogenes/grafo`, `/vinculos` | `fuerzas.js` + `grafo.js` (+`vinculos.js`) | canvas | Grafo fuerza-dirigida **determinista**; Δ-nodos de descuadre; ghost-ink de dispuestos; deep-link `#n=` | `proyeccion.py` |
| Ingesta | `/autogenes/ingesta` | `chord.js` + `ingesta.js` | canvas + DOM | Acorde bipartito documento↔entidad; goteo de ZIP con manifiesto | `chord_ingesta.py`, `lotes.py` |
| Síntesis | `/autogenes/sintesis` | `sintesis.js` | canvas | Informe ejecutivo citado sobre hechos medidos | `informe.py`, `hechos.py` |
| CRONOS | `/autogenes/cronos` | `cronos.js` | canvas | Time-travel aditivo de la bitácora | `cronos.py` |
| Expediente | `/autogenes/expediente/<id>` | — (print-first) | DOM | Documento de defensa imprimible (`@media print`) con sello sha256 y cobertura | producto dockeado |

### Studio QUALIA (OODA)

Siete instrumentos canvas + dos capas compartidas: `qualia_dossier.js` (el
**cajón de dossier** con selección `?sel` que persiste entre pestañas) y
`qualia_export.js` (PNG/CSV).

| Instrumento | Fase OODA | Forma visual |
|---|---|---|
| `qualia.js` | OBSERVAR | Tablero de anomalías vs base medida |
| `qualia_terreno.js` | OBSERVAR | Terreno de anomalías |
| `qualia_orbe.js` | ORIENTAR | Orbe de centralidad (masas) |
| `qualia_cuerdas.js` | ORIENTAR | Cuerdas de comunidades |
| `qualia_deriva.js` | ORIENTAR | Deriva entre sesiones (drift) |
| `qualia_cascada.js` | DECIDIR | Cascada simulada (¿qué cae si cae X?) |
| `qualia_horizonte.js` | ACTUAR | Horizonte de eventos + telemetría de intervenciones |
| `qualia_maquina.js` | el bucle | La máquina OODA completa |

### Flujo de descuadre (investigación)

| Superficie | JS | Medio | Forma visual | Datos |
|---|---|---|---|---|
| CONCILIA | `concilia.js` + `ciclo_vida.js` + `control.js` | **SVG** + DOM | **Escalera de derivaciones P&ID**: espina VENDIDO→CONCILIADO→LLEGADO, cada fuga una estación FG con monto real; ciclo de vida O1 (ledger, filtros, ≠); cartas SPC | `concilia.py`, `control.py` |
| VALIDACIÓN | `validacion.js` + `ciclo_vida.js` + `control.js` | **SVG** + DOM | **Lattice de conformidad**: ⊤=U por dos rieles (DWH/PDF), tamices por estrato de veredicto, ⊥=⋂ V̄ᵣ; **retícula héroe** (una celda por fila, peor veredicto); ciclo O1 en la ficha; cartas SPC | `validacion.py`, `nomos.py`, `control.py` |
| NOMOS | `nomos.js` + `ciclo_vida.js` | canvas + DOM | **Neurona McCulloch-Pitts** de la regla (entradas→Σ→umbral→veredicto); P&L; backtest histórico; ciclo O1 | `nomos.py` |
| SINAPSIS | `sinapsis.js` | canvas + DOM | **Diamante del lattice de particiones** (⊤ → P·CONCILIA / P·VALIDACIÓN → ínfimo P∧P); tarjetas insight con cadena de composición; volante «formalizar regla» | `sinapsis.py` |
| VIN → dossier | `vin_dossier.js` | DOM | Todo VIN citado es enlace al cajón de dossier compartido; `?sel=` lo auto-abre | `consultas.py` |

### Tableros VW (negocio) y shell

| Superficie | JS | Medio | Forma visual |
|---|---|---|---|
| TBV-01 Dominio | `tbv_dominio.js` | canvas | Dominio de mercado por marca/modelo |
| TBV-02 Maduración | `tbv_maduracion.js` | canvas | Curvas de maduración de pedimentos |
| TBV-03 Rutas | `tbv_rutas.js` | canvas + OSM | Mapa de teselas con arcos de flujo por volumen |
| TBV-04 Rechazos | `tbv_rechazos.js` | canvas | Análisis de rechazos |
| TBV-05 Cupo | `tbv_cupo.js` | canvas | Consumo/proyección de cupos (`cupos_what_if`, método declarado) |
| Dashboard | `veredicto.js` + `constelacion.js` | SVG | Franja de veredicto + constelación |
| Chat Gnosis·IA | `chat.js` | DOM | Conversación con tools, render escapado contra XSS |
| Errores | — | DOM | Panel de curación de `facturas_errores` |

### Design system — GESTELL/PANOPTES (leyes visuales)

- **Solo tokens** (`static/styles.css`): cero hex/px crudos en componentes.
  Dos temas (Nocturne oscuro / Daylight claro) con contraste **AAA en
  ambos**; el toggle no redibuja porque el color vive en CSS.
- **Magenta disciplinado**: SOLO vía `--danger`/`--telos-on` — magenta =
  alerta real (violación, contradicción ≠), jamás decoración.
- **Motion desde tokens**; sin flashes >5 Hz; `prefers-reduced-motion`
  degrada a estático. Glows se apagan en Daylight (el trazo basta).
- **Accesibilidad**: severidad y estado siempre como TEXTO además de color;
  blancos de clic accesibles por teclado (`tabindex`, `role=button`);
  `aria-label` en todo diagrama.
- **Sin build step** (decisión registrada en `docs/EVALUACION_ESTANDAR_A.md`):
  JS vanilla servido por Jinja; nada de React/TS/Vite/Tailwind/bundler.

---

## Proceso (BPMN-style) — Ingesta y procesamiento del pedimento

El pipeline de negocio en 4 fases, con carriles por actor. Notación
BPMN-style: `([inicio/fin])`, `[tarea]`, `{compuerta}`.

```mermaid
flowchart TB
    subgraph OP["Carril · Operador"]
        A([Sube ZIP de facturas]) --> B([Sube DWH + incrementales])
        B --> C([Sube PDFs de cupo prod/inversión])
    end
    subgraph APP["Carril · Aplicación Flask (/procesar)"]
        A --> F1["Fase 1 · extraer facturas<br/>PDFs_to_excel + validación ZIP"]
        F1 --> G1{¿PDF extraíble?}
        G1 -- no --> ERR[/Registrar en facturas_errores/]
        G1 -- sí --> EXT[/Guardar en extraccion_facturas/]
        C --> F2["Fase 2 · Concentrado 1<br/>Concentrado(dwh, incrementales)"]
        F2 --> F3["Fase 3 · Concentrado 2"]
        F3 --> F4["Fase 4 · Estadístico<br/>estadistico_v4(cupos)"]
        F4 --> G2{¿Factura sin<br/>documento físico?}
        G2 -- sí --> FALT[/facturas_faltantes/]
        G2 -- no --> OK[/importaciones + seguimiento_mensual/]
    end
    subgraph DB["Carril · SQLite"]
        EXT --> P[(Persistir)]
        ERR --> P
        FALT --> P
        OK --> P
    end
    P --> Z([Sesión lista para análisis])

    classDef start fill:#0b3d4d,stroke:#00d4ff,color:#fff
    classDef gate fill:#3d2a2f,stroke:#ff2e88,color:#fff
    class A,B,C,Z start
    class G1,G2 gate
```

## Proceso (BPMN-style) — El flujo de investigación

El hueco que `docs/BENCHMARK_PALANTIR.md` declaraba como el valor central de
Palantir, cerrado: **detectar → disponer → documentar → defender →
vigilar**. El diferenciador honesto está en la compuerta final: GNOSIS no
solo registra lo que el operador dice — **contrasta lo declarado contra lo
medido** en cada corrida.

```mermaid
flowchart TB
    subgraph MOT["Carril · Motores (lectura pura — re-derivan en cada corrida)"]
        M1["CONCILIA · 10 clases<br/>de hallazgo tri-fuente"] --> H{¿hallazgos<br/>vivos?}
        M2["VALIDACIÓN · 22 tamices<br/>veredicto en capas"] --> H
        M3["NOMOS · reglas M-P<br/>del operador"] --> H
        M4["SINAPSIS · conjunciones<br/>entre motores"] --> H
    end
    subgraph OP["Carril · Operador (HITL)"]
        H -- sí --> T["Triaje: ledger, filtros,<br/>severidad como texto"]
        T --> D["DISPONER: nuevo → en_gestión →<br/>resuelto / descartado + nota"]
        D --> DOC["DOCUMENTAR: dockear<br/>dossier · certificado · insight"]
        DOC --> DEF["DEFENDER: expediente<br/>imprimible con cobertura"]
    end
    subgraph SUS["Carril · Sustrato (única puerta de escritura)"]
        D --> W[("ag_disposiciones<br/>+ bitácora WORM")]
        DOC --> PR[("ag_productos<br/>con sello sha256")]
    end
    subgraph VIG["Carril · Vigilancia"]
        W --> C1{"¿cerrado pero el motor<br/>lo SIGUE midiendo?"}
        C1 -- sí --> CONTRA["≠ CONTRADICHO<br/>(magenta legítimo)"]
        C1 -- "ya no se mide" --> VER["resolución VERIFICADA<br/>por el motor"]
        PR --> SPC["CONTROL · SPC:<br/>mediana ± 3·MAD vs historia"]
        SPC --> R["Radar: urgencias<br/>(régimen, norma, negocio)"]
        CONTRA --> R
    end

    classDef gate fill:#3d2a2f,stroke:#ff2e88,color:#fff
    class H,C1 gate
```

## Proceso (BPMN-style) — Consulta al caso vía Gnosis·IA (con ofuscación)

Cómo una pregunta del operador atraviesa el LLM sin filtrar identificadores.

```mermaid
sequenceDiagram
    actor OP as Operador
    participant UI as chat.js
    participant CH as chat_handler
    participant TE as tool_executor
    participant OB as ofuscation
    participant GR as tools_grafo / motores
    participant LLM as Proveedor LLM

    OP->>UI: pregunta ("¿qué rodea a la aduana X?")
    UI->>CH: POST /api/v1/chat
    CH->>LLM: system prompt + historia (tool_result = DATO, no instrucción)
    LLM-->>CH: tool_call (p.ej. vecindario, conciliacion, validacion)
    CH->>TE: ejecutar tool (26 disponibles)
    TE->>GR: correr consulta sobre el grafo
    GR-->>TE: resultado con chasis/factura REALES
    TE->>OB: ofuscar (por nombre + patrón VIN)
    OB-->>TE: resultado con tokens [VIN-001-...], [FACT-...]
    TE-->>CH: resultado ofuscado
    CH->>LLM: tool_result (ofuscado)
    LLM-->>CH: respuesta citada con tokens
    CH->>OB: unmask_text (solo en dispositivo)
    OB-->>CH: respuesta con valores reales
    CH-->>UI: respuesta final
    UI-->>OP: render (escapado contra XSS)
```

---

## Modelo de datos (ER)

Dos mundos en la misma base: el **aduanal** (alimentado por el pipeline) y
el **sustrato AUTOGENES** (`ag_*`, el grafo de evidencia + el flujo de
investigación). El dato aduanal se *proyecta* al grafo en tiempo de lectura
— no se duplica.

```mermaid
erDiagram
    processing_sessions ||--o{ importaciones : tiene
    processing_sessions ||--o{ pedimentos : tiene
    processing_sessions ||--o{ extraccion_facturas : tiene
    processing_sessions ||--o{ facturas_errores : tiene
    processing_sessions ||--o{ facturas_faltantes : tiene
    processing_sessions ||--o{ cupos : tiene
    processing_sessions ||--o{ seguimiento_mensual : tiene
    pedimentos ||--o{ importaciones : ampara
    catalogo_vehiculos ||--o{ importaciones : clasifica
    marcas ||--o{ catalogo_vehiculos : marca
    paises ||--o{ importaciones : origen

    ag_artefactos ||--o{ ag_fragmentos : contiene
    ag_fragmentos ||--o{ ag_entidades : "cita (procedencia)"
    ag_entidades ||--o{ ag_relaciones : conecta
    ag_entidades ||--o{ ag_eventos : "participa (por nombre)"
    ag_entidades ||--o{ ag_productos : "ancla (por id)"
    ag_bitacora }o--|| processing_sessions : "WORM append-only"
    ag_disposiciones }o--|| processing_sessions : "ciclo de vida O1"
    ag_reglas }o--|| processing_sessions : "normas NOMOS"
    ag_qualia_base ||--o{ ag_qualia_anomalias : "base medida"
    ag_qualia_snapshots }o--|| processing_sessions : "OODA"

    importaciones {
        int session_id
        string chasis "VIN (ofuscado ante LLM)"
        string factura
        float precio "0 = vacío, no $0 real"
        string j_y_n "preferencia"
        string pais_code
    }
    ag_disposiciones {
        int session_id
        string motor "concilia|validacion|nomos"
        string clave "UNIQUE(session,motor,clave)"
        string estado "nuevo|en_gestion|resuelto|descartado"
        string nota "SIN columna de monto"
    }
    ag_reglas {
        string id
        string nombre
        string condiciones "JSON campo=valor (AND)"
        string entonces "JSON esperado"
        string origen "operador|insight"
        bool activa
    }
    ag_productos {
        string id
        string clase "informe|camino|investigacion"
        string unidad "concilia|validacion|sinapsis|..."
        string cuerpo "JSON con sello sha256"
        string evidencia "JAMÁS fabricada"
    }
```

**Ley de procedencia:** una `ag_entidad` extraída de un documento **debe**
citar fragmentos (`evidencia`); las entidades de operador/conversación
llevan su `origen`. Un producto que cita filas aduanales lleva
`evidencia=[]` — jamás fabrica evidencia documental. **Ley del ciclo de
vida:** `ag_disposiciones` registra la decisión, nunca un monto — el monto
vive en el hallazgo del motor, derivado y citable a fila.

---

## Vista de despliegue

```mermaid
flowchart LR
    subgraph device["Dispositivo del operador (local-first)"]
        direction TB
        proc["Proceso Flask (app.py)<br/>gunicorn / python"]
        sqlite[("SQLite + WAL<br/>data/aduanas.db")]
        fs["Uploads / Downloads<br/>(ZIP, PDFs, Excel)"]
        proc --- sqlite
        proc --- fs
    end
    net{{"Salida HTTPS<br/>(allowlist de dominios)"}}
    proc --> net
    net --> ds["api.deepseek.com"]
    net --> an["api.anthropic.com"]
    net --> osm["tile.openstreetmap.org"]

    classDef ext fill:#1a1a1a,stroke:#666,color:#ccc
    class ds,an,osm ext
```

- **Local-first:** el dato vive en SQLite en el dispositivo; nada se sube a
  un backend. Exportable como bundle JSON (`/api/v1/autogenes/exportar`).
- **Candado de operador:** con `GNOSIS_TOKEN` en el entorno, todo método
  mutante exige el header `X-Gnosis-Token`.
- **Salida de red:** allowlist de dominios (DeepSeek, Anthropic, OSM); sin
  fetch fuera de ella.
- **Config segura por defecto:** `debug` off y `host=127.0.0.1` salvo
  override explícito por entorno (`GNOSIS_DEBUG`, `GNOSIS_HOST`).
- **Contenedores:** `docker/compose.yaml` (Podman) → `http://127.0.0.1:5001`.

## Calidad — gates y doctrina de prueba

| Gate | Herramienta | Regla |
|---|---|---|
| Lint Python | `ruff check .` | Limpio; el pipeline legado excluido a propósito |
| Lint JS | `npx eslint static` | 0 errores |
| Suite | `pytest tests/` (506 verdes + 4 gated por OCR) | 1:1 con los motores |
| Determinismo | test de **doble corrida** | Toda métrica nueva de panel: misma base ⇒ misma salida |
| CI | `.github/workflows/ci.yml` | ruff + pytest en cada push y PR |
| Visual | mock-first + captura Nocturne/Daylight | Ningún uplift visual sin visto bueno del operador |

---

## Decisiones de arquitectura (resumen)

| Decisión | Racional |
|----------|----------|
| Monolito Flask con blueprints | Un solo operador, local-first; la separación se logra por módulos y blueprints (`rutas/`), no por servicios. |
| SQLite como única fuente de verdad (WAL) | Local-first, exportable, transaccional; el backup hace checkpoint del WAL antes de copiar. |
| Sustrato como único escritor de `ag_*` | Integridad de la procedencia y la bitácora WORM; los motores solo *proponen* o leen. |
| Proyección en tiempo de lectura | El dato aduanal no se duplica en el grafo; se proyecta al leer (una sola fuente). |
| Motores puros y deterministas | Testeables sin IO; ordenamientos estables (sin dependencia de PYTHONHASHSEED). |
| NetworkX confinado a lentes | Cifras de panel y layout del render salen de código propio determinista; NetworkX solo responde camino/vecindario/hubs. |
| Ciclo de vida como CONTRASTE (O1) | No se registra solo lo que el operador dice: cada corrida contrasta lo declarado contra lo medido (≠ contradicho / verificado). Palantir registra; GNOSIS responde. |
| Sello sha256 re-derivable en productos | Un expediente de defensa es a prueba de manipulación: `verificar()` re-deriva y compara. |
| SPC con mediana ± 3·MAD | Banda robusta a outliers sobre historia real; jamás una confianza inventada. |
| Monetización honesta | `0` y `'0,00'` son campos vacíos/fabricados, no dinero; se declaran como «sin precio», nunca se estiman. |
| SVG para diagramas, canvas para campos | En SVG el texto truncado es estructuralmente imposible (escalera P&ID, lattice); canvas para campos densos (grafo, terreno, orbe). |
| Volante insight→regla con HITL | La regla llega derivada de filas reales y PRE-llenada, pero el operador la crea; solo se ofrece donde el insight es campo=valor. |
| Ofuscación antes del LLM | Los identificadores (VIN/factura) nunca salen en claro; tokens reversibles solo en dispositivo. |
| Import perezoso del pipeline legado | La app y sus rutas importan sin el stack de data-science; CI corre la red HTTP con deps mínimas. |
| Contrato de errores honesto | HTTPException conserva su código; `/api` responde JSON; estado vacío = 404 declarado, no 500. |
| Sin build step en el frontend | JS vanilla + Jinja (decisión registrada en `docs/EVALUACION_ESTANDAR_A.md`); cero dependencia de bundlers. |

Referencias: modelo C4 (c4model.com), BPMN 2.0 (OMG), arc42 para la
estructura del documento. Planes rectores: `docs/PROPUESTA_GRAFO.md`,
`docs/BENCHMARK_PALANTIR.md`, `docs/PLAN_CONCILIA_VALIDACION.md` (bitácora
del flujo de investigación), `docs/QUALIA_ARQUITECTURA.md` (detalle del
subsistema QUALIA).
