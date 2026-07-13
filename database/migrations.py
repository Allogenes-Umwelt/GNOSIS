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
