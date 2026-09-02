"""Reglas que ven el GRAFO — hallazgo G8 del diagnóstico v02.

NOMOS es un motor de reglas aduanal excelente y no ve el grafo: sus
condiciones son literales `campo=valor` sobre `{pais_code, j_y_n, auto_code,
factura, chasis}` y se evalúan fila a fila. Con eso no se puede escribir «un
proveedor con más de N facturas que ningún pedimento ampara», que es
justamente la clase de pregunta para la que existe un grafo de evidencia.

Esto NO sustituye a NOMOS: es su gemelo sobre la otra superficie. Las reglas
de fila siguen donde estaban; estas viven aquí.

Lo que hace posible escribirlas es el vocabulario cerrado de predicados
(ADR-0017): sin él, «ampara» y «cubre» eran dos condiciones distintas y una
regla no podía referirse a la relación, solo a una redacción de ella.

Tres leyes de la casa, aplicadas:

- **Determinista.** Mismo grafo ⇒ mismo resultado, sin fechas ni azar; el
  orden de salida es explícito. Hay prueba de doble corrida.
- **ZERO SNAKE OIL.** Un disparo no lleva monto ni confianza: lleva el
  conteo, el umbral y las CITAS —los fragmentos que sostienen cada relación
  contada—. Quien lo lea puede rehacerlo.
- **Aditivo.** Evalúa, no escribe. Un hallazgo es una lectura del grafo.
"""
import json
import sqlite3
from typing import Any

from autogenes.predicados import PREDICADOS
from autogenes.tipos import TipoEntidad

#: Direcciones que una condición de patrón puede mirar.
DIRECCIONES = ("sale", "entra")

#: Tope de sujetos que un disparo enumera. Un hallazgo con 4 000 nombres no
#: es un hallazgo, es un volcado; el conteo total se declara igual.
MAX_SUJETOS = 25


class PatronInvalido(ValueError):
    """El patrón no se puede evaluar tal y como está escrito."""


def validar_patron(patron: dict) -> dict[str, Any]:
    """Un patrón bien formado, o la razón exacta por la que no lo está.

    Se valida contra el vocabulario CERRADO y los tipos de entidad reales: una
    regla no puede referirse a un predicado que nadie escribe ni a un tipo que
    no existe — sería una regla que jamás dispara y que nadie sabe por qué.
    """
    if not isinstance(patron, dict):
        raise PatronInvalido("El patrón tiene que ser un objeto.")
    sujeto = str(patron.get("sujeto") or "").strip()
    predicado = str(patron.get("predicado") or "").strip()
    tipos = set(TipoEntidad.__args__)      # type: ignore[attr-defined]
    if sujeto not in tipos:
        raise PatronInvalido(
            f"'sujeto' tiene que ser un tipo de entidad: {sorted(tipos)}")
    if predicado not in PREDICADOS:
        raise PatronInvalido(
            f"'predicado' tiene que ser del vocabulario: {list(PREDICADOS)}")
    objeto = patron.get("objeto")
    if objeto is not None and str(objeto) not in tipos:
        raise PatronInvalido("'objeto' tiene que ser un tipo de entidad o nulo.")
    direccion = str(patron.get("direccion") or "sale")
    if direccion not in DIRECCIONES:
        raise PatronInvalido(f"'direccion' tiene que ser una de {DIRECCIONES}.")
    try:
        umbral = int(patron.get("umbral", 1))
    except (TypeError, ValueError):
        raise PatronInvalido("'umbral' tiene que ser un entero.") from None
    if umbral < 1:
        raise PatronInvalido("'umbral' tiene que ser 1 o más.")
    salvo = patron.get("salvo_predicado")
    if salvo is not None and str(salvo) not in PREDICADOS:
        raise PatronInvalido(
            f"'salvo_predicado' tiene que ser del vocabulario: {list(PREDICADOS)}")
    return {"sujeto": sujeto, "predicado": predicado,
            "objeto": str(objeto) if objeto is not None else None,
            "direccion": direccion, "umbral": umbral,
            "salvo_predicado": str(salvo) if salvo is not None else None}


def evaluar_patron(conn: sqlite3.Connection, session_id: int,
                   patron: dict) -> dict[str, Any]:
    """Cuenta, sobre el grafo de la sesión, quién cumple el patrón.

    «Un `sujeto` con más de `umbral` relaciones `predicado` hacia un `objeto`,
    salvo las que además tienen `salvo_predicado`.»
    """
    p = validar_patron(patron)

    entidades = {r["id"]: r for r in conn.execute(
        "SELECT id, nombre, tipo FROM ag_entidades WHERE session_id = ?"
        " ORDER BY id", (session_id,))}
    relaciones = conn.execute(
        "SELECT id, desde_id, hasta_id, tipo, evidencia FROM ag_relaciones"
        " WHERE session_id = ? ORDER BY id", (session_id,)).fetchall()

    #: Entidades OBJETO que ya están cubiertas por el predicado de excepción.
    #: La exención mira al objeto, no al par: «facturas sin pedimento que las
    #: ampare» quiere decir que la FACTURA no tiene amparo de nadie, no que no
    #: lo tenga de su proveedor —el amparo lo emite un tercero, que es
    #: precisamente el sentido de la palabra—.
    exentos: set[str] = set()
    if p["salvo_predicado"]:
        for r in relaciones:
            if r["tipo"] == p["salvo_predicado"]:
                exentos.add(r["desde_id"])
                exentos.add(r["hasta_id"])

    conteo: dict[str, list] = {}
    for r in relaciones:
        if r["tipo"] != p["predicado"]:
            continue
        sujeto_id = r["desde_id"] if p["direccion"] == "sale" else r["hasta_id"]
        otro_id = r["hasta_id"] if p["direccion"] == "sale" else r["desde_id"]
        sujeto = entidades.get(sujeto_id)
        otro = entidades.get(otro_id)
        if not sujeto or not otro or sujeto["tipo"] != p["sujeto"]:
            continue
        if p["objeto"] and otro["tipo"] != p["objeto"]:
            continue
        if otro_id in exentos:
            continue
        conteo.setdefault(sujeto_id, []).append(r)

    disparos = []
    for sujeto_id, suyas in conteo.items():
        if len(suyas) < p["umbral"]:
            continue
        citas: list[str] = []
        for r in suyas:
            try:
                citas.extend(json.loads(r["evidencia"] or "[]"))
            except ValueError:
                continue
        disparos.append({
            "entidad_id": sujeto_id,
            "nombre": entidades[sujeto_id]["nombre"],
            "n": len(suyas),
            "relaciones": [r["id"] for r in suyas],
            # las CITAS: los fragmentos que sostienen cada relación contada
            "evidencia": sorted(dict.fromkeys(citas)),
        })
    # orden explícito: el mismo grafo se lee igual las dos veces
    disparos.sort(key=lambda d: (-d["n"], d["nombre"], d["entidad_id"]))

    return {
        "patron": p,
        "n_disparos": len(disparos),
        "disparos": disparos[:MAX_SUJETOS],
        "acotado": len(disparos) > MAX_SUJETOS,
        "derivacion": _derivacion(p, len(disparos)),
    }


def _derivacion(p: dict, n: int) -> str:
    partes = [f"{p['sujeto']} con {p['umbral']} o más relaciones "
              f"'{p['predicado']}' que {'salen' if p['direccion'] == 'sale' else 'entran'}"]
    if p["objeto"]:
        partes.append(f"hacia {p['objeto']}")
    if p["salvo_predicado"]:
        partes.append(f"sin una relación '{p['salvo_predicado']}' que las ampare")
    return (f"{'; '.join(partes)}. Disparan {n}. "
            "Contado sobre el grafo de la sesión, citable a fragmento.")


def evaluar_reglas_patron(conn: sqlite3.Connection,
                          session_id: int) -> list[dict[str, Any]]:
    """Todas las reglas de patrón activas de la sesión, evaluadas."""
    try:
        filas = conn.execute(
            "SELECT id, nombre, condiciones, origen, activa FROM ag_reglas"
            " WHERE session_id = ? AND clase = 'patron' ORDER BY created_at, id",
            (session_id,)).fetchall()
    except sqlite3.OperationalError:
        return []                      # base a medio migrar: sin reglas de patrón
    salida = []
    for f in filas:
        try:
            patron = json.loads(f["condiciones"] or "{}")
        except ValueError:
            continue
        try:
            resultado = evaluar_patron(conn, session_id, patron)
        except PatronInvalido as e:
            resultado = {"error": str(e), "patron": patron,
                         "n_disparos": 0, "disparos": []}
        salida.append({"id": f["id"], "nombre": f["nombre"],
                       "origen": f["origen"], "activa": bool(f["activa"]),
                       **resultado})
    return salida
