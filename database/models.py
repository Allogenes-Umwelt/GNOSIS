SCHEMA_SQL = """
-- ============================================================
-- TABLAS CATALOGO
-- ============================================================

CREATE TABLE IF NOT EXISTS paises (
    codigo  TEXT PRIMARY KEY NOT NULL,
    nombre  TEXT NOT NULL
);

INSERT OR IGNORE INTO paises (codigo, nombre) VALUES
    ('CZE', 'Republica Checa'),
    ('DEU', 'Alemania'),
    ('SVK', 'Eslovaquia'),
    ('ESP', 'Espana'),
    ('GBR', 'Reino Unido'),
    ('HUN', 'Hungria'),
    ('IND', 'India'),
    ('ZAF', 'Sudafrica'),
    ('BRA', 'Brasil'),
    ('USA', 'Estados Unidos'),
    ('ARG', 'Argentina'),
    ('BEL', 'Belgica'),
    ('POL', 'Polonia'),
    ('TUR', 'Turquia');

CREATE TABLE IF NOT EXISTS marcas (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO marcas (nombre) VALUES
    ('AUDI'), ('BENTLEY'), ('PORSCHE'), ('SEAT'), ('VOLKSWAGEN');


-- ============================================================
-- TABLA CENTRAL
-- ============================================================

CREATE TABLE IF NOT EXISTS processing_sessions (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date            TEXT NOT NULL,
    month_processed         INTEGER NOT NULL,
    year_processed          INTEGER NOT NULL,
    total_pdfs_processed    INTEGER DEFAULT 0,
    total_pdfs_errors       INTEGER DEFAULT 0,
    total_records           INTEGER DEFAULT 0,
    processing_time_seconds REAL,
    status                  TEXT DEFAULT 'in_progress',
    created_at              TEXT DEFAULT (datetime('now'))
);


-- ============================================================
-- CATALOGO DE VEHICULOS (3NF: AUTO -> tipo, fraccion, pais, fletes, seguros, marca)
-- ============================================================

CREATE TABLE IF NOT EXISTS catalogo_vehiculos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    auto_code   TEXT NOT NULL,
    tipo        TEXT,
    fraccion    TEXT,
    pais_code   TEXT,
    fletes      REAL,
    seguros     REAL,
    marca_id    INTEGER,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id),
    FOREIGN KEY (pais_code) REFERENCES paises(codigo),
    FOREIGN KEY (marca_id) REFERENCES marcas(id),
    UNIQUE(session_id, auto_code)
);

CREATE INDEX IF NOT EXISTS idx_catalogo_session ON catalogo_vehiculos(session_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_auto ON catalogo_vehiculos(auto_code);


-- ============================================================
-- PEDIMENTOS (3NF: PEDIMENTO -> patente, fecha_pedimento, aduana)
-- ============================================================

CREATE TABLE IF NOT EXISTS pedimentos (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        INTEGER NOT NULL,
    numero_pedimento  TEXT NOT NULL,
    patente           TEXT,
    fecha_pedimento   TEXT,
    aduana            TEXT,
    created_at        TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id),
    UNIQUE(session_id, numero_pedimento)
);

CREATE INDEX IF NOT EXISTS idx_pedimentos_session ON pedimentos(session_id);
CREATE INDEX IF NOT EXISTS idx_pedimentos_numero ON pedimentos(numero_pedimento);


-- ============================================================
-- IMPORTACIONES (tabla principal normalizada)
-- ============================================================

CREATE TABLE IF NOT EXISTS importaciones (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,
    pedimento_id    INTEGER,
    catalogo_id     INTEGER,
    id_dwh          TEXT,
    auto_code       TEXT,
    factura         TEXT,
    fecha_factura   TEXT,
    chasis          TEXT,
    precio          REAL,
    j_y_n           TEXT,
    pais_code       TEXT,
    pais_witness    TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id),
    FOREIGN KEY (pedimento_id) REFERENCES pedimentos(id),
    FOREIGN KEY (catalogo_id) REFERENCES catalogo_vehiculos(id),
    FOREIGN KEY (pais_code) REFERENCES paises(codigo)
);

CREATE INDEX IF NOT EXISTS idx_import_chasis ON importaciones(chasis);
CREATE INDEX IF NOT EXISTS idx_import_factura ON importaciones(factura);
CREATE INDEX IF NOT EXISTS idx_import_pais ON importaciones(pais_code);
CREATE INDEX IF NOT EXISTS idx_import_j_y_n ON importaciones(j_y_n);
CREATE INDEX IF NOT EXISTS idx_import_session ON importaciones(session_id);
CREATE INDEX IF NOT EXISTS idx_import_auto ON importaciones(auto_code);


-- ============================================================
-- EXTRACCION DE FACTURAS (datos crudos de PDFs)
-- ============================================================

CREATE TABLE IF NOT EXISTS extraccion_facturas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    factura     TEXT,
    pais_code   TEXT,
    fecha       TEXT,
    auto        TEXT,
    chasis      TEXT,
    j_y_n       TEXT,
    amount      TEXT,
    moneda      TEXT,
    leyenda     TEXT,
    filename    TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id),
    FOREIGN KEY (pais_code) REFERENCES paises(codigo)
);

CREATE INDEX IF NOT EXISTS idx_extraccion_chasis ON extraccion_facturas(chasis);
CREATE INDEX IF NOT EXISTS idx_extraccion_factura ON extraccion_facturas(factura);
CREATE INDEX IF NOT EXISTS idx_extraccion_pais ON extraccion_facturas(pais_code);
CREATE INDEX IF NOT EXISTS idx_extraccion_j_y_n ON extraccion_facturas(j_y_n);
CREATE INDEX IF NOT EXISTS idx_extraccion_session ON extraccion_facturas(session_id);


-- ============================================================
-- INSUMOS (archivos de entrada)
-- ============================================================

CREATE TABLE IF NOT EXISTS insumos_archivos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       INTEGER NOT NULL,
    tipo_archivo     TEXT NOT NULL,
    nombre_original  TEXT NOT NULL,
    ruta_almacenada  TEXT NOT NULL,
    tamanio_bytes    INTEGER,
    hash_md5         TEXT,
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_insumos_session ON insumos_archivos(session_id);
CREATE INDEX IF NOT EXISTS idx_insumos_tipo ON insumos_archivos(tipo_archivo);


-- ============================================================
-- CUPOS
-- ============================================================

CREATE TABLE IF NOT EXISTS cupos (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id            INTEGER NOT NULL,
    tipo                  TEXT NOT NULL,
    numero_autorizacion   TEXT,
    cantidad_inicial      INTEGER NOT NULL,
    cantidad_consumida    INTEGER DEFAULT 0,
    cantidad_saldo        INTEGER DEFAULT 0,
    mes_agotado           TEXT,
    pdf_path              TEXT,
    created_at            TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_cupos_session ON cupos(session_id);
CREATE INDEX IF NOT EXISTS idx_cupos_tipo ON cupos(tipo);


-- ============================================================
-- SEGUIMIENTO MENSUAL
-- ============================================================

CREATE TABLE IF NOT EXISTS seguimiento_mensual (
    id                            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id                    INTEGER NOT NULL,
    mes                           INTEGER NOT NULL,
    mes_nombre                    TEXT NOT NULL,
    cupo_produccion_activo        TEXT,
    disponible_produccion_inicio  INTEGER,
    cupo_inversion_activo         TEXT,
    disponible_inversion_inicio   INTEGER,
    consumo_total                 INTEGER,
    consumo_produccion            INTEGER,
    consumo_inversion             INTEGER,
    disponible_produccion_fin     INTEGER,
    disponible_inversion_fin      INTEGER,
    acumulado_total               INTEGER,
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_session ON seguimiento_mensual(session_id);
CREATE INDEX IF NOT EXISTS idx_seguimiento_mes ON seguimiento_mensual(mes);


-- ============================================================
-- CONTROL DE CALIDAD
-- ============================================================

CREATE TABLE IF NOT EXISTS facturas_errores (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER NOT NULL,
    filename      TEXT NOT NULL,
    error_type    TEXT DEFAULT 'parsing_failed',
    error_message TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_errores_session ON facturas_errores(session_id);

CREATE TABLE IF NOT EXISTS facturas_faltantes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    factura     TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_faltantes_session ON facturas_faltantes(session_id);
CREATE INDEX IF NOT EXISTS idx_faltantes_factura ON facturas_faltantes(factura);


-- ============================================================
-- CHAT JARVIS
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_session_id TEXT NOT NULL,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    tool_calls      TEXT,
    tool_results    TEXT,
    tokens_input    INTEGER,
    tokens_output   INTEGER,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_conversations(chat_session_id);


-- ============================================================
-- CONFIGURACION (key-value; selector LLM y ajustes de admin)
-- ============================================================

CREATE TABLE IF NOT EXISTS config (
    clave       TEXT PRIMARY KEY,
    valor       TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
);
"""
