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
            "SELECT * FROM ag_reglas WHERE session_id = ?"
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
