import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

import datetime
import shutil
import tempfile
import traceback
import zipfile

import pandas as pd
from flask import (  # type: ignore
    Flask, request, render_template, redirect, send_from_directory,
    send_file, jsonify, session,
)
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException

# Nota: las herramientas del pipeline legado (PDFs_to_excel, Concentrado,
# Concentrado2, estadistico_v4) arrastran el stack de data-science
# (tabula/bokeh/matplotlib) y se importan PEREZOSAMENTE dentro de los
# handlers de /procesar. Así la app —y sus rutas AUTOGENES/tableros—
# importa sin ese stack, y la red de pruebas HTTP corre en CI liviano.


def _read_excel(path, **kwargs):
    """Lee un Excel con engine apropiado; si openpyxl falla intenta xlrd."""
    if str(path).lower().endswith('.xls'):
        return pd.read_excel(path, engine='xlrd', **kwargs)
    try:
        return pd.read_excel(path, engine='openpyxl', **kwargs)
    except Exception:
        return pd.read_excel(path, engine='xlrd', **kwargs)


# Columnas que el pipeline legado (concentrado1.Concentrado) exige del archivo
# de Divisiones — la ranura «Incrementales» de la ingesta. El pipelegado NO se
# toca: fuerza engine='openpyxl' (solo .xlsx) y hace df['CLAVES'] directo, así
# que un .xls viejo revienta con BadZipFile y un archivo equivocado con
# KeyError. Se normaliza y valida en el BORDE antes de entrar al pipeline.
_COLS_DIVISIONES = ['CLAVES', 'Tipo', 'FRACCIÓN', 'Pais',
                    'Seguro (Incrementables)', 'Flete (Incrementables)', 'MARCA']


def _preparar_divisiones(path):
    """Normaliza el archivo de Divisiones para el pipeline legado, sin tocarlo:
    lo lee con el engine correcto (.xls→xlrd, .xlsx→openpyxl), valida que traiga
    las columnas que Concentrado necesita y —si venía en .xls— lo reescribe como
    .xlsx (el pipeline solo lee openpyxl). Devuelve la ruta lista para el pipeline.
    Lanza ConcentradoError con un mensaje accionable si el archivo no sirve."""
    nombre = os.path.basename(path)
    try:
        df = _read_excel(path)
    except Exception as e:
        raise ConcentradoError(
            f"No se pudo leer «{nombre}» como Excel. La ranura Incrementales espera "
            f"el archivo de Divisiones en formato .xls o .xlsx. Detalle: {e}")
    faltan = [c for c in _COLS_DIVISIONES if c not in df.columns]
    if faltan:
        raise ConcentradoError(
            f"«{nombre}» no parece el archivo de Divisiones: faltan las columnas "
            + ", ".join(faltan) + ". Sube el archivo de Divisiones con sus 7 columnas "
            "(CLAVES, Tipo, FRACCIÓN, Pais, Seguro (Incrementables), "
            "Flete (Incrementables), MARCA) en la ranura Incrementales.")
    if str(path).lower().endswith('.xlsx'):
        return path
    # .xls (u otro): reescribe a .xlsx para que el pipeline (openpyxl) lo lea
    destino = os.path.splitext(path)[0] + '.norm.xlsx'
    df.to_excel(destino, index=False)
    return destino


# Tope de expansión al descomprimir un ZIP subido. MAX_CONTENT_LENGTH
# acota el ARCHIVO (50 MB) pero no lo DESCOMPRIMIDO: un zip bomba de 50 MB
# puede expandir a gigabytes y llenar el disco.
_MAX_UNZIPPED_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB


def _extraer_zip_seguro(zip_path, destino):
    """Extrae un ZIP abortando si la suma descomprimida supera el tope.
    Lanza FileUploadError (400 vía errorhandler) si excede o está corrupto."""
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        total = sum(info.file_size for info in zip_ref.infolist())
        if total > _MAX_UNZIPPED_BYTES:
            raise FileUploadError(
                f"El ZIP se expande a {total // (1024*1024)} MB, supera el "
                f"tope de {_MAX_UNZIPPED_BYTES // (1024*1024*1024)} GB.")
        zip_ref.extractall(destino)


# --- Persistencia SQLite (Gnosis AI) ---
from database import init_db
from database.persistence import (
    create_session, update_session_stats, save_catalogo_vehiculos,
    save_extraccion, save_concentrado2, save_estadistico_results,
    save_facturas_errors, save_facturas_faltantes, copy_insumos_to_persistent,
    migrate_add_error_message, migrate_add_artefacto_hash,
    get_errores_session, get_latest_session_id
)
from database.backup import backup_database

UPLOAD_FOLDER = os.path.dirname(os.path.abspath(__file__)) + '/uploads'
DOWNLOAD_FOLDER = os.path.dirname(os.path.abspath(__file__)) + '/downloads'
DATA_DIR_TICKETS = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['DOWNLOAD_FOLDER'] = DOWNLOAD_FOLDER
# Una carga jamas debe poder tumbar el proceso, pero un ZIP mensual de
# facturas rebasa 50 MB con facilidad; el guardia real contra zip-bombs
# es _MAX_UNZIPPED_BYTES al extraer.
app.config['MAX_CONTENT_LENGTH'] = 300 * 1024 * 1024
# Los tickets de traceback viven aparte de DOWNLOAD_FOLDER: ese directorio se
# sirve entero por /download/<filename> y un traceback no es una descarga de
# negocio (ver log_error_to_file y la ruta /ticket/<filename>).
app.config['TICKET_FOLDER'] = os.path.join(DATA_DIR_TICKETS, 'tickets')


# ── candado de operador (opcional): con GNOSIS_TOKEN en el entorno,
# toda mutación —y toda LECTURA sensible— exige el header X-Gnosis-Token.
# Sin la variable el candado no existe: el uso local de un solo operador no
# cambia en nada.

#: Prefijos de LECTURA que entregan dato del expediente o configuración del
#: operador. El contenedor escucha en 0.0.0.0, y estas rutas servían con
#: nombres FIJOS y adivinables (`/download/ZipGeneral.zip` es el concentrado
#: aduanal completo del mes: VIN, facturas y precios). Un candado que solo
#: cubre POST protege la escritura y deja la lectura abierta a la red.
_LECTURA_PROTEGIDA = (
    '/download/',
    '/errores/download',
    '/api/v1/admin/',
    '/admin/',
    '/ticket/',
)


@app.before_request
def _candado_operador():
    esperado = os.environ.get('GNOSIS_TOKEN')
    if not esperado:
        return None
    # El candado se ancla al MÉTODO mutante, no al prefijo /api/: rutas
    # destructivas como /processing, /procesar/*, /admin/dedup y
    # /errores/delete no viven bajo /api/ y antes quedaban libres.
    mutante = request.method in ('POST', 'PUT', 'DELETE', 'PATCH')
    lectura_sensible = request.path.startswith(_LECTURA_PROTEGIDA)
    if mutante or lectura_sensible:
        if request.headers.get('X-Gnosis-Token') != esperado:
            return jsonify({'error': 'Token de operador requerido'}), 401
    return None


# La cookie de sesión se firma con SECRET_KEY: sin un valor fuerte en el
# entorno, un tercero forja la cookie. Sin default embebido — si no está
# la env var, se genera una efímera por-proceso (invalida sesiones al
# reiniciar, que es lo correcto para un default inseguro ausente).
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY') or os.urandom(32)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

# Blueprints: familias de rutas extraídas de app.py (ver rutas/).
from rutas.tableros import bp as tableros_bp
from rutas.autogenes import bp as autogenes_bp
app.register_blueprint(tableros_bp)
app.register_blueprint(autogenes_bp)

# Inicializar base de datos SQLite al arrancar
init_db()
migrate_add_error_message()
migrate_add_artefacto_hash()


@app.route('/health')
def health():
    return jsonify({"status": "ok"}), 200


def clean_directory(directory_path):
    if not os.path.exists(directory_path):
        return  # nothing to clean

    for file in os.listdir(directory_path):
        file_path = os.path.join(directory_path, file)

        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)

        except Exception as e:
            print(f"Failed to delete {file_path}. Reason: {e}")
            raise  # let the caller decide what to do

#Custom Exception Classes
class FileUploadError(Exception):
    """Raised when there is an issue with file uploads."""
    pass

class PDFProcessingError(Exception):
    """Raised when there is an issue processing PDFs."""
    pass

class ConcentradoError(Exception):
    """Raised when there is an issue generating Concentrado files."""
    pass

class EstadisticoError(Exception):
    """Raised when there is an issue creating the Estadistico."""
    pass



def log_error_to_file(error_type, error_message, error_traceback):
    """
    Creates a detailed error log file in the downloads folder.
    
    Args:
        error_type: Type of error (e.g., FileUploadError, Exception)
        error_message: The error message
        error_traceback: The full traceback string
    
    Returns:
        str: Path to the created error log file
    """
    timestamp_filename = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    timestamp_display = datetime.datetime.now().strftime("%Y/%m/%d %H:%M:%S")
    log_filename = f"Ticket_de_Servicio_ADUANAS_{timestamp_filename}.txt"
    # FUERA del árbol servible: un traceback nombra rutas de disco, consultas
    # y fragmentos de dato, y `/download/<filename>` entregaba el directorio
    # entero. El ticket sigue existiendo y el operador lo baja por su ruta
    # propia, que sí pasa por el candado.
    carpeta = app.config['TICKET_FOLDER']
    log_filepath = os.path.join(carpeta, log_filename)
    # el manejador de errores no puede fallar: sin este directorio, el
    # ticket que explica el error moría en FileNotFoundError y el 500
    # original se perdía tras un segundo 500
    os.makedirs(carpeta, exist_ok=True)

    with open(log_filepath, 'w', encoding='utf-8') as log_file:
        log_file.write("="*80 + "\n")
        log_file.write(f"Ticket de Servicio - ADUANAS PROCESO 1 - {timestamp_display}\n")
        log_file.write("="*80 + "\n")

        log_file.write("Para ayudarle a corregir este error, le pedimos por favor seguir estos pasos:\n\n")
        log_file.write("1. Envíe este Ticket de Servicio a los correos electrónicos que se indican a continuación.\n")
        log_file.write("\n\t- eruiz@gestell.co\n")
        log_file.write("\t- soporte@gestell.co\n")
        log_file.write("\t- drpgestell@outlook.com\n\n")
        log_file.write(f"2. En el \"subject\" del correo, incluya la siguiente leyenda: Ticket de Servicio ADUANAS PROCESO 1 - {timestamp_display}\n\n")
        log_file.write("3. Adjunte los archivos insumo que intentó procesar, para que podamos revisar el caso correctamente.\n\n")

        log_file.write("4. Su solicitud será atendida con gusto conforme a nuestra política vigente de Niveles de Servicio (SLA).\n\n")
        log_file.write("Estamos a sus órdenes,\n\n")
        log_file.write("Gestell\n")
        log_file.write("-"*80 + "\n")

        log_file.write("TRACEBACK DEL ERROR\n\n")
        log_file.write(error_traceback)
        log_file.write("\n\n")

        log_file.write(f"ERROR: {error_type.__name__}\n")
        log_file.write(f"Línea del código: {error_message}\n\n")

        log_file.write("=" * 80 + "\n\n")



    return log_filename






# Error Handlers
@app.errorhandler(413)
def handle_request_too_large(e):
    limite_mb = app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)
    mensaje = (f"El archivo supera el tope de {limite_mb} MB por carga. "
               "Divide las facturas en varios ZIP y súbelos uno por uno.")
    if request.path.startswith('/procesar/'):
        return jsonify({'error': mensaje}), 413
    return render_template('error.html', error_message=mensaje, log_file=None), 413


@app.errorhandler(FileUploadError)
def handle_file_upload_error(e):
    error_traceback = traceback.format_exc()
    log_filename = log_error_to_file(FileUploadError, str(e), error_traceback)

    if request.path.startswith('/procesar/'):
        return jsonify({'error': str(e)}), 400
    return render_template('error.html',
                         error_message="Error durante la carga: " + str(e),
                         log_file=log_filename), 400
@app.errorhandler(PDFProcessingError)
def handle_pdf_processing_error(e):
    error_traceback = traceback.format_exc()
    log_filename = log_error_to_file(FileUploadError, str(e), error_traceback)
   
    return render_template('error.html', 
                         error_message="Error durante el procesamiento de PDFs: " + str(e),
                         log_file=log_filename), 400
@app.errorhandler(ConcentradoError)
def handle_concentrado_error(e):
    error_traceback = traceback.format_exc()
    log_filename = log_error_to_file(ConcentradoError, str(e), error_traceback)
   
    return render_template('error.html', 
                         error_message="Error generando Concentrado: " + str(e),
                         log_file=log_filename), 500


@app.errorhandler(EstadisticoError)
def handle_estadistico_error(e):
    error_traceback = traceback.format_exc()
    log_filename = log_error_to_file(EstadisticoError, str(e), error_traceback)
   
    return render_template('error.html', 
                         error_message="Error creando Estadistico: " + str(e),
                         log_file=log_filename), 500

@app.errorhandler(HTTPException)
def handle_http_exception(e):
    """HTTP status exceptions (404, 405, 413…) keep their true code — the
    generic handler below must not bury them as 500. API paths answer in
    JSON so clients get a machine-readable status, not an HTML page."""
    if request.path.startswith('/api/'):
        return jsonify({'error': e.description, 'status': e.code}), e.code
    return render_template('error.html',
                           error_message=f"{e.code} · {e.name}",
                           log_file=None), e.code


@app.errorhandler(Exception)
def handle_generic_error(e):
    error_traceback = traceback.format_exc()
    log_filename = log_error_to_file(type(e), str(e), error_traceback)
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Error inesperado', 'status': 500}), 500
    return render_template('error.html',
                         error_message="Error inesperado: " + str(e),
                         log_file=log_filename), 500

# Tableros de análisis disponibles (rechazos, cupo, rutas, dominio, maduración):
# es el conteo real de vistas, no una métrica de sesión inventada.
_TABLEROS_DISPONIBLES = 5


@app.route('/', methods=['GET'])
def dashboard():
    """Pagina principal — landing INICIO (celda) + dashboard desplegable."""
    from database import get_connection
    from database.persistence import get_all_sessions, get_latest_session_id, get_errores_session
    from celda import construir_celda_svg, kpis_de_sesion

    # La celda INICIO en estado latente (sin sesión): todo declarado «—».
    _celda_latente = dict(session_id=None, vehiculos=None, facturas=None,
                          faltantes=None, errores=None, entidades=None,
                          conciliado_pct=None, valor_total=None, tableros=_TABLEROS_DISPONIBLES)

    _empty = dict(
        empty=True, sessions=[], current_session=None,
        stats={'total_importaciones': 0, 'total_extraccion': 0,
               'total_faltantes': 0, 'total_errores': 0},
        por_marca=[], por_pais=[], por_jyn=[], por_aduana=[], por_fraccion=[], por_moneda=[],
        has_graphs=False, has_zip=False, has_historico_zip=False,
        fase1_stats={'total': 0, 'exitosos': 0, 'registros': 0, 'errores': 0},
        historico_sessions=0, errores_count=0, errores=[], session_id=None,
        viz_data={}, data={},
        celda_svg=construir_celda_svg(_celda_latente),
        celda_kpis=kpis_de_sesion(_celda_latente),
    )

    try:
        conn = get_connection()
        sid = get_latest_session_id()

        # Fase 1 stats
        fase1_stats = {'total': 0, 'exitosos': 0, 'registros': 0, 'errores': 0}
        errores_count = 0
        if sid:
            ep = conn.execute("SELECT COUNT(DISTINCT filename) as cnt FROM extraccion_facturas WHERE session_id = ?", (sid,)).fetchone()
            er = conn.execute("SELECT COUNT(*) as cnt FROM extraccion_facturas WHERE session_id = ?", (sid,)).fetchone()
            ef = conn.execute("SELECT COUNT(*) as cnt FROM facturas_errores WHERE session_id = ?", (sid,)).fetchone()
            fase1_stats['exitosos']  = ep['cnt']
            fase1_stats['registros'] = er['cnt']
            fase1_stats['errores']   = ef['cnt']
            fase1_stats['total']     = ep['cnt'] + ef['cnt']
            errores_count = ef['cnt']

        # Historico sessions
        hr = conn.execute(
            """SELECT COUNT(DISTINCT session_id) as cnt FROM insumos_archivos
               WHERE tipo_archivo = 'dwh'
               AND session_id IN (
                   SELECT DISTINCT session_id FROM insumos_archivos
                   WHERE tipo_archivo = 'incrementales'
               )"""
        ).fetchone()
        historico_sessions = hr['cnt'] if hr else 0

        sessions = get_all_sessions()
        if not sessions:
            conn.close()
            return render_template('main.html', **dict(_empty,
                fase1_stats=fase1_stats,
                historico_sessions=historico_sessions,
                errores_count=errores_count))

        session_id = request.args.get('session_id')
        session_id = int(session_id) if session_id else get_latest_session_id()

        current_session = conn.execute(
            "SELECT * FROM processing_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not current_session:
            conn.close()
            return render_template('main.html', **dict(_empty,
                sessions=sessions,
                fase1_stats=fase1_stats,
                historico_sessions=historico_sessions,
                errores_count=errores_count))
        current_session = dict(current_session)

        stats = {}
        for table, key in [('importaciones', 'total_importaciones'),
                            ('extraccion_facturas', 'total_extraccion'),
                            ('facturas_faltantes', 'total_faltantes'),
                            ('facturas_errores', 'total_errores')]:
            row = conn.execute(f"SELECT COUNT(*) as cnt FROM {table} WHERE session_id = ?", (session_id,)).fetchone()
            stats[key] = row['cnt']

        por_marca = [dict(r) for r in conn.execute(
            """SELECT m.nombre, COUNT(*) as total FROM importaciones i
               JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
               JOIN marcas m ON c.marca_id = m.id
               WHERE i.session_id = ? GROUP BY m.nombre ORDER BY total DESC""",
            (session_id,)).fetchall()]

        por_pais = [dict(r) for r in conn.execute(
            """SELECT i.pais_code, p.nombre as pais_nombre, COUNT(*) as total
               FROM importaciones i
               LEFT JOIN paises p ON i.pais_code = p.codigo
               WHERE i.session_id = ? GROUP BY i.pais_code ORDER BY total DESC""",
            (session_id,)).fetchall()]

        por_jyn = [dict(r) for r in conn.execute(
            "SELECT j_y_n, COUNT(*) as total FROM importaciones WHERE session_id = ? GROUP BY j_y_n",
            (session_id,)).fetchall()]

        # ── Desgloses adicionales (read-only · no fatales): aduana, fracción arancelaria, moneda ──
        try:
            por_aduana = [dict(r) for r in conn.execute(
                "SELECT aduana, COUNT(*) as total FROM pedimentos WHERE session_id = ? AND aduana IS NOT NULL AND aduana != '' GROUP BY aduana ORDER BY total DESC",
                (session_id,)).fetchall()]
        except Exception:
            por_aduana = []
        try:
            por_fraccion = [dict(r) for r in conn.execute(
                """SELECT c.fraccion, COUNT(*) as total FROM importaciones i
                   JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
                   WHERE i.session_id = ? AND c.fraccion IS NOT NULL AND c.fraccion != ''
                   GROUP BY c.fraccion ORDER BY total DESC LIMIT 12""",
                (session_id,)).fetchall()]
        except Exception:
            por_fraccion = []
        try:
            por_moneda = [dict(r) for r in conn.execute(
                "SELECT COALESCE(NULLIF(moneda,''),'—') as moneda, COUNT(*) as total FROM extraccion_facturas WHERE session_id = ? GROUP BY moneda ORDER BY total DESC",
                (session_id,)).fetchall()]
        except Exception:
            por_moneda = []

        # ── GNOSIS deep-tech viz data contract (read-only aggregations · Decisión 1A) ──
        # Solo lectura; si algo falla, el dashboard sigue renderizando sin viz_data.
        viz_data = {}
        try:
            # Flujo país × marca × preferencia (+ valor) — chord / flow-to-reservoir
            viz_data['flujo'] = [dict(r) for r in conn.execute(
                """SELECT COALESCE(p.nombre, i.pais_code) AS pais, m.nombre AS marca,
                          i.j_y_n AS jn, COUNT(*) AS n, COALESCE(SUM(i.precio), 0) AS valor
                   FROM importaciones i
                   JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
                   JOIN marcas m ON c.marca_id = m.id
                   LEFT JOIN paises p ON i.pais_code = p.codigo
                   WHERE i.session_id = ? GROUP BY pais, marca, jn""",
                (session_id,)).fetchall()]

            # Serie diaria por marca y país — Manhattan (z-score) + heatmap marca×mes
            viz_data['serie_diaria'] = [dict(r) for r in conn.execute(
                """SELECT substr(i.fecha_factura, 1, 8) AS fecha, m.nombre AS marca,
                          COALESCE(p.nombre, i.pais_code) AS pais, COUNT(*) AS n
                   FROM importaciones i
                   JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
                   JOIN marcas m ON c.marca_id = m.id
                   LEFT JOIN paises p ON i.pais_code = p.codigo
                   WHERE i.session_id = ? AND i.fecha_factura IS NOT NULL
                   GROUP BY fecha, marca, pais""",
                (session_id,)).fetchall()]

            # Jerarquía marca → modelo (tipo) — icicle / dendrograma
            viz_data['jerarquia_modelo'] = [dict(r) for r in conn.execute(
                """SELECT m.nombre AS marca, c.tipo AS tipo, COUNT(*) AS n
                   FROM importaciones i
                   JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
                   JOIN marcas m ON c.marca_id = m.id
                   WHERE i.session_id = ? GROUP BY marca, tipo""",
                (session_id,)).fetchall()]

            # Cupos — reservorio (flow-to-reservoir / waterfall)
            viz_data['cupo'] = [dict(r) for r in conn.execute(
                """SELECT tipo, cantidad_inicial, cantidad_consumida, cantidad_saldo
                   FROM cupos WHERE session_id = ?""",
                (session_id,)).fetchall()]

            # Flota por código/VIN — árbol circular VIN (T1)
            viz_data['flota'] = [dict(r) for r in conn.execute(
                """SELECT i.auto_code AS auto, c.tipo AS tipo, m.nombre AS marca, COUNT(*) AS n
                   FROM importaciones i
                   JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
                   JOIN marcas m ON c.marca_id = m.id
                   WHERE i.session_id = ? AND i.auto_code IS NOT NULL
                   GROUP BY i.auto_code, c.tipo, m.nombre""",
                (session_id,)).fetchall()]

            # Totales por marca (para taxonomía / dendrograma) — ya es lista de dicts
            viz_data['por_marca'] = por_marca

            # Seguimiento mensual del cupo (trayectoria) — read-only, ya calculado por estadistico_v4.
            # Si la sesión Flask no lo trae (recarga de página o sesión completada revisitada en otro
            # navegador), se lee de la tabla durable `seguimiento_mensual` y se mapea a la MISMA forma
            # que consume la trayectoria en el cliente, para que el tablero nunca quede en "SIN DATOS".
            seg = session.get('data', {}).get('SEGUIMIENTO_MENSUAL', []) or []
            if not seg and session_id:
                try:
                    seg = [dict(
                        month=str(r['mes']), month_name=r['mes_nombre'],
                        consumo_produccion=r['consumo_produccion'], consumo_inversion=r['consumo_inversion'],
                        consumo_total=r['consumo_total'], acumulado_total=r['acumulado_total'],
                        cupo_produccion_activo=r['cupo_produccion_activo'],
                        cupo_inversion_activo=r['cupo_inversion_activo'],
                    ) for r in conn.execute(
                        "SELECT mes, mes_nombre, consumo_produccion, consumo_inversion, consumo_total,"
                        " acumulado_total, cupo_produccion_activo, cupo_inversion_activo"
                        " FROM seguimiento_mensual WHERE session_id = ? ORDER BY mes",
                        (session_id,)).fetchall()]
                except Exception:
                    seg = []
            viz_data['seguimiento'] = seg
            # Agotamientos de cupo (transiciones prod + inv) — read-only, para marcar en la trayectoria
            viz_data['agotamientos'] = (session.get('data', {}).get('TRANSICIONES_PRODUCCION', []) or []) \
                + (session.get('data', {}).get('TRANSICIONES_INVERSION', []) or [])
        except Exception as _e:
            print(f"[Dashboard] viz_data build failed (non-fatal): {_e}")
            viz_data = {}

        # ── Celda INICIO: métricas vivas de la sesión (mismo conn, sin
        # dobles conteos: reusa stats; entidades y valor se leen directo). ──
        try:
            _ent = conn.execute(
                "SELECT COUNT(*) FROM ag_entidades WHERE session_id = ?", (session_id,)
            ).fetchone()[0]
        except Exception:
            _ent = None
        try:
            _valor = conn.execute(
                "SELECT COALESCE(SUM(precio), 0) FROM importaciones WHERE session_id = ?",
                (session_id,)
            ).fetchone()[0]
        except Exception:
            _valor = None
        _veh = stats['total_importaciones']
        _falt = stats['total_faltantes']
        _conf = max(0, min(100, round(100 * (_veh - _falt) / _veh))) if _veh else None
        _celda = dict(
            session_id=session_id, vehiculos=_veh, facturas=stats['total_extraccion'],
            faltantes=_falt, errores=stats['total_errores'], entidades=_ent,
            conciliado_pct=_conf, valor_total=_valor, tableros=_TABLEROS_DISPONIBLES)
        celda_svg = construir_celda_svg(_celda)
        celda_kpis = kpis_de_sesion(_celda)

        conn.close()

        graphs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'plotly_graphs')
        has_graphs = os.path.isfile(os.path.join(graphs_dir, '01.html'))
        has_zip = os.path.isfile(os.path.join(app.config['DOWNLOAD_FOLDER'], 'ZipGeneral.zip'))
        has_historico_zip = os.path.isfile(os.path.join(app.config['DOWNLOAD_FOLDER'], 'Historico_ZipGeneral.zip'))

        errores = get_errores_session(sid) if sid else []

        return render_template('main.html',
            empty=False,
            sessions=sessions,
            current_session=current_session,
            stats=stats,
            por_marca=por_marca,
            por_pais=por_pais,
            por_jyn=por_jyn,
            por_aduana=por_aduana,
            por_fraccion=por_fraccion,
            por_moneda=por_moneda,
            has_graphs=has_graphs,
            has_zip=has_zip,
            has_historico_zip=has_historico_zip,
            fase1_stats=fase1_stats,
            historico_sessions=historico_sessions,
            errores_count=errores_count,
            errores=errores,
            session_id=sid,
            viz_data=viz_data,
            data=session.get('data', {}),
            celda_svg=celda_svg,
            celda_kpis=celda_kpis,
        )
    except Exception as e:
        print(f"[Dashboard] Error: {e}")
        try:
            conn.close()   # no dejar la conexión abierta al degradar (fuga fd/lock WAL)
        except Exception:
            pass
        return render_template('main.html', **_empty)


@app.route('/api/admin/reset', methods=['POST'])
def admin_reset():
    """Empezar de cero: borra la base local, insumos y resultados, y
    reinicia el esquema. SOLO lo dispara el operador con confirmación
    explícita en el cuerpo — un borrado jamás se delega ni se facilita.
    """
    datos = request.get_json(silent=True) or {}
    if datos.get('confirmar') != 'BORRAR':
        return jsonify({'error': 'Confirmación requerida: envía {"confirmar": "BORRAR"}.'}), 400

    from database import DB_PATH, init_db
    session.clear()
    for sufijo in ('', '-wal', '-shm'):
        try:
            os.remove(DB_PATH + sufijo)
        except OSError:
            pass
    init_db()

    def _vaciar(directorio):
        if not os.path.isdir(directorio):
            return
        for nombre in os.listdir(directorio):
            ruta = os.path.join(directorio, nombre)
            try:
                if os.path.isdir(ruta):
                    shutil.rmtree(ruta, ignore_errors=True)
                else:
                    os.remove(ruta)
            except OSError:
                pass

    _vaciar(app.config['UPLOAD_FOLDER'])
    _vaciar(app.config['DOWNLOAD_FOLDER'])
    _vaciar(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'plotly_graphs'))
    return jsonify({'ok': True, 'mensaje': 'Sesión local borrada; esquema reiniciado.'})


@app.route('/welcome', methods=['GET'])
def welcome():
    """Legacy: pagina de bienvenida original."""
    return render_template('welcome.html')


"""
def combine_txt_files(file_paths, output_file):
    with open(output_file, 'w', encoding='utf-8') as outfile:
        for file_path in file_paths:
            try:
                with open(file_path, 'r', encoding='utf-8') as infile:
                    # Read the contents of each file and write them into the output file
                    contents = infile.read()
                    outfile.write(contents + "\n")  # Add a newline between files' content
                print(f"Combined content from {file_path}")
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
"""

def combine_txt_files(file_paths, output_file):
    with open(output_file, 'w', encoding='utf-8') as outfile:
        for file_path in file_paths:
            try:
                with open(file_path, 'r', errors='replace') as infile:
                    outfile.write(infile.read() + "\n")
            except Exception as e:
                print(f"Error reading {file_path}: {e}")


@app.route('/procesar', methods=['GET'])
def procesar_page():
    """La carga vive en una sola página (el cockpit `/`, que trae los mismos
    formularios + chat + histórico). `procesar.html` era una copia recortada y
    redundante; se retiró. Esta ruta redirige para no romper el menú «Áreas»
    ni el link «Pipeline completo → Áreas». Las ACCIONES del pipeline siguen en
    /procesar/fase1, /procesar/pipeline y /procesar/historico."""
    return redirect('/')


@app.route('/procesar/fase1', methods=['POST'])
def procesar_fase1():
    """Fase 1: Subir y extraer facturas PDF (acumulativo).
    Solo procesa las facturas del ZIP recien subido, luego las mueve
    al directorio acumulativo para que esten disponibles en Fases 2-4.
    """
    # El pipeline de extracción usa Java/tabula/PyPDF2 (imagen completa). En
    # un despliegue lite/nativo esas deps no están: degradar con un mensaje
    # claro en vez de reventar en 500 al subir cientos de facturas.
    try:
        from PDFs_Final_v3 import PDFs_to_excel
    except Exception:
        return jsonify({'error': 'El pipeline de extracción de PDFs no está '
                        'disponible en este despliegue (faltan Java/tabula/PyPDF2). '
                        'Usa la imagen completa docker/Containerfile, no la lite.'}), 503
    facturas_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'facturas')
    historico_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'historico')
    downloads_dir = app.config['DOWNLOAD_FOLDER']

    os.makedirs(facturas_dir, exist_ok=True)
    os.makedirs(historico_dir, exist_ok=True)
    os.makedirs(downloads_dir, exist_ok=True)

    # Aceptar PDFs sueltos y/o un ZIP de facturas: el selector del navegador
    # ya no obliga a comprimir. Los ZIP se extraen; los PDFs se guardan
    # directo. (El pipeline de extracción trabaja sobre temp_dir igual.)
    subidos = [f for f in request.files.getlist('facturas') if f and f.filename]
    if not subidos:
        return jsonify({'error': 'No se cargaron facturas. Selecciona PDFs o un ZIP.'}), 400

    temp_dir = tempfile.mkdtemp(prefix='facturas_nuevas_')
    hay_pdf = False
    for f in subidos:
        nombre = secure_filename(f.filename)
        bajo = nombre.lower()
        if bajo.endswith('.zip'):
            zip_path = os.path.join(temp_dir, nombre)
            f.save(zip_path)
            try:
                _extraer_zip_seguro(zip_path, temp_dir)
            except zipfile.BadZipFile:
                shutil.rmtree(temp_dir, ignore_errors=True)
                return jsonify({'error': f'«{f.filename}» no es un ZIP valido.'}), 400
            finally:
                try:
                    os.remove(zip_path)
                except OSError:
                    pass
            hay_pdf = True
        elif bajo.endswith('.pdf'):
            f.save(os.path.join(temp_dir, nombre))
            hay_pdf = True
        # otros tipos se ignoran en silencio (el XML se limpia abajo)

    if not hay_pdf:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({'error': 'No se encontraron PDFs ni un ZIP con facturas.'}), 400

    # Eliminar archivos XML del ZIP (no son facturas y pueden causar errores de lectura)
    for root, _, files in os.walk(temp_dir):
        for f in files:
            if f.lower().endswith('.xml'):
                try:
                    os.remove(os.path.join(root, f))
                except OSError:
                    pass

    # Handle optional historico
    file_path = None
    historico_file = request.files.get('FilePrevio')
    if historico_file and historico_file.filename != '':
        clean_directory(historico_dir)
        fname = historico_file.filename
        if not fname.endswith('.xlsx'):
            fname = os.path.splitext(fname)[0] + '.xlsx'
        file_path = os.path.join(historico_dir, fname)
        historico_file.save(file_path)

    # Procesar SOLO los PDFs del ZIP nuevo (temp_dir)
    try:
        df_nuevas, df_pdfs, list_errores, errores_detalle_pdfs = PDFs_to_excel(temp_dir, file_path, 'facturasProcesadas.xlsx')

        # Mover los PDFs procesados al directorio acumulativo
        for root, _, files in os.walk(temp_dir):
            for f in files:
                if f.lower().endswith('.pdf'):
                    src = os.path.join(root, f)
                    dst = os.path.join(facturas_dir, f)
                    if not os.path.exists(dst):
                        shutil.move(src, dst)

        # Actualizar el Excel acumulado en downloads
        output_path = os.path.join(downloads_dir, 'facturasProcesadas.xlsx')
        if os.path.exists(output_path) and not df_pdfs.empty:
            try:
                df_prev = _read_excel(output_path)
                df_combined = pd.concat([df_prev, df_pdfs], ignore_index=True)
                df_combined.to_excel(output_path, index=False)
            except Exception:
                # Archivo acumulado ilegible — reemplazar con los datos actuales
                df_pdfs.to_excel(output_path, index=False)
        elif not df_pdfs.empty:
            df_pdfs.to_excel(output_path, index=False)

        # Save to DB
        from database.persistence import get_latest_session_id
        db_session_id = get_latest_session_id()

        # Create session if none exists
        if not db_session_id:
            now = datetime.datetime.now()
            db_session_id = create_session(now.month, now.year)

        nuevos_pdfs = (df_pdfs['Filename'].nunique()
                       if not df_pdfs.empty and 'Filename' in df_pdfs.columns
                       else (0 if df_pdfs.empty else 1))
        nuevos_vehiculos = len(df_pdfs) if not df_pdfs.empty else 0
        nuevos_errores = len(list_errores) if list_errores else 0

        if db_session_id and not df_pdfs.empty:
            save_extraccion(db_session_id, df_pdfs)
        if db_session_id and list_errores:
            save_facturas_errors(db_session_id, list_errores, errores_detalle_pdfs)

        # Persistir PDFs fallidos para que sean descargables desde /errores
        if list_errores and db_session_id:
            errores_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'errores', str(db_session_id))
            os.makedirs(errores_dir, exist_ok=True)
            for err_path in list_errores:
                if os.path.isfile(err_path):
                    shutil.copy2(err_path, os.path.join(errores_dir, os.path.basename(err_path)))

        # Get accumulated stats
        from database import get_connection
        conn = get_connection()
        total_pdfs = conn.execute(
            "SELECT COUNT(DISTINCT filename) as cnt FROM extraccion_facturas WHERE session_id = ?", (db_session_id,)
        ).fetchone()['cnt']
        total_registros = conn.execute(
            "SELECT COUNT(*) as cnt FROM extraccion_facturas WHERE session_id = ?", (db_session_id,)
        ).fetchone()['cnt']
        total_err = conn.execute(
            "SELECT COUNT(*) as cnt FROM facturas_errores WHERE session_id = ?", (db_session_id,)
        ).fetchone()['cnt']
        conn.close()

        return jsonify({
            'nuevos_exitosos': nuevos_pdfs,
            'nuevos_vehiculos': nuevos_vehiculos,
            'nuevos_errores': nuevos_errores,
            'total_exitosos': total_pdfs,
            'total_registros': total_registros,
            'total_errores': total_err,
            'total_acumulado': total_pdfs + total_err
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.route('/procesar/pipeline', methods=['POST'])
def procesar_pipeline():
    """Fases 2-4: Pipeline completo (usa facturas ya extraidas)."""
    try:
        from concentrado1 import Concentrado
        from concentrado2 import Concentrado2
        from Estadistico import estadistico_v4
    except Exception:
        return jsonify({'error': 'El pipeline completo (concentrado/estadístico) '
                        'no está disponible en este despliegue. Usa la imagen '
                        'completa docker/Containerfile, no la lite.'}), 503
    dwh_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'dwh')
    incrementales_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'incrementales')
    pdfInversion_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'pdfInversion')
    pdfProduccion_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'pdfProduccion')
    downloads_dir = app.config['DOWNLOAD_FOLDER']

    os.makedirs(dwh_dir, exist_ok=True)
    os.makedirs(incrementales_dir, exist_ok=True)
    os.makedirs(pdfInversion_dir, exist_ok=True)
    os.makedirs(pdfProduccion_dir, exist_ok=True)
    os.makedirs(downloads_dir, exist_ok=True)

    # Clean dirs for new pipeline files (NOT facturas)
    clean_directory(dwh_dir)
    clean_directory(incrementales_dir)
    clean_directory(pdfInversion_dir)
    clean_directory(pdfProduccion_dir)

    # Save uploaded files
    if 'dwh' not in request.files:
        raise FileUploadError("No se cargaron archivos DWH")
    for file in request.files.getlist('dwh'):
        if file and file.filename != '':
            file.save(os.path.join(dwh_dir, secure_filename(file.filename)))

    if 'incrementales' not in request.files:
        raise FileUploadError("No se cargaron Incrementales")
    for file in request.files.getlist('incrementales'):
        if file and file.filename != '':
            file.save(os.path.join(incrementales_dir, secure_filename(file.filename)))

    if 'pdfInversion' not in request.files:
        raise FileUploadError("No se cargo PDF Inversion")
    for file in request.files.getlist('pdfInversion'):
        if file and file.filename != '':
            file.save(os.path.join(pdfInversion_dir, secure_filename(file.filename)))

    if 'pdfProduccion' not in request.files:
        raise FileUploadError("No se cargo PDF Produccion")
    for file in request.files.getlist('pdfProduccion'):
        if file and file.filename != '':
            file.save(os.path.join(pdfProduccion_dir, secure_filename(file.filename)))

    # Use existing extracted facturas
    output_file_path = os.path.join(downloads_dir, 'facturasProcesadas.xlsx')
    if not os.path.isfile(output_file_path):
        raise FileUploadError("No hay facturas extraidas. Ejecute primero la Fase 1.")

    # Crear siempre una sesion nueva para cada ejecucion del pipeline
    now = datetime.datetime.now()
    db_session_id = create_session(now.month, now.year)

    backup_database()
    inicio_pipeline = datetime.datetime.now()

    # Copy insumos
    try:
        upload_dirs = {
            'dwh': dwh_dir,
            'incrementales': incrementales_dir,
            'pdfInversion': pdfInversion_dir,
            'pdfProduccion': pdfProduccion_dir,
        }
        copy_insumos_to_persistent(db_session_id, upload_dirs, DATA_DIR)
    except Exception as e_db:
        print(f"[DB] Error copiando insumos: {e_db}")

    # Fase 2: Concentrado 1
    try:
        dwh_files = [os.path.join(dwh_dir, f) for f in os.listdir(dwh_dir) if os.path.isfile(os.path.join(dwh_dir, f))]
        incrementales_files = [os.path.join(incrementales_dir, f) for f in os.listdir(incrementales_dir) if os.path.isfile(os.path.join(incrementales_dir, f))]

        if len(dwh_files) > 1:
            combined_dwh_file = os.path.join(dwh_dir, "combined_dwh.txt")
            combine_txt_files(dwh_files, combined_dwh_file)
            dwh_files = [combined_dwh_file]

        # Normaliza/valida el archivo de Divisiones en el borde (.xls→.xlsx +
        # chequeo de columnas) para que el pipeline legado lo procese igual sin
        # tocarlo, y para dar un error accionable si subieron el archivo equivocado.
        incrementales_files[0] = _preparar_divisiones(incrementales_files[0])
        pedimento = Concentrado(dwh_files[0], incrementales_files[0])
        output_file_path2 = os.path.join(downloads_dir, 'Concentrado1.xlsx')
        pedimento[0].to_excel(output_file_path2, sheet_name="concentrado", index=False)

        try:
            if db_session_id:
                df_divisiones = _read_excel(incrementales_files[0])
                save_catalogo_vehiculos(db_session_id, df_divisiones)
        except Exception as e_db:
            print(f"[DB] Error guardando catalogo: {e_db}")

    except Exception as e:
        raise ConcentradoError(f"{e}")

    # Fase 3: Concentrado 2
    try:
        final = Concentrado2(output_file_path2, output_file_path)
        output_file_path3 = os.path.join(downloads_dir, 'Concentrado2.xlsx')
        final[0].to_excel(output_file_path3, sheet_name='final')

        facturasFaltantes_array = final[2]
        facturasFaltantes_df = pd.DataFrame({'FACT': facturasFaltantes_array})
        filepath_faltantes = os.path.join(downloads_dir, 'Facturas_Faltantes.xlsx')
        facturasFaltantes_df.to_excel(filepath_faltantes, sheet_name='concentrado2')

        filepathFormatoNuevo = os.path.join(downloads_dir, 'NuevoFormato.xlsx')
        final[3].to_excel(filepathFormatoNuevo, sheet_name='NuevoFormato', index=False)

        try:
            if db_session_id and not final[0].empty:
                save_concentrado2(db_session_id, final[0])
            if db_session_id and facturasFaltantes_array:
                save_facturas_faltantes(db_session_id, facturasFaltantes_array)
        except Exception as e_db:
            print(f"[DB] Error guardando concentrado2: {e_db}")

    except Exception as e:
        raise ConcentradoError(f"{e}")

    # Fase 4: Estadistico
    try:
        pdfProduccion_files = [os.path.join(pdfProduccion_dir, f) for f in os.listdir(pdfProduccion_dir) if os.path.isfile(os.path.join(pdfProduccion_dir, f))]
        pdfInversion_files = [os.path.join(pdfInversion_dir, f) for f in os.listdir(pdfInversion_dir) if os.path.isfile(os.path.join(pdfInversion_dir, f))]

        output_file_path4 = os.path.join(downloads_dir, 'Estadistico.xlsx')
        ress = estadistico_v4(output_file_path3, [pdfProduccion_files[0]], output_file_path4, [pdfInversion_files[0]])
        session['data'] = ress

        fin_pipeline = datetime.datetime.now()

        try:
            if db_session_id:
                save_estadistico_results(db_session_id, ress)
                total_time = (fin_pipeline - inicio_pipeline).total_seconds()
                df_pdfs = _read_excel(output_file_path)
                update_session_stats(
                    db_session_id,
                    total_pdfs_processed=len(df_pdfs) if not df_pdfs.empty else 0,
                    total_pdfs_errors=0,
                    total_records=len(final[0]) if not final[0].empty else 0,
                    processing_time_seconds=total_time,
                    status='completed'
                )
        except Exception as e_db:
            print(f"[DB] Error guardando estadistico: {e_db}")

        # Create ZIP
        errores_txt_path = os.path.join(downloads_dir, 'ListaErrores.txt')
        ZipFilepaths = [output_file_path4, output_file_path3, output_file_path2,
                        output_file_path, errores_txt_path, filepath_faltantes, filepathFormatoNuevo]
        output_zip_path = os.path.join(downloads_dir, 'ZipGeneral.zip')
        with zipfile.ZipFile(output_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file in ZipFilepaths:
                if os.path.exists(file):
                    zipf.write(file, arcname=os.path.basename(file))

        return redirect('/')

    except Exception as e:
        raise EstadisticoError(f"{e}")


@app.route('/confirmation/<filename>', methods=['GET'])
def confirmation(filename):
    return render_template('confirmation.html', filename=filename)

@app.route('/dashboard2/<filename>', methods=['GET'])
def dashboard2(filename):
    data = session.get('data', {})  # Retrieve data from the session

    return render_template('dashboard2.html', filename=filename, data=data)

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    return send_from_directory(app.config['DOWNLOAD_FOLDER'], filename, as_attachment=True)


@app.route('/ticket/<filename>', methods=['GET'])
def download_ticket(filename):
    """Baja un ticket de servicio. Vive fuera de `downloads/` a propósito
    (un traceback no es una salida de negocio) y pasa por el candado."""
    return send_from_directory(app.config['TICKET_FOLDER'], filename,
                               as_attachment=True)

@app.route('/error')
def error():
    error_message = request.args.get('message', 'An unexpected error occurred.')
    return render_template('error.html', error_message=error_message)



# ============================================================
# API v1 - Endpoints independientes
# ============================================================

@app.route('/api/v1/status', methods=['GET'])
def api_status():
    """Estado general de la base de datos."""
    from database import get_connection
    try:
        conn = get_connection()
        stats = {}
        for table in ['processing_sessions', 'importaciones', 'extraccion_facturas',
                       'catalogo_vehiculos', 'pedimentos', 'cupos', 'insumos_archivos']:
            row = conn.execute(f"SELECT COUNT(*) as cnt FROM {table}").fetchone()
            stats[table] = row['cnt']
        conn.close()
        return jsonify({'status': 'ok', 'tables': stats})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── AUTOGENES: registrado desde rutas/autogenes.py (blueprint) ──


@app.route('/api/v1/sessions', methods=['GET'])
def api_sessions():
    """Lista todas las sesiones de procesamiento."""
    from database.persistence import get_all_sessions
    try:
        sessions = get_all_sessions()
        return jsonify({'sessions': sessions})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/sessions/<int:session_id>', methods=['GET'])
def api_session_detail(session_id):
    """Detalle de una sesion especifica."""
    from database import get_connection
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM processing_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'Sesion no encontrada'}), 404

        detail = dict(row)

        # Counts per table for this session
        for table in ['importaciones', 'extraccion_facturas', 'catalogo_vehiculos',
                       'pedimentos', 'facturas_errores', 'facturas_faltantes']:
            cnt = conn.execute(
                f"SELECT COUNT(*) as cnt FROM {table} WHERE session_id = ?", (session_id,)
            ).fetchone()
            detail[f'total_{table}'] = cnt['cnt']

        conn.close()
        return jsonify(detail)
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/insumos/<int:session_id>', methods=['GET'])
def api_insumos_list(session_id):
    """Lista archivos de entrada de una sesion."""
    from database import get_connection
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT id, tipo_archivo, nombre_original, tamanio_bytes, hash_md5, created_at "
            "FROM insumos_archivos WHERE session_id = ? ORDER BY tipo_archivo, nombre_original",
            (session_id,)
        ).fetchall()
        conn.close()
        return jsonify({'session_id': session_id, 'insumos': [dict(r) for r in rows]})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/insumos/<int:session_id>/<tipo>/<filename>', methods=['GET'])
def api_insumo_download(session_id, tipo, filename):
    """Descarga un archivo de insumo especifico."""
    insumo_dir = os.path.join(DATA_DIR, 'insumos', str(session_id), tipo)
    if not os.path.isfile(os.path.join(insumo_dir, filename)):
        return jsonify({'error': 'Archivo no encontrado'}), 404
    return send_from_directory(insumo_dir, filename, as_attachment=True)


# ============================================================
# PROCESO HISTORICO
# ============================================================

@app.route('/admin/dedup', methods=['POST'])
def admin_dedup():
    """Limpia duplicados en extraccion_facturas (conserva MIN(id) por grupo session+chasis+fact8)."""
    from database.persistence import dedup_extraccion_facturas
    eliminated = dedup_extraccion_facturas()
    return jsonify({'ok': True, 'filas_eliminadas': eliminated})


@app.route('/procesar/historico', methods=['POST'])
def procesar_historico():
    """Pipeline historico: Concentrado2 via SQL + Estadistico con todos los cupos."""
    from Estadistico import estadistico_v4
    from database import get_connection
    from database.persistence import get_historico_concentrado2, get_facturas_faltantes_historico

    downloads_dir = app.config['DOWNLOAD_FOLDER']
    os.makedirs(downloads_dir, exist_ok=True)

    try:
        # 1. Verificar que hay datos en la BD
        conn = get_connection()
        total = conn.execute("SELECT COUNT(*) as cnt FROM importaciones").fetchone()['cnt']
        conn.close()

        if total == 0:
            return jsonify({'error': 'No hay datos procesados en la base de datos. Ejecute primero el pipeline normal.'}), 400

        # 2. Generar Concentrado2 historico via SQL (sin re-correr scripts Python)
        print(f"[Historico] Generando Concentrado2 historico desde BD ({total} registros)...")
        df_c2 = get_historico_concentrado2()

        if df_c2.empty:
            raise ConcentradoError("La consulta historica no retorno datos.")

        c2_path = os.path.join(downloads_dir, 'Historico_Concentrado2.xlsx')
        df_c2.to_excel(c2_path, sheet_name='final')
        print(f"[Historico] Concentrado2 historico: {len(df_c2)} filas.")

        # 3. Facturas faltantes historico
        faltantes = get_facturas_faltantes_historico()
        df_faltantes = pd.DataFrame({'FACT': faltantes})
        faltantes_path = os.path.join(downloads_dir, 'Historico_Facturas_Faltantes.xlsx')
        df_faltantes.to_excel(faltantes_path, sheet_name='faltantes', index=False)

        # 4. Recolectar todos los PDFs de cupos almacenados
        conn2 = get_connection()
        pdf_rows = conn2.execute(
            """SELECT tipo_archivo, ruta_almacenada
               FROM insumos_archivos
               WHERE tipo_archivo IN ('pdf_produccion', 'pdf_inversion')
               ORDER BY session_id ASC"""
        ).fetchall()
        conn2.close()

        pdf_produccion = [r['ruta_almacenada'] for r in pdf_rows
                          if r['tipo_archivo'] == 'pdf_produccion' and os.path.exists(r['ruta_almacenada'])]
        pdf_inversion = [r['ruta_almacenada'] for r in pdf_rows
                         if r['tipo_archivo'] == 'pdf_inversion' and os.path.exists(r['ruta_almacenada'])]

        if not pdf_produccion or not pdf_inversion:
            raise FileUploadError("No se encontraron PDFs de cupos almacenados. Ejecute primero el pipeline normal.")

        # 5. Estadistico historico
        est_path = os.path.join(downloads_dir, 'Historico_Estadistico.xlsx')
        print(f"[Historico] Ejecutando estadistico con {len(pdf_produccion)} PDFs produccion y {len(pdf_inversion)} PDFs inversion...")
        estadistico_v4(c2_path, pdf_produccion, est_path, pdf_inversion)
        print("[Historico] Estadistico generado.")

        # 6. Empaquetar ZIP
        zip_path = os.path.join(downloads_dir, 'Historico_ZipGeneral.zip')
        archivos_zip = [c2_path, est_path, faltantes_path]
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for f in archivos_zip:
                if os.path.exists(f):
                    zipf.write(f, arcname=os.path.basename(f))

        return redirect('/?historico=ok')

    except (FileUploadError, ConcentradoError):
        raise
    except Exception as e:
        raise EstadisticoError(f"Error en proceso historico: {e}")


# ============================================================
# Gnosis AI - Chat Routes
# ============================================================

# Instancia global del chat handler (una por proceso)
COOKIE_HILO = 'gnosis_chat'


def _proveedor_activo(config):
    """Nombre del proveedor que serviría ahora, o None si no hay ninguno."""
    from jarvis.llm_interface import seleccionar_proveedor
    try:
        return seleccionar_proveedor(config)[0]
    except RuntimeError:
        return None


def _hilo_de_chat():
    """El id del hilo de conversación, desde la cookie firmada.

    No se guarda en el proceso: gunicorn corre varios workers y una petición
    puede caer en cualquiera. La cookie la firma SECRET_KEY, así que el
    cliente no puede inventarse el hilo de otro."""
    import uuid

    from flask import session as sesion_flask
    hilo = sesion_flask.get(COOKIE_HILO)
    if not hilo:
        hilo = str(uuid.uuid4())
        sesion_flask[COOKIE_HILO] = hilo
    return hilo


def _chat_handler_de(hilo):
    """Un manejador POR PETICIÓN, atado al hilo de la cookie.

    Construirlo cada vez es barato (la historia vive en SQLite) y elimina la
    clase de errores que tenía el singleton: historia partida entre workers,
    reset que solo alcanzaba a uno, y un proveedor 'activo' que alternaba
    según a qué proceso cayera la lectura."""
    from database import get_connection
    from database.config import get_all_config
    from jarvis.chat_handler import ChatHandler
    from jarvis.llm_interface import seleccionar_proveedor
    from database.persistence import get_latest_session_id

    conn = get_connection()
    try:
        config = get_all_config(conn)
    finally:
        conn.close()
    nombre, provider = seleccionar_proveedor(config)
    handler = ChatHandler(provider, session_id=get_latest_session_id(),
                          chat_session_id=hilo)
    handler.proveedor = nombre
    return handler


@app.route('/api/v1/admin/llm', methods=['GET'])
def api_admin_llm_estado():
    """Estado de la capa LLM: proveedores disponibles, default y fallbacks."""
    from database import get_connection
    from database.config import get_all_config
    from jarvis.llm_interface import proveedores_disponibles
    try:
        conn = get_connection()
        config = get_all_config(conn)
        conn.close()
        return jsonify({
            'default': config.get('llm_default', 'deepseek'),
            'fallback_claude': config.get('llm_fallback_claude', 'off'),
            'ollama': config.get('llm_ollama', 'off'),
            'disponibles': proveedores_disponibles(config),
            # 'activo' se DERIVA de la configuración persistida, no de un
            # global de proceso: con dos workers, aquel valor alternaba según
            # a quién cayera la lectura. Sin ningún proveedor configurado es
            # None declarado — este endpoint REPORTA estado, no puede fallar
            # por no haber estado que reportar.
            'activo': _proveedor_activo(config),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/admin/llm', methods=['POST'])
def api_admin_llm_configurar():
    """Configura el selector LLM. Claves permitidas: llm_default,
    llm_fallback_claude (on/off), llm_ollama (on/off), deepseek_model,
    claude_model. Reinicia el handler para aplicar de inmediato."""
    from database import get_connection
    from database.config import set_config
    permitidas = {'llm_default', 'llm_fallback_claude', 'llm_ollama',
                  'deepseek_model', 'claude_model'}
    data = request.get_json(silent=True) or {}
    cambios = {k: str(v) for k, v in data.items() if k in permitidas}
    if not cambios:
        return jsonify({'error': f'Nada que configurar; claves: {sorted(permitidas)}'}), 400
    if 'llm_default' in cambios and cambios['llm_default'] not in ('deepseek', 'claude', 'ollama'):
        return jsonify({'error': 'llm_default debe ser deepseek, claude u ollama'}), 400
    for k in ('llm_fallback_claude', 'llm_ollama'):
        if k in cambios and cambios[k] not in ('on', 'off'):
            return jsonify({'error': f'{k} debe ser on u off'}), 400
    try:
        conn = get_connection()
        for k, v in cambios.items():
            set_config(conn, k, v)
        conn.close()
        # No hay handler que invalidar: se construye por petición y relee la
        # configuración, así que el cambio aplica en TODOS los workers de
        # inmediato — antes solo en el que atendió el POST.
        return jsonify({'status': 'ok', 'aplicado': cambios})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/gnosisia', methods=['GET'])
def gnosisia_chat():
    return render_template('chat.html')


@app.route('/api/v1/chat', methods=['POST'])
def api_chat():
    """Endpoint principal de chat con Gnosis AI."""
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'Se requiere el campo "message"'}), 400

    try:
        handler = _chat_handler_de(_hilo_de_chat())
        result = handler.handle_message(data['message'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/chat/reset', methods=['POST'])
def api_chat_reset():
    """Olvida la conversación — en la base, así que alcanza a todo worker."""
    from flask import session as sesion_flask
    from jarvis.chat_handler import olvidar_conversacion
    try:
        hilo = sesion_flask.get(COOKIE_HILO)
        if hilo:
            olvidar_conversacion(hilo)
            sesion_flask.pop(COOKIE_HILO, None)
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/errores')
def api_errores():
    """Devuelve la lista de errores de la sesión activa como JSON."""
    try:
        from database.persistence import get_latest_session_id as _get_sid, get_errores_session as _get_err
        sid = _get_sid()
        rows = _get_err(sid) if sid else []
        result = []
        for e in rows:
            result.append({
                'filename':      str(e.get('filename') or ''),
                'error_type':    str(e.get('error_type') or 'parse'),
                'error_message': str(e.get('error_message') or '')
            })
        return jsonify({'session_id': sid, 'errores': result})
    except Exception as ex:
        return jsonify({'session_id': None, 'errores': [], 'error': str(ex)}), 500


@app.route('/errores')
def errores_view():
    """Vista de PDFs que fallaron en el parsing, con razón del fallo."""
    sid = get_latest_session_id()
    errores = get_errores_session(sid) if sid else []
    return render_template('errores.html', errores=errores, session_id=sid)


@app.route('/errores/download', methods=['GET'])
def errores_download_pdf():
    """Descarga un PDF que falló el parsing (?sid=<session_id>&f=<filename>)."""
    session_id = request.args.get('sid', type=int)
    filename   = request.args.get('f', '').strip()
    if not session_id or not filename:
        return jsonify({'error': 'Parámetros sid y f requeridos'}), 400

    try:
        # 1. Directorio dedicado de errores (canónico para fase1 y reprocesar)
        errores_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'errores', str(session_id))
        if os.path.isfile(os.path.join(errores_dir, filename)):
            return send_from_directory(errores_dir, filename, as_attachment=True)

        # 2. insumos_archivos DB (pipeline completo)
        from database import get_connection as _gc
        conn = _gc()
        row = conn.execute(
            """SELECT ruta_almacenada FROM insumos_archivos
               WHERE session_id = ? AND nombre_original = ?
                 AND tipo_archivo = 'factura_pdf'
               LIMIT 1""",
            (session_id, filename)
        ).fetchone()
        conn.close()

        if row and os.path.isfile(row['ruta_almacenada']):
            directory = os.path.dirname(row['ruta_almacenada'])
            return send_from_directory(directory, filename, as_attachment=True)

        # 3. Fallback: uploads/facturas
        facturas_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'facturas')
        if os.path.isfile(os.path.join(facturas_dir, filename)):
            return send_from_directory(facturas_dir, filename, as_attachment=True)

        return jsonify({'error': f'Archivo no encontrado: {filename}'}), 404

    except Exception as e:
        app.logger.error(f'errores_download_pdf({filename}): {e}', exc_info=True)
        return jsonify({'error': f'Error interno: {str(e)}'}), 500


@app.route('/procesar/reprocesar', methods=['POST'])
def reprocesar_pdfs():
    """Re-procesa PDFs corregidos subidos por el usuario.
    Espera multipart/form-data con: files[] y session_id.
    """
    from PDFs_Final_v3 import PDFs_to_excel
    from database import get_connection as _get_conn

    session_id = request.form.get('session_id')
    if not session_id:
        return jsonify({'error': 'session_id requerido'}), 400
    session_id = int(session_id)

    archivos_subidos = request.files.getlist('files')
    if not archivos_subidos:
        return jsonify({'error': 'No se enviaron archivos'}), 400

    # 1. Guardar en directorio temporal
    temp_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'reprocesar_temp')
    shutil.rmtree(temp_dir, ignore_errors=True)
    os.makedirs(temp_dir, exist_ok=True)

    nombre_map = {}  # secure_name -> original_name
    for f in archivos_subidos:
        original = f.filename
        secure   = secure_filename(original)
        f.save(os.path.join(temp_dir, secure))
        nombre_map[secure] = original

    nombres_subidos = set(nombre_map.keys())

    # 2. Procesar (sin previous_excel_path para obtener solo filas nuevas)
    try:
        df_nuevos, _df_combinado, errores_nuevos, errores_detalle = PDFs_to_excel(temp_dir)
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({'error': f'Error al procesar PDFs: {e}'}), 500

    nombres_error = {os.path.basename(p) for p in errores_nuevos}
    nombres_exito = nombres_subidos - nombres_error

    # 3. Exitosos: guardar en DB y merge en facturasProcesadas.xlsx
    if not df_nuevos.empty and nombres_exito:
        save_extraccion(session_id, df_nuevos)
        facturas_path = os.path.join(app.config['DOWNLOAD_FOLDER'], 'facturasProcesadas.xlsx')
        if os.path.exists(facturas_path):
            df_prev = _read_excel(facturas_path)
            pd.concat([df_prev, df_nuevos], ignore_index=True).to_excel(facturas_path, index=False)
        else:
            df_nuevos.to_excel(facturas_path, index=False)

        conn = _get_conn()
        for nombre in nombres_exito:
            conn.execute(
                "DELETE FROM facturas_errores WHERE session_id=? AND filename=?",
                (session_id, nombre_map.get(nombre, nombre))
            )
        conn.commit()
        conn.close()

    # 4. Los que siguen fallando: actualizar su registro en facturas_errores
    if errores_nuevos:
        conn = _get_conn()
        for path in errores_nuevos:
            nombre = os.path.basename(path)
            detalle = errores_detalle.get(nombre, {})
            categoria = detalle.get('categoria', 'parsing_failed')
            mensaje = detalle.get('mensaje', '')
            conn.execute(
                """UPDATE facturas_errores
                   SET error_type=?, error_message=?
                   WHERE session_id=? AND filename=?""",
                (categoria, mensaje, session_id, nombre)
            )
        conn.commit()
        conn.close()

    # 5. Sincronizar directorio de errores persistente
    errores_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'errores', str(session_id))
    os.makedirs(errores_dir, exist_ok=True)
    # los nombres de destino en disco pasan por secure_filename: el nombre
    # ORIGINAL (nombre_map) puede traer "../" y `orig` alimenta os.remove /
    # shutil.copy2 — sanearlo bloquea escritura/borrado fuera de errores_dir.
    for nombre in nombres_exito:
        orig = secure_filename(nombre_map.get(nombre, nombre)) or nombre
        err_file = os.path.join(errores_dir, orig)
        if os.path.isfile(err_file):
            os.remove(err_file)
    for path in errores_nuevos:
        secure_name = os.path.basename(path)
        orig = secure_filename(nombre_map.get(secure_name, secure_name)) or secure_name
        if os.path.isfile(path):
            shutil.copy2(path, os.path.join(errores_dir, orig))

    # 6. Limpiar temp
    shutil.rmtree(temp_dir, ignore_errors=True)

    return jsonify({
        'exitosos': [nombre_map.get(n, n) for n in nombres_exito],
        'fallidos': [
            {'file': nombre_map.get(os.path.basename(p), os.path.basename(p)),
             'categoria': errores_detalle.get(os.path.basename(p), {}).get('categoria', ''),
             'detalle': errores_detalle.get(os.path.basename(p), {}).get('mensaje', '')}
            for p in errores_nuevos
        ]
    })


@app.route('/errores/delete', methods=['POST'])
def errores_delete():
    """Elimina un registro de error de la DB y su archivo del directorio de errores."""
    data = request.get_json(silent=True) or {}
    session_id = data.get('sid')
    filename   = (data.get('filename') or '').strip()
    if not session_id or not filename:
        return jsonify({'error': 'sid y filename requeridos'}), 400

    from database import get_connection as _gc
    conn = _gc()
    conn.execute(
        "DELETE FROM facturas_errores WHERE session_id=? AND filename=?",
        (session_id, filename)
    )
    conn.commit()
    conn.close()

    # el archivo en disco SIEMPRE se guardó bajo secure_filename (ver
    # reprocesar_pdfs); sanear aquí bloquea el traversal por `filename`
    # arbitrario del JSON (p.ej. "../../database/gnosis.db").
    safe_name = secure_filename(filename)
    if safe_name:
        err_file = os.path.join(
            app.config['UPLOAD_FOLDER'], 'errores', str(int(session_id)), safe_name)
        if os.path.isfile(err_file):
            os.remove(err_file)

    return jsonify({'ok': True})


@app.route('/errores/download-zip', methods=['GET'])
def errores_download_zip():
    """Descarga un ZIP con todos los PDFs de error de la sesión."""
    import io
    session_id = request.args.get('sid', type=int)
    if not session_id:
        return jsonify({'error': 'sid requerido'}), 400

    errores_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'errores', str(session_id))
    if not os.path.isdir(errores_dir):
        return jsonify({'error': 'No hay archivos de error para esta sesión'}), 404

    pdfs = [f for f in os.listdir(errores_dir) if f.lower().endswith('.pdf')]
    if not pdfs:
        return jsonify({'error': 'No hay PDFs de error en esta sesión'}), 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for pdf in pdfs:
            zf.write(os.path.join(errores_dir, pdf), pdf)
    buf.seek(0)

    return send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'errores_session_{session_id}.zip'
    )


if __name__ == '__main__':
    # debug=True expone la consola Werkzeug (RCE) y host 0.0.0.0 la publica
    # en toda la red. Ambos se controlan por entorno; el default es seguro.
    debug = os.environ.get('GNOSIS_DEBUG') == '1'
    host = os.environ.get('GNOSIS_HOST', '127.0.0.1')
    app.run(host=host, port=int(os.environ.get('GNOSIS_PORT', '5001')), debug=debug)