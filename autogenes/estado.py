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


def _tiene_base_qualia(conn: sqlite3.Connection, session_id: int) -> bool:
    from autogenes.qualia import leer_base
    try:
        return leer_base(conn, session_id) is not None
    except sqlite3.OperationalError:
        return False   # esquema qualia aún no migrado en esta base


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
        # faltantes puede exceder vehiculos tras un reproceso parcial:
        # el porcentaje se acota, jamás se muestra negativo o >100
        conciliado_pct = max(0, min(100, round(100 * (vehiculos - faltantes) / vehiculos)))

    valor_total = conn.execute(
        "SELECT COALESCE(SUM(precio), 0) FROM importaciones WHERE session_id = ?",
        (session_id,),
    ).fetchone()[0]

    from autogenes.senales import senales_de_sesion
    sen = senales_de_sesion(conn, session_id)

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
        # señales del Radar (F5, ya incluye anomalías Qualia): total real
        "senales": sen["total"],
        # anomalías Qualia (F7): con base es conteo (aun 0); sin base solo
        # las de actividad — si tampoco hay, el satélite queda latente
        "anomalias": (len(sen["anomalias"])
                      if sen["anomalias"] or _tiene_base_qualia(conn, session_id)
                      else None),
        # hallazgos CONCILIA (F9): conteo real con datos aduanales; una
        # sesión puramente de sustrato queda latente, no en cero falso
        "hallazgos": _hallazgos_concilia(conn, session_id, vehiculos, facturas),
        # conformidad VALIDACIÓN (F10): % de filas plenamente conformes; sin
        # filas aduanales queda latente (None), no un 100% falso
        "conformidad_pct": _conformidad_validacion(conn, session_id,
                                                   vehiculos, facturas),
        # reglas NOMOS (F12): conteo real; sin tabla migrada queda latente
        "reglas": _reglas_nomos(conn, session_id),
    }


def _conformidad_validacion(conn: sqlite3.Connection, session_id: int,
                            vehiculos: int, facturas: int) -> Optional[int]:
    if not vehiculos and not facturas:
        return None
    from autogenes.validacion import validar
    return validar(conn, session_id)["conformidad_pct"]


def _reglas_nomos(conn: sqlite3.Connection, session_id: int) -> Optional[int]:
    try:
        return conn.execute(
            "SELECT COUNT(*) FROM ag_reglas WHERE session_id = ?",
            (session_id,)).fetchone()[0]
    except sqlite3.OperationalError:
        return None


def _hallazgos_concilia(conn: sqlite3.Connection, session_id: int,
                        vehiculos: int, facturas: int) -> Optional[int]:
    if not vehiculos and not facturas:
        return None
    from autogenes.concilia import conciliar
    return conciliar(conn, session_id)["total"]
