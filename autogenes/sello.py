"""SELLO (C1-lite) — sello de integridad re-derivable para los productos
dockeados (dossier CONCILIA, certificado VALIDACIÓN).

El sello es el sha256 del cuerpo canónico del producto (JSON con claves
ordenadas), SIN incluir el propio campo `sello`. Prueba que el expediente
que alguien tiene en la mano es exactamente el que se dockeó — evidencia
manipulable en cero. `verificar` re-deriva el hash del cuerpo y lo compara
con el sello guardado. Todo puro y determinista.
"""
import hashlib
import json
from typing import Any


def _canonico(cuerpo: dict[str, Any]) -> str:
    """JSON canónico del cuerpo sin el campo `sello` — la base del hash."""
    sin_sello = {k: v for k, v in cuerpo.items() if k != "sello"}
    return json.dumps(sin_sello, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"))


def sellar(cuerpo: dict[str, Any]) -> str:
    """sha256 del cuerpo canónico. No muta; devuelve el hash hex."""
    return hashlib.sha256(_canonico(cuerpo).encode("utf-8")).hexdigest()


def verificar(cuerpo: dict[str, Any]) -> dict[str, Any]:
    """Re-deriva el sello del cuerpo y lo compara con el guardado.
    Devuelve {sello_guardado, sello_rederivado, valido}."""
    guardado = cuerpo.get("sello")
    rederivado = sellar(cuerpo)
    return {
        "sello_guardado": guardado,
        "sello_rederivado": rederivado,
        "valido": guardado is not None and guardado == rederivado,
    }
