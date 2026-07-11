"""TBV-05 · CUPO — el libro mayor mensual, pasado y presente.

Ajuste acordado: el futuro SE QUITA — cuando se propuso proyección aquí
no se quiso, así que este tablero corta en el mes de la sesión y no
proyecta nada (el what-if vive solo en CONCILIA, donde sí se pidió).

La cascada de agotamiento: por tipo de cupo, cada mes es un escalón —
disponible al inicio, consumo (la caída) y disponible al fin, tomados
TAL CUAL de seguimiento_mensual. Un cupo que llega a cero es un hecho
(magenta), no una proyección. Meses posteriores al de la sesión se
excluyen y se declara cuántos fueron.
"""
import sqlite3
from typing import Any

TIPOS = (("PRODUCCION", "consumo_produccion", "disponible_produccion_inicio",
          "disponible_produccion_fin"),
         ("INVERSION", "consumo_inversion", "disponible_inversion_inicio",
          "disponible_inversion_fin"))


def libro_cupo(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    mes_sesion = conn.execute(
        "SELECT month_processed FROM processing_sessions WHERE id = ?",
        (session_id,)).fetchone()
    mes_corte = mes_sesion[0] if mes_sesion else 12

    filas = conn.execute(
        "SELECT * FROM seguimiento_mensual WHERE session_id = ? ORDER BY mes",
        (session_id,)).fetchall()
    visibles = [r for r in filas if r["mes"] <= mes_corte]
    excluidos = len(filas) - len(visibles)

    series = []
    for tipo, c_cons, c_ini, c_fin in TIPOS:
        meses = []
        for r in visibles:
            fin = r[c_fin]
            meses.append({
                "mes": r["mes"],
                "nombre": r["mes_nombre"],
                "inicio": r[c_ini],
                "consumo": r[c_cons] or 0,
                "fin": fin,
                "agotado": fin is not None and fin <= 0,
            })
        if any(m["inicio"] is not None or m["consumo"] for m in meses):
            series.append({"tipo": tipo, "meses": meses})

    cupos = [dict(r) for r in conn.execute(
        "SELECT tipo, numero_autorizacion, cantidad_inicial,"
        "       cantidad_consumida, cantidad_saldo, mes_agotado"
        " FROM cupos WHERE session_id = ? ORDER BY tipo, numero_autorizacion",
        (session_id,))]

    return {
        "session_id": session_id,
        "mes_corte": mes_corte,
        "series": series,
        "cupos": cupos,
        "meses_futuros_excluidos": excluidos,
        "nota": ("Pasado y presente tal cual del seguimiento mensual; el "
                 "futuro se quitó por acuerdo — sin proyecciones aquí."),
    }
