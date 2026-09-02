"""Registro estructurado — el mínimo de observabilidad que el repo no tenía.

`grep -c 'print('` daba 34 en el árbol vivo y `import logging` cero. Bajo
gunicorn todo eso va a stdout sin nivel, sin petición y sin forma de filtrar:
cuando algo falla en la máquina del operador, lo único que queda es un
párrafo suelto entre el ruido de acceso.

Esto no es una plataforma de observabilidad — no la hace falta a un
despliegue mono-operador. Es lo que convierte "algo salió mal" en algo
buscable: nivel, momento, módulo, y el id de la petición que lo provocó.

Logs a stream (12-factor): stderr. Quien recoge es el contenedor.
"""
import logging
import os
import sys
import uuid
from contextvars import ContextVar

_PETICION: ContextVar[str] = ContextVar("peticion_id", default="-")

_FORMATO = "%(asctime)s %(levelname)-7s %(name)-22s [%(peticion)s] %(message)s"


class _ContextoPeticion(logging.Filter):
    """Cuelga el id de petición de cada línea: sin él, dos operaciones
    concurrentes se entrelazan y ningún mensaje se puede seguir."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.peticion = _PETICION.get()
        return True


def nuevo_id_peticion() -> str:
    """Marca esta petición. Devuelve el id, que también viaja al cliente en
    la cabecera `X-Peticion-Id` para que un ticket sea rastreable."""
    pid = uuid.uuid4().hex[:12]
    _PETICION.set(pid)
    return pid


def id_peticion() -> str:
    return _PETICION.get()


def configurar(nivel: str | None = None) -> None:
    """Idempotente: gunicorn importa el módulo en cada worker."""
    raiz = logging.getLogger("gnosis")
    if raiz.handlers:
        return
    manejador = logging.StreamHandler(sys.stderr)
    manejador.setFormatter(logging.Formatter(_FORMATO))
    manejador.addFilter(_ContextoPeticion())
    raiz.addHandler(manejador)
    raiz.setLevel(nivel or os.environ.get("GNOSIS_LOG_NIVEL", "INFO").upper())
    raiz.propagate = False


def log(nombre: str) -> logging.Logger:
    """Logger de un módulo, bajo el árbol `gnosis.`"""
    configurar()
    return logging.getLogger(f"gnosis.{nombre}")
