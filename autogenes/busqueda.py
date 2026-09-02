"""Búsqueda de texto sobre los fragmentos — con procedencia, como todo aquí.

El sustrato guardaba el texto de cada fragmento y no había forma de buscarlo:
`grep 'MATCH|fts'` sobre `autogenes/` no devolvía nada (hallazgo G6 del
diagnóstico v02). El operador no podía preguntar «qué documentos mencionan
X», y el modelo tampoco.

FTS5 viene DENTRO de SQLite: cero dependencias nuevas, local, sin red — las
tres cosas que la ley exige. `bm25` con parámetros fijos ordena igual en dos
corridas, así que la relevancia no rompe el determinismo.

Un resultado SIN procedencia no serviría: cada acierto cita su fragmento, su
página y su documento, que es la misma cadena que sostiene un expediente.
"""
import sqlite3
from typing import Any

#: Tope de aciertos devueltos. Una búsqueda no es un volcado: por encima de
#: esto el operador debe afinar la consulta.
MAX_RESULTADOS = 25

#: Hasta dónde se cuenta. Contar TODOS los aciertos costaba más que la
#: búsqueda misma —medido a 24 000 fragmentos: 400-1 050 ms de conteo contra
#: 17-24 ms de búsqueda—, porque el conteo exacto obliga a recorrer la lista
#: entera mientras que el top-25 se corta al llegar. Por encima de este tope
#: se declara una COTA («más de 500»), nunca una cifra inventada.
TOPE_CONTEO = 500

#: Caracteres alrededor del acierto en el extracto.
CONTEXTO = 90

#: El `CROSS JOIN` no es adorno: fija el orden de anidamiento. Con un `JOIN`
#: normal el planificador elegía `ag_fragmentos` como bucle externo (barrer
#: `idx_ag_fragmentos_session` y sondear el índice FTS fila a fila), y una
#: palabra POCO frecuente pasaba de 0,2 ms a 324 ms — el peor plan justo en
#: el caso que la búsqueda debería resolver mejor. `CROSS JOIN` obliga a
#: partir del índice, que es de donde tiene sentido partir.
_BUSCAR = (
    "SELECT f.id, f.artefacto_id, f.pagina, f.texto, a.nombre AS artefacto"
    " FROM ag_fragmentos_fts fts"
    " CROSS JOIN ag_fragmentos f ON f.rowid = fts.rowid"
    " JOIN ag_artefactos a ON a.id = f.artefacto_id"
    " WHERE ag_fragmentos_fts MATCH ? AND f.session_id = ?"
    " ORDER BY bm25(ag_fragmentos_fts), f.id LIMIT ?")

_CONTAR = (
    "SELECT COUNT(*) FROM ("
    "SELECT 1 FROM ag_fragmentos_fts fts"
    " CROSS JOIN ag_fragmentos f ON f.rowid = fts.rowid"
    " WHERE ag_fragmentos_fts MATCH ? AND f.session_id = ?"
    " LIMIT ?)")


def _extracto(texto: str, consulta: str) -> str:
    """Un trozo del fragmento alrededor de la primera palabra de la consulta.

    No se usa `snippet()` de FTS5 a propósito: sobre un índice de contenido
    externo devuelve el texto reconstruido, y aquí ya tenemos el original.
    """
    limpio = " ".join((texto or "").split())
    palabras = [p for p in "".join(
        ch if ch.isalnum() else " " for ch in (consulta or "")).split() if p]
    posicion = -1
    for palabra in palabras:
        posicion = limpio.lower().find(palabra.lower())
        if posicion >= 0:
            break
    if posicion < 0:
        return limpio[:CONTEXTO * 2]
    ini = max(0, posicion - CONTEXTO)
    fin = min(len(limpio), posicion + CONTEXTO)
    return ("…" if ini else "") + limpio[ini:fin] + ("…" if fin < len(limpio) else "")


def _contar(conn: sqlite3.Connection, consulta: str,
            session_id: int) -> tuple[int, bool] | None:
    """Cuenta aciertos hasta `TOPE_CONTEO`. Devuelve `(cuántos, hay_más)`, o
    `None` si el conteo no se pudo hacer — que NO es lo mismo que cero: hay
    resultados en la mano, y anotarlos con un total de 0 sería mentir."""
    try:
        fila = conn.execute(
            _CONTAR, (consulta, session_id, TOPE_CONTEO + 1)).fetchone()
    except sqlite3.OperationalError:
        return None
    n = fila[0]
    return (TOPE_CONTEO, True) if n > TOPE_CONTEO else (n, False)


def buscar_fragmentos(conn: sqlite3.Connection, session_id: int,
                      consulta: str, limite: int = MAX_RESULTADOS) -> dict[str, Any]:
    """Fragmentos de la sesión que casan con `consulta`, más relevante primero.

    Devuelve `{consulta, total, resultados:[{fragmento_id, artefacto_id,
    artefacto, pagina, extracto}]}`. Cuando hay más aciertos de los que se
    cuentan, `total` desaparece y en su lugar va `total_minimo`: decir «500»
    cuando puede haber 9 000 sería inventar una cifra.
    """
    texto_consulta = (consulta or "").strip()
    if not texto_consulta:
        return {"consulta": consulta, "total": 0, "resultados": [],
                "error": "Consulta vacía."}
    limite = max(1, min(int(limite or MAX_RESULTADOS), MAX_RESULTADOS))
    try:
        filas = conn.execute(
            _BUSCAR, (texto_consulta, session_id, limite)).fetchall()
    except sqlite3.OperationalError as e:
        # la sintaxis de FTS5 es estricta y el operador (o el modelo) escribe
        # lo que quiera: un paréntesis suelto se declara, no tumba la petición
        return {"consulta": consulta, "total": 0, "resultados": [],
                "error": f"Consulta de búsqueda inválida: {e}"}

    resultados = [
        {"fragmento_id": f["id"], "artefacto_id": f["artefacto_id"],
         "artefacto": f["artefacto"], "pagina": f["pagina"],
         "extracto": _extracto(f["texto"], texto_consulta)}
        for f in filas
    ]
    salida: dict[str, Any] = {"consulta": texto_consulta, "resultados": resultados}
    if len(resultados) < limite:
        # cabían todos: lo mostrado ES el total, sin segunda consulta
        salida["total"] = len(resultados)
        return salida

    conteo = _contar(conn, texto_consulta, session_id)
    if conteo is None:
        # sin conteo, lo único cierto es lo que se tiene delante
        salida["total_minimo"] = len(resultados)
        salida["aviso"] = (f"Se muestran {len(resultados)} aciertos; no se pudo "
                           "contar cuántos hay en total.")
        return salida
    contados, hay_mas = conteo
    if hay_mas:
        salida["total_minimo"] = contados
        salida["aviso"] = (f"Se muestran {len(resultados)} aciertos y hay más de "
                           f"{contados}; afina la consulta para acotar la búsqueda.")
    else:
        salida["total"] = contados
        if contados > len(resultados):
            salida["aviso"] = (f"Se muestran {len(resultados)} de {contados} aciertos; "
                               "afina la consulta para ver el resto.")
    return salida
