import os
import hashlib
import shutil
from datetime import datetime

import pandas as pd

from . import get_connection

from registro import log

_log = log("persistencia")


# ============================================================
# SESSION MANAGEMENT
# ============================================================

def create_session(month, year):
    """Creates a new processing session. Returns the session_id."""
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed) VALUES (?, ?, ?)",
        (datetime.now().isoformat(), month, year)
    )
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return session_id


# Columnas que update_session_stats puede tocar. El nombre de columna se
# interpola en el SQL (no se puede parametrizar un identificador), así que
# se valida contra esta allowlist: sin esto, una clave derivada de entrada
# externa sería inyección SQL.
_STATS_COLUMNAS = frozenset({
    'total_pdfs_processed', 'total_pdfs_errors', 'total_records',
    'processing_time_seconds', 'status', 'month_processed', 'year_processed',
    'session_date',
})


def update_session_stats(session_id, **kwargs):
    """Updates processing_sessions with final counts and timing.
    Solo se permiten columnas de la allowlist _STATS_COLUMNAS."""
    conn = get_connection()
    try:
        for key, value in kwargs.items():
            if key not in _STATS_COLUMNAS:
                raise ValueError(f"Columna no permitida en stats: {key}")
            conn.execute(
                f"UPDATE processing_sessions SET {key} = ? WHERE id = ?",
                (value, session_id)
            )
        conn.commit()
    finally:
        conn.close()


def get_all_sessions():
    """Returns all processing sessions ordered by date desc."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM processing_sessions ORDER BY session_date DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_latest_session_id():
    """Returns the most recent session_id, or None if no sessions exist."""
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM processing_sessions ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return row['id'] if row else None


# ============================================================
# CATALOGO DE VEHICULOS
# ============================================================

def _num_pct(v):
    """Celda de Flete/Seguro → fracción (x/100). None si viene vacía o no
    numérica: un '-', 'N/A' o '5%' NO debe tumbar el catálogo entero (antes
    un float() sin guarda reventaba la fila y, sin commit, se perdía todo)."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return float(str(v).replace('%', '').replace(',', '').strip()) / 100
    except (ValueError, TypeError):
        return None


def save_catalogo_vehiculos(session_id, df_divisiones):
    """Inserts the vehicle catalog from the Divisiones Excel into catalogo_vehiculos.
    Also resolves marca_id from the marcas table. Returns number of rows inserted.

    Cada fila se procesa de forma AISLADA: una celda sucia (número inválido,
    tipo inesperado) salta esa fila y sigue — antes tumbaba el catálogo completo
    en silencio y dejaba los importaciones.catalogo_id en NULL."""
    conn = get_connection()

    # Build marca name -> id lookup
    marcas_rows = conn.execute("SELECT id, nombre FROM marcas").fetchall()
    marca_lookup = {r['nombre'].upper(): r['id'] for r in marcas_rows}

    count, saltadas = 0, 0
    for _, row in df_divisiones.iterrows():
        try:
            auto_code = str(row.get('CLAVES', '')).strip()
            if not auto_code:
                continue

            marca_name = str(row.get('MARCA', '')).strip().upper()
            marca_id = marca_lookup.get(marca_name)

            pais_code = str(row.get('Pais', '')).strip() if pd.notna(row.get('Pais')) else None

            fletes = _num_pct(row.get('Flete (Incrementables)'))
            seguros = _num_pct(row.get('Seguro (Incrementables)'))
            if seguros is None:
                seguros = 0.0

            # Ensure pais exists in catalog (insert if new). OR IGNORE conserva
            # el nombre real ya sembrado cuando el código coincide.
            if pais_code:
                conn.execute(
                    "INSERT OR IGNORE INTO paises (codigo, nombre) VALUES (?, ?)",
                    (pais_code, pais_code)
                )

            cur = conn.execute(
                """INSERT OR IGNORE INTO catalogo_vehiculos
                   (session_id, auto_code, tipo, fraccion, pais_code, fletes, seguros, marca_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (session_id, auto_code,
                 str(row.get('Tipo', '')) if pd.notna(row.get('Tipo')) else None,
                 str(row.get('FRACCIÓN', '')) if pd.notna(row.get('FRACCIÓN')) else None,
                 pais_code, fletes, seguros, marca_id)
            )
            if cur.rowcount:           # OR IGNORE: no contar duplicados descartados
                count += 1
        except Exception as e:
            saltadas += 1
            _log.info(f"[catalogo] fila saltada (CLAVES={row.get('CLAVES')!r}): {e}")

    conn.commit()
    conn.close()
    if saltadas:
        _log.info(f"[catalogo] {count} insertadas, {saltadas} filas saltadas por celdas inválidas")
    return count


# ============================================================
# EXTRACCION DE FACTURAS (facturasProcesadas)
# ============================================================

def save_extraccion(session_id, df):
    """Inserts PDF extraction data into extraccion_facturas.
    Maps: Factura->factura, Pais->pais_code, Fecha->fecha, Auto->auto,
          Chasis->chasis, J y N->j_y_n, Amount->amount, Moneda->moneda,
          Leyenda->leyenda, Filename->filename
    Returns number of rows inserted."""
    # Deduplicar: un mismo chasis+factura puede aparecer en multiples PDFs (copias).
    # Conservamos solo la primera ocurrencia por (Chasis, primeros 8 chars de Factura).
    df = df.copy()
    df['_fact8'] = df['Factura'].astype(str).str[:8]
    df = df.drop_duplicates(subset=['Chasis', '_fact8'], keep='first')
    df = df.drop(columns=['_fact8'])

    conn = get_connection()
    count = 0

    for _, row in df.iterrows():
        pais = str(row.get('Pais', '')) if pd.notna(row.get('Pais')) else None
        if pais:
            conn.execute(
                "INSERT OR IGNORE INTO paises (codigo, nombre) VALUES (?, ?)",
                (pais, pais)
            )

        conn.execute(
            """INSERT INTO extraccion_facturas
               (session_id, factura, pais_code, fecha, auto, chasis, j_y_n, amount, moneda, leyenda, filename)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id,
             str(row.get('Factura', '')) if pd.notna(row.get('Factura')) else None,
             pais,
             str(row.get('Fecha', '')) if pd.notna(row.get('Fecha')) else None,
             str(row.get('Auto', '')) if pd.notna(row.get('Auto')) else None,
             str(row.get('Chasis', '')) if pd.notna(row.get('Chasis')) else None,
             str(row.get('J y N', '')) if pd.notna(row.get('J y N')) else None,
             str(row.get('Amount', '')) if pd.notna(row.get('Amount')) else None,
             str(row.get('Moneda', '')) if pd.notna(row.get('Moneda')) else None,
             str(row.get('Leyenda', '')) if pd.notna(row.get('Leyenda')) else None,
             str(row.get('Filename', '')) if pd.notna(row.get('Filename')) else None)
        )
        count += 1

    conn.commit()
    conn.close()
    return count


# ============================================================
# IMPORTACIONES (Concentrado2)
# ============================================================

def save_concentrado2(session_id, df):
    """Inserts Concentrado2 data into importaciones + pedimentos.
    Resolves pedimento_id and catalogo_id via lookups.
    Returns number of rows inserted."""
    conn = get_connection()

    # Build catalogo lookup for this session: auto_code -> id
    catalogo_rows = conn.execute(
        "SELECT id, auto_code FROM catalogo_vehiculos WHERE session_id = ?",
        (session_id,)
    ).fetchall()
    catalogo_lookup = {r['auto_code']: r['id'] for r in catalogo_rows}

    # Build pedimento lookup for this session: numero -> id
    pedimento_lookup = {}

    count = 0
    for _, row in df.iterrows():
        # Resolve or create pedimento
        pedimento_num = str(row.get('PEDIMENTO', '')) if pd.notna(row.get('PEDIMENTO')) else None
        pedimento_id = None
        if pedimento_num:
            if pedimento_num not in pedimento_lookup:
                patente = str(row.get('PATENTE', '')) if pd.notna(row.get('PATENTE')) else None
                fecha_ped = str(row.get('FECHA PEDIMENTO', '')) if pd.notna(row.get('FECHA PEDIMENTO')) else None
                aduana = str(row.get('ADUANA', '')) if pd.notna(row.get('ADUANA')) else None

                cursor = conn.execute(
                    """INSERT OR IGNORE INTO pedimentos
                       (session_id, numero_pedimento, patente, fecha_pedimento, aduana)
                       VALUES (?, ?, ?, ?, ?)""",
                    (session_id, pedimento_num, patente, fecha_ped, aduana)
                )
                if cursor.lastrowid:
                    pedimento_lookup[pedimento_num] = cursor.lastrowid
                else:
                    row_ped = conn.execute(
                        "SELECT id FROM pedimentos WHERE session_id = ? AND numero_pedimento = ?",
                        (session_id, pedimento_num)
                    ).fetchone()
                    pedimento_lookup[pedimento_num] = row_ped['id'] if row_ped else None

            pedimento_id = pedimento_lookup.get(pedimento_num)

        # Resolve catalogo_id
        auto_code = str(row.get('AUTO', '')) if pd.notna(row.get('AUTO')) else None
        catalogo_id = catalogo_lookup.get(auto_code) if auto_code else None

        # Resolve pais
        pais = str(row.get('PAIS', '')) if pd.notna(row.get('PAIS')) else None
        if pais:
            conn.execute(
                "INSERT OR IGNORE INTO paises (codigo, nombre) VALUES (?, ?)",
                (pais, pais)
            )

        # Parse precio
        precio_str = str(row.get('PRECIO', '')) if pd.notna(row.get('PRECIO')) else None
        precio = None
        if precio_str:
            try:
                precio = float(precio_str)
            except (ValueError, TypeError):
                precio = None

        conn.execute(
            """INSERT INTO importaciones
               (session_id, pedimento_id, catalogo_id, id_dwh, auto_code, factura,
                fecha_factura, chasis, precio, j_y_n, pais_code, pais_witness)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id, pedimento_id, catalogo_id,
             str(row.get('ID', '')) if pd.notna(row.get('ID')) else None,
             auto_code,
             str(row.get('FACT', '')) if pd.notna(row.get('FACT')) else None,
             str(row.get('FECFACT', '')) if pd.notna(row.get('FECFACT')) else None,
             str(row.get('CHASIS', '')) if pd.notna(row.get('CHASIS')) else None,
             precio,
             str(row.get('J y N', '')) if pd.notna(row.get('J y N')) else None,
             pais,
             str(row.get('PAIS_WITNESS', '')) if pd.notna(row.get('PAIS_WITNESS')) else None)
        )
        count += 1

    conn.commit()
    conn.close()
    return count


# ============================================================
# ESTADISTICO RESULTS
# ============================================================

def save_estadistico_results(session_id, result_dict):
    """Persists the dataTablasSalida dict from estadistico_v4:
    - Saves CUPOS_INVERSION and CUPOS_PRODUCCION to cupos table
    - Saves SEGUIMIENTO_MENSUAL to seguimiento_mensual table
    """
    conn = get_connection()

    # Save cupos
    for tipo_key, tipo_val in [('CUPOS_PRODUCCION', 'PRODUCCION'), ('CUPOS_INVERSION', 'INVERSION')]:
        cupos_list = result_dict.get(tipo_key, [])
        for cupo in cupos_list:
            conn.execute(
                """INSERT INTO cupos
                   (session_id, tipo, numero_autorizacion, cantidad_inicial, pdf_path)
                   VALUES (?, ?, ?, ?, ?)""",
                (session_id, tipo_val,
                 cupo.get('cupo', ''),
                 cupo.get('cantidad', 0),
                 cupo.get('path', ''))
            )

    # Save seguimiento mensual
    seguimiento = result_dict.get('SEGUIMIENTO_MENSUAL', [])
    for mes_data in seguimiento:
        conn.execute(
            """INSERT INTO seguimiento_mensual
               (session_id, mes, mes_nombre, cupo_produccion_activo,
                disponible_produccion_inicio, cupo_inversion_activo,
                disponible_inversion_inicio, consumo_total, consumo_produccion,
                consumo_inversion, disponible_produccion_fin,
                disponible_inversion_fin, acumulado_total)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id,
             mes_data.get('month', 0),
             mes_data.get('month_name', ''),
             mes_data.get('cupo_produccion_activo', ''),
             mes_data.get('disponible_produccion_inicio', 0),
             mes_data.get('cupo_inversion_activo', ''),
             mes_data.get('disponible_inversion_inicio', 0),
             mes_data.get('consumo_total', 0),
             mes_data.get('consumo_produccion', 0),
             mes_data.get('consumo_inversion', 0),
             mes_data.get('disponible_produccion_fin', 0),
             mes_data.get('disponible_inversion_fin', 0),
             mes_data.get('acumulado', 0))
        )

    # Update cupo consumption from transitions
    for tipo_key, tipo_val in [('TRANSICIONES_PRODUCCION', 'PRODUCCION'), ('TRANSICIONES_INVERSION', 'INVERSION')]:
        transitions = result_dict.get(tipo_key, [])
        for trans in transitions:
            exhausted = trans.get('quota_exhausted', {})
            if exhausted:
                conn.execute(
                    """UPDATE cupos SET
                       cantidad_consumida = cantidad_inicial,
                       cantidad_saldo = 0,
                       mes_agotado = ?
                       WHERE session_id = ? AND tipo = ? AND numero_autorizacion = ?""",
                    (trans.get('month_name', ''),
                     session_id, tipo_val,
                     exhausted.get('cupo', ''))
                )

    conn.commit()
    conn.close()


# ============================================================
# FACTURAS ERRORES Y FALTANTES
# ============================================================

def migrate_add_error_message():
    """Adds error_message column to facturas_errores if it doesn't exist (safe migration)."""
    conn = get_connection()
    cols = [r[1] for r in conn.execute("PRAGMA table_info(facturas_errores)").fetchall()]
    if 'error_message' not in cols:
        conn.execute("ALTER TABLE facturas_errores ADD COLUMN error_message TEXT")
        conn.commit()
    conn.close()


def migrate_add_artefacto_hash():
    """Adds ag_artefactos.hash if missing (content-hash dedupe, C5). Guarded
    ADD COLUMN — FK-safe (ag_fragmentos references ag_artefactos), unlike a
    recreate. Fresh DBs already have it from AG_SCHEMA_SQL; this covers the
    ones created before the column existed."""
    conn = get_connection()
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(ag_artefactos)").fetchall()]
        if cols and 'hash' not in cols:
            conn.execute("ALTER TABLE ag_artefactos ADD COLUMN hash TEXT")
            conn.commit()
    finally:
        conn.close()


def save_facturas_errors(session_id, error_list, errores_detalle=None):
    """Persists list of PDF filenames that failed extraction.
    errores_detalle: dict {filename: {'categoria': ..., 'mensaje': ...}} from PDFs_to_excel
    """
    if errores_detalle is None:
        errores_detalle = {}
    conn = get_connection()
    for filepath in error_list:
        filename = os.path.basename(filepath)
        detalle = errores_detalle.get(filename, {})
        categoria = detalle.get('categoria', 'parsing_failed')
        mensaje = detalle.get('mensaje', '')
        conn.execute(
            "INSERT INTO facturas_errores (session_id, filename, error_type, error_message) VALUES (?, ?, ?, ?)",
            (session_id, filename, categoria, mensaje)
        )
    conn.commit()
    conn.close()


def get_errores_session(session_id):
    """Returns list of error records for a given session."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, filename, error_type, error_message, created_at FROM facturas_errores WHERE session_id = ? ORDER BY id",
        (session_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_facturas_faltantes(session_id, faltantes):
    """Persists list of facturas missing J y N."""
    conn = get_connection()
    for factura in faltantes:
        if factura and str(factura) != 'nan':
            conn.execute(
                "INSERT INTO facturas_faltantes (session_id, factura) VALUES (?, ?)",
                (session_id, str(factura))
            )
    conn.commit()
    conn.close()


# ============================================================
# INSUMOS (archivos de entrada)
# ============================================================

def _file_md5(filepath):
    """Calculate MD5 hash of a file."""
    h = hashlib.md5()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()


def copy_insumos_to_persistent(session_id, upload_dirs, data_dir):
    """Copies all input files from uploads/ to the persistent data volume.
    Registers each file in the insumos_archivos table.

    upload_dirs: dict mapping tipo -> source directory path
    data_dir: base persistent data directory (e.g., /ara/API_Aduanas/data)
    """
    conn = get_connection()

    tipo_map = {
        'facturas': 'factura_pdf',
        'dwh': 'dwh',
        'incrementales': 'incrementales',
        'pdfInversion': 'pdf_inversion',
        'pdfProduccion': 'pdf_produccion',
        'historico': 'historico',
    }

    for dir_key, source_dir in upload_dirs.items():
        if not os.path.exists(source_dir):
            continue

        tipo = tipo_map.get(dir_key, dir_key)
        dest_dir = os.path.join(data_dir, 'insumos', str(session_id), dir_key)
        os.makedirs(dest_dir, exist_ok=True)

        for root, _, files in os.walk(source_dir):
            for filename in files:
                if filename.startswith('.'):
                    continue

                src_path = os.path.join(root, filename)
                dst_path = os.path.join(dest_dir, filename)

                shutil.copy2(src_path, dst_path)

                file_size = os.path.getsize(src_path)
                file_hash = _file_md5(src_path)

                conn.execute(
                    """INSERT INTO insumos_archivos
                       (session_id, tipo_archivo, nombre_original, ruta_almacenada, tamanio_bytes, hash_md5)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (session_id, tipo, filename, dst_path, file_size, file_hash)
                )

    conn.commit()
    conn.close()


# ============================================================
# PROCESO HISTORICO (consulta SQL directa)
# ============================================================

def get_historico_concentrado2(session_ids=None):
    """Genera el Concentrado2 historico leyendo directamente de la BD via SQL.

    Equivale al resultado de Concentrado2() pero usando JOINs SQL sobre los datos
    ya almacenados en importaciones, extraccion_facturas, catalogo_vehiculos, etc.
    Mucho mas eficiente que re-correr los scripts Python cuando hay muchos registros.

    Args:
        session_ids: lista de session_id a incluir. None = todas las sesiones.

    Returns:
        DataFrame con columnas: ID, AUTO, FACT, FECFACT, CHASIS, PRECIO, TIPO,
        FRACCION, PAIS, PATENTE, PEDIMENTO, FECHA PEDIMENTO, FLETES, SEGUROS,
        ADUANA, MARCA, J y N, PAIS_WITNESS, AMOUNT, MONEDA
    """
    conn = get_connection()

    filter_clause = ""
    params = []
    if session_ids:
        placeholders = ",".join("?" * len(session_ids))
        filter_clause = f"WHERE i.session_id IN ({placeholders})"
        params = list(session_ids)

    query = f"""
        SELECT
            i.id_dwh           AS ID,
            i.auto_code        AS AUTO,
            i.factura          AS FACT,
            i.fecha_factura    AS FECFACT,
            i.chasis           AS CHASIS,
            i.precio           AS PRECIO,
            c.tipo             AS TIPO,
            c.fraccion         AS FRACCION,
            COALESCE(ef.pais_code, i.pais_code) AS PAIS,
            p.patente          AS PATENTE,
            p.numero_pedimento AS PEDIMENTO,
            p.fecha_pedimento  AS "FECHA PEDIMENTO",
            c.fletes           AS FLETES,
            c.seguros          AS SEGUROS,
            p.aduana           AS ADUANA,
            m.nombre           AS MARCA,
            CASE
                WHEN ef.j_y_n = 'C.O' AND ef.pais_code = 'USA' THEN 'J'
                WHEN ef.j_y_n = 'C.O' AND ef.pais_code = 'BRA' THEN 'C.O'
                WHEN ef.j_y_n = 'CUPO' AND ef.pais_code = 'IND' THEN 'N'
                ELSE COALESCE(ef.j_y_n, i.j_y_n)
            END                AS "J y N",
            CASE
                WHEN ef.pais_code IS NULL
                  OR ef.pais_code = i.pais_code THEN 'sin cambio'
                ELSE ef.pais_code
            END                AS PAIS_WITNESS,
            ef.amount          AS AMOUNT,
            ef.moneda          AS MONEDA
        FROM importaciones i
        LEFT JOIN (
            SELECT chasis,
                   SUBSTR(factura, 1, 8) AS fact8,
                   pais_code, j_y_n, amount, moneda
            FROM extraccion_facturas
            GROUP BY chasis, SUBSTR(factura, 1, 8)
        ) ef ON  i.chasis = ef.chasis
             AND SUBSTR(i.factura, 1, 8) = ef.fact8
        LEFT JOIN catalogo_vehiculos c  ON i.catalogo_id = c.id
        LEFT JOIN marcas m              ON c.marca_id = m.id
        LEFT JOIN pedimentos p          ON i.pedimento_id = p.id
        {filter_clause}
        ORDER BY i.session_id, i.id
    """

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return pd.DataFrame([dict(r) for r in rows])


def get_facturas_faltantes_historico(session_ids=None):
    """Devuelve lista de facturas sin match en extraccion_facturas (historico)."""
    conn = get_connection()

    filter_clause = ""
    params = []
    if session_ids:
        placeholders = ",".join("?" * len(session_ids))
        filter_clause = f"AND i.session_id IN ({placeholders})"
        params = list(session_ids)

    query = f"""
        SELECT DISTINCT i.factura
        FROM importaciones i
        LEFT JOIN extraccion_facturas ef
            ON  i.chasis = ef.chasis
            AND SUBSTR(i.factura, 1, 8) = SUBSTR(ef.factura, 1, 8)
        WHERE ef.chasis IS NULL
          AND i.factura != '*'
          {filter_clause}
    """

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [r['factura'] for r in rows]


# ============================================================
# DEDUPLICACION
# ============================================================

def dedup_extraccion_facturas():
    """Elimina duplicados de extraccion_facturas conservando el registro con id minimo
    por grupo (session_id, chasis, primeros 8 chars de factura).

    Los duplicados surgen cuando la misma factura existe en varios archivos PDF
    (original + copias: _cc, _1, etc.). Esta funcion es idempotente.

    Returns:
        int: numero de filas eliminadas.
    """
    conn = get_connection()
    conn.execute("""
        DELETE FROM extraccion_facturas
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM extraccion_facturas
            GROUP BY session_id, chasis, SUBSTR(factura, 1, 8)
        )
    """)
    affected = conn.total_changes
    conn.commit()
    conn.close()
    return affected
