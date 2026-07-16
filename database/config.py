"""Key-value configuration over the config table.

Known keys:
- llm_default          -> provider name the chat uses first (default "deepseek")
- llm_fallback_claude  -> "on"/"off": Claude may serve when the default
                          is unavailable (admin-activated; default "off")
- llm_ollama           -> "on"/"off": allow the offline Ollama fallback
- deepseek_model / claude_model -> optional model-id overrides
"""
import sqlite3
from typing import Optional

DEFAULTS = {
    "llm_default": "deepseek",
    "llm_fallback_claude": "off",
    "llm_ollama": "off",
}


def get_config(conn: sqlite3.Connection, clave: str, default: Optional[str] = None) -> Optional[str]:
    row = conn.execute("SELECT valor FROM config WHERE clave = ?", (clave,)).fetchone()
    if row:
        return row["valor"]
    return DEFAULTS.get(clave, default) if default is None else default


def set_config(conn: sqlite3.Connection, clave: str, valor: str) -> None:
    conn.execute(
        "INSERT INTO config (clave, valor) VALUES (?, ?)"
        " ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor,"
        " updated_at = datetime('now')",
        (clave, valor),
    )
    conn.commit()


def get_all_config(conn: sqlite3.Connection) -> dict[str, str]:
    valores = dict(DEFAULTS)
    for r in conn.execute("SELECT clave, valor FROM config"):
        valores[r["clave"]] = r["valor"]
    return valores
