"""Ámbito de sesión del modelo — quién decide QUÉ sesión se consulta.

El modelo NO lo decide. Antes de este módulo toda tool aceptaba un
`session_id` arbitrario (`tools._get_session` hacía `int(session_id)` sin
validar), así que el modelo podía responder con cifras de otro mes sin
declararlo: no solo una fuga, sino un número equivocado con cara de
correcto — snake oil involuntario.

El ámbito lo fija quien atiende al operador (el ChatHandler), y las tools
lo leen de aquí. Un `session_id` fuera del ámbito se rechaza con un error
explícito, nunca se sirve en silencio.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterable, Optional

_AMBITO: ContextVar[Optional[tuple[int, ...]]] = ContextVar("ambito_sesiones",
                                                            default=None)


class FueraDeAmbito(ValueError):
    """El modelo pidió una sesión que el operador no puso sobre la mesa."""


@contextmanager
def ambito_de_sesion(*session_ids: int | Iterable[int]):
    """Declara las sesiones que las tools pueden ver en este turno.

    La primera es la sesión por defecto (la que se usa cuando el modelo no
    especifica ninguna). Comparar meses sigue siendo posible: el operador
    abre el ámbito con las dos sesiones."""
    plana: list[int] = []
    for s in session_ids:
        if isinstance(s, int):
            plana.append(s)
        elif s is not None:
            plana.extend(int(x) for x in s)
    token = _AMBITO.set(tuple(plana))
    try:
        yield tuple(plana)
    finally:
        _AMBITO.reset(token)


def ambito_actual() -> Optional[tuple[int, ...]]:
    return _AMBITO.get()


def sesion_en_ambito(session_id=None) -> int:
    """Resuelve la sesión que una tool debe consultar.

    Sin ámbito declarado (uso fuera del chat: pruebas, scripts) se comporta
    como antes — la sesión pedida o la última. Con ámbito, solo lo permitido.
    """
    permitidas = _AMBITO.get()
    if permitidas is None:
        if session_id:
            return int(session_id)
        from database.persistence import get_latest_session_id
        return get_latest_session_id()
    if not permitidas:
        raise FueraDeAmbito("No hay sesión activa para esta conversación")
    if session_id is None or session_id == "":
        return permitidas[0]
    pedida = int(session_id)
    if pedida not in permitidas:
        raise FueraDeAmbito(
            f"Sesión {pedida} fuera del ámbito de esta conversación "
            f"(permitidas: {', '.join(str(s) for s in permitidas)})")
    return pedida
