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

-- Índice de RESOLUCIÓN de entidad: cada nombre y cada alias es una fila con
-- su forma normalizada (TRIM+LOWER, el `_norm` de autogenes/sustrato.py).
-- `upsert_entidad` resuelve aquí en vez de escanear todas las entidades por
-- pydantic; sin esto la ingesta era O(E²) (docs/DIAGNOSTICO_FABLE_v02.md §1).
-- El PRIMARY KEY (session_id, alias_norm) hace además IMPOSIBLE que dos
-- entidades reclamen el mismo alias — antes ganaba la que el orden físico de
-- filas pusiera primero.
CREATE TABLE IF NOT EXISTS ag_entidad_alias (
    session_id  INTEGER NOT NULL,
    alias_norm  TEXT NOT NULL,
    entidad_id  TEXT NOT NULL,
    es_nombre   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, alias_norm),
    FOREIGN KEY (entidad_id) REFERENCES ag_entidades(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ag_entidad_alias_entidad ON ag_entidad_alias(entidad_id);

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

-- ag_bitacora es WORM (append-only). La propiedad write-once ya no es solo
-- disciplina de los llamadores: cada fila lleva un sello encadenado
-- (hash = sha256(prev_hash, id, session_id, ts, accion, detalle)) que
-- Sustrato._registrar computa al insertar y verificar_bitacora re-deriva. Una
-- edición o un borrado fuera de la puerta rompe la cadena y se DETECTA (el
-- esquema no puede impedir el UPDATE sin vetar el sembrado histórico legítimo
-- de cronos/qualia, pero sí lo vuelve manipulable-con-evidencia-cero).
-- prev_hash/hash existen aquí para bases nuevas y en la migración 3 para las ya
-- creadas; son NULL en filas previas al sello (historia sin sellar, declarada).
CREATE TABLE IF NOT EXISTS ag_bitacora (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    ts          TEXT DEFAULT (datetime('now')),
    accion      TEXT NOT NULL,
    detalle     TEXT NOT NULL,
    prev_hash   TEXT,
    hash        TEXT,
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

-- Ciclo de vida de un hallazgo de los motores de descuadre (F9 CONCILIA,
-- F10 VALIDACION, F12 NOMOS). Como ag_qualia_anomalias: el hallazgo se
-- re-deriva VIVO desde su motor; aquí sólo vive la DISPOSICIÓN del operador
-- por (motor, clave): nuevo → en_gestion → resuelto/descartado. Escritura
-- SOLO via Sustrato (puerta única + bitácora WORM). SIN columna de monto:
-- la disposición JAMÁS monetiza — el monto vive en el hallazgo, derivado y
-- citable a fila, nunca aquí (ley cero-snake-oil fijada en el esquema).
CREATE TABLE IF NOT EXISTS ag_disposiciones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    motor       TEXT NOT NULL CHECK (motor IN ('concilia','validacion','nomos')),
    clave       TEXT NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo','en_gestion','resuelto','descartado')),
    nota        TEXT,
    ts          TEXT DEFAULT (datetime('now')),
    UNIQUE (session_id, motor, clave),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_ag_disposiciones
    ON ag_disposiciones(session_id, motor, clave);

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
