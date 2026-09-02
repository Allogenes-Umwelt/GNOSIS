"""Respaldo de la base — la única cosa entre el operador y perder el expediente.

Antes: `PRAGMA wal_checkpoint(TRUNCATE)` y `shutil.copy2` del archivo
principal. El checkpoint es **best-effort**: con una transacción de lectura
abierta devuelve `busy` y NO vuelca el WAL (medido: `(1, 3, 3)`, con el `-wal`
intacto). El código avisaba por consola y copiaba igual, así que la garantía
del respaldo dependía de que nadie estuviera leyendo — y aunque el resultado
suela salir bien, «suele» no es una propiedad sobre la que se defienda una
glosa.

Ahora se usa la **API de respaldo en línea** de SQLite (`Connection.backup`),
que toma una instantánea consistente sin depender de que el checkpoint
complete, y la copia se verifica con `integrity_check` antes de declararla
buena. Un respaldo que dice «listo» sin comprobarlo es peor que ninguno,
porque se confía en él.
"""
import os
import sqlite3
from datetime import datetime

from registro import log

from . import DB_PATH

_log = log("respaldo")


class RespaldoCorrupto(RuntimeError):
    """La copia no pasó la verificación de integridad."""


def backup_database(backup_dir=None):
    """Copia consistente y verificada de la base. Devuelve su ruta, o None
    si no hay base que respaldar."""
    if not os.path.exists(DB_PATH):
        _log.info("no hay base en %s; nada que respaldar", DB_PATH)
        return None

    if backup_dir is None:
        backup_dir = os.path.join(os.path.dirname(DB_PATH), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    marca = datetime.now().strftime("%Y%m%d_%H%M%S")
    destino = os.path.join(backup_dir, f"aduanas_backup_{marca}.db")

    origen = sqlite3.connect(DB_PATH)
    copia = sqlite3.connect(destino)
    try:
        # Instantánea consistente: incluye lo confirmado que aún viva en el
        # -wal, sin exigir que el checkpoint complete.
        with copia:
            origen.backup(copia)
        veredicto = copia.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        copia.close()
        origen.close()

    if veredicto != "ok":
        # No se borra: una copia sospechosa puede servir para un rescate
        # manual. Pero NO se declara buena.
        _log.error("el respaldo %s no pasó integrity_check: %s", destino, veredicto)
        raise RespaldoCorrupto(
            f"La copia {destino} no está íntegra ({veredicto}). "
            "No la uses como respaldo; revisa el disco.")

    _log.info("respaldo verificado en %s", destino)
    return destino
