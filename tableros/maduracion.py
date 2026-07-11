"""TBV-01 · MADURACIÓN — días entre importación y venta, por marca.

El punto 1 del acuerdo VW: cuánto tardó en venderse cada coche desde
que se importó. delta = fecha_factura (venta) − fecha_pedimento
(importación), por unidad, agrupado por marca.

Honestidad del espectro: cada unidad es un tick real; los percentiles
son rango-más-cercano sobre los deltas ordenados (ninguna curva
ajustada). Las filas sin alguna de las dos fechas parseables se cuentan
y declaran; un delta NEGATIVO (vendido antes de importarse) es una
anomalía de datos que se reporta aparte — jamás se recorta a cero.
"""
import sqlite3
from typing import Any

from tableros.fechas import parsear_fecha

MAX_TICKS = 400
MAX_EXTREMOS = 3


def _percentil(orden: list[int], p: float) -> int:
    """Rango más cercano sobre la lista YA ordenada."""
    if not orden:
        return 0
    k = max(0, min(len(orden) - 1, round(p * (len(orden) - 1))))
    return orden[k]


def maduracion(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    filas = conn.execute(
        "SELECT i.chasis, i.factura, i.fecha_factura, p.fecha_pedimento,"
        "       COALESCE(m.nombre, 'Sin marca') AS marca"
        " FROM importaciones i"
        " LEFT JOIN pedimentos p ON i.pedimento_id = p.id"
        " LEFT JOIN catalogo_vehiculos c ON i.catalogo_id = c.id"
        " LEFT JOIN marcas m ON c.marca_id = m.id"
        " WHERE i.session_id = ?", (session_id,)).fetchall()

    sin_fechas = 0
    negativos = 0
    por_marca: dict[str, list[dict]] = {}
    for r in filas:
        venta = parsear_fecha(r["fecha_factura"])
        entrada = parsear_fecha(r["fecha_pedimento"])
        if venta is None or entrada is None:
            sin_fechas += 1
            continue
        dias = (venta - entrada).days
        if dias < 0:
            negativos += 1
            continue
        por_marca.setdefault(r["marca"], []).append(
            {"dias": dias, "chasis": r["chasis"], "factura": r["factura"]})

    marcas = []
    for marca, unidades in por_marca.items():
        unidades.sort(key=lambda u: u["dias"])
        orden = [u["dias"] for u in unidades]
        lentas = sorted(unidades, key=lambda u: -u["dias"])[:MAX_EXTREMOS]
        marcas.append({
            "marca": marca,
            "n": len(orden),
            "mediana": _percentil(orden, 0.5),
            "p25": _percentil(orden, 0.25),
            "p90": _percentil(orden, 0.9),
            "min": orden[0],
            "max": orden[-1],
            "deltas": orden[:MAX_TICKS],
            "recorte": max(0, len(orden) - MAX_TICKS),
            "extremos": [{"chasis": u["chasis"], "factura": u["factura"],
                          "dias": u["dias"]} for u in lentas],
        })
    marcas.sort(key=lambda m: (m["mediana"], m["marca"]))

    return {
        "session_id": session_id,
        "marcas": marcas,
        "medidas": sum(m["n"] for m in marcas),
        "sin_fechas": sin_fechas,
        "negativos": negativos,
        "max_dias": max((m["max"] for m in marcas), default=0),
    }
