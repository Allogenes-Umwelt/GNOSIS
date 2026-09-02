"""CRONOS (F13) — time travel del sustrato AUTOGENES.

Qué es honestamente posible reconstruir, y qué no:

- Toda fila del sustrato (`ag_*`) lleva `created_at`, así que el estado
  en un instante T se reconstruye de forma ADITIVA: todo lo creado
  hasta T que sigue vivo hoy.
- Lo BORRADO después de T no resucita: el borrado con cascada de
  procedencia es real, no un soft-delete. CRONOS lo declara — jamás
  finge que puede deshacerlo.
- Una entidad fusionada (upsert) se muestra en su forma ACTUAL aunque
  en T tuviera menos alias/evidencia: el sustrato no versiona filas.
- Las tablas aduanales (importaciones, extracción) no llevan timestamp
  por fila: CRONOS viaja el SUSTRATO, no el pipeline legado.

La línea de tiempo son los momentos de la bitácora WORM — cada mutación
registrada es un punto al que se puede volver. Los ESTRATOS son la
acumulación real de cada capa (fuentes, fragmentos, entidades,
relaciones, productos) a lo largo de esos momentos: geología del caso.
Todo es lectura pura y determinista; no hay modelo ni escritura.
"""
import json
import sqlite3
from typing import Any, Optional

MAX_MOMENTOS = 300

_CAPAS = ("ag_artefactos", "ag_fragmentos", "ag_entidades",
          "ag_relaciones", "ag_productos")


def momentos(conn: sqlite3.Connection, session_id: int) -> list[dict]:
    """La línea de tiempo: cada mutación de la bitácora WORM, en orden.
    Se acota a los últimos MAX_MOMENTOS y se declara el total."""
    return [dict(r) for r in conn.execute(
        "SELECT ts, accion, detalle FROM ag_bitacora WHERE session_id = ?"
        " ORDER BY id LIMIT ?", (session_id, MAX_MOMENTOS))]


def _conteo_hasta(conn: sqlite3.Connection, tabla: str, session_id: int,
                  ts: Optional[str]) -> int:
    if ts is None:
        return conn.execute(
            f"SELECT COUNT(*) FROM {tabla} WHERE session_id = ?",  # noqa: S608 — tabla de tupla fija
            (session_id,)).fetchone()[0]
    return conn.execute(
        f"SELECT COUNT(*) FROM {tabla} WHERE session_id = ? AND created_at <= ?",  # noqa: S608
        (session_id, ts)).fetchone()[0]


def estratos(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """La acumulación real de cada capa del sustrato en cada momento de
    la bitácora — los estratos geológicos del caso. Cada punto es un
    conteo verificable con created_at <= ts del momento."""
    linea = momentos(conn, session_id)
    puntos = []
    for m in linea:
        puntos.append({
            "ts": m["ts"],
            "accion": m["accion"],
            "detalle": m["detalle"],
            "capas": {t.removeprefix("ag_"): _conteo_hasta(conn, t, session_id,
                                                           m["ts"])
                      for t in _CAPAS},
        })
    total_bitacora = conn.execute(
        "SELECT COUNT(*) FROM ag_bitacora WHERE session_id = ?",
        (session_id,)).fetchone()[0]
    return {
        "session_id": session_id,
        "puntos": puntos,
        "total_momentos": total_bitacora,
        "recortado": total_bitacora > len(puntos),
        "nota": ("Reconstrucción aditiva: lo creado hasta cada momento que "
                 "sigue vivo hoy. Lo borrado después no resucita — el "
                 "borrado con cascada es real."),
    }


def _red_en(conn: sqlite3.Connection, session_id: int,
            ts: Optional[str]) -> dict[str, list]:
    """La sub-proyección del SUSTRATO en el instante ts (misma semántica
    de pesos que proyeccion.construir_grafo, solo capas ag_*)."""
    cond = "" if ts is None else " AND created_at <= ?"
    par = (session_id,) if ts is None else (session_id, ts)

    def q(tabla: str) -> list[sqlite3.Row]:
        return conn.execute(
            f"SELECT * FROM {tabla} WHERE session_id = ?{cond}", par  # noqa: S608
        ).fetchall()

    artefactos, fragmentos = q("ag_artefactos"), q("ag_fragmentos")
    entidades, relaciones = q("ag_entidades"), q("ag_relaciones")
    frag_a_art = {f["id"]: f["artefacto_id"] for f in fragmentos}
    ids_art = {a["id"] for a in artefactos}
    ids_ent = {e["id"] for e in entidades}

    nodos = ([{"id": a["id"], "etiqueta": a["nombre"], "kind": "artefacto"}
              for a in artefactos]
             + [{"id": f["id"],
                 "etiqueta": f"p. {f['pagina']}" if f["pagina"] else "fragmento",
                 "kind": "fragmento"} for f in fragmentos]
             + [{"id": e["id"], "etiqueta": e["nombre"], "kind": "entidad"}
                for e in entidades])
    enlaces = [{"origen": f["id"], "destino": f["artefacto_id"], "peso": 0.5}
               for f in fragmentos if f["artefacto_id"] in ids_art]
    for e in entidades:
        conteo: dict[str, int] = {}
        for fid in json.loads(e["evidencia"] or "[]"):
            art = frag_a_art.get(fid)
            if art:
                conteo[art] = conteo.get(art, 0) + 1
        for art, n in conteo.items():
            enlaces.append({"origen": e["id"], "destino": art,
                            "peso": min(1.0, 0.3 + n * 0.2)})
    enlaces += [{"origen": r["desde_id"], "destino": r["hasta_id"],
                 "peso": r["peso"]}
                for r in relaciones
                if r["desde_id"] in ids_ent and r["hasta_id"] in ids_ent]
    return {"nodos": nodos, "enlaces": enlaces}


def estado_en(conn: sqlite3.Connection, session_id: int,
              ts: Optional[str] = None) -> dict[str, Any]:
    """El sustrato reconstruido en el instante ts (None = ahora): conteos
    por capa, resumen estructural de la red y cuántas mutaciones de la
    bitácora habían ocurrido — todo verificable."""
    from autogenes import topologia

    red = _red_en(conn, session_id, ts)
    capas = {t.removeprefix("ag_"): _conteo_hasta(conn, t, session_id, ts)
             for t in _CAPAS}
    acciones = conn.execute(
        "SELECT COUNT(*) FROM ag_bitacora WHERE session_id = ?"  # noqa: S608 — SQL estático: la f-string no interpola entrada
        + ("" if ts is None else " AND ts <= ?"),
        (session_id,) if ts is None else (session_id, ts)).fetchone()[0]
    return {
        "session_id": session_id,
        "ts": ts,
        "capas": capas,
        "resumen": topologia.resumen_red(red),
        "acciones_hasta": acciones,
    }
