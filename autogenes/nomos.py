"""NOMOS (F12) — reglas de negocio como ciudadanos del grafo.

Una regla es una neurona McCulloch-Pitts en el sentido ORIGINAL (1943):
lógica booleana como unidad de umbral con pesos unitarios FIJOS — nada
se aprende, nada se pondera a ojo. Sus entradas son condiciones
campo=valor sobre las filas DWH (0/1 por fila), el umbral es θ = número
de condiciones (AND), y cuando dispara se exige `entonces` (campo=valor
esperado). Cada evaluación reporta la anatomía completa:

- por condición: cuántas filas la satisfacen (el conteo vivo de cada
  entrada de la neurona);
- disparos: filas que cruzan el umbral (todas las condiciones);
- conformes / violaciones: disparos donde `entonces` se cumple / falla;
- P&L en MXN: valor real de las filas violadoras (suma de precios
  presentes — lo sin precio se cuenta y se declara, jamás se estima).

Escritura solo vía Sustrato (crear/alternar; borrar jamás). Este motor
solo LEE y evalúa. Cero snake oil: todo número es |conjunto| o suma de
precios reales.
"""
import json
import sqlite3
from typing import Any

MAX_REFS = 12


def _cumple(fila: sqlite3.Row, cond: dict) -> bool:
    v = fila[cond["campo"]]
    return (str(v).strip().upper() if v is not None else "") \
        == str(cond["valor"]).strip().upper()


def evaluar_regla(filas: list[sqlite3.Row], regla: dict) -> dict[str, Any]:
    """La neurona M-P evaluada sobre las filas: anatomía + veredicto.
    Pura: recibe filas y regla, devuelve conteos."""
    condiciones = regla["condiciones"]
    entradas = []
    for c in condiciones:
        n = sum(1 for f in filas if _cumple(f, c))
        entradas.append({"campo": c["campo"], "valor": c["valor"], "n": n})

    disparos = [f for f in filas if all(_cumple(f, c) for c in condiciones)]
    entonces = regla["entonces"]
    violan = [f for f in disparos if not _cumple(f, entonces)]
    con_precio = [f["precio"] for f in violan if f["precio"] is not None]

    return {
        "id": regla["id"],
        "nombre": regla["nombre"],
        "origen": regla["origen"],
        "activa": regla["activa"],
        "entradas": entradas,                 # conteo vivo por condición
        "umbral": len(condiciones),           # θ = n condiciones (AND)
        "n_disparos": len(disparos),
        "entonces": entonces,
        "n_conformes": len(disparos) - len(violan),
        "n_violaciones": len(violan),
        "pnl_mxn": round(sum(con_precio), 2) if con_precio else None,
        "sin_precio": len(violan) - len(con_precio),
        "refs": [{"chasis": f["chasis"], "factura": f["factura"]}
                 for f in violan[:MAX_REFS]],
        "base": len(filas),
    }


def evaluar_reglas(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """Todas las reglas de la sesión evaluadas sobre las filas DWH vivas.
    Las inactivas se evalúan igual (backtest barato: qué pasaría) pero se
    reportan aparte del P&L total."""
    filas = conn.execute(
        "SELECT id, chasis, factura, precio, j_y_n, pais_code, auto_code"
        " FROM importaciones WHERE session_id = ? ORDER BY id",
        (session_id,)).fetchall()
    reglas = [
        {**dict(r), "condiciones": json.loads(r["condiciones"]),
         "entonces": json.loads(r["entonces"]), "activa": bool(r["activa"])}
        for r in conn.execute(
            # SOLO las de fila: una regla de patrón (ADR-0019) ve el grafo y la
            # evalúa `autogenes/patrones.py`. Mezclarlas aquí haría que este
            # motor recorriera un objeto como si fuera su lista de condiciones.
            "SELECT * FROM ag_reglas WHERE session_id = ? AND clase = 'fila'"
            " ORDER BY created_at, id", (session_id,))
    ]
    evaluadas = [evaluar_regla(filas, rg) for rg in reglas]
    evaluadas.sort(key=lambda e: (-(e["pnl_mxn"] or 0), -e["n_violaciones"],
                                  e["nombre"]))
    activas = [e for e in evaluadas if e["activa"]]
    return {
        "session_id": session_id,
        "reglas": evaluadas,
        "total": len(evaluadas),
        "activas": len(activas),
        "violaciones_activas": sum(e["n_violaciones"] for e in activas),
        "pnl_activas_mxn": round(sum(e["pnl_mxn"] or 0 for e in activas), 2),
        "base": len(filas),
    }


def triaje_o1(evaluacion: dict[str, Any], disp: dict[str, dict]) -> dict[str, Any]:
    """El ciclo de vida O1 sobre una evaluación NOMOS. Un hallazgo VIVO es una
    regla que se APLICA (activa) y SIGUE incumpliéndose: una inactiva es solo
    backtest ('qué pasaría') y jamás debe contar como hallazgo, contradecir una
    disposición ni figurar en el resumen de estados. Anota disposición y
    contradicción, resume estados y verifica resoluciones — todo sobre reglas
    activas. Muta `evaluacion` en su lugar y la devuelve. Determinista."""
    from autogenes.disposiciones import (anotar, resoluciones_verificadas,
                                         resumen_estados)
    for e in evaluacion["reglas"]:
        e["clave"] = e["id"]                          # la clave O1 es el id
    ids_activas = {e["clave"] for e in evaluacion["reglas"] if e["activa"]}
    incumplidas = [e for e in evaluacion["reglas"]
                   if e["n_violaciones"] > 0 and e["activa"]]
    anotar(incumplidas, disp)
    claves = {e["clave"] for e in incumplidas}
    # solo disposiciones de reglas activas: una inactiva dispuesta 'resuelto' no
    # es una resolución verificada (desapareció por apagado, no por corrección)
    disp_activas = {k: v for k, v in disp.items() if k in ids_activas}
    evaluacion["resoluciones_verificadas"] = resoluciones_verificadas(
        claves, disp_activas)
    evaluacion["estados"] = resumen_estados(incumplidas)
    return evaluacion


# ── ola 2: backtest contra la historia ───────────────────────────────


def backtest_regla(conn: sqlite3.Connection, session_id: int,
                   regla_id: str) -> dict[str, Any]:
    """La regla evaluada contra TODAS las sesiones procesadas: qué habría
    encontrado en cada una. Mismo evaluador, otras filas — nada nuevo que
    inventar. La regla vive en su sesión; el backtest solo LEE historia."""
    regla_fila = conn.execute(
        "SELECT * FROM ag_reglas WHERE id = ? AND session_id = ? AND clase = 'fila'",
        (regla_id, session_id)).fetchone()
    if regla_fila is None:
        return {"error": "Regla de fila inexistente en esta sesión"}
    regla = {**dict(regla_fila),
             "condiciones": json.loads(regla_fila["condiciones"]),
             "entonces": json.loads(regla_fila["entonces"]),
             "activa": bool(regla_fila["activa"])}

    sesiones = conn.execute(
        "SELECT id, month_processed, year_processed FROM processing_sessions"
        " ORDER BY id").fetchall()
    corridas = []
    for s in sesiones:
        filas = conn.execute(
            "SELECT id, chasis, factura, precio, j_y_n, pais_code, auto_code"
            " FROM importaciones WHERE session_id = ? ORDER BY id",
            (s["id"],)).fetchall()
        e = evaluar_regla(filas, regla)
        corridas.append({
            "session_id": s["id"],
            "sesion": f"{s['month_processed']:02d}/{s['year_processed']}",
            "actual": s["id"] == session_id,
            "base": e["base"],
            "n_disparos": e["n_disparos"],
            "n_violaciones": e["n_violaciones"],
            "pnl_mxn": e["pnl_mxn"],
        })
    return {"regla": regla["nombre"], "corridas": corridas}
