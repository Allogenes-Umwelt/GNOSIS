import os
import shutil
import sqlite3
from datetime import datetime

from . import DB_PATH


def backup_database(backup_dir=None):
    """Creates a timestamped copy of the database file.
    Returns the backup file path."""
    if not os.path.exists(DB_PATH):
        print(f"No database found at {DB_PATH}, skipping backup.")
        return None

    if backup_dir is None:
        backup_dir = os.path.join(os.path.dirname(DB_PATH), 'backups')

    # En modo WAL las transacciones confirmadas pueden vivir en el archivo
    # -wal hasta el checkpoint; copiar solo el principal perdería esas
    # escrituras. Se hace checkpoint (TRUNCATE) para volcar el WAL al
    # archivo base antes de copiarlo.
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
    except sqlite3.Error as e:
        print(f"WARN: no se pudo hacer checkpoint del WAL antes del backup: {e}")

    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(backup_dir, f"aduanas_backup_{timestamp}.db")
    shutil.copy2(DB_PATH, backup_path)
    print(f"Database backed up to: {backup_path}")
    return backup_path
