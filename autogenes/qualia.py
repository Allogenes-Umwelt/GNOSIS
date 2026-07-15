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

# La lente de negocio (Q2 del PLAN_QUALIA_UPLIFT): QUALIA lee la topología
# ESTRUCTURAL del caso, no la fontanería de CÓMO se sabe. Los artefactos y
# fragmentos son evidencia (el "porqué se cree"), no protagonistas de la red:
# cada entidad los cita, así que dominan la centralidad por construcción — es
# la razón de que hoy el "concentrador" y el "monolito" sean un nombre de PDF.
# La lente los oculta por default; la capa documental queda a un clic
# (lente="completa"). Ocultar es honesto: no fabrica enlaces, solo deja de
# contar la plomería. El núcleo aduanal (nucleo/pedimento/vehiculo/marca/país)
# NO es plomería y se conserva.
FONTANERIA_DOCUMENTAL = frozenset({"artefacto", "fragmento"})


def red_de_sesion(conn: sqlite3.Connection, session_id: int,
                  limite_vehiculos: Optional[int] = None,
                  lente: str = "negocio") -> dict[str, list]:
    """The session ontology as a generic weighted network. Rides the F2
    read-time projection — never rebuilds it, never writes.

    lente="negocio" (default) oculta la fontanería documental
    (artefactos/fragmentos) para que hubs, puentes y monolitos sean
    entidades de negocio; lente="completa" incluye la capa documental."""
    from autogenes.proyeccion import construir_grafo

    g = construir_grafo(conn, session_id, limite_vehiculos=limite_vehiculos)
    nodos, enlaces = g["nodos"], g["enlaces"]
    if lente == "negocio":
        ocultos = {n["id"] for n in nodos
                   if n.get("kind") in FONTANERIA_DOCUMENTAL}
        if ocultos:
            nodos = [n for n in nodos if n["id"] not in ocultos]
            enlaces = [e for e in enlaces
                       if e["source"] not in ocultos and e["target"] not in ocultos]
    return {
        "nodos": [{"id": n["id"], "etiqueta": n["etiqueta"], "kind": n.get("kind")}
                  for n in nodos],
        "enlaces": [{"origen": e["source"], "destino": e["target"],
                     "peso": e.get("peso") or 0.5}
                    for e in enlaces],
    }


def unidades_por_nodo(conn: sqlite3.Connection,
                      session_id: int) -> dict[str, int]:
    """Unidades físicas MEDIDAS por nodo, en base atómica: un vehículo
    cuenta 1; el resto —marca, país, pedimento, núcleo, conceptos,
    documentos— son vistas o agregados y NO se recuentan (marca y país
    parten el mismo padrón por ejes distintos; sumarlos duplicaría). Así el
    "volumen afectado" de una caída jamás infla: es el número de unidades
    individuales que quedan sin conexión, citable a la fila del vehículo.
    Deriva de la misma proyección F2; determinista, nunca proyecta."""
    from autogenes.proyeccion import construir_grafo

    g = construir_grafo(conn, session_id)
    return {n["id"]: (1 if n.get("kind") == "vehiculo" else 0)
            for n in g["nodos"]}


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


def anomalias_actividad(conn: sqlite3.Connection, session_id: int) -> list[dict]:
    """RÁFAGA y RITMO sobre la serie de actividad de la bitácora
    (mutaciones por día). Miden contra su PROPIA historia, así que no
    requieren base — estadística clásica, nunca opinión."""
    from autogenes.anomalias import quiebre_ritmo, rafaga_actividad

    filas = conn.execute(
        "SELECT substr(ts, 1, 10) AS dia, COUNT(*) AS n FROM ag_bitacora"
        " WHERE session_id = ? GROUP BY dia ORDER BY dia",
        (session_id,),
    ).fetchall()
    serie = [float(r["n"]) for r in filas]
    hallazgos: list[dict] = []
    r = rafaga_actividad(serie)
    if r["es_rafaga"]:
        hallazgos.append({
            "detector": "rafaga",
            "titulo": "Ráfaga de actividad",
            "detalle": (f"El último día registró {serie[-1]:g} mutaciones, a "
                        f"{r['z']:.1f} desviaciones de tu cadencia previa."),
            "severidad": max(0.0, min(1.0, r["z"] / 4)),
            "clave": "anom-rafaga",
        })
    q = quiebre_ritmo(serie)
    if q["es_quiebre"]:
        hallazgos.append({
            "detector": "ritmo",
            "titulo": "Tu cadencia se quebró",
            "detalle": (f"La actividad tenía periodo {q['lag']} días "
                        f"(autocorrelación {q['antes']:.2f}) y en la ventana "
                        f"reciente cayó a {q['ahora']:.2f}."),
            "severidad": max(0.0, min(1.0, q["antes"] - q["ahora"])),
            "clave": "anom-ritmo",
        })
    return hallazgos


def anomalias_de_sesion(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """OBSERVAR: the network NOW measured against the operator's baseline,
    plus the self-referential activity detectors (ráfaga/ritmo, which
    need no base). Without a baseline the structural findings are empty
    and the surface says why — never an invented reference."""
    red = red_de_sesion(conn, session_id)
    resumen = topologia.resumen_red(red)
    base = leer_base(conn, session_id)
    actividad = anomalias_actividad(conn, session_id)
    if base is None:
        return {"resumen": resumen, "base": None, "hallazgos": actividad,
                "motivo": "Sin referencia fijada — fija la base para medir desviaciones"}
    hallazgos = detectar_anomalias(resumen, base) + actividad
    hallazgos.sort(key=lambda h: -h["severidad"])
    return {"resumen": resumen, "base": base, "hallazgos": hallazgos}


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
    red_a = red_de_sesion(conn, session_id_a)
    red_b = red_de_sesion(conn, session_id_b)
    resultado = drift_topologico(topologia.resumen_red(red_a),
                                 topologia.resumen_red(red_b), et_a, et_b)
    # huella de cohesión comparable (persistencia_h0): apretó vs fragmentó
    resultado["cohesion_de"] = topologia.huella_cohesion(red_a)
    resultado["cohesion_a"] = topologia.huella_cohesion(red_b)
    return resultado


def _n_registros(conn: sqlite3.Connection, session_id: int) -> int:
    """How many source records feed the network: document fragments plus
    the aduanal rows the projection rides on."""
    total = 0
    for t in ("ag_fragmentos", "importaciones", "extraccion_facturas"):
        total += conn.execute(
            f"SELECT COUNT(*) FROM {t} WHERE session_id = ?",  # noqa: S608 — fixed tuple
            (session_id,),
        ).fetchone()[0]
    return total


def horizonte_de_sesion(conn: sqlite3.Connection, session_id: int) -> Optional[dict]:
    """ACTUAR: the telemetry waves + the operator's interventions from
    the append-only bitácora, each with its measured before/after delta."""
    from autogenes.horizonte import construir_horizonte

    snapshots = leer_snapshots(conn, session_id, limite=200)
    intervenciones = [
        {"ts": r["ts"], "accion": r["accion"], "detalle": r["detalle"]}
        for r in conn.execute(
            "SELECT ts, accion, detalle FROM ag_bitacora WHERE session_id = ?"
            " ORDER BY id", (session_id,),
        )
    ]
    return construir_horizonte(snapshots, intervenciones)


def estado_qualia(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """The OBSERVAR window's full readout: current summary, baseline,
    measured anomalies, the deterministic reading and the telemetry
    tail — one call for the UI."""
    from autogenes.qualia_narrativa import construir_lectura

    resultado = anomalias_de_sesion(conn, session_id)
    resultado["snapshots"] = leer_snapshots(conn, session_id, limite=50)
    resultado["lectura"] = construir_lectura(
        resultado["resumen"], _n_registros(conn, session_id))
    return resultado
