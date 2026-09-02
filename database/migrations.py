"""Versioned, one-way migrations for changes CREATE IF NOT EXISTS can't express.

Each migration runs exactly once, inside init_db(). Append only — never
edit or reorder an entry that has shipped.
"""
import sqlite3

# (version, name, list of SQL statements)
MIGRATIONS: list[tuple[int, str, list[str]]] = [
    # Widen ag_productos.clase to allow 'investigacion' (P1 · saved
    # investigations). SQLite can't ALTER a CHECK constraint, so the table is
    # recreated and copied. Safe: nothing references ag_productos by FK.
    (1, "ag_productos_add_investigacion", [
        """CREATE TABLE ag_productos_new (
            id          TEXT PRIMARY KEY,
            session_id  INTEGER NOT NULL,
            clase       TEXT NOT NULL CHECK (clase IN ('informe','camino','investigacion')),
            titulo      TEXT NOT NULL,
            unidad      TEXT NOT NULL,
            cuerpo      TEXT,
            entidades   TEXT NOT NULL DEFAULT '[]',
            evidencia   TEXT NOT NULL DEFAULT '[]',
            created_at  TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
        )""",
        "INSERT INTO ag_productos_new (id, session_id, clase, titulo, unidad,"
        " cuerpo, entidades, evidencia, created_at) SELECT id, session_id, clase,"
        " titulo, unidad, cuerpo, entidades, evidencia, created_at FROM ag_productos",
        "DROP TABLE ag_productos",
        "ALTER TABLE ag_productos_new RENAME TO ag_productos",
        "CREATE INDEX IF NOT EXISTS idx_ag_productos_session ON ag_productos(session_id)",
    ]),
    # Add ag_relaciones.origen (provenance): who asserted the edge. Without
    # it a relation cannot declare its author — synesis (model) vs operador
    # (the analyst's own claim from the radar triage, T1). Recreate-and-copy
    # (house style) so it works whether or not the column already exists:
    # existing rows default to 'synesis' (the pre-provenance state, declared).
    (2, "ag_relaciones_add_origen", [
        """CREATE TABLE ag_relaciones_new (
            id          TEXT PRIMARY KEY,
            session_id  INTEGER NOT NULL,
            desde_id    TEXT NOT NULL,
            hasta_id    TEXT NOT NULL,
            tipo        TEXT NOT NULL,
            peso        REAL NOT NULL DEFAULT 0.5 CHECK (peso >= 0 AND peso <= 1),
            evidencia   TEXT NOT NULL DEFAULT '[]',
            origen      TEXT NOT NULL DEFAULT 'synesis',
            created_at  TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (session_id) REFERENCES processing_sessions(id),
            FOREIGN KEY (desde_id) REFERENCES ag_entidades(id),
            FOREIGN KEY (hasta_id) REFERENCES ag_entidades(id)
        )""",
        "INSERT INTO ag_relaciones_new (id, session_id, desde_id, hasta_id, tipo,"
        " peso, evidencia, origen, created_at) SELECT id, session_id, desde_id,"
        " hasta_id, tipo, peso, evidencia, 'synesis', created_at FROM ag_relaciones",
        "DROP TABLE ag_relaciones",
        "ALTER TABLE ag_relaciones_new RENAME TO ag_relaciones",
        "CREATE INDEX IF NOT EXISTS idx_ag_relaciones_session ON ag_relaciones(session_id)",
        "CREATE INDEX IF NOT EXISTS idx_ag_relaciones_desde ON ag_relaciones(desde_id)",
        "CREATE INDEX IF NOT EXISTS idx_ag_relaciones_hasta ON ag_relaciones(hasta_id)",
    ]),
    # Add ag_bitacora.prev_hash/hash (WORM tamper-evidence). Recreate-and-copy
    # (house style) so it works whether or not the columns already exist: the
    # copy names only the pre-seal columns, so legacy rows keep NULL seals
    # (declared: history before the chain isn't sealed). ag_bitacora is
    # referenced by no FK, so recreate is safe.
    (3, "ag_bitacora_add_hash_chain", [
        """CREATE TABLE ag_bitacora_new (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  INTEGER NOT NULL,
            ts          TEXT DEFAULT (datetime('now')),
            accion      TEXT NOT NULL,
            detalle     TEXT NOT NULL,
            prev_hash   TEXT,
            hash        TEXT,
            FOREIGN KEY (session_id) REFERENCES processing_sessions(id)
        )""",
        "INSERT INTO ag_bitacora_new (id, session_id, ts, accion, detalle)"
        " SELECT id, session_id, ts, accion, detalle FROM ag_bitacora",
        "DROP TABLE ag_bitacora",
        "ALTER TABLE ag_bitacora_new RENAME TO ag_bitacora",
        "CREATE INDEX IF NOT EXISTS idx_ag_bitacora_session ON ag_bitacora(session_id)",
    ]),
    # Índice de resolución de entidad. `upsert_entidad` cargaba TODAS las
    # entidades de la sesión por pydantic y buscaba en Python el nombre
    # normalizado o un alias: O(E) por llamada, y por tanto O(E²) para una
    # ingesta. Medido en docs/DIAGNOSTICO_FABLE_v02.md §1: reencontrar una
    # entidad costaba 13,7× más con 2 100 dentro que con 100.
    #
    # Cada nombre y cada alias pasa a ser una FILA con su forma normalizada.
    # El UNIQUE(session_id, alias_norm) hace además imposible el empate que
    # el escaneo en Python resolvía según el orden físico de filas.
    #
    # Se rellena desde lo que ya existe; es idempotente (INSERT OR IGNORE),
    # así que una base a medio migrar converge sola.
    # La tabla la crea también el esquema (models_autogenes.AG_SCHEMA_SQL), pero
    # se repite aquí a propósito: esta migración tiene que bastarse sola sobre
    # una base ANTERIOR a que el esquema la trajera, sin depender del orden en
    # que se apliquen esquema y migraciones. Lo que el esquema no puede
    # expresar es el RELLENO desde las entidades ya existentes.
    (4, "ag_entidad_alias_relleno", [
        """CREATE TABLE IF NOT EXISTS ag_entidad_alias (
            session_id  INTEGER NOT NULL,
            alias_norm  TEXT NOT NULL,
            entidad_id  TEXT NOT NULL,
            es_nombre   INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (session_id, alias_norm),
            FOREIGN KEY (entidad_id) REFERENCES ag_entidades(id) ON DELETE CASCADE
        )""",
        "CREATE INDEX IF NOT EXISTS idx_ag_entidad_alias_entidad"
        " ON ag_entidad_alias(entidad_id)",
        # El RELLENO va en `_rellenar_alias` (Python), no aquí: una base
        # legada puede no tener siquiera `ag_entidades`, y una migración que
        # explota sobre un esquema parcial bloquea el arranque entero.
    ]),
    # Índice FTS5 de fragmentos. Como la migración 4, todo el trabajo va en el
    # paso de Python: `CREATE VIRTUAL TABLE ... content='ag_fragmentos'` exige
    # que la tabla de contenido EXISTA, y una base legada puede no tenerla.
    # Una migración que explota sobre un esquema parcial bloquea el arranque.
    (5, "ag_fragmentos_fts", []),
]


#: El índice FTS y sus disparadores, idénticos a los del esquema. Se repiten
#: aquí para que una base ANTERIOR los reciba, y se aplican desde Python
#: porque dependen de que `ag_fragmentos` exista.
_FTS_SQL = (
    """CREATE VIRTUAL TABLE IF NOT EXISTS ag_fragmentos_fts USING fts5(
        texto, content='ag_fragmentos', content_rowid='rowid',
        tokenize="unicode61 remove_diacritics 2")""",
    """CREATE TRIGGER IF NOT EXISTS ag_fragmentos_fts_ai
       AFTER INSERT ON ag_fragmentos BEGIN
         INSERT INTO ag_fragmentos_fts(rowid, texto) VALUES (new.rowid, new.texto);
       END""",
    """CREATE TRIGGER IF NOT EXISTS ag_fragmentos_fts_ad
       AFTER DELETE ON ag_fragmentos BEGIN
         INSERT INTO ag_fragmentos_fts(ag_fragmentos_fts, rowid, texto)
           VALUES ('delete', old.rowid, old.texto);
       END""",
    """CREATE TRIGGER IF NOT EXISTS ag_fragmentos_fts_au
       AFTER UPDATE ON ag_fragmentos BEGIN
         INSERT INTO ag_fragmentos_fts(ag_fragmentos_fts, rowid, texto)
           VALUES ('delete', old.rowid, old.texto);
         INSERT INTO ag_fragmentos_fts(rowid, texto) VALUES (new.rowid, new.texto);
       END""",
    # y se puebla desde el texto ya dockeado ('rebuild' reconstruye desde cero,
    # así que es idempotente)
    "INSERT INTO ag_fragmentos_fts(ag_fragmentos_fts) VALUES ('rebuild')",
)


def _reconstruir_fts(conn: sqlite3.Connection) -> None:
    """Crea el índice FTS y lo puebla desde los fragmentos que ya existan.

    Sobre un esquema parcial (una base legada sin `ag_fragmentos`) no hay nada
    que indexar y desde luego no hay que tumbar el arranque."""
    for sentencia in _FTS_SQL:
        try:
            conn.execute(sentencia)
        except sqlite3.OperationalError:
            return


def _rellenar_alias(conn: sqlite3.Connection) -> None:
    """Rellena el índice de resolución desde las entidades ya existentes.

    Va en Python y no en la lista SQL de la migración por dos razones: los
    alias viven serializados en JSON, que SQL no sabe abrir; y una base legada
    puede no tener `ag_entidades` en absoluto, así que el relleno tiene que
    poder no hacer nada sin romper el arranque. Idempotente."""
    import json as _json

    try:
        # nombres canónicos
        conn.execute(
            "INSERT OR IGNORE INTO ag_entidad_alias"
            " (session_id, alias_norm, entidad_id, es_nombre)"
            " SELECT session_id, LOWER(TRIM(nombre)), id, 1 FROM ag_entidades")
        # y los alias, que viven serializados en JSON
        filas = conn.execute(
            "SELECT id, session_id, alias FROM ag_entidades"
            " WHERE alias IS NOT NULL AND alias NOT IN ('', '[]')").fetchall()
    except sqlite3.OperationalError:
        # esquema parcial (una base legada puede no tener ag_entidades): no hay
        # nada que rellenar y desde luego no hay que tumbar el arranque
        return
    for fila in filas:
        try:
            alias = _json.loads(fila[2] or "[]")
        except ValueError:
            continue
        for a in alias:
            clave = (a or "").strip().lower()
            if clave:
                conn.execute(
                    "INSERT OR IGNORE INTO ag_entidad_alias"
                    " (session_id, alias_norm, entidad_id, es_nombre)"
                    " VALUES (?, ?, ?, 0)", (fila[1], clave, fila[0]))


def apply_migrations(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            applied_at  TEXT DEFAULT (datetime('now'))
        )
        """
    )
    applied = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
    for version, name, statements in sorted(MIGRATIONS):
        if version in applied:
            continue
        for statement in statements:
            conn.execute(statement)
        conn.execute(
            "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
            (version, name),
        )
        if version == 4:
            _rellenar_alias(conn)
        if version == 5:
            _reconstruir_fts(conn)
