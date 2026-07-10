"""Live state for the constellation figures — pure, read-only.

Every figure in the landing constellations carries a REAL metric from
this payload (the no-dead-ornament law). Metrics that belong to phases
not yet built (Radar signals, Qualia telemetry, NOMOS rules) are
reported as None so the UI renders them as latent — never faked.
"""
import sqlite3
from typing import Any, Optional


def _count(conn: sqlite3.Connection, tabla: str, session_id: int) -> int:
    # tabla always comes from the fixed literals below, never from input
    return conn.execute(
        f"SELECT COUNT(*) FROM {tabla} WHERE session_id = ?", (session_id,)
    ).fetchone()[0]


def _total_senales(conn: sqlite3.Connection, session_id: int) -> int:
    from autogenes.senales import senales_de_sesion

    return senales_de_sesion(conn, session_id)["total"]


def estado_de_sesion(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    ses = conn.execute(
        "SELECT id, month_processed, year_processed, status FROM processing_sessions"
        " WHERE id = ?", (session_id,),
    ).fetchone()
    if ses is None:
        raise ValueError(f"Sesión inexistente: {session_id}")

    vehiculos = _count(conn, "importaciones", session_id)
    facturas = _count(conn, "extraccion_facturas", session_id)
    faltantes = _count(conn, "facturas_faltantes", session_id)
    errores = _count(conn, "facturas_errores", session_id)

    conciliado_pct: Optional[int] = None
    if vehiculos:
        conciliado_pct = round(100 * (vehiculos - faltantes) / vehiculos)

    valor_total = conn.execute(
        "SELECT COALESCE(SUM(precio), 0) FROM importaciones WHERE session_id = ?",
        (session_id,),
    ).fetchone()[0]

    productos_informe = conn.execute(
        "SELECT COUNT(*) FROM ag_productos WHERE session_id = ? AND clase = 'informe'",
        (session_id,),
    ).fetchone()[0]
    productos_camino = conn.execute(
        "SELECT COUNT(*) FROM ag_productos WHERE session_id = ? AND clase = 'camino'",
        (session_id,),
    ).fetchone()[0]

    return {
        "session_id": ses["id"],
        "sesion": f"{ses['month_processed']:02d}/{ses['year_processed']}",
        "estado_sesion": ses["status"],
        "vehiculos": vehiculos,
        "facturas": facturas,
        "faltantes": faltantes,
        "errores": errores,
        "conciliado_pct": conciliado_pct,
        "valor_total": valor_total,
        "artefactos": _count(conn, "ag_artefactos", session_id),
        "fragmentos": _count(conn, "ag_fragmentos", session_id),
        "entidades": _count(conn, "ag_entidades", session_id),
        "relaciones": _count(conn, "ag_relaciones", session_id),
        "productos_informe": productos_informe,
        "productos_camino": productos_camino,
        # señales del Radar (F5): total real
        "senales": _total_senales(conn, session_id),
        "anomalias": None,    # F7 Qualia
        "hallazgos": None,    # F9 motor de hallazgos
        "reglas": None,       # F12 NOMOS
    }
