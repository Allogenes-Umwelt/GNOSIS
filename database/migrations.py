"""Versioned, one-way migrations for changes CREATE IF NOT EXISTS can't express.

Each migration runs exactly once, inside init_db(). Append only — never
edit or reorder an entry that has shipped.
"""
import sqlite3

# (version, name, list of SQL statements)
MIGRATIONS: list[tuple[int, str, list[str]]] = [
    # Widen ag_productos.clase to allow 'investigacion' (P1 · saved
    # investigations). SQLite can't ALTER a CHECK constraint, so the table is
    # recreated and copied. Safe: nothing references ag_productos by FK.
    (1, "ag_productos_add_investigacion", [
        """CREATE TABLE ag_productos_new (
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
        )""",
        "INSERT INTO ag_productos_new (id, session_id, clase, titulo, unidad,"
        " cuerpo, entidades, evidencia, created_at) SELECT id, session_id, clase,"
        " titulo, unidad, cuerpo, entidades, evidencia, created_at FROM ag_productos",
        "DROP TABLE ag_productos",
        "ALTER TABLE ag_productos_new RENAME TO ag_productos",
        "CREATE INDEX IF NOT EXISTS idx_ag_productos_session ON ag_productos(session_id)",
    ]),
    # Add ag_relaciones.origen (provenance): who asserted the edge. Without
    # it a relation cannot declare its author — synesis (model) vs operador
    # (the analyst's own claim from the radar triage, T1). Recreate-and-copy
    # (house style) so it works whether or not the column already exists:
    # existing rows default to 'synesis' (the pre-provenance state, declared).
    (2, "ag_relaciones_add_origen", [
        """CREATE TABLE ag_relaciones_new (
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
        )""",
        "INSERT INTO ag_relaciones_new (id, session_id, desde_id, hasta_id, tipo,"
        " peso, evidencia, origen, created_at) SELECT id, session_id, desde_id,"
        " hasta_id, tipo, peso, evidencia, 'synesis', created_at FROM ag_relaciones",
        "DROP TABLE ag_relaciones",
        "ALTER TABLE ag_relaciones_new RENAME TO ag_relaciones",
        "CREATE INDEX IF NOT EXISTS idx_ag_relaciones_session ON ag_relaciones(session_id)",
        "CREATE INDEX IF NOT EXISTS idx_ag_relaciones_desde ON ag_relaciones(desde_id)",
        "CREATE INDEX IF NOT EXISTS idx_ag_relaciones_hasta ON ag_relaciones(hasta_id)",
    ]),
    # Add ag_bitacora.prev_hash/hash (WORM tamper-evidence). Recreate-and-copy
    # (house style) so it works whether or not the columns already exist: the
    # copy names only the pre-seal columns, so legacy rows keep NULL seals
    # (declared: history before the chain isn't sealed). ag_bitacora is
    # referenced by no FK, so recreate is safe.
    (3, "ag_bitacora_add_hash_chain", [
        """CREATE TABLE ag_bitacora_new (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  INTEGER NOT NULL,
            ts          TEXT DEFAULT (datetime('now')),
            accion      TEXT NOT NULL,
            detalle     TEXT NOT NULL,
            prev_hash   TEXT,
            hash        TEXT,
            FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
        )""",
        "INSERT INTO ag_bitacora_new (id, session_id, ts, accion, detalle)"
        " SELECT id, session_id, ts, accion, detalle FROM ag_bitacora",
        "DROP TABLE ag_bitacora",
        "ALTER TABLE ag_bitacora_new RENAME TO ag_bitacora",
        "CREATE INDEX IF NOT EXISTS idx_ag_bitacora_session ON ag_bitacora(session_id)",
    ]),
]


def apply_migrations(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            applied_at  TEXT DEFAULT (datetime('now'))
        )
        """
    )
    applied = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
    for version, name, statements in sorted(MIGRATIONS):
        if version in applied:
            continue
        for statement in statements:
            conn.execute(statement)
        conn.execute(
            "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
            (version, name),
        )
