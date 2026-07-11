"""TBV-02 · DOMINIO — ranking de unidades más vendidas por periodo.

Cubre los puntos 2, 5 y 8 del acuerdo VW: qué modelo (unidad) dominó
las ventas en cada mes/trimestre/semestre/año, el ranking escalonado
por marca y el desglose de la unidad más vendida de cada marca.

La escalera de dominio: para cada periodo se rankean los modelos por
unidades facturadas (rank denso, empates por nombre). Un modelo sin
ventas en un periodo no tiene rango ahí (None) — jamás se interpola.
Las filas sin fecha parseable o sin modelo se cuentan y declaran.
"""
import sqlite3
from typing import Any

from tableros.fechas import parsear_fecha, periodo_de

MAX_MODELOS = 12
ESCALAS = ("mes", "trimestre", "semestre", "anio")


def dominio(conn: sqlite3.Connection, session_id: int,
            escala: str = "mes") -> dict[str, Any]:
    if escala not in ESCALAS:
        escala = "mes"
    filas = conn.execute(
        "SELECT i.fecha_factura, i.auto_code,"
        "       COALESCE(NULLIF(c.tipo, ''), i.auto_code) AS modelo,"
        "       COALESCE(m.nombre, 'Sin marca') AS marca"
        " FROM importaciones i"
        " LEFT JOIN catalogo_vehiculos c ON i.catalogo_id = c.id"
        " LEFT JOIN marcas m ON c.marca_id = m.id"
        " WHERE i.session_id = ?", (session_id,)).fetchall()

    sin_fecha = 0
    sin_modelo = 0
    ventas: dict[str, dict[str, int]] = {}       # periodo -> modelo -> n
    info: dict[str, dict[str, str]] = {}         # modelo -> {marca, auto_code}
    for r in filas:
        f = parsear_fecha(r["fecha_factura"])
        if f is None:
            sin_fecha += 1
            continue
        modelo = (r["modelo"] or "").strip()
        if not modelo:
            sin_modelo += 1
            continue
        p = periodo_de(f, escala)
        ventas.setdefault(p, {}).setdefault(modelo, 0)
        ventas[p][modelo] += 1
        info.setdefault(modelo, {"marca": r["marca"],
                                 "auto_code": r["auto_code"] or ""})

    periodos = sorted(ventas)
    totales: dict[str, int] = {}
    for p in periodos:
        for modelo, n in ventas[p].items():
            totales[modelo] = totales.get(modelo, 0) + n
    top = [m for m, _ in sorted(totales.items(),
                                key=lambda kv: (-kv[1], kv[0]))[:MAX_MODELOS]]

    # rango denso por periodo (1 = el que domina); None sin ventas
    rangos_por_periodo: dict[str, dict[str, int]] = {}
    for p in periodos:
        orden = sorted(ventas[p].items(), key=lambda kv: (-kv[1], kv[0]))
        rangos_por_periodo[p] = {m: i + 1 for i, (m, _) in enumerate(orden)}

    series = [
        {
            "modelo": m,
            "marca": info[m]["marca"],
            "auto_code": info[m]["auto_code"],
            "total": totales[m],
            "rangos": [rangos_por_periodo[p].get(m) for p in periodos],
            "ventas": [ventas[p].get(m, 0) for p in periodos],
        }
        for m in top
    ]

    # el ranking escalonado por marca (punto 8), con su unidad dominante
    por_marca: dict[str, dict[str, int]] = {}
    for modelo, n in totales.items():
        por_marca.setdefault(info[modelo]["marca"], {})[modelo] = n
    ranking_marcas = []
    for marca, modelos in por_marca.items():
        top_modelo, top_n = max(modelos.items(), key=lambda kv: (kv[1], kv[0]))
        ranking_marcas.append({
            "marca": marca,
            "total": sum(modelos.values()),
            "n_modelos": len(modelos),
            "top_modelo": top_modelo,
            "top_n": top_n,
        })
    ranking_marcas.sort(key=lambda r: (-r["total"], r["marca"]))

    return {
        "session_id": session_id,
        "escala": escala,
        "periodos": periodos,
        "series": series,
        "ranking_marcas": ranking_marcas,
        "facturadas": sum(totales.values()),
        "sin_fecha": sin_fecha,
        "sin_modelo": sin_modelo,
        "recorte": max(0, len(totales) - MAX_MODELOS),
    }
