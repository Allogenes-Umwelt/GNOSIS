"""Database package: connection factory, schema bootstrap and migrations.

SQLite is the single source of truth. Every connection enforces foreign
keys; the database runs in WAL mode. Schema application is idempotent
(CREATE IF NOT EXISTS); non-idempotent changes go through migrations.py.
"""
import os
import sqlite3
import time

_DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "aduanas.db",
)

DB_PATH = os.environ.get("JARVIS_DB_PATH", _DEFAULT_DB_PATH)


def get_connection() -> sqlite3.Connection:
    """Return a connection with dict-like rows and foreign keys enforced."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # Wait instead of failing when another worker holds the write lock
    # (gunicorn runs several workers over the same file).
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    """Apply the idempotent schema, WAL mode, and pending migrations.

    Every gunicorn worker runs this at import over the same file. The
    busy handler does not cover lock-upgrade deadlocks (SQLITE_BUSY is
    immediate there), so the idempotent bootstrap retries instead.
    """
    from . import models, models_autogenes
    from .migrations import apply_migrations

    last_error: sqlite3.OperationalError | None = None
    for _ in range(10):
        conn = get_connection()
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(models.SCHEMA_SQL)
            conn.executescript(models_autogenes.AG_SCHEMA_SQL)
            apply_migrations(conn)
            conn.commit()
            return
        except sqlite3.OperationalError as exc:
            if "locked" not in str(exc).lower():
                raise
            last_error = exc
            time.sleep(0.5)
        finally:
            conn.close()
    raise last_error
