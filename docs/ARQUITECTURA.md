# Arquitectura de GNOSIS

Documentación de arquitectura del software siguiendo el **modelo C4**
(Context → Container → Component → Code) de Simon Brown, con vistas de
**proceso (BPMN-style)**, **modelo de datos (ER)**, **secuencia** y
**despliegue**. Los diagramas están en Mermaid (se renderizan en GitHub y
en cualquier visor Mermaid).

GNOSIS es un sistema de analítica de importaciones aduanales para el Grupo
Volkswagen México: extrae facturas y pedimentos (PDF), reconcilia contra el
DWH, y construye sobre ese dato un **sustrato de ontología unificada
(AUTOGENES)** — un grafo de evidencia con procedencia — más una capa de
inteligencia (LLM con ofuscación de identificadores) y tableros de negocio.

Principios rectores (ver también `AGENTS.md`): **ZERO SNAKE OIL** (todo
número es salida de motor; nada se estima ni se inventa), **ley de
procedencia** (toda entidad extraída cita su fragmento fuente), **sustrato
como único escritor** de las tablas `ag_*`, **bitácora WORM**, y
**ofuscación de identificadores** (chasis/factura) antes de exponerlos a un
LLM.

---

## C4 · Nivel 1 — Contexto del sistema

Quién usa GNOSIS y con qué sistemas externos habla.

```mermaid
C4Context
    title GNOSIS · Diagrama de Contexto

    Person(operador, "Operador (Julio)", "Analista aduanal VW. Sube facturas/pedimentos, revisa conciliación, consulta el caso.")

    System(gnosis, "GNOSIS", "Analítica de importaciones + sustrato de evidencia AUTOGENES + tableros de negocio. Local-first.")

    System_Ext(deepseek, "DeepSeek API", "LLM por defecto para Gnosis·IA (chat sobre el grafo).")
    System_Ext(anthropic, "Anthropic API", "LLM de respaldo, activable en admin.")
    System_Ext(ollama, "Ollama", "LLM local de respaldo offline.")
    System_Ext(osm, "OpenStreetMap", "Teselas de mapa para el tablero de Rutas (TBV-03).")

    Rel(operador, gnosis, "Sube documentos, consulta, revisa hallazgos", "HTTPS")
    Rel(gnosis, deepseek, "Consulta con tools; identificadores OFUSCADOS", "HTTPS")
    Rel(gnosis, anthropic, "Fallback LLM", "HTTPS")
    Rel(gnosis, ollama, "Fallback offline", "HTTP local")
    Rel(gnosis, osm, "Pide teselas", "HTTPS")

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
        Container(spa, "PWA (frontend)", "HTML/Jinja2 + Canvas JS", "Tableros deep-tech, chat, renderers de lienzo. Tema claro/oscuro.")
        Container(flask, "Aplicación Flask", "Python 3.11 / Flask", "Factory + blueprints. Rutas, orquestación del pipeline, contrato de errores, candado de operador.")
        Container(motores, "Motores del sustrato", "Python puro", "AUTOGENES (grafo de evidencia) + tableros (analítica de negocio). Deterministas, testeados, sin IO.")
        Container(jarvis, "Gnosis·IA", "Python", "Chat sobre el grafo: selección de proveedor LLM, ejecución de tools, ofuscación de identificadores.")
        Container(pipeline, "Pipeline legado", "Python + pandas/tabula/PyPDF2", "Extracción de PDFs → concentrados Excel → estadístico de cupos. Import perezoso.")
        ContainerDb(db, "SQLite", "Base local (WAL)", "Única fuente de verdad: 13 tablas aduanales + 10 tablas ag_* del sustrato.")
    }

    System_Ext(llm, "Proveedores LLM", "DeepSeek / Anthropic / Ollama")
    System_Ext(osm, "OpenStreetMap", "Teselas")

    Rel(operador, spa, "Usa", "HTTPS")
    Rel(spa, flask, "Llama API JSON / carga páginas", "HTTPS")
    Rel(spa, osm, "Teselas del mapa", "HTTPS")
    Rel(flask, motores, "Invoca (read-time)", "in-process")
    Rel(flask, jarvis, "Delega el chat", "in-process")
    Rel(flask, pipeline, "Orquesta fases 1-4", "in-process")
    Rel(motores, db, "Lee/escribe (sustrato)", "sqlite3")
    Rel(pipeline, db, "Persiste extracción/concentrados", "sqlite3")
    Rel(flask, db, "Sesiones, stats", "sqlite3")
    Rel(jarvis, motores, "Consulta el grafo vía tools", "in-process")
    Rel(jarvis, llm, "Chat (identificadores ofuscados)", "HTTPS")
```

### Mapa de código → contenedor

| Contenedor | Código |
|------------|--------|
| PWA | `templates/*.html`, `static/*.js` (renderers de canvas), `static/*.css` (tokens Gestell) |
| Aplicación Flask | `app.py` (factory, pipeline legado, sessions/admin/chat/errores), `rutas/` (blueprints `tableros`, `autogenes`, helpers `comun`) |
| Motores | `autogenes/` (sustrato + capacidades), `tableros/` (dominio, maduración, rechazos, cupo, rutas) |
| Gnosis·IA | `jarvis/` (llm_interface, tool_executor, tools, tools_grafo, ofuscation, prompts, quorum, chat_handler) |
| Pipeline legado | `PDFs_Final_v3.py`, `PDFs_v2.py`, `concentrado1.py`, `concentrado2.py`, `Estadistico.py` |
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
        Component(bp_tab, "Blueprint tableros", "rutas/tableros.py", "5 páginas + 5 APIs de negocio (TBV-01..05).")
        Component(bp_auto, "Blueprint autogenes", "rutas/autogenes.py", "~45 rutas: landing, grafo, ingesta, QUALIA, CONCILIA, VALIDACIÓN, SINAPSIS, NOMOS, CRONOS, síntesis.")
        Component(comun, "Helpers de sesión", "rutas/comun.py", "_con_sesion (estado vacío honesto = 404 declarado), _etiqueta_sesion, _sesion_activa.")
        Component(legacy, "Rutas /procesar", "app.py", "Fases 1-4 del pipeline; carga de ZIP con extracción acotada.")
        Component(shell, "Sessions/Admin/Chat/Errores", "app.py", "Gestión de sesiones, config LLM, proxy de chat, panel de errores.")
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

## C4 · Nivel 3 — Componentes del sustrato AUTOGENES

El diferenciador: un grafo de evidencia con procedencia. `sustrato.py` es el
**único escritor** de las tablas `ag_*`; todo lo demás lee o propone.

```mermaid
C4Component
    title AUTOGENES · Componentes del sustrato

    Container_Boundary(sub, "Motores AUTOGENES") {
        Component(sustrato, "Sustrato", "sustrato.py", "ÚNICO escritor de ag_*. Artefacto→Fragmento→Entidad→Relación, Evento, Producto. Ley aditiva, integración saneada, bitácora WORM.")
        Component(ingesta, "Ingesta", "ingesta.py", "Lee PDF/JPG, arma fragmentos, extrae entidades citadas.")
        Component(proyeccion, "Proyección", "proyeccion.py", "Proyecta el dato aduanal en el grafo en tiempo de lectura (sin dual-write).")
        Component(qualia, "QUALIA", "qualia.py, topologia.py, anomalias.py", "Topología pura: comunidades, puentes, anomalías vs base, drift.")
        Component(concilia, "CONCILIA", "concilia.py", "Hallazgos tri-fuente monetizados por moneda; sin conversión.")
        Component(valida, "VALIDACIÓN", "validacion.py", "16 reglas deterministas + certificado dockeable.")
        Component(sinapsis, "SINAPSIS", "sinapsis.py", "Insights por recombinación verificada + retícula de particiones.")
        Component(nomos, "NOMOS", "nomos.py", "Reglas McCulloch-Pitts (unidad AND) + backtest.")
        Component(cronos, "CRONOS", "cronos.py", "Time-travel aditivo por created_at sobre la bitácora.")
        Component(consultas, "Consultas de grafo", "consultas.py, caminos.py", "Expediente, camino, vecindario — con citas fragmento→página→PDF.")
    }
    ContainerDb(agdb, "Tablas ag_*", "SQLite")

    Rel(ingesta, sustrato, "propone escrituras")
    Rel(sustrato, agdb, "escribe (único)")
    Rel(proyeccion, agdb, "lee dato proyectado")
    Rel(qualia, agdb, "lee")
    Rel(concilia, agdb, "lee")
    Rel(valida, agdb, "lee")
    Rel(sinapsis, concilia, "recombina salidas")
    Rel(nomos, agdb, "evalúa reglas")
    Rel(cronos, agdb, "reconstruye por tiempo")
    Rel(consultas, agdb, "lee con procedencia")
```

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
    LLM-->>CH: tool_call (p.ej. vecindario)
    CH->>TE: ejecutar tool
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

Dos mundos en la misma base: el **aduanal** (izquierda, alimentado por el
pipeline) y el **sustrato AUTOGENES** (`ag_*`, el grafo de evidencia). El
dato aduanal se *proyecta* al grafo en tiempo de lectura — no se duplica.

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

    importaciones {
        int session_id
        string chasis "VIN (ofuscado ante LLM)"
        string factura
        string pais_code
    }
    ag_fragmentos {
        int id
        int artefacto_id
        int pagina
        string texto "unidad de procedencia"
    }
    ag_entidades {
        string id
        string nombre
        string alias "JSON"
        string evidencia "JSON de fragment ids"
        string origen "operador|synesis"
    }
```

**Ley de procedencia:** una `ag_entidad` extraída de un documento **debe**
citar fragmentos (`evidencia`); las entidades de operador/conversación
llevan su `origen`. Un producto (informe, camino) que cita filas aduanales
lleva `evidencia=[]` — jamás fabrica evidencia documental.

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

---

## Decisiones de arquitectura (resumen)

| Decisión | Racional |
|----------|----------|
| Monolito Flask con blueprints | Un solo operador, local-first; la separación se logra por módulos y blueprints (`rutas/`), no por servicios. |
| SQLite como única fuente de verdad (WAL) | Local-first, exportable, transaccional; el backup hace checkpoint del WAL antes de copiar. |
| Sustrato como único escritor de `ag_*` | Integridad de la procedencia y la bitácora WORM; los motores solo *proponen* o leen. |
| Proyección en tiempo de lectura | El dato aduanal no se duplica en el grafo; se proyecta al leer (una sola fuente). |
| Motores puros y deterministas | Testeables sin IO; ordenamientos estables (sin dependencia de PYTHONHASHSEED). |
| Ofuscación antes del LLM | Los identificadores (VIN/factura) nunca salen en claro; tokens reversibles solo en dispositivo. |
| Import perezoso del pipeline legado | La app y sus rutas importan sin el stack de data-science; CI corre la red HTTP con deps mínimas. |
| Contrato de errores honesto | HTTPException conserva su código; `/api` responde JSON; estado vacío = 404 declarado, no 500. |

Referencias: modelo C4 (c4model.com), BPMN 2.0 (OMG), arc42 para la
estructura del documento.
