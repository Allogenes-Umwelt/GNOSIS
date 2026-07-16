"""Quorum multi-modelo con degradacion elegante.

Regla del operador: una funcionalidad que pide 2 LLM corre con los dos
cuando los dos estan disponibles; si solo hay uno (o uno falla a media
llamada), se ejecuta la version simple y el resultado queda marcado
quorum=False — nunca se bloquea el flujo por falta del segundo modelo.

El acuerdo/consenso es responsabilidad del caller (cada funcionalidad
compara a su manera: extraccion por campos, hipotesis por recomputo);
este modulo solo garantiza la mecanica de ejecucion y degradacion.
"""
from typing import Any, Callable

from .llm_interface import LLMProvider


def ejecutar_en_quorum(
    llamada: Callable[[LLMProvider], Any],
    proveedores: list[tuple[str, LLMProvider]],
) -> dict[str, Any]:
    """Ejecuta `llamada` sobre cada proveedor disponible (max los que
    lleguen). Retorna:
      respuestas: {nombre: resultado} solo de las llamadas que sirvieron
      errores:    {nombre: str} de las que fallaron
      quorum:     True solo si respondieron 2+ proveedores
    Levanta RuntimeError unicamente si NINGUN proveedor respondio."""
    respuestas: dict[str, Any] = {}
    errores: dict[str, str] = {}
    for nombre, proveedor in proveedores:
        try:
            respuestas[nombre] = llamada(proveedor)
        except Exception as e:  # degradar, nunca bloquear el flujo
            errores[nombre] = str(e)
    if not respuestas:
        raise RuntimeError(f"Todos los proveedores fallaron: {errores}")
    return {
        "respuestas": respuestas,
        "errores": errores,
        "quorum": len(respuestas) >= 2,
    }
