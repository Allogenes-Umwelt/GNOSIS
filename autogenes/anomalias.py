"""QUALIA anomaly engine (F7b) — OBSERVAR's honest core.

Python port of ref_karelen/capacidades/anomalias.ts (+ the
autocorrelation it borrows from series.ts); the behaviour spec is
tests/test_anomalias.py (1:1 with anomalias.test.ts).

An anomaly is a MEASURED deviation of the current network against the
operator's own baseline (the docked snapshot), never a hidden model's
opinion. Every finding carries its detector, the numbers behind it and
a severity in [0,1]. Pure and deterministic; consumes resumen_red()
dicts from autogenes.topologia.
"""
import math
from typing import Any

Anomalia = dict[str, Any]
Snapshot = dict[str, Any]


def _acotar(x: float) -> float:
    return max(0.0, min(1.0, x))


def tomar_snapshot(resumen: dict[str, Any], ts: str) -> Snapshot:
    """Compact metric snapshot of a structural summary — what telemetry
    stores and the baseline pins."""
    return {
        "ts": ts,
        "n_nodos": resumen["n_nodos"],
        "n_enlaces": resumen["n_enlaces"],
        "densidad": resumen["densidad"],
        "n_comunidades": resumen["n_comunidades"],
        "n_componentes": resumen["n_componentes"],
        "exponente": resumen["exponente"],
        "hubs": [{"id": h["id"], "etiqueta": h["etiqueta"], "grado": h["grado"]}
                 for h in resumen["hubs"]],
        "puentes": [p["id"] for p in resumen["puentes"]],
    }


def detectar_anomalias(actual: dict[str, Any], base: Snapshot) -> list[Anomalia]:
    """Compare the network NOW against the baseline snapshot. Empty
    baseline or empty network → no findings (the surface says why,
    honestly). Findings sorted most-severe first, each with a citable
    clave for the SYNESIS digest."""
    hallazgos: list[Anomalia] = []
    if actual["n_nodos"] == 0 or base["n_nodos"] == 0:
        return hallazgos

    # 1 · A newcomer in the top hubs — structure reorganized around it.
    hubs_base = {h["id"] for h in base["hubs"]}
    nuevos = [h for h in actual["hubs"] if h["id"] not in hubs_base][:2]
    for h in nuevos:
        rango = next(i for i, x in enumerate(actual["hubs"]) if x["id"] == h["id"])
        hallazgos.append({
            "detector": "hub-nuevo",
            "titulo": f"Concentrador nuevo: «{h['etiqueta']}»",
            "detalle": (f"Entró al top de conectividad (rango {rango + 1}, grado "
                        f"{h['grado']:g}) sin estar en tu referencia."),
            "severidad": _acotar(1 - rango / max(1, len(actual["hubs"]))),
            "clave": f"anom-hub-{h['id']}",
        })

    # 2 · Degree-law exponent moved — the concentration regime changed.
    if actual["exponente"] is not None and base["exponente"] is not None:
        delta = abs(actual["exponente"] - base["exponente"])
        if delta >= 0.3:
            rumbo = ("se concentra en menos nodos"
                     if actual["exponente"] > base["exponente"] else "se reparte más")
            hallazgos.append({
                "detector": "exponente",
                "titulo": "La ley de conectividad cambió de régimen",
                "detalle": (f"Exponente {base['exponente']:.2f} → "
                            f"{actual['exponente']:.2f}: la estructura {rumbo}."),
                "severidad": _acotar(delta / 1.5),
                "clave": "anom-exponente",
            })

    # 3 · Bridges appearing or vanishing — fragility moved.
    puentes_base = set(base["puentes"])
    puentes_ahora = {p["id"] for p in actual["puentes"]}
    for p in actual["puentes"]:
        if p["id"] not in puentes_base:
            hallazgos.append({
                "detector": "puente-nuevo",
                "titulo": f"Puente crítico nuevo: «{p['etiqueta']}»",
                "detalle": "Si cae, la red se parte — y en tu referencia no era puente.",
                "severidad": 0.8,
                "clave": f"anom-puente-{p['id']}",
            })
    for pid in base["puentes"]:
        if pid not in puentes_ahora:
            etiqueta = next((h["etiqueta"] for h in base["hubs"] if h["id"] == pid), pid)
            hallazgos.append({
                "detector": "puente-caido",
                "titulo": f"Un puente dejó de serlo: «{etiqueta}»",
                "detalle": "La estructura ganó redundancia ahí — o el nodo perdió su posición.",
                "severidad": 0.4,
                "clave": f"anom-expuente-{pid}",
            })

    # 4 · Islands formed or fused.
    d_islas = actual["n_componentes"] - base["n_componentes"]
    if d_islas != 0:
        if d_islas > 0:
            titulo = f"{d_islas} {'isla nueva' if d_islas == 1 else 'islas nuevas'}"
        else:
            titulo = (f"{-d_islas} "
                      f"{'isla se fusionó' if d_islas == -1 else 'islas se fusionaron'}")
        hallazgos.append({
            "detector": "islas",
            "titulo": titulo,
            "detalle": f"Componentes: {base['n_componentes']} → {actual['n_componentes']}.",
            "severidad": _acotar(abs(d_islas) / 3),
            "clave": "anom-islas",
        })

    # 5 · Density shift ≥ 30% — the weave tightened or loosened.
    if base["densidad"] > 0:
        razon = actual["densidad"] / base["densidad"]
        if razon >= 1.3 or razon <= 0.7:
            hallazgos.append({
                "detector": "densidad",
                "titulo": "El tejido se apretó" if razon > 1 else "El tejido se aflojó",
                "detalle": (f"Densidad {base['densidad'] * 100:.0f} → "
                            f"{actual['densidad'] * 100:.0f} por ciento."),
                "severidad": _acotar(abs(razon - 1)),
                "clave": "anom-densidad",
            })

    hallazgos.sort(key=lambda h: -h["severidad"])
    return hallazgos


# ── classical statistics over the operator's own activity series ─────


def autocorrelacion(serie: list[float], lag: int) -> float:
    """Autocorrelation at a lag (port of series.ts)."""
    n = len(serie)
    if lag <= 0 or lag >= n:
        return 0.0
    media = sum(serie) / n
    den = sum((x - media) ** 2 for x in serie)
    num = sum((serie[i] - media) * (serie[i + lag] - media) for i in range(n - lag))
    return 0.0 if den == 0 else num / den


def rafaga_actividad(serie: list[float], ventana: int = 8) -> dict[str, Any]:
    """Activity burst — classical z-score of the last bucket against the
    mean and deviation of the previous window. Statistics, not magic."""
    if len(serie) < 3:
        return {"z": 0.0, "es_rafaga": False}
    previos = serie[max(0, len(serie) - 1 - ventana):-1]
    ultimo = serie[-1]
    media = sum(previos) / len(previos)
    varianza = sum((x - media) ** 2 for x in previos) / len(previos)
    sd = math.sqrt(varianza)
    z = (3.0 if ultimo > media else 0.0) if sd == 0 else (ultimo - media) / sd
    return {"z": z, "es_rafaga": z >= 2}


def quiebre_ritmo(serie: list[float]) -> dict[str, Any]:
    """Rhythm break — if the operator's activity series had a clear
    periodicity (autocorrelation ≥ 0.5 at some lag in the earlier half)
    and that periodicity collapsed in the recent, DISJOINT half (< 0.2
    at the same lag), the rhythm broke. Disjoint halves matter:
    overlapping windows dilute the collapse."""
    nada = {"lag": 0, "antes": 0.0, "ahora": 0.0, "es_quiebre": False}
    n = len(serie)
    if n < 12:
        return nada
    mitad = n // 2
    antes = serie[:mitad]
    ahora = serie[n - mitad:]
    max_lag = mitad // 2
    mejor_lag, mejor_r = 0, -math.inf
    for lag in range(2, max_lag + 1):
        r = autocorrelacion(antes, lag)
        if r > mejor_r:
            mejor_r, mejor_lag = r, lag
    if mejor_lag == 0 or mejor_r < 0.5:
        return nada
    r_ahora = autocorrelacion(ahora, mejor_lag)
    return {"lag": mejor_lag, "antes": mejor_r, "ahora": r_ahora,
            "es_quiebre": r_ahora < 0.2}


def desviacion_fuentes(series: list[dict[str, Any]]) -> list[Anomalia]:
    """Series deviation — each numeric series the operator accumulated
    (tipo de cambio, cupos, precios…) checked with the same classical
    z-score as the burst: the last value against its own history. Top
    two findings by severity; nothing is fetched here. Pure."""
    hallazgos: list[Anomalia] = []
    for s in series:
        valores: list[float] = s["valores"]
        r = rafaga_actividad(valores)
        if not r["es_rafaga"]:
            continue
        # Relevance floor: a near-constant series drifting by hundredths
        # clears z≥2 on tiny variance but means nothing to the operator.
        previos = valores[:-1]
        media = sum(previos) / len(previos)
        ultimo = valores[-1]
        if media != 0 and abs(ultimo - media) / abs(media) < 0.01:
            continue
        hallazgos.append({
            "detector": "fuente",
            "titulo": f"Serie «{s['etiqueta']}» se desvió",
            "detalle": (f"El último valor está a {r['z']:.1f} desviaciones de su "
                        f"propia historia ({len(valores)} consultas guardadas)."),
            "severidad": _acotar(r["z"] / 4),
            "clave": f"anom-fuente-{s['etiqueta']}",
        })
    hallazgos.sort(key=lambda h: -h["severidad"])
    return hallazgos[:2]


# ── drift between sessions (server enhancement, F7) ──────────────────


def drift_topologico(resumen_a: dict[str, Any], resumen_b: dict[str, Any],
                     etiqueta_a: str, etiqueta_b: str) -> dict[str, Any]:
    """Measured structural drift between two sessions' summaries — the
    cross-session enhancement KARELEN could not have (its store was one
    browser). Reuses the baseline detectors: session A's summary becomes
    the reference, session B is 'now'. Deltas are facts, not opinion."""
    base = tomar_snapshot(resumen_a, etiqueta_a)
    hallazgos = detectar_anomalias(resumen_b, base)
    return {
        "de": etiqueta_a,
        "a": etiqueta_b,
        "hallazgos": hallazgos,
        "deltas": {
            "n_nodos": resumen_b["n_nodos"] - resumen_a["n_nodos"],
            "n_enlaces": resumen_b["n_enlaces"] - resumen_a["n_enlaces"],
            "densidad": resumen_b["densidad"] - resumen_a["densidad"],
            "n_comunidades": resumen_b["n_comunidades"] - resumen_a["n_comunidades"],
            "n_componentes": resumen_b["n_componentes"] - resumen_a["n_componentes"],
            "exponente": (None if resumen_a["exponente"] is None
                          or resumen_b["exponente"] is None
                          else resumen_b["exponente"] - resumen_a["exponente"]),
        },
    }
