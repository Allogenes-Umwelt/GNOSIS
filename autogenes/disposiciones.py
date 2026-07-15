"""Ciclo de vida de hallazgos (F9 CONCILIA · F10 VALIDACIÓN · F12 NOMOS):
la lectura que une los hallazgos VIVOS del motor con la DISPOSICIÓN del
operador y — el diferenciador honesto — CONTRASTA lo declarado contra lo
medido.

El motor re-deriva sus hallazgos en cada corrida (lectura pura). La
disposición (nuevo → en_gestion → resuelto/descartado) vive en
`ag_disposiciones`, escrita sólo por `Sustrato`. Aquí no se escribe ni se
recalcula nada: se anota y se contrasta.

Dos direcciones del contraste — Palantir registra lo que el operador dice;
GNOSIS además responde si los datos le dan la razón:

- Un hallazgo VIVO que el operador marcó cerrado (resuelto/descartado) pero
  el motor SIGUE midiendo: se declara contradicho (`contradice=True`). No se
  cree la palabra sin la evidencia que la sostenga.
- Una disposición 'resuelto' cuya clave ya NO aparece entre los hallazgos
  vivos: el motor confirma que la discrepancia desapareció
  (`resoluciones_verificadas`).

Todo es lectura pura y determinista (mismo estado de base ⇒ misma salida).
"""
from typing import Any, Iterable

ESTADOS = ("nuevo", "en_gestion", "resuelto", "descartado")
ABIERTOS = ("nuevo", "en_gestion")
CERRADOS = ("resuelto", "descartado")


def leer_disposiciones(conn: Any, session_id: int,
                       motor: str) -> dict[str, dict]:
    """Mapa clave → {estado, nota, ts} de un motor. Vacío si el esquema aún
    no tiene la tabla del ciclo de vida (degradación honesta, como en
    QUALIA)."""
    import sqlite3
    try:
        return {
            r["clave"]: {"estado": r["estado"], "nota": r["nota"],
                         "ts": r["ts"]}
            for r in conn.execute(
                "SELECT clave, estado, nota, ts FROM ag_disposiciones"
                " WHERE session_id = ? AND motor = ?", (session_id, motor),
            )
        }
    except sqlite3.OperationalError:
        return {}


def anotar(hallazgos: list[dict], disp: dict[str, dict]) -> list[dict]:
    """Anota cada hallazgo vivo con su disposición (estado/nota; sin
    disposición nace 'nuevo') y con `contradice`: True cuando el operador lo
    marcó cerrado (resuelto/descartado) pero el motor lo sigue midiendo.
    Muta en sitio y devuelve la misma lista."""
    for h in hallazgos:
        d = disp.get(h["clave"])
        h["estado"] = d["estado"] if d else "nuevo"
        h["nota"] = d["nota"] if d else None
        h["contradice"] = bool(d) and d["estado"] in CERRADOS
    return hallazgos


def resoluciones_verificadas(claves_vivas: Iterable[str],
                             disp: dict[str, dict]) -> list[dict]:
    """Disposiciones 'resuelto' cuya clave ya no está entre los hallazgos
    vivos: el motor confirma que la discrepancia desapareció. Orden
    determinista por clave."""
    vivas = set(claves_vivas)
    return sorted(
        ({"clave": k, "nota": v["nota"], "ts": v["ts"]}
         for k, v in disp.items()
         if v["estado"] == "resuelto" and k not in vivas),
        key=lambda x: x["clave"],
    )


def resumen_estados(hallazgos: list[dict]) -> dict[str, int]:
    """Conteo por estado sobre hallazgos ya anotados (más `contradice`) —
    alimenta el filtro y los contadores del tablero. Determinista."""
    r = {e: 0 for e in ESTADOS}
    r["contradice"] = 0
    for h in hallazgos:
        r[h.get("estado", "nuevo")] += 1
        if h.get("contradice"):
            r["contradice"] += 1
    return r
