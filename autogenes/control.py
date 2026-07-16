"""CONTROL (A3) — SPC transversal: cada métrica citada de la sesión contra
su propia historia. Bandas MEDIDAS (rango observado min–max y mediana ± k·MAD
con k declarado), nunca un pronóstico puntual. Señala cuándo el proceso
cambió de régimen — el idioma de calidad (SPC) que la planta ya habla.

Todo es lectura pura y determinista: misma base ⇒ misma salida.
"""
import sqlite3
from typing import Any, Optional

K_MAD = 3   # límite robusto declarado: mediana ± k·MAD

# (clave, título, unidad) — las métricas citadas que se vigilan
METRICAS = (
    ("conformidad_pct", "Conformidad", "%"),
    ("pct_conciliado", "Conciliado", "%"),
    ("valor_en_riesgo_mxn", "Valor en riesgo", "MXN"),
)


def _mediana(xs: list[float]) -> Optional[float]:
    s = sorted(xs)
    n = len(s)
    if not n:
        return None
    m = n // 2
    return s[m] if n % 2 else (s[m - 1] + s[m]) / 2


def _metricas_de_sesion(conn: sqlite3.Connection, sid: int) -> dict[str, Any]:
    from autogenes.concilia import conciliar
    from autogenes.validacion import validar
    c = conciliar(conn, sid)
    return {
        "conformidad_pct": validar(conn, sid)["conformidad_pct"],
        "pct_conciliado": c["flujo"]["pct_conciliado"],
        "valor_en_riesgo_mxn": c["valor_en_riesgo_mxn"],
    }


def control(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """La sesión en su historia: por cada métrica, su serie transversal, la
    banda medida y la señal (dentro/fuera de régimen). Sin historia (una sola
    sesión) no hay banda y se dice — nada de placebo."""
    sesiones = conn.execute(
        "SELECT id, month_processed, year_processed FROM processing_sessions"
        " ORDER BY id").fetchall()
    por_sesion = []
    for s in sesiones:
        m = _metricas_de_sesion(conn, s["id"])
        por_sesion.append({
            "session_id": s["id"],
            "etiqueta": f"{s['month_processed']:02d}/{s['year_processed']}",
            "actual": s["id"] == session_id,
            **m,
        })

    metricas: list[dict[str, Any]] = []
    for clave, titulo, unidad in METRICAS:
        serie = [{"etiqueta": p["etiqueta"], "valor": p[clave],
                  "actual": p["actual"]} for p in por_sesion]
        vals = [p[clave] for p in por_sesion if p[clave] is not None]
        actual = next((p[clave] for p in por_sesion if p["actual"]), None)
        banda = None
        senal = None
        if len(vals) >= 2 and actual is not None:
            med = _mediana(vals)
            mad = _mediana([abs(v - med) for v in vals]) or 0.0
            lo, hi = med - K_MAD * mad, med + K_MAD * mad
            banda = {"min": min(vals), "max": max(vals),
                     "mediana": round(med, 2), "mad": round(mad, 2), "k": K_MAD,
                     "lim_inf": round(lo, 2), "lim_sup": round(hi, 2)}
            senal = "fuera" if (actual < lo or actual > hi) else "dentro"
        metricas.append({
            "clave": clave, "titulo": titulo, "unidad": unidad,
            "serie": serie, "actual": actual, "banda": banda, "senal": senal,
            "metodo": (f"banda medida: rango observado y mediana ± {K_MAD}·MAD "
                       "(desviación absoluta mediana); no es un pronóstico"),
        })
    return {"session_id": session_id, "n_sesiones": len(sesiones),
            "metricas": metricas}
