"""Radar — el instrumento de atención (port de capacidades/senales.ts +
calidad.ts, adaptado al dominio GNOSIS).

Señales puras de lectura sobre una sesión:
- vencimientos: eventos fechados que caen dentro de la ventana.
- fuentes_frias: artefactos cuyo texto nadie ha convertido en
  conocimiento (ninguna entidad cita sus fragmentos).
- huerfanas: entidades sin una sola relación — islas del grafo.
- pendientes de negocio: faltantes y errores del pipeline aduanal.

El total alimenta la fracción viva del satélite Radar en las
constelaciones (estado_de_sesion.senales).
"""
import json
import sqlite3
from datetime import date, timedelta
from typing import Any, Optional

VENTANA_DIAS = 30


def senales_de_sesion(conn: sqlite3.Connection, session_id: int,
                      hoy: Optional[str] = None) -> dict[str, Any]:
    hoy_d = date.fromisoformat(hoy) if hoy else date.today()
    limite = hoy_d + timedelta(days=VENTANA_DIAS)

    vencimientos = [
        {"id": r["id"], "titulo": r["titulo"], "fecha": r["fecha"],
         "precision": r["precision"],
         "dias": (date.fromisoformat(r["fecha"]) - hoy_d).days}
        for r in conn.execute(
            "SELECT id, titulo, fecha, precision FROM ag_eventos"
            " WHERE session_id = ? AND fecha >= ? AND fecha <= ? ORDER BY fecha",
            (session_id, hoy_d.isoformat(), limite.isoformat()),
        )
    ]

    # fuentes frías: ningún fragmento del artefacto es citado por entidad alguna
    citados: set[str] = set()
    for r in conn.execute(
        "SELECT evidencia FROM ag_entidades WHERE session_id = ?", (session_id,)
    ):
        citados.update(json.loads(r["evidencia"] or "[]"))
    fuentes_frias = []
    for a in conn.execute(
        "SELECT a.id, a.nombre, a.kind, a.created_at FROM ag_artefactos a"
        " WHERE a.session_id = ? ORDER BY a.created_at", (session_id,)
    ):
        frag_ids = {r["id"] for r in conn.execute(
            "SELECT id FROM ag_fragmentos WHERE artefacto_id = ?", (a["id"],))}
        if frag_ids and not (frag_ids & citados):
            fuentes_frias.append({"id": a["id"], "nombre": a["nombre"],
                                  "kind": a["kind"], "desde": a["created_at"]})

    conectadas = {r[0] for r in conn.execute(
        "SELECT desde_id FROM ag_relaciones WHERE session_id = ?"
        " UNION SELECT hasta_id FROM ag_relaciones WHERE session_id = ?",
        (session_id, session_id))}
    huerfanas = [
        {"id": r["id"], "nombre": r["nombre"], "tipo": r["tipo"], "origen": r["origen"]}
        for r in conn.execute(
            "SELECT id, nombre, tipo, origen FROM ag_entidades WHERE session_id = ?"
            " ORDER BY created_at", (session_id,))
        if r["id"] not in conectadas
    ]

    faltantes = conn.execute(
        "SELECT COUNT(*) FROM facturas_faltantes WHERE session_id = ?",
        (session_id,)).fetchone()[0]
    errores = conn.execute(
        "SELECT COUNT(*) FROM facturas_errores WHERE session_id = ?",
        (session_id,)).fetchone()[0]

    total = (len(vencimientos) + len(fuentes_frias) + len(huerfanas)
             + (1 if faltantes else 0) + (1 if errores else 0))
    return {
        "session_id": session_id,
        "hoy": hoy_d.isoformat(),
        "ventana_dias": VENTANA_DIAS,
        "vencimientos": vencimientos,
        "fuentes_frias": fuentes_frias,
        "huerfanas": huerfanas,
        "negocio": {"faltantes": faltantes, "errores": errores},
        "total": total,
    }
