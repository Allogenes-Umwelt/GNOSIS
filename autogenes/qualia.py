"""QUALIA session service (F7b) — the studio's own store over SQLite.

Bridges the pure engines (topologia, anomalias) to a session:

- `red_de_sesion`: projects the session graph (aduanal tables + ag_*)
  into the generic RedSig dict the topology engine consumes.
- Telemetry: `registrar_snapshot` auto-samples a compact structural
  snapshot after mutations (deduped against the last sample, capped);
  it is NOT the baseline.
- Baseline: `fijar_base` pins the operator's reference — only the
  operator moves it; `anomalias_de_sesion` measures NOW against it.
- `drift_sesiones`: cross-session structural drift (marca/país/aduana
  live in the same projection, so drift compares whole cases) — the
  server enhancement KARELEN's one-browser store could not have.

ag_qualia_* is Qualia's OWN store (derived, reproducible telemetry),
not the evidence graph: sustrato.py remains the only writer of the
evidence tables. This module is the sole writer of ag_qualia_*.
"""
import json
import sqlite3
from typing import Any, Optional

from autogenes import topologia
from autogenes.anomalias import detectar_anomalias, drift_topologico, tomar_snapshot

MAX_SNAPSHOTS = 200


def red_de_sesion(conn: sqlite3.Connection, session_id: int,
                  limite_vehiculos: Optional[int] = None) -> dict[str, list]:
    """The session ontology as a generic weighted network. Rides the F2
    read-time projection — never rebuilds it, never writes."""
    from autogenes.proyeccion import construir_grafo

    g = construir_grafo(conn, session_id, limite_vehiculos=limite_vehiculos)
    return {
        "nodos": [{"id": n["id"], "etiqueta": n["etiqueta"], "kind": n.get("kind")}
                  for n in g["nodos"]],
        "enlaces": [{"origen": e["source"], "destino": e["target"],
                     "peso": e.get("peso") or 0.5}
                    for e in g["enlaces"]],
    }


def _snapshot_actual(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    red = red_de_sesion(conn, session_id)
    resumen = topologia.resumen_red(red)
    ahora = conn.execute("SELECT datetime('now')").fetchone()[0]
    return tomar_snapshot(resumen, ahora)


def _sin_ts(s: dict[str, Any]) -> str:
    return json.dumps({k: v for k, v in s.items() if k != "ts"},
                      ensure_ascii=False, sort_keys=True)


def registrar_snapshot(conn: sqlite3.Connection, session_id: int) -> Optional[dict]:
    """Auto-telemetry: sample the current structure. Skipped when
    identical to the last sample (a no-op mutation is not a data point);
    the series is capped at MAX_SNAPSHOTS per session."""
    snap = _snapshot_actual(conn, session_id)
    ultimo = conn.execute(
        "SELECT snapshot FROM ag_qualia_snapshots WHERE session_id = ?"
        " ORDER BY id DESC LIMIT 1", (session_id,),
    ).fetchone()
    if ultimo and _sin_ts(json.loads(ultimo["snapshot"])) == _sin_ts(snap):
        return None
    conn.execute(
        "INSERT INTO ag_qualia_snapshots (session_id, snapshot) VALUES (?, ?)",
        (session_id, json.dumps(snap, ensure_ascii=False)),
    )
    conn.execute(
        "DELETE FROM ag_qualia_snapshots WHERE session_id = ? AND id NOT IN ("
        " SELECT id FROM ag_qualia_snapshots WHERE session_id = ?"
        " ORDER BY id DESC LIMIT ?)",
        (session_id, session_id, MAX_SNAPSHOTS),
    )
    conn.commit()
    return snap


def leer_snapshots(conn: sqlite3.Connection, session_id: int,
                   limite: int = 50) -> list[dict]:
    """Telemetry series, oldest → newest (for the Horizonte's waves)."""
    filas = conn.execute(
        "SELECT snapshot FROM ag_qualia_snapshots WHERE session_id = ?"
        " ORDER BY id DESC LIMIT ?", (session_id, limite),
    ).fetchall()
    return [json.loads(r["snapshot"]) for r in reversed(filas)]


def fijar_base(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """Pin the operator's reference: OBSERVAR measures anomalies against
    THIS, and only the operator moves it. Also records the sample as
    telemetry (the reference is a data point too)."""
    snap = _snapshot_actual(conn, session_id)
    conn.execute(
        "INSERT INTO ag_qualia_base (session_id, snapshot) VALUES (?, ?)"
        " ON CONFLICT(session_id) DO UPDATE SET snapshot = excluded.snapshot,"
        " ts = datetime('now')",
        (session_id, json.dumps(snap, ensure_ascii=False)),
    )
    conn.commit()
    registrar_snapshot(conn, session_id)
    return snap


def leer_base(conn: sqlite3.Connection, session_id: int) -> Optional[dict]:
    r = conn.execute(
        "SELECT snapshot FROM ag_qualia_base WHERE session_id = ?", (session_id,),
    ).fetchone()
    return json.loads(r["snapshot"]) if r else None


def anomalias_de_sesion(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """OBSERVAR: the network NOW measured against the operator's baseline.
    Without a baseline there are no findings — the surface says why,
    honestly, instead of inventing a reference."""
    red = red_de_sesion(conn, session_id)
    resumen = topologia.resumen_red(red)
    base = leer_base(conn, session_id)
    if base is None:
        return {"resumen": resumen, "base": None, "hallazgos": [],
                "motivo": "Sin referencia fijada — fija la base para medir desviaciones"}
    return {"resumen": resumen, "base": base,
            "hallazgos": detectar_anomalias(resumen, base)}


def drift_sesiones(conn: sqlite3.Connection, session_id_a: int,
                   session_id_b: int) -> dict[str, Any]:
    """Structural drift between two whole sessions (A = reference)."""
    def etiqueta(sid: int) -> str:
        r = conn.execute(
            "SELECT month_processed, year_processed FROM processing_sessions"
            " WHERE id = ?", (sid,),
        ).fetchone()
        if r is None:
            raise ValueError(f"Sesión inexistente: {sid}")
        return f"{r['month_processed']:02d}/{r['year_processed']}"

    et_a, et_b = etiqueta(session_id_a), etiqueta(session_id_b)
    resumen_a = topologia.resumen_red(red_de_sesion(conn, session_id_a))
    resumen_b = topologia.resumen_red(red_de_sesion(conn, session_id_b))
    return drift_topologico(resumen_a, resumen_b, et_a, et_b)


def estado_qualia(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """The OBSERVAR window's full readout: current summary, baseline,
    measured anomalies and the telemetry tail — one call for the UI."""
    resultado = anomalias_de_sesion(conn, session_id)
    resultado["snapshots"] = leer_snapshots(conn, session_id, limite=50)
    return resultado
