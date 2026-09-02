"""Confianza DERIVADA, no afirmada — hallazgo G5 del diagnóstico v02.

`peso` era 0,5 por defecto o lo que dijera el LLM, y se leía como si fuera
confianza. No lo es: es una afirmación sobre una afirmación. ZERO SNAKE OIL
pide de un número que sea citable a algo, y «el modelo dijo 0,8» no cita
nada.

Aquí la confianza se DERIVA al leer, de cosas que se pueden señalar con el
dedo:

- **fuentes**: cuántos ARTEFACTOS distintos citan la relación. Dos documentos
  independientes que dicen lo mismo valen más que un documento citado dos
  veces — por eso se cuentan artefactos, no fragmentos.
- **origen**: lo que afirmó el operador no es lo mismo que lo que propuso un
  modelo. No es «más verdad»; es otra clase de afirmación, y se declara.
- **spans**: si la relación tiene citas verificadas al TROZO (ADR-0017), la
  afirmación está anclada a texto comprobado, no a una página entera.

El número que sale de ahí viene SIEMPRE con su derivación, para que quien lo
lea pueda rehacerlo. Un número sin derivación es exactamente lo que este
módulo existe para no producir.

Determinista por construcción: sin fechas, sin azar, sin orden de filas. La
prueba de doble corrida lo fija.
"""
import json
import sqlite3
from typing import Any

#: Escalones de confianza por número de fuentes independientes. No son una
#: probabilidad y no se presentan como tal: son una ESCALA declarada, y el
#: operador la puede mover sin que nada más cambie.
ESCALA: tuple[tuple[int, str], ...] = (
    (3, "corroborada"),      # 3+ artefactos distintos
    (2, "contrastada"),      # 2
    (1, "citada"),           # 1
    (0, "sin_cita"),         # 0 — no debería existir: la ley lo impide
)


def _nivel(fuentes: int) -> str:
    for minimo, nombre in ESCALA:
        if fuentes >= minimo:
            return nombre
    return "sin_cita"


def _artefactos_por_fragmento(conn: sqlite3.Connection,
                              session_id: int) -> dict[str, str]:
    return {r[0]: r[1] for r in conn.execute(
        "SELECT id, artefacto_id FROM ag_fragmentos WHERE session_id = ?",
        (session_id,))}


def confianza_de_sesion(conn: sqlite3.Connection,
                        session_id: int) -> dict[str, dict[str, Any]]:
    """`{relacion_id: {fuentes, nivel, origen, spans, derivacion}}`.

    De una sola pasada: pedir la confianza relación a relación sería una
    consulta por arista, que es justo el patrón que la ola 1 quitó de en
    medio."""
    frag_a_art = _artefactos_por_fragmento(conn, session_id)

    spans: dict[str, int] = {}
    try:
        for rid, n in conn.execute(
            "SELECT sujeto_id, COUNT(*) FROM ag_citas"
            " WHERE session_id = ? AND sujeto_kind = 'relacion'"
            " GROUP BY sujeto_id", (session_id,)):
            spans[rid] = n
    except sqlite3.OperationalError:
        pass                      # base sin `ag_citas`: cero spans, no un error

    salida: dict[str, dict[str, Any]] = {}
    for r in conn.execute(
        "SELECT id, evidencia, origen, peso_declarado FROM ag_relaciones"
        " WHERE session_id = ? ORDER BY id", (session_id,)
    ):
        try:
            evidencia = json.loads(r[1] or "[]")
        except ValueError:
            evidencia = []
        artefactos = sorted({frag_a_art[f] for f in evidencia if f in frag_a_art})
        fuentes = len(artefactos)
        n_spans = spans.get(r[0], 0)
        salida[r[0]] = {
            "fuentes": fuentes,
            "artefactos": artefactos,
            "fragmentos": len(evidencia),
            "spans_verificados": n_spans,
            "origen": r[2],
            "nivel": _nivel(fuentes),
            "peso_declarado": r[3],
            "derivacion": _derivacion(fuentes, len(evidencia), n_spans, r[2]),
        }
    return salida


def _derivacion(fuentes: int, fragmentos: int, spans: int, origen: str) -> str:
    """La frase que permite rehacer el número a mano."""
    if not fuentes:
        return ("Sin fragmentos citados de esta sesión: la relación no se "
                "puede sostener con documentos.")
    plural = fuentes != 1
    partes = [
        f"{fuentes} artefacto{'s' if plural else ''} distinto"
        f"{'s' if plural else ''} lo cita{'n' if plural else ''}",
        f"{fragmentos} fragmento{'s' if fragmentos != 1 else ''} en total",
    ]
    if spans:
        partes.append(f"{spans} cita{'s' if spans != 1 else ''} verificada"
                      f"{'s' if spans != 1 else ''} al trozo")
    partes.append("afirmada por el operador" if origen == "operador"
                  else "propuesta por el modelo")
    return "; ".join(partes) + "."
