"""Nombre canónico — la mitad determinista del hallazgo G1 (diagnóstico v02).

`ag_entidades` lleva `session_id`: cada mes es un espacio de nombres propio, y
`upsert_entidad` resuelve por `strip().lower()`. Así, «Volkswagen de México
S.A. de C.V.» y «Volkswagen Mexico» son dos nodos, y el mismo proveedor en
doce meses son doce nodos sin arista entre ellos. Un grafo que no sabe que
dos cosas son la misma no es de conocimiento: es un índice.

Este módulo hace la parte que se puede hacer SIN adivinar: plegar el
Unicode, quitar los sufijos legales de un catálogo, tirar los conectores y
ordenar los tokens. Dos escrituras del MISMO nombre acaban en la misma
cadena, y eso es una identidad que se puede defender ante un auditor.

Lo que NO hace, a propósito: adivinar que «VW» es «Volkswagen». Eso es
parecido, no igualdad, y va por el otro camino —`autogenes/similitud.py`—
que PROPONE al operador y nunca decide. La diferencia entre las dos cosas es
la diferencia entre normalizar y inventar.
"""
import unicodedata

#: Sufijos de forma legal, por token. Se retiran SOLO del final del nombre:
#: «SA de CV» al final es forma jurídica; «Grupo SA Ltda» en medio podría ser
#: parte del nombre, y el catálogo no puede saberlo.
SUFIJOS_LEGALES: frozenset[str] = frozenset({
    # México
    "sa", "sab", "sapi", "sc", "ac", "srl", "s", "de", "cv", "rl", "spr",
    # comunes en el expediente automotriz
    "ag", "gmbh", "kg", "kgaa", "se", "bv", "nv", "as", "ab", "oy", "spa",
    "srl", "sas", "plc", "ltd", "ltda", "limited", "inc", "incorporated",
    "llc", "lp", "llp", "co", "corp", "corporation", "company", "gruppe",
})

#: Conectores que no distinguen a nadie. «Volkswagen de México» y
#: «Volkswagen México» son el mismo nombre escrito por dos personas.
CONECTORES: frozenset[str] = frozenset({
    "de", "del", "la", "las", "el", "los", "y", "e", "and", "of", "the",
    "para", "por", "en",
})


def _plegar(texto: str) -> str:
    """Sin acentos y en minúsculas. NFKD + descarte de marcas: «MÉXICO»,
    «Mexico» y «méxico» son la misma palabra escrita por tres teclados."""
    descompuesto = unicodedata.normalize("NFKD", texto or "")
    return "".join(c for c in descompuesto
                   if not unicodedata.combining(c)).lower()


def tokens(nombre: str) -> list[str]:
    """Los tokens alfanuméricos del nombre, plegados y en orden de lectura.

    El punto se BORRA en vez de separar: así «S.A. de C.V.» da `sa de cv` y
    el catálogo de formas legales puede reconocerlo. Separando por el punto
    daba `s a de c v`, cinco tokens que no son nada y que ningún catálogo
    razonable puede listar."""
    plegado = _plegar(nombre).replace(".", "")
    return "".join(c if c.isalnum() else " " for c in plegado).split()


def canonizar(nombre: str) -> str:
    """El nombre canónico: la forma en que dos escrituras del mismo nombre
    coinciden exactamente.

    Los sufijos legales se retiran por la COLA, uno a uno, mientras el token
    esté en el catálogo: así «volkswagen de mexico sa de cv» pierde «sa de
    cv» pero «de mexico» sobrevive, que es lo que distingue a esta empresa de
    su matriz. Después se tiran los conectores y se ORDENAN los tokens, para
    que el orden de las palabras deje de ser una identidad distinta.

    Si al quitar todo no queda nada —un nombre que era solo forma legal— se
    devuelve el nombre plegado entero: perder la identidad por normalizarla
    sería peor que no normalizar.
    """
    piezas = tokens(nombre)
    while piezas and piezas[-1] in SUFIJOS_LEGALES:
        piezas.pop()
    utiles = [t for t in piezas if t not in CONECTORES]
    if not utiles:
        utiles = piezas or tokens(nombre)
    return " ".join(sorted(utiles))


def claves_bloque(nombre: str) -> list[str]:
    """Las claves de BLOQUEO: comparar cada entidad con todas es cuadrático, y
    la ola 1 se dedicó justo a quitar ese patrón. Solo se comparan las que
    comparten alguna clave.

    Cada token del nombre canónico es una clave, no solo uno. Una sola clave
    —el token más largo, digamos— parece más barata y es INESTABLE: «Agencia
    Aduanal Perez» y «Agencia Aduanal Perez y Asociados» son la misma agencia
    y sus tokens más largos son «agencia» y «asociados», así que el par que el
    bloqueo existe para encontrar es justo el que se le escapaba. Añadir una
    palabra no puede cambiar con quién se compara.
    """
    return sorted(set(canonizar(nombre).split()))
