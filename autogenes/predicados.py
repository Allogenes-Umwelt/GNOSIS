"""Vocabulario cerrado de predicados — hallazgo G2 del diagnóstico v02.

`Relacion.tipo` era `str` libre y el prompt pedía «relaciones tipadas» sin
lista, así que «importa por», «importa vía» e «importa a través de» eran
TRES predicados distintos. Con eso no se puede preguntar «todos los
proveedores de X» ni escribir una regla sobre el grafo: cada consulta
tendría que adivinar la redacción que le tocó al modelo ese día.

Las entidades ya tenían su `CHECK (tipo IN (…))`. Las relaciones no.

**La lista es del operador, no del ejecutor.** Esto es una SEMILLA — la que
propone el diagnóstico v02 §G2, literal — y quien conoce el dominio aduanal
la corrige. Por eso vive aquí, en un módulo de datos de una sola pieza, y no
repartida por el código: cambiarla es editar dos tuplas.

Nada se pierde al normalizar: lo que el modelo dijo se conserva en
`tipo_crudo` siempre que no case con un predicado, así que una redacción
nueva se puede leer luego y decidir si merece entrar al vocabulario.
"""

#: Los predicados canónicos. `otro` es el cajón declarado: no es un fallo,
#: es una relación real cuyo verbo todavía no tiene nombre en el dominio.
PREDICADOS: tuple[str, ...] = (
    "emite_factura",
    "importa_por",
    "ampara",
    "transporta",
    "representa",
    "audita",
    "pertenece_a",
    "ubicado_en",
    "vigente_en",
    "otro",
)

#: Lo que el modelo escribe → el predicado que significa. Las claves están
#: normalizadas (minúsculas, sin acentos, con `_` por separador): la tabla
#: mapea SENTIDO, no ortografía.
SINONIMOS: dict[str, str] = {
    # facturación
    "factura": "emite_factura",
    "factura_a": "emite_factura",
    "emite": "emite_factura",
    "emite_factura_a": "emite_factura",
    "vende_a": "emite_factura",
    "provee_a": "emite_factura",
    "proveedor_de": "emite_factura",
    # importación
    "importa": "importa_por",
    "importa_via": "importa_por",
    "importa_a_traves_de": "importa_por",
    "importa_desde": "importa_por",
    "ingresa_por": "importa_por",
    "entra_por": "importa_por",
    # amparo documental (pedimento → vehículo, contrato → operación)
    "ampara_a": "ampara",
    "cubre": "ampara",
    "cubre_a": "ampara",
    "garantiza": "ampara",
    "garantiza_a": "ampara",
    "declara": "ampara",
    # transporte
    "transporta_a": "transporta",
    "traslada": "transporta",
    "embarca": "transporta",
    "flete_de": "transporta",
    # representación
    "representa_a": "representa",
    "agente_de": "representa",
    "agente_aduanal_de": "representa",
    "apodera_a": "representa",
    "actua_por": "representa",
    # auditoría / revisión
    "audita_a": "audita",
    "revisa": "audita",
    "revisa_a": "audita",
    "fiscaliza": "audita",
    "observa_a": "audita",
    # pertenencia
    "pertenece": "pertenece_a",
    "parte_de": "pertenece_a",
    "filial_de": "pertenece_a",
    "subsidiaria_de": "pertenece_a",
    "propiedad_de": "pertenece_a",
    "es_parte_de": "pertenece_a",
    # ubicación
    "ubicado": "ubicado_en",
    "situado_en": "ubicado_en",
    "opera_en": "ubicado_en",
    "localizado_en": "ubicado_en",
    "con_sede_en": "ubicado_en",
    # vigencia
    "vigente": "vigente_en",
    "valido_en": "vigente_en",
    "rige_en": "vigente_en",
}

_ACENTOS = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")


def clave(tipo: str) -> str:
    """La forma normalizada de un verbo: minúsculas, sin acentos, `_` por
    separador. «Importa Vía», «importa vía» e «importa_via» son la misma
    clave — la tabla mapea sentido, no ortografía."""
    limpio = (tipo or "").strip().translate(_ACENTOS).lower()
    return "_".join(
        "".join(ch if ch.isalnum() else " " for ch in limpio).split())


def normalizar(tipo: str) -> tuple[str, str | None]:
    """`(predicado, tipo_crudo)` para lo que sea que haya dicho el modelo.

    `tipo_crudo` viene con valor SOLO cuando hubo que caer a `otro`: si el
    verbo casó con un predicado, guardarlo otra vez sería ruido. Lo que no
    casa NO se descarta — se conserva tal cual llegó, que es la diferencia
    entre normalizar y perder información.
    """
    k = clave(tipo)
    if k in PREDICADOS:
        return k, None
    if k in SINONIMOS:
        return SINONIMOS[k], None
    return "otro", (tipo or "").strip()[:60] or None
