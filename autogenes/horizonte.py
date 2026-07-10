"""QUALIA event horizon (F7c) — ACTUAR's honest core.

Python port of ref_karelen/capacidades/horizonte.ts; spec is
tests/test_horizonte.py (1:1 with horizonte.test.ts).

The oscilloscope's waves are the operator's OWN sampled telemetry (the
qualia snapshots); the vertical lines are the operator's interventions
from the append-only bitácora; the delta around each line is measured
between the nearest samples before and after — never interpolated,
never invented. Pure. Timestamps only need to be mutually comparable
(ints in tests, ISO strings from SQLite — both order correctly).
"""
from typing import Any, Optional


def construir_horizonte(snapshots: list[dict[str, Any]],
                        intervenciones: list[dict[str, Any]],
                        max_lineas: int = 12) -> Optional[dict[str, Any]]:
    if not snapshots:
        return None
    puntos = [
        {"ts": s["ts"], "n_nodos": s["n_nodos"], "n_enlaces": s["n_enlaces"],
         "densidad": s["densidad"]}
        for s in sorted(snapshots, key=lambda s: s["ts"])
    ]
    t0, t1 = puntos[0]["ts"], puntos[-1]["ts"]

    lineas: list[dict[str, Any]] = []
    dentro = sorted(
        (i for i in intervenciones if t0 <= i["ts"] <= t1),
        key=lambda i: i["ts"],
    )[-max_lineas:]
    for i in dentro:
        antes: Optional[dict] = None
        despues: Optional[dict] = None
        for p in puntos:
            if p["ts"] <= i["ts"]:
                antes = p
            if p["ts"] >= i["ts"] and despues is None:
                despues = p
        delta = None
        if antes is not None and despues is not None and despues["ts"] > antes["ts"]:
            delta = {"nodos": despues["n_nodos"] - antes["n_nodos"],
                     "enlaces": despues["n_enlaces"] - antes["n_enlaces"]}
        lineas.append({**i, "delta": delta})

    return {
        "puntos": puntos,
        "lineas": lineas,
        "t0": t0,
        "t1": t1,
        "max_nodos": max(*(p["n_nodos"] for p in puntos), 1),
        "max_enlaces": max(*(p["n_enlaces"] for p in puntos), 1),
    }
