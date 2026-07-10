"""Database package: connection factory, schema bootstrap and migrations.

SQLite is the single source of truth. Every connection enforces foreign
keys; the database runs in WAL mode. Schema application is idempotent
(CREATE IF NOT EXISTS); non-idempotent changes go through migrations.py.
"""
import os
import sqlite3

_DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "aduanas.db",
)

DB_PATH = os.environ.get("JARVIS_DB_PATH", _DEFAULT_DB_PATH)


def get_connection() -> sqlite3.Connection:
    """Return a connection with dict-like rows and foreign keys enforced."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Apply the idempotent schema, WAL mode, and pending migrations."""
    from . import models
    from .migrations import apply_migrations

    conn = get_connection()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(models.SCHEMA_SQL)
        apply_migrations(conn)
        conn.commit()
    finally:
        conn.close()
