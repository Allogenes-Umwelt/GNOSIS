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
import re
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


def _variantes(valor: str) -> list[str]:
    """Formas del mismo identificador que una expresión SQL puede producir
    y que siguen siendo el dato: mayúsculas/minúsculas y su hexadecimal."""
    formas = {valor, valor.upper(), valor.lower()}
    formas.add(valor.encode("utf-8").hex().upper())
    formas.add(valor.encode("utf-8").hex().lower())
    return [f for f in formas if f]


def enmascarar_texto(texto: Optional[str], identificadores: dict[str, str],
                     capa) -> Optional[str]:
    """Sustituye toda ocurrencia de un identificador real por su token.

    Búsqueda, no coincidencia: da igual que venga como valor de columna,
    dentro de una frase o troceado por el JSON. `capa` es la
    `ObfuscationLayer` de la conversación, así que el token es estable y
    `unmask_text` lo revierte para el operador.

    Los valores más largos se sustituyen primero: si uno contiene a otro,
    enmascarar el corto antes rompería al largo.
    """
    if not texto or not identificadores:
        return texto
    pares: list[tuple[str, str]] = []
    for valor, tipo in identificadores.items():
        for forma in _variantes(valor):
            pares.append((forma, capa.mask_value(valor, tipo)))
    pares.sort(key=lambda p: len(p[0]), reverse=True)
    for forma, token in pares:
        if forma in texto:
            texto = texto.replace(forma, token)
    return texto


#: Un identificador troceado por SQL (`substr(a,1,8)||'-'||substr(a,9)`) no
#: aparece literal, pero sus mitades sí. Se detecta el patrón inverso: dos
#: fragmentos de un identificador conocido separados por un solo carácter.
def enmascarar_troceado(texto: Optional[str], identificadores: dict[str, str],
                        capa) -> Optional[str]:
    if not texto or not identificadores:
        return texto
    for valor, tipo in identificadores.items():
        if len(valor) < MIN_LONGITUD * 2:
            continue
        patron = re.compile(
            "".join(re.escape(c) + r"\W?" for c in valor), re.IGNORECASE)
        texto = patron.sub(lambda _m, v=valor, t=tipo: capa.mask_value(v, t), texto)
    return texto
