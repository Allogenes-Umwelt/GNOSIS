"""TBV-04 · RECHAZOS — waybill o factura que no funcionó, y por qué.

Dos clases reales de rechazo, ambas del pipeline:
- facturas_errores: el PDF llegó pero la extracción falló (error_type
  es la razón registrada; si viene vacío se reporta como «sin razón
  registrada» — y ESO también es un hallazgo para el pipeline).
- facturas_faltantes: la factura nunca llegó — la venta del DWH no
  tiene documento físico que la ampare.

El Pareto ordena las razones por frecuencia con su acumulado: qué pocas
razones concentran la mayoría de los rechazos. Todo conteo es |filas|.
"""
import sqlite3
from typing import Any

MAX_ARCHIVOS = 12
SIN_RAZON = "sin razón registrada"
FALTANTE = "factura faltante — nunca llegó"


def rechazos(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    razones: dict[str, list[str]] = {}
    for r in conn.execute(
        "SELECT filename, COALESCE(NULLIF(TRIM(error_type), ''), ?) AS razon"
        " FROM facturas_errores WHERE session_id = ? ORDER BY filename",
        (SIN_RAZON, session_id)):
        razones.setdefault(r["razon"], []).append(r["filename"])
    faltantes = [r["factura"] for r in conn.execute(
        "SELECT factura FROM facturas_faltantes WHERE session_id = ?"
        " ORDER BY factura", (session_id,))]
    if faltantes:
        razones[FALTANTE] = faltantes

    total = sum(len(v) for v in razones.values())
    orden = sorted(razones.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    acumulado = 0
    pareto = []
    for razon, archivos in orden:
        acumulado += len(archivos)
        pareto.append({
            "razon": razon,
            "n": len(archivos),
            "pct": round(100 * len(archivos) / total, 1) if total else 0,
            "acumulado_pct": round(100 * acumulado / total, 1) if total else 0,
            "archivos": archivos[:MAX_ARCHIVOS],
            "recorte": max(0, len(archivos) - MAX_ARCHIVOS),
            "clase": "faltante" if razon == FALTANTE else "extraccion",
        })

    # el corte 80/20 real: cuántas razones cubren el 80% de rechazos
    n80 = next((i + 1 for i, p in enumerate(pareto)
                if p["acumulado_pct"] >= 80), len(pareto))
    return {
        "session_id": session_id,
        "pareto": pareto,
        "total": total,
        "n_razones": len(pareto),
        "razones_para_80": n80 if total else 0,
        "sin_razon": sum(p["n"] for p in pareto if p["razon"] == SIN_RAZON),
    }
