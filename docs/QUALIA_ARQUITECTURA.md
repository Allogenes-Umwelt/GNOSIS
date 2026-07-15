# QUALIA — Arquitectura (C4 · BPMN · ER · mapa de código)

**Subsistema:** AUTOGENES · F7 (QUALIA) tras el uplift Q0–Q7.
**Alcance:** los 8 instrumentos de la sala de control estructural, sus
endpoints, los motores puros que los alimentan y la puerta única de escritura.
**Leyes que gobiernan el subsistema** (ver `CLAUDE.md`): determinismo del
render · puerta única de escritura (`Sustrato`) · cero snake oil (ningún número
inventa monto; montos solo de CONCILIA/NOMOS) · local-first (cero red) · solo
tokens, magenta solo en alerta real, AAA en ambos temas.

> Los diagramas son Mermaid (se renderizan en GitHub). Las cajas de motor son
> **puras y deterministas**; la única flecha que escribe pasa por `Sustrato`.

---

## C4 · Nivel 1 — Contexto

```mermaid
flowchart TD
    OP["Operador (analista de aduanas)"]
    subgraph GNOSIS["GNOSIS · app Flask/Python 3.11 · local-first"]
        QUALIA["Subsistema QUALIA (F7)\n8 instrumentos de análisis estructural"]
    end
    DB[("SQLite\núnica verdad")]
    OP -->|"pregunta de negocio\n(por instrumento)"| QUALIA
    QUALIA -->|"lectura determinista + drill-down citable"| OP
    QUALIA -->|"lee proyección F2"| DB
    QUALIA -.->|"escribe SOLO disposiciones/base\nvía Sustrato + bitácora WORM"| DB
    QUALIA -. "cero peticiones externas\n(ni mapas ni LLM sin aprobación)" .- OP
```

## C4 · Nivel 2 — Contenedores

```mermaid
flowchart LR
    subgraph Browser["Navegador · JS vanilla + canvas 2D (sin build)"]
        INST["8 instrumentos qualia_*.js"]
        SH["Helpers compartidos\nqualia_comun · qualia_dossier · qualia_export"]
    end
    subgraph Flask["Flask · rutas/autogenes.py (blueprint)"]
        API["Endpoints /api/v1/autogenes/qualia/*"]
    end
    subgraph Motores["Motores puros (Python, deterministas, sin deps)"]
        TOP["topologia.py"]
        ANO["anomalias.py"]
        CAS["cascada.py"]
        HOR["horizonte.py"]
        QLA["qualia.py (adaptador de sesión)"]
    end
    GATE["Sustrato\n(puerta única de escritura + WORM)"]
    DB[("SQLite")]

    INST -->|fetch JSON| API
    SH --- INST
    API --> QLA
    QLA --> TOP & ANO & CAS & HOR
    API -->|solo mutaciones| GATE
    QLA -->|proyección F2 read-time| DB
    GATE -->|ag_* + ag_bitacora| DB
```

## C4 · Nivel 3 — Componentes (instrumento → endpoint → motor)

```mermaid
flowchart TB
    subgraph UI["Instrumentos (canvas 2D)"]
        M["QLA-C2 Máquina (OODA)"]
        R["QLA-01 Red"]
        O["QLA-05 Orbe"]
        C["QLA-06 Cuerdas"]
        T["QLA-02 Terreno"]
        K["QLA-03 Cascada"]
        H["QLA-04 Horizonte"]
        D["QLA-08 Deriva"]
    end
    subgraph EP["Endpoints"]
        e1["/qualia/red"]
        e2["/qualia/estado"]
        e3["/qualia/cascada"]
        e4["/qualia/horizonte"]
        e5["/qualia/drift"]
        e6["/qualia/dossier"]
        e7["/qualia/anomalia (POST)"]
        e8["/qualia/base (POST)"]
        e9["/qualia/narrativa (POST)"]
    end
    subgraph EN["Motores + servicios"]
        n1["topologia: comunidades, centralidad,\nresumen, huella_cohesion"]
        n2["anomalias: 10 detectores + drift"]
        n3["cascada: simular_caida + volumen"]
        n4["horizonte: telemetría + delta"]
        n5["consultas.expediente_entidad"]
        n6["Sustrato.disponer_anomalia"]
    end

    R --> e1 --> n1
    O --> e1
    C --> e1
    M --> e1 & e2
    T --> e2 --> n2
    K --> e3 --> n3
    H --> e4 --> n4
    D --> e5 --> n1 & n2
    R & O & C & T & K --> e6 --> n5
    T --> e7 --> n6
    T --> e8
    M --> e9
```

---

## BPMN — Ciclo de vida de una anomalía (Q5)

```mermaid
flowchart LR
    A(["Motor mide el grafo\ncontra la base fijada"]) --> B{"¿desviación?"}
    B -- no --> Z(["Terreno plano\n(certificado de sesión sana)"])
    B -- sí --> C["Cresta en el Terreno\nestado = nuevo"]
    C --> D{"Operador dispone"}
    D -->|"en gestión"| E["Sustrato.disponer_anomalia\n→ ag_qualia_anomalias"]
    D -->|"resuelto"| E
    D -->|"descartado"| E
    E --> F["Bitácora WORM\n(ag_bitacora, append-only)"]
    E --> G["CHECK monetizado = 0\n(la ley vive en el esquema)"]
    F --> H(["Re-derivada viva + anotada\n(Radar y Terreno ven el estado)"])
    G --> H
```

## Secuencia — lectura (drill-down) y escritura (disposición)

```mermaid
sequenceDiagram
    actor OP as Operador
    participant JS as Instrumento (canvas)
    participant API as Flask /qualia/*
    participant EN as Motor puro
    participant SU as Sustrato
    participant DB as SQLite

    Note over OP,DB: Lectura — nada muta
    OP->>JS: abre instrumento / clic en nodo
    JS->>API: GET /qualia/red · /estado · /dossier
    API->>EN: proyección F2 + métrica pura
    EN->>DB: SELECT (read-time)
    DB-->>EN: filas
    EN-->>API: JSON determinista + citas
    API-->>JS: pinta lienzo + dossier citable

    Note over OP,DB: Escritura — solo por la puerta única
    OP->>JS: dispone anomalía (+ nota)
    JS->>API: POST /qualia/anomalia
    API->>SU: disponer_anomalia(clave, estado, nota)
    SU->>DB: UPSERT ag_qualia_anomalias (monetizado=0)
    SU->>DB: INSERT ag_bitacora (WORM)
    SU-->>API: {clave, estado, nota}
    API-->>JS: recarga estado + re-anota
```

## ER — tablas propias de QUALIA (escritas solo por qualia.py/Sustrato)

```mermaid
erDiagram
    processing_sessions ||--o{ ag_qualia_snapshots : "telemetría (cap 200)"
    processing_sessions ||--o| ag_qualia_base : "referencia del operador"
    processing_sessions ||--o{ ag_qualia_anomalias : "disposición por clave"
    processing_sessions ||--o{ ag_bitacora : "WORM"
    ag_qualia_anomalias {
        int id PK
        int session_id FK
        text clave "id de la anomalía viva"
        text estado "nuevo|en_gestion|resuelto|descartado"
        text nota "libre del operador"
        int monetizado "CHECK = 0 (ley cero-snake-oil)"
        text ts
    }
    ag_qualia_base {
        int session_id PK
        text snapshot "resumen de referencia"
        text ts
    }
    ag_qualia_snapshots {
        int id PK
        int session_id FK
        text snapshot
        text ts
    }
```

---

## Mapa de código (todo comentado en estilo PANOPTES)

### Motores puros — deterministas, sin dependencias, con test de doble corrida
| Archivo | Responsabilidad | Ley clave |
|---|---|---|
| `autogenes/topologia.py` | Comunidades (propagación de etiquetas), centralidad de vector propio, resumen, escalera de agrupamiento, `persistencia_h0` → `huella_cohesion`. | Métrica de panel = pura + determinista |
| `autogenes/anomalias.py` | 10 detectores + `drift_topologico` (deriva entre sesiones). | Anomalía nunca monetiza |
| `autogenes/cascada.py` | `simular_caida`/`simular_enlace` what-if en memoria (volumen se compone en la ruta). | Nada escribe |
| `autogenes/horizonte.py` | Telemetría + intervenciones con delta medido entre muestras. | Nunca interpola |
| `autogenes/qualia.py` | Adaptador de sesión: proyección, telemetría (cap 200 + honestidad), base, `series_de_sesion`, `unidades_por_nodo`, `drift_sesiones`, anotación de ciclo de vida. | Lee F2, no la reconstruye |

### Escritura y consulta
| Archivo | Responsabilidad |
|---|---|
| `autogenes/sustrato.py` | Puerta única. `disponer_anomalia` (ciclo de vida + WORM), `fijar_base`. |
| `autogenes/consultas.py` | `expediente_entidad` (dossier citado fragmento→página→PDF). |
| `autogenes/senales.py` · `metabolismo.py` | Radar: publica anomalías + **deriva** entre sesiones como urgencia. |
| `rutas/autogenes.py` | Blueprint: 8 páginas + endpoints `/api/v1/autogenes/qualia/*`. |
| `database/models_autogenes.py` | Esquema `ag_qualia_*` (la ley `CHECK monetizado=0` vive aquí). |

### Instrumentos (JS vanilla + canvas 2D) y helpers
| Archivo | Instrumento / rol |
|---|---|
| `static/qualia.js` | QLA-01 Red — comunidades cósmicas + tendones por el núcleo + inset. |
| `static/qualia_terreno.js` | QLA-02 Terreno — 10 detectores, crestas, **ciclo de vida**. |
| `static/qualia_cascada.js` | QLA-03 Cascada — what-if radial + **volumen afectado**. |
| `static/qualia_horizonte.js` | QLA-04 Horizonte — osciloscopio con eje absoluto + honestidad del cap. |
| `static/qualia_orbe.js` | QLA-05 Orbe — sistema orbital luminoso por peso en la red. |
| `static/qualia_cuerdas.js` | QLA-06 Cuerdas — auroras por comunidad. |
| `static/qualia_maquina.js` | QLA-C2 Máquina — diagrama de acoples OODA (Feynman). |
| `static/qualia_deriva.js` | QLA-08 Deriva — dos núcleos + eje divergente + huella de cohesión. |
| `static/qualia_comun.js` | Helpers puros: esc, alfa, leerColores (fallback por tema), medir (DPR), brackets, alTema. |
| `static/qualia_dossier.js` | Cajón de dossier compartido (drill-down + `?sel=` cross-pestaña). |
| `static/qualia_export.js` | PNG exhibit + CSV con pie de fuente, en los 8. |
| `static/qualia.css` | Tokens del subsistema (magenta solo `--danger`/`--telos-on`). |

### Tests (1:1 con el motor; doble corrida para métricas nuevas)
`tests/test_topologia.py` · `test_anomalias.py` · `test_cascada_volumen.py` ·
`test_qualia.py` · `test_qualia_rutas.py` · `test_qualia_copy.py` (ratchet de
idioma) · `test_metabolismo.py` (deriva→Radar).
