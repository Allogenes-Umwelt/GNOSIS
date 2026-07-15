"""AUTOGENES substrate schema — the evidence graph, scoped per session.

Provenance order: Artefacto (source) -> Fragmento (unit of provenance)
-> Entidad / Relacion / Evento / Producto. JSON-array columns
(evidencia, alias, entidades, propiedades, cuerpo) hold serialized
lists/objects; all provenance pruning happens in autogenes/sustrato.py,
never here. ag_bitacora is append-only and uncapped (server-side audit
is a feature, unlike the browser store's 500-entry cap).
"""

AG_SCHEMA_SQL = """
-- ============================================================
-- AUTOGENES: EVIDENCE GRAPH (one graph per processing_session)
-- ============================================================

CREATE TABLE IF NOT EXISTS ag_artefactos (
    id          TEXT PRIMARY KEY,
    session_id  INTEGER NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('pdf','imagen','nota','estructurado')),
    nombre      TEXT NOT NULL,
    paginas     INTEGER,
    blob_ref    TEXT,
    hash        TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_artefactos_session ON ag_artefactos(session_id);

CREATE TABLE IF NOT EXISTS ag_fragmentos (
    id           TEXT PRIMARY KEY,
    session_id   INTEGER NOT NULL,
    artefacto_id TEXT NOT NULL,
    pagina       INTEGER,
    texto        TEXT NOT NULL,
    created_at   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id),
    FOREIGN KEY (artefacto_id) REFERENCES ag_artefactos(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ag_fragmentos_session ON ag_fragmentos(session_id);
CREATE INDEX IF NOT EXISTS idx_ag_fragmentos_artefacto ON ag_fragmentos(artefacto_id);

CREATE TABLE IF NOT EXISTS ag_entidades (
    id          TEXT PRIMARY KEY,
    session_id  INTEGER NOT NULL,
    nombre      TEXT NOT NULL,
    tipo        TEXT NOT NULL CHECK (tipo IN
        ('concepto','persona','organizacion','lugar','evento',
         'termino','servicio','documento','otro')),
    resumen     TEXT,
    campo       TEXT,
    alias       TEXT NOT NULL DEFAULT '[]',
    geo_lat     REAL,
    geo_lon     REAL,
    subtipo     TEXT,
    propiedades TEXT,
    origen      TEXT NOT NULL CHECK (origen IN ('operador','synesis')),
    evidencia   TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_entidades_session ON ag_entidades(session_id);
CREATE INDEX IF NOT EXISTS idx_ag_entidades_nombre ON ag_entidades(session_id, nombre);

CREATE TABLE IF NOT EXISTS ag_relaciones (
    id          TEXT PRIMARY KEY,
    session_id  INTEGER NOT NULL,
    desde_id    TEXT NOT NULL,
    hasta_id    TEXT NOT NULL,
    tipo        TEXT NOT NULL,
    peso        REAL NOT NULL DEFAULT 0.5 CHECK (peso >= 0 AND peso <= 1),
    evidencia   TEXT NOT NULL DEFAULT '[]',
    origen      TEXT NOT NULL DEFAULT 'synesis',
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id),
    FOREIGN KEY (desde_id) REFERENCES ag_entidades(id),
    FOREIGN KEY (hasta_id) REFERENCES ag_entidades(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_relaciones_session ON ag_relaciones(session_id);
CREATE INDEX IF NOT EXISTS idx_ag_relaciones_desde ON ag_relaciones(desde_id);
CREATE INDEX IF NOT EXISTS idx_ag_relaciones_hasta ON ag_relaciones(hasta_id);

CREATE TABLE IF NOT EXISTS ag_eventos (
    id          TEXT PRIMARY KEY,
    session_id  INTEGER NOT NULL,
    titulo      TEXT NOT NULL,
    fecha       TEXT NOT NULL,
    precision   TEXT NOT NULL CHECK (precision IN ('dia','mes','anio')),
    entidades   TEXT NOT NULL DEFAULT '[]',
    evidencia   TEXT NOT NULL DEFAULT '[]',
    origen      TEXT NOT NULL CHECK (origen IN ('operador','synesis')),
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_eventos_session ON ag_eventos(session_id);
CREATE INDEX IF NOT EXISTS idx_ag_eventos_fecha ON ag_eventos(session_id, fecha);

CREATE TABLE IF NOT EXISTS ag_productos (
    id          TEXT PRIMARY KEY,
    session_id  INTEGER NOT NULL,
    clase       TEXT NOT NULL CHECK (clase IN ('informe','camino','investigacion')),
    titulo      TEXT NOT NULL,
    unidad      TEXT NOT NULL,
    cuerpo      TEXT,
    entidades   TEXT NOT NULL DEFAULT '[]',
    evidencia   TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_productos_session ON ag_productos(session_id);

CREATE TABLE IF NOT EXISTS ag_bitacora (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    ts          TEXT DEFAULT (datetime('now')),
    accion      TEXT NOT NULL,
    detalle     TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_bitacora_session ON ag_bitacora(session_id);

-- QUALIA's OWN store (F7b): derived telemetry, NOT the evidence graph.
-- Mirrors KARELEN's separation (store/qualia.ts lived apart from the
-- AUTOGENES store); autogenes/qualia.py is its sole writer. Snapshots
-- are auto-sampled telemetry; the baseline is pinned ONLY by the
-- operator and is what anomalies measure against.
CREATE TABLE IF NOT EXISTS ag_qualia_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    ts          TEXT DEFAULT (datetime('now')),
    snapshot    TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_qualia_snapshots ON ag_qualia_snapshots(session_id, id);

CREATE TABLE IF NOT EXISTS ag_qualia_base (
    session_id  INTEGER PRIMARY KEY,
    ts          TEXT DEFAULT (datetime('now')),
    snapshot    TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);

-- Ciclo de vida de una anomalía QUALIA (F7/Q5). La anomalía se re-deriva
-- viva; aquí sólo vive la DISPOSICIÓN del operador por clave. Escritura
-- SOLO via Sustrato (puerta única + bitácora WORM). La ley cero-snake-oil
-- se fija en el esquema: una anomalía estructural JAMÁS se monetiza.
CREATE TABLE IF NOT EXISTS ag_qualia_anomalias (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    clave       TEXT NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo', 'en_gestion', 'resuelto', 'descartado')),
    nota        TEXT,
    monetizado  INTEGER NOT NULL DEFAULT 0 CHECK (monetizado = 0),
    ts          TEXT DEFAULT (datetime('now')),
    UNIQUE (session_id, clave),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_qualia_anomalias
    ON ag_qualia_anomalias(session_id, clave);

-- NOMOS (F12): reglas de negocio como ciudadanos del grafo. Escritura
-- SOLO via Sustrato (ley aditiva: crear + activar/desactivar, jamas
-- borrar). Una regla es una neurona McCulloch-Pitts AND: condiciones
-- (campo=valor sobre importaciones) con pesos unitarios y umbral = n
-- condiciones; 'entonces' es el campo/valor esperado cuando dispara.
CREATE TABLE IF NOT EXISTS ag_reglas (
    id          TEXT PRIMARY KEY,
    session_id  INTEGER NOT NULL,
    nombre      TEXT NOT NULL,
    condiciones TEXT NOT NULL,          -- JSON [{campo, valor}]
    entonces    TEXT NOT NULL,          -- JSON {campo, valor}
    origen      TEXT NOT NULL CHECK (origen IN ('operador', 'insight')),
    activa      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_reglas_session ON ag_reglas(session_id);
"""
