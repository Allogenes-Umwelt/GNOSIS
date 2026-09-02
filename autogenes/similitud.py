"""Parecido entre entidades — la mitad que PROPONE del hallazgo G1.

`autogenes/canon.py` resuelve la igualdad: dos escrituras del mismo nombre
acaban en la misma cadena y se funden solas, sin preguntar, porque no hay
nada que decidir.

Aquí empieza lo que sí hay que decidir. «VW MEXICO» y «Volkswagen de México
S.A. de C.V.» son casi con seguridad la misma empresa, pero «casi con
seguridad» no es una identidad: es una hipótesis. Este módulo la formula y
la deja sobre la mesa del operador, con su número y con la razón del número.

Tres leyes gobiernan este archivo:

1. **Nunca funde.** Devuelve candidatas. La fusión la ejecuta `Sustrato` con
   bitácora, y la ordena una persona.
2. **Nunca propone tocar lo que afirmó el operador.** Una entidad con
   `origen='operador'` es una afirmación humana; proponer fundirla sería que
   la máquina corrija al operador (ley aditiva, ADR-0004).
3. **Nada de cuadrático.** Se compara dentro de BLOQUES (`clave_bloque`), no
   todos contra todos: la ola 1 se dedicó justo a quitar ese patrón.

El umbral es DECLARADO, no aprendido, y sale en cada propuesta: quien la lee
puede rehacer la cuenta.
"""
import sqlite3
from typing import Any

from autogenes.canon import canonizar, claves_bloque, tokens

#: A partir de aquí se propone. No es una probabilidad y no se presenta como
#: tal: es un umbral declarado sobre una medida declarada, y el operador lo
#: puede mover. 0,6 empieza a proponer «VW Mexico»/«Volkswagen Mexico» y deja
#: fuera a dos empresas que solo comparten la ciudad.
UMBRAL = 0.6

#: Tope de propuestas. Una lista que no se puede revisar no se revisa.
MAX_PROPUESTAS = 50

#: Un token que agrupa a más de esto no distingue a nadie («servicios»,
#: «mexico») y su bloque sería cuadrático. Se salta, y las entidades que
#: comparten ALGÚN otro token siguen comparándose por él.
MAX_BLOQUE = 60


def jaccard(a: str, b: str) -> float:
    """Tokens compartidos sobre tokens totales. Determinista y explicable:
    se puede rehacer a mano, que es lo que un número citado necesita."""
    ta, tb = set(tokens(a)), set(tokens(b))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _contiene(a: str, b: str) -> bool:
    """¿Uno de los nombres canónicos contiene entero al otro?

    «Volkswagen» y «Volkswagen Mexico» comparten la mitad de sus tokens, así
    que Jaccard los deja en 0,5 — por debajo del umbral. Pero uno contiene al
    otro entero, que es la forma normal de escribir una filial. Se declara
    aparte, no se disfraza subiendo el número."""
    ca, cb = set(canonizar(a).split()), set(canonizar(b).split())
    return bool(ca) and bool(cb) and (ca <= cb or cb <= ca) and ca != cb


def candidatas(conn: sqlite3.Connection, session_id: int,
               umbral: float = UMBRAL) -> list[dict[str, Any]]:
    """Pares de entidades de la sesión que MERECEN una mirada humana.

    Se excluyen los pares que ya comparten identidad (no hay nada que
    proponer) y los que tocan una entidad afirmada por el operador.
    """
    filas = conn.execute(
        "SELECT id, nombre, tipo, origen, identidad_id FROM ag_entidades"
        " WHERE session_id = ? ORDER BY id", (session_id,)).fetchall()

    bloques: dict[str, list] = {}
    for f in filas:
        for clave in claves_bloque(f["nombre"]):
            bloques.setdefault(clave, []).append(f)

    propuestas = []
    vistos: set[tuple[str, str]] = set()
    for _, grupo in sorted(bloques.items()):
        if len(grupo) > MAX_BLOQUE:
            continue                   # token demasiado común para distinguir
        for i, a in enumerate(grupo):
            for b in grupo[i + 1:]:
                par = (a["id"], b["id"]) if a["id"] < b["id"] else (b["id"], a["id"])
                if par in vistos:
                    continue           # dos entidades comparten varios tokens
                vistos.add(par)
                juicio = _juzgar(a, b, umbral)
                if juicio:
                    propuestas.append(juicio)
    # el orden es parte del contrato: la misma base propone lo mismo, arriba
    propuestas.sort(key=lambda p: (-p["puntuacion"], p["a"]["id"], p["b"]["id"]))
    return propuestas[:MAX_PROPUESTAS]


def _juzgar(a, b, umbral: float) -> dict[str, Any] | None:
    if a["tipo"] != b["tipo"]:
        return None                    # una persona no se funde con un lugar
    if "operador" in (a["origen"], b["origen"]):
        return None                    # no se corrige al operador
    if a["identidad_id"] and a["identidad_id"] == b["identidad_id"]:
        return None                    # ya son la misma: nada que proponer

    puntuacion = jaccard(a["nombre"], b["nombre"])
    contiene = _contiene(a["nombre"], b["nombre"])
    if puntuacion < umbral and not contiene:
        return None
    razon = (f"comparten {puntuacion:.0%} de sus palabras"
             if puntuacion >= umbral else
             "un nombre contiene al otro entero")
    if contiene and puntuacion >= umbral:
        razon += "; y uno contiene al otro entero"
    return {
        "a": {"id": a["id"], "nombre": a["nombre"]},
        "b": {"id": b["id"], "nombre": b["nombre"]},
        "tipo": a["tipo"],
        "puntuacion": round(puntuacion, 3),
        "umbral": umbral,
        "canon": [canonizar(a["nombre"]), canonizar(b["nombre"])],
        "razon": f"Se propone revisar: {razon}. Decide el operador.",
    }
