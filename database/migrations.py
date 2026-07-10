"""Versioned, one-way migrations for changes CREATE IF NOT EXISTS can't express.

Each migration runs exactly once, inside init_db(). Append only — never
edit or reorder an entry that has shipped.
"""
import sqlite3

# (version, name, list of SQL statements)
MIGRATIONS: list[tuple[int, str, list[str]]] = [
    # (1, "example_add_column", ["ALTER TABLE x ADD COLUMN y TEXT"]),
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
