"""El conjunto de identificadores reales de una sesión, y el enmascarado
de CUALQUIER texto contra ese conjunto.

Por qué existe: `ofuscation.mask_row` enmascara por NOMBRE de columna
(`chasis`, `factura`, …) y, como segunda capa, por FORMA (una regex de VIN
anclada y en mayúsculas). Ambas se evaden con una expresión SQL trivial —
`lower(chasis)`, `chasis||' '`, `substr(...)||'-'||substr(...)`, `hex(...)`,
o simplemente `SELECT factura AS f`, porque una factura no tiene forma de
VIN y `f` no está en la lista de nombres.

La defensa que no se evade no mira la sintaxis: mira el DATO. Los
identificadores reales de una sesión son un conjunto conocido y finito, así
que se buscan como texto en todo lo que sale hacia el modelo, en el único
punto donde ya está serializado. Eso cubre alias, expresiones, JSON anidado
a cualquier profundidad y prosa libre, sin listas especiales por tool.
"""
import sqlite3
from typing import Optional

#: Longitud mínima para enmascarar por TEXTO. La patente aduanal son 4
#: dígitos: buscarla como subcadena destrozaría precios, fechas y conteos
#: ("3807" aparece en cualquier importe). Se sigue enmascarando por columna
#: en `mask_row`, que es donde su significado está declarado.
MIN_LONGITUD = 6


def identificadores_de_sesion(conn: sqlite3.Connection,
                              session_id: int) -> dict[str, str]:
    """{valor_real: tipo} de los identificadores de la sesión.

    Tipos según el vocabulario de `ObfuscationLayer`: chasis, factura,
    pedimento. Solo valores suficientemente largos para buscarlos como
    texto sin falsos positivos (ver MIN_LONGITUD).
    """
    consultas = (
        ("chasis", "SELECT DISTINCT chasis FROM importaciones WHERE session_id = ?"),
        ("chasis", "SELECT DISTINCT chasis FROM extraccion_facturas WHERE session_id = ?"),
        ("factura", "SELECT DISTINCT factura FROM importaciones WHERE session_id = ?"),
        ("factura", "SELECT DISTINCT factura FROM extraccion_facturas WHERE session_id = ?"),
        ("factura", "SELECT DISTINCT factura FROM facturas_faltantes WHERE session_id = ?"),
        ("pedimento", "SELECT DISTINCT numero_pedimento FROM pedimentos WHERE session_id = ?"),
    )
    fuera: dict[str, str] = {}
    for tipo, sql in consultas:
        try:
            filas = conn.execute(sql, (session_id,)).fetchall()
        except sqlite3.Error:
            continue          # tabla ausente en una base a medio migrar
        for fila in filas:
            valor = fila[0]
            if not valor:
                continue
            texto = str(valor).strip()
            if len(texto) >= MIN_LONGITUD:
                fuera.setdefault(texto, tipo)
    return fuera


def _formas_normalizadas(valor: str) -> set[str]:
    """Las formas del identificador que hay que reconocer, ya normalizadas
    (sin separadores, minúsculas):

    - el dato mismo — cubre el literal, `lower()`, `replace()` y el troceado
      por cualquier separador, porque la normalización los aplana todos;
    - su hexadecimal — `hex(chasis)` devuelve el dato codificado, y ninguna
      normalización de puntuación lo recupera.
    """
    plano = _solo_alfanumerico(valor)
    if not plano:
        return set()
    return {plano, valor.encode("utf-8").hex().lower()}


def _solo_alfanumerico(texto: str) -> str:
    return "".join(ch for ch in texto if ch.isalnum()).lower()


def _plano(texto: str) -> tuple[str, list[int]]:
    """El texto sin separadores en minúsculas, y el índice ORIGINAL de cada
    carácter que sobrevive. Permite localizar en el texto real algo que solo
    se reconoce después de quitarle la puntuación."""
    limpio: list[str] = []
    indices: list[int] = []
    for i, ch in enumerate(texto):
        if ch.isalnum():
            limpio.append(ch.lower())
            indices.append(i)
    return "".join(limpio), indices


def enmascarar(texto: Optional[str], identificadores: dict[str, str],
               capa) -> Optional[str]:
    """Sustituye por su token toda aparición de un identificador real.

    Una sola pasada que cubre el literal, las mayúsculas/minúsculas, el
    troceado por separadores (`substr(a,1,8)||'-'||substr(a,9)`) y el
    hexadecimal (`hex(a)`).

    **El coste lo pone el TEXTO, no el tamaño del conjunto.** La versión
    anterior recorría los identificadores —cuatro variantes de cada uno, y
    una regex compilada por identificador— así que crecía con cuántos
    hubiera: medido, 3,77 s con 22 500 formas sobre 12 KB de texto, aplicado
    a CADA resultado de tool y a CADA mensaje del operador (~7 s de regex por
    turno de chat en una sesión de 10 000 vehículos).

    Aquí el texto se normaliza una vez y se deslizan ventanas de las
    LONGITUDES que existen —VIN 17, factura ~12, pedimento 15 sin espacios,
    más sus hexadecimales— consultando un `set`. Las longitudes distintas son
    un puñado, tenga el conjunto diez identificadores o cien mil.

    `capa` es la `ObfuscationLayer` de la conversación: el token es estable y
    `unmask_text` lo revierte para la pantalla del operador.
    """
    if not texto or not identificadores:
        return texto

    por_longitud: dict[int, dict[str, tuple[str, str]]] = {}
    for valor, tipo in identificadores.items():
        for forma in _formas_normalizadas(valor):
            if len(forma) >= MIN_LONGITUD:
                por_longitud.setdefault(len(forma), {}).setdefault(forma, (valor, tipo))
    if not por_longitud:
        return texto

    plano, indices = _plano(texto)
    if not plano:
        return texto

    # (inicio, fin) en el texto ORIGINAL de cada coincidencia
    hallazgos: list[tuple[int, int, str, str]] = []
    for longitud, tabla in por_longitud.items():
        if longitud > len(plano):
            continue
        for i in range(len(plano) - longitud + 1):
            encontrado = tabla.get(plano[i:i + longitud])
            if encontrado:
                hallazgos.append((indices[i], indices[i + longitud - 1] + 1,
                                  encontrado[0], encontrado[1]))
    if not hallazgos:
        return texto

    # la coincidencia más LARGA gana el solape: si un identificador contiene a
    # otro, enmascarar el corto primero rompería al largo
    hallazgos.sort(key=lambda h: (h[0], -(h[1] - h[0])))
    elegidos: list[tuple[int, int, str, str]] = []
    tope = -1
    for ini, fin, valor, tipo in hallazgos:
        if ini >= tope:
            elegidos.append((ini, fin, valor, tipo))
            tope = fin
    # de derecha a izquierda: sustituir no mueve los índices pendientes
    for ini, fin, valor, tipo in reversed(elegidos):
        texto = texto[:ini] + capa.mask_value(valor, tipo) + texto[fin:]
    return texto
