import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from flask import Flask, request, render_template, redirect, url_for, send_from_directory, send_file, jsonify # type: ignore
import pandas as pd
from PDFs_Final_v3 import PDFs_to_excel
from concentrado1 import Concentrado
from concentrado2 import Concentrado2
from Estadistico import estadistico_v2
from Estadistico import estadistico_v3

from Estadistico import estadistico_v4

import PDFs_v2
import zipfile
from werkzeug.utils import secure_filename
import datetime
import shutil
import tempfile
import traceback

from flask import session, redirect, url_for

def _read_excel(path, **kwargs):
    """Lee un Excel con engine apropiado; si openpyxl falla intenta xlrd."""
    if str(path).lower().endswith('.xls'):
        return pd.read_excel(path, engine='xlrd', **kwargs)
    try:
        return pd.read_excel(path, engine='openpyxl', **kwargs)
    except Exception:
        return pd.read_excel(path, engine='xlrd', **kwargs)

# --- Persistencia SQLite (Gnosis AI) ---
from database import init_db
from database.persistence import (
    create_session, update_session_stats, save_catalogo_vehiculos,
    save_extraccion, save_concentrado2, save_estadistico_results,
    save_facturas_errors, save_facturas_faltantes, copy_insumos_to_persistent,
    migrate_add_error_message, get_errores_session, get_latest_session_id
)
from database.backup import backup_database

UPLOAD_FOLDER = os.path.dirname(os.path.abspath(__file__)) + '/uploads'
DOWNLOAD_FOLDER = os.path.dirname(os.path.abspath(__file__)) + '/downloads'

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['DOWNLOAD_FOLDER'] = DOWNLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # una carga jamas debe poder tumbar el proceso
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'Gestel2025')

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

# Inicializar base de datos SQLite al arrancar
init_db()
migrate_add_error_message()


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
    log_filepath = os.path.join(app.config['DOWNLOAD_FOLDER'], log_filename)

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
@app.errorhandler(FileUploadError)
def handle_file_upload_error(e):
    error_traceback = traceback.format_exc()
    log_filename = log_error_to_file(FileUploadError, str(e), error_traceback)
   
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

@app.errorhandler(Exception)
def handle_generic_error(e):
    error_traceback = traceback.format_exc()
    log_filename = log_error_to_file(type(e), str(e), error_traceback)
    return render_template('error.html', 
                         error_message="Error inesperado: " + str(e),
                         log_file=log_filename), 500

@app.route('/', methods=['GET'])
def dashboard():
    """Pagina principal — layout 3 columnas con chat, areas y dashboard."""
    from database import get_connection
    from database.persistence import get_all_sessions, get_latest_session_id, get_errores_session

    _empty = dict(
        empty=True, sessions=[], current_session=None,
        stats={'total_importaciones': 0, 'total_extraccion': 0,
               'total_faltantes': 0, 'total_errores': 0},
        por_marca=[], por_pais=[], por_jyn=[], por_aduana=[], por_fraccion=[], por_moneda=[],
        has_graphs=False, has_zip=False, has_historico_zip=False,
        fase1_stats={'total': 0, 'exitosos': 0, 'registros': 0, 'errores': 0},
        historico_sessions=0, errores_count=0, errores=[], session_id=None,
        viz_data={}, data={},
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
        except Exception: por_aduana = []
        try:
            por_fraccion = [dict(r) for r in conn.execute(
                """SELECT c.fraccion, COUNT(*) as total FROM importaciones i
                   JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
                   WHERE i.session_id = ? AND c.fraccion IS NOT NULL AND c.fraccion != ''
                   GROUP BY c.fraccion ORDER BY total DESC LIMIT 12""",
                (session_id,)).fetchall()]
        except Exception: por_fraccion = []
        try:
            por_moneda = [dict(r) for r in conn.execute(
                "SELECT COALESCE(NULLIF(moneda,''),'—') as moneda, COUNT(*) as total FROM extraccion_facturas WHERE session_id = ? GROUP BY moneda ORDER BY total DESC",
                (session_id,)).fetchall()]
        except Exception: por_moneda = []

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

            # Seguimiento mensual del cupo (trayectoria) — read-only, ya calculado por estadistico_v4
            viz_data['seguimiento'] = session.get('data', {}).get('SEGUIMIENTO_MENSUAL', []) or []
            # Agotamientos de cupo (transiciones prod + inv) — read-only, para marcar en la trayectoria
            viz_data['agotamientos'] = (session.get('data', {}).get('TRANSICIONES_PRODUCCION', []) or []) \
                + (session.get('data', {}).get('TRANSICIONES_INVERSION', []) or [])
        except Exception as _e:
            print(f"[Dashboard] viz_data build failed (non-fatal): {_e}")
            viz_data = {}

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
        )
    except Exception as e:
        print(f"[Dashboard] Error: {e}")
        return render_template('main.html', **_empty)


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
    """Pagina de procesamiento por fases."""
    from database import get_connection
    from database.persistence import get_latest_session_id

    fase1_stats = {'total': 0, 'exitosos': 0, 'registros': 0, 'errores': 0}
    historico_sessions = 0
    try:
        conn = get_connection()
        sid = get_latest_session_id()
        if sid:
            ext_pdfs = conn.execute(
                "SELECT COUNT(DISTINCT filename) as cnt FROM extraccion_facturas WHERE session_id = ?", (sid,)
            ).fetchone()
            ext_rows = conn.execute(
                "SELECT COUNT(*) as cnt FROM extraccion_facturas WHERE session_id = ?", (sid,)
            ).fetchone()
            err = conn.execute(
                "SELECT COUNT(*) as cnt FROM facturas_errores WHERE session_id = ?", (sid,)
            ).fetchone()
            fase1_stats['exitosos']  = ext_pdfs['cnt']   # PDFs únicos
            fase1_stats['registros'] = ext_rows['cnt']   # filas (vehículos)
            fase1_stats['errores']   = err['cnt']
            fase1_stats['total']     = ext_pdfs['cnt'] + err['cnt']

        # Contar sesiones con DWH + incrementales para el proceso historico
        row = conn.execute(
            """SELECT COUNT(DISTINCT session_id) as cnt FROM insumos_archivos
               WHERE tipo_archivo = 'dwh'
               AND session_id IN (
                   SELECT DISTINCT session_id FROM insumos_archivos
                   WHERE tipo_archivo = 'incrementales'
               )"""
        ).fetchone()
        historico_sessions = row['cnt'] if row else 0
        conn.close()
    except Exception as e:
        print(f"[Procesar] Error leyendo stats: {e}")

    return render_template('procesar.html', fase1_stats=fase1_stats, historico_sessions=historico_sessions)


@app.route('/procesar/fase1', methods=['POST'])
def procesar_fase1():
    """Fase 1: Subir y extraer facturas PDF (acumulativo).
    Solo procesa las facturas del ZIP recien subido, luego las mueve
    al directorio acumulativo para que esten disponibles en Fases 2-4.
    """
    facturas_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'facturas')
    historico_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'historico')
    downloads_dir = app.config['DOWNLOAD_FOLDER']

    os.makedirs(facturas_dir, exist_ok=True)
    os.makedirs(historico_dir, exist_ok=True)
    os.makedirs(downloads_dir, exist_ok=True)

    # Handle ZIP upload
    facturas_zip = request.files.get('facturas')
    if not facturas_zip or facturas_zip.filename == '':
        return jsonify({'error': 'No se cargo el archivo ZIP de facturas.'}), 400

    # Extraer ZIP a directorio temporal (solo procesar las nuevas)
    temp_dir = tempfile.mkdtemp(prefix='facturas_nuevas_')
    facturas_zip_path = os.path.join(temp_dir, secure_filename(facturas_zip.filename))
    facturas_zip.save(facturas_zip_path)

    try:
        with zipfile.ZipFile(facturas_zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
    except zipfile.BadZipFile:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({'error': 'El archivo no es un ZIP valido.'}), 400

    # Eliminar el ZIP despues de extraer
    try:
        os.remove(facturas_zip_path)
    except:
        pass

    # Eliminar archivos XML del ZIP (no son facturas y pueden causar errores de lectura)
    for root, _, files in os.walk(temp_dir):
        for f in files:
            if f.lower().endswith('.xml'):
                try:
                    os.remove(os.path.join(root, f))
                except:
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
    facturas_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'facturas')
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


@app.route('/processing', methods=['POST'])
def processing():
    facturas_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'facturas')
    dwh_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'dwh')
    incrementales_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'incrementales')
    pdfInversion_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'pdfInversion')
    pdfProduccion_dir  = os.path.join(app.config['UPLOAD_FOLDER'], 'pdfProduccion')
    historico_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'historico')
    downloads_dir = app.config['DOWNLOAD_FOLDER']  # Downloads folder


    os.makedirs(facturas_dir, exist_ok=True)
    os.makedirs(dwh_dir, exist_ok=True)
    os.makedirs(incrementales_dir, exist_ok=True)
    os.makedirs(pdfInversion_dir, exist_ok=True)
    os.makedirs(pdfProduccion_dir, exist_ok=True)
    os.makedirs(downloads_dir, exist_ok=True)
    os.makedirs(historico_dir, exist_ok=True)


    # Clean directories
    clean_directory(facturas_dir)
    clean_directory(dwh_dir)
    clean_directory(incrementales_dir)
    clean_directory(pdfInversion_dir)
    clean_directory(pdfProduccion_dir)
    clean_directory(downloads_dir)  # Clean the downloads folder
    clean_directory(historico_dir)
    

    """
    # Save facturas files
    if 'facturas' in request.files:
        for file in request.files.getlist('facturas'):
            if file and file.filename != '':
                file_path = os.path.join(facturas_dir, file.filename)
                file.save(file_path)
                print(f"Saved factura: {file_path}")
    else:
        raise FileUploadError("No se cargaron facturas")
    """


    # Save dwh files
    if 'dwh' in request.files:
        for file in request.files.getlist('dwh'):
            if file and file.filename != '':
                file_path = os.path.join(dwh_dir, file.filename)
                file.save(file_path)
                print(f"Saved dwh: {file_path}")
    else:
        raise FileUploadError("No se cargaron DWH")

#Extraccion por medio de ZIP contiendo las facturas 
    # Handle FACTURAS ZIP upload
    facturas_zip = request.files.get('facturas')
    if not facturas_zip or facturas_zip.filename == '':
        raise FileUploadError("No se cargó el archivo ZIP de facturas.")

    # Save and extract ZIP to facturas_dir
    facturas_zip_path = os.path.join(facturas_dir, secure_filename(facturas_zip.filename))
    facturas_zip.save(facturas_zip_path)

    try:
        with zipfile.ZipFile(facturas_zip_path, 'r') as zip_ref:
            zip_ref.extractall(facturas_dir)
        print(f"ZIP extraído en: {facturas_dir}")
    except zipfile.BadZipFile:
        raise FileUploadError("El archivo de facturas no es un ZIP válido.")

    # Save incrementales/diviciones files
    if 'incrementales' in request.files:
        for file in request.files.getlist('incrementales'):
            if file and file.filename != '':
                file_path = os.path.join(incrementales_dir, file.filename)
                file.save(file_path)
                print(f"Saved incremental: {file_path}")
    else:
        raise FileUploadError("No se cargaron Incrementales")

    #Save PDFs inversion y produccion
    if 'pdfInversion' in request.files:
        for file in request.files.getlist('pdfInversion'):
            if file and file.filename != '':
                file_path = os.path.join(pdfInversion_dir, file.filename)
                file.save(file_path)
                print(f"Saved pdfInversion: {file_path}")
    else:
        raise FileUploadError("No se cargo pdfInbversion")
    
    if 'pdfProduccion' in request.files:
        for file in request.files.getlist('pdfProduccion'):
            if file and file.filename != '':
                file_path = os.path.join(pdfProduccion_dir, file.filename)
                file.save(file_path)
                print(f"Saved pdfProduccion: {file_path}")
    else:
        raise FileUploadError("No se cargo pdfProduccion")
    

# Assuming `historico_dir` is the directory where you want to save the file

    if 'FilePrevio' in request.files:
        file = request.files['FilePrevio']
        
        if file and file.filename != '':
            # Check if the file has a valid Excel extension
            if not file.filename.endswith('.xlsx'):
                print("Uploaded file is not an Excel file. Renaming to .xlsx.")
                # If the file is not an xlsx, we forcefully rename it as .xlsx
                filename = os.path.splitext(file.filename)[0] + '.xlsx'
            else:
                filename = file.filename

            # Construct the full file path
            file_path = os.path.join(historico_dir, filename)
            
            try:
                # Save the file to the specified path
                file.save(file_path)
                print(f"Saved file to: {file_path}")
            except Exception as e:
                print(f"Error saving the file: {e}")
        else:
            print("No file selected or file is empty.")
    else:
        print("No file uploaded.")

    # --- Persistencia: crear sesion y copiar insumos ---
    now = datetime.datetime.now()
    db_session_id = None
    try:
        db_session_id = create_session(now.month, now.year)
        backup_database()
        upload_dirs = {
            'facturas': facturas_dir,
            'dwh': dwh_dir,
            'incrementales': incrementales_dir,
            'pdfInversion': pdfInversion_dir,
            'pdfProduccion': pdfProduccion_dir,
            'historico': historico_dir,
        }
        copy_insumos_to_persistent(db_session_id, upload_dirs, DATA_DIR)
        print(f"[DB] Sesion {db_session_id} creada, insumos copiados.")
    except Exception as e_db:
        print(f"[DB] Error creando sesion/insumos (no afecta pipeline): {e_db}")

    # Process PDFs and generate Excel file
    try:
        # proceso 1 facturas
        inicoFacturas = datetime.datetime.now()
        df_nuevas, df_PDFs_documents, ListErrores, errores_detalle_hist = PDFs_to_excel(facturas_dir, file_path, 'facturasProcesadas.xlsx')
        output_filename = 'facturasProcesadas.xlsx'
        output_file_path = os.path.join(app.config['DOWNLOAD_FOLDER'], output_filename)
        df_PDFs_documents.to_excel(output_file_path, index=False)
        print('1. extraidas las facturas')
        finFacturas = datetime.datetime.now()
        print('Tiempo de procesamiento de facturas: ', finFacturas - inicoFacturas)

        errores_txt_path = os.path.join(app.config['DOWNLOAD_FOLDER'], 'ListaErrores.txt')

        if ListErrores:
            print('📌 Files with errors:', ListErrores)
        
        # Keep only the rightmost part of each path (filename)
            errores_filenames = [os.path.basename(path) for path in ListErrores]
            
            # Export to TXT
            errores_txt_path = os.path.join(app.config['DOWNLOAD_FOLDER'], 'ListaErrores.txt')
            with open(errores_txt_path, 'w', encoding='utf-8') as f:
                for name in errores_filenames:
                    f.write(name + '\n')

        # --- Persistencia: guardar extraccion y errores ---
        try:
            if db_session_id and not df_PDFs_documents.empty:
                n_ext = save_extraccion(db_session_id, df_PDFs_documents)
                print(f"[DB] {n_ext} registros de extraccion guardados.")
            if db_session_id and ListErrores:
                save_facturas_errors(db_session_id, ListErrores, errores_detalle_hist)
                print(f"[DB] {len(ListErrores)} errores de PDFs guardados.")
        except Exception as e_db:
            print(f"[DB] Error guardando extraccion (no afecta pipeline): {e_db}")

    except Exception as e:
        raise PDFProcessingError(f"{e}")


    try:
        concentradoInicio = datetime.datetime.now()
        # proceso 2, creacion pedimento con dwh y divisiones/incrementales
        dwh_files = [os.path.join(dwh_dir, f) for f in os.listdir(dwh_dir) if os.path.isfile(os.path.join(dwh_dir, f))]
        incrementales_files = [os.path.join(incrementales_dir, f) for f in os.listdir(incrementales_dir) if os.path.isfile(os.path.join(incrementales_dir, f))]
        
        # Asegurarse de que hay exactamente un archivo en cada directorio 
        #### si hay mas de uno los juntamos para que se puedan hacer en dbulk |
        if len(dwh_files) > 1:
            # Combine the dwh files into one
            combined_dwh_file = os.path.join(dwh_dir, "combined_dwh.txt")
            combine_txt_files(dwh_files, combined_dwh_file)
            dwh_files = [combined_dwh_file]  # Update the dwh_files list to only have the combined file
        else: 
            handle_concentrado_error("Error con los pedimentos")
        
        if len(dwh_files) != 1 or len(incrementales_files) != 1:
            raise handle_concentrado_error("Debe haber por lo menos un archivo en el directorio 'dwh' y solo 1 archivo en el directorio 'incrementales'.")

        pedimento = Concentrado(dwh_files[0], incrementales_files[0])
        output_filename2 = 'Concentrado1.xlsx'
        output_file_path2 = os.path.join(app.config['DOWNLOAD_FOLDER'], output_filename2)
        pedimento[0].to_excel(output_file_path2, sheet_name="concentrado", index=False)
        print('2. creacion del pedimento')

        # --- Persistencia: guardar catalogo de vehiculos (divisiones) ---
        try:
            if db_session_id and len(pedimento) > 1:
                df_divisiones = _read_excel(incrementales_files[0])
                n_cat = save_catalogo_vehiculos(db_session_id, df_divisiones)
                print(f"[DB] {n_cat} vehiculos del catalogo guardados.")
        except Exception as e_db:
            print(f"[DB] Error guardando catalogo vehiculos (no afecta pipeline): {e_db}")

    except Exception as e:
        print(f"Error processing pedimento1: {e}")
        raise ConcentradoError(e)
    
    try:
        # proceso 3, union concentrado y facturas
        final = Concentrado2(output_file_path2, output_file_path)
        output_filename3 = 'Concentrado2.xlsx'
        output_file_path3 = os.path.join(app.config['DOWNLOAD_FOLDER'], output_filename3)
        final[0].to_excel(output_file_path3, sheet_name='final')
        facturasFaltantes_array = final[2]
        facturasFaltantes_df = pd.DataFrame({'FACT': facturasFaltantes_array})
        filepath_faltantes = os.path.join(app.config['DOWNLOAD_FOLDER'], 'Facturas_Faltantes.xlsx')

        facturasFaltantes_df.to_excel(filepath_faltantes, sheet_name='concentrado2')
        filepathFormatoNuevo = os.path.join(app.config['DOWNLOAD_FOLDER'], 'NuevoFormato.xlsx')
        dfNuevoFormato = final[3]
        dfNuevoFormato.to_excel(filepathFormatoNuevo, sheet_name='NuevoFormato', index=False)

        print('terminado hasta concentrado 2')
        concentradoFinal = datetime.datetime.now()
        print('Tiempo de procesamiento de concentrado 2: ', concentradoFinal - concentradoInicio)

        # --- Persistencia: guardar concentrado2 (importaciones) y faltantes ---
        try:
            if db_session_id and not final[0].empty:
                n_imp = save_concentrado2(db_session_id, final[0])
                print(f"[DB] {n_imp} importaciones guardadas.")
            if db_session_id and facturasFaltantes_array:
                save_facturas_faltantes(db_session_id, facturasFaltantes_array)
                print(f"[DB] {len(facturasFaltantes_array)} facturas faltantes guardadas.")
        except Exception as e_db:
            print(f"[DB] Error guardando concentrado2 (no afecta pipeline): {e_db}")

    ############ NOS VAMOS A LA CREACION DEL ESTADISTICO ##################
    except Exception as e:
        print(f"Error processing final: {e}")
        return redirect(url_for('error', message=str(e)))
    
    #Try para estadistico

    try:
        print('3. Creacion del estadistico')
        # output_file_path3 = concentrado 2
        # pdf_produccion_path = path donde se subio el pdf 
        # output3_path = output para el archivo de estadistico 
        # pdf_inversion_path =  path donde se subio el pdf

        pdfProduccion_files = [os.path.join(pdfProduccion_dir, f) for f in os.listdir(pdfProduccion_dir) if os.path.isfile(os.path.join(pdfProduccion_dir, f))]
        pdfInversion_files = [os.path.join(pdfInversion_dir, f) for f in os.listdir(pdfInversion_dir) if os.path.isfile(os.path.join(pdfInversion_dir, f))]
        output_filename4 = 'Estadistico.xlsx'
        output_file_path4 = os.path.join(app.config['DOWNLOAD_FOLDER'], output_filename4)
        
        inicioEstadistico = datetime.datetime.now()
        ress= estadistico_v4(output_file_path3, [pdfProduccion_files[0]], output_file_path4, [pdfInversion_files[0]])
        session['data'] = ress  # Store the data dictionary in session
        print(ress)
        # Provide success response with download link
        files_to_download = [output_filename, output_filename2, output_filename3,'ListaErrores.txt', 'Facturas_Faltantes.xlsx', output_filename4,'ZipGeneral.zip','NuevoFormato.xlsx']
        ZipFilepaths = [output_file_path4,output_file_path3,output_file_path2,output_file_path,errores_txt_path,filepath_faltantes,filepathFormatoNuevo]

        print(session)
        finEstadistico = datetime.datetime.now()
        print('Tiempo de procesamiento de facturas: ', finFacturas - inicoFacturas)
        print('Tiempo de procesamiento de concentrado 2: ', concentradoFinal - concentradoInicio)
        print('Tiempo de procesamiento de estadistico: ', finEstadistico - inicioEstadistico)
        print('Tiempo total de procesamiento: ', finEstadistico - inicoFacturas)

        # --- Persistencia: guardar estadistico y actualizar sesion ---
        try:
            if db_session_id:
                save_estadistico_results(db_session_id, ress)
                total_time = (finEstadistico - inicoFacturas).total_seconds()
                update_session_stats(
                    db_session_id,
                    total_pdfs_processed=len(df_PDFs_documents) if not df_PDFs_documents.empty else 0,
                    total_pdfs_errors=len(ListErrores) if ListErrores else 0,
                    total_records=len(final[0]) if not final[0].empty else 0,
                    processing_time_seconds=total_time,
                    status='completed'
                )
                print(f"[DB] Estadistico y stats de sesion {db_session_id} guardados.")
        except Exception as e_db:
            print(f"[DB] Error guardando estadistico (no afecta pipeline): {e_db}")

        output_zip_path = os.path.join(app.config['DOWNLOAD_FOLDER'], 'ZipGeneral.zip')
        with zipfile.ZipFile(output_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file in ZipFilepaths:
                if os.path.exists(file):
                    zipf.write(file, arcname=os.path.basename(file))  # Store only filename
                else:
                    print(f"⚠️ File not found, skipping: {file}")

        
    ############ NOS  VAMOS A LA CONFIRMACION   ##################
        return render_template('dashboard2.html', files=files_to_download)
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
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── AUTOGENES: landing + secciones ──────────────────────────────────

AUTOGENES_SECCIONES = {
    'concilia': {
        'nombre': 'CONCILIA', 'numero': 'I', 'forma': 'triangulo',
        'tipo': 'Dashboard', 'fase': 'Fase F9',
        'descripcion': 'Coherencia entre fuentes: DWH (vendido), facturas '
                       '(llegado) y pedimentos (declarado). Estado vivo por VIN, '
                       'afirmaciones en competencia y hallazgos monetizados.',
        'metricas': [('conciliado_pct', 'Conciliado %'), ('faltantes', 'Faltantes'),
                     ('vehiculos', 'Vehículos')],
        'estado': 'El motor de hallazgos se construye en F9 — la conciliación '
                  'tri-fuente ya corre en el pipeline y se lee aquí.'},
    'validacion': {
        'nombre': 'VALIDACIÓN', 'numero': 'II', 'forma': 'triangulo',
        'tipo': 'Dashboard', 'fase': 'Fase F10',
        'descripcion': 'La glosa preventiva: conformidad de cada documento contra '
                       'la norma — estructura, catálogo y reglas de negocio. '
                       'Expediente certificado por sesión.',
        'metricas': [('errores', 'Registros con error'), ('facturas', 'Facturas')],
        'estado': 'Los validadores declarativos llegan en F10 — los errores de '
                  'captura ya se leen aquí.'},
    'sinapsis': {
        'nombre': 'SINAPSIS', 'numero': 'III', 'forma': 'triangulo',
        'tipo': 'Dashboard', 'fase': 'Fase F11',
        'descripcion': 'Conocimiento nuevo por recombinación: el modelo propone '
                       'hipótesis, el servidor las recomputa, y solo lo confirmado '
                       'se muestra — en un grafo que se reconfigura para demostrarlo.',
        'metricas': [('entidades', 'Entidades'), ('relaciones', 'Relaciones')],
        'estado': 'El motor de recombinación llega en F11, sobre Qualia (F7) y '
                  'el motor de hallazgos (F9).'},
    'nomos': {
        'nombre': 'NOMOS', 'numero': 'IV', 'forma': 'triangulo',
        'tipo': 'Dashboard', 'fase': 'Fase F12',
        'descripcion': 'La ley del sistema: reglas de negocio como ciudadanos del '
                       'grafo — P&L por regla, backtesting, base normativa citada '
                       'y mapa de cobertura.',
        'metricas': [],
        'estado': 'Latente — legisla sobre un sistema que ya detecta, valida y '
                  'descubre. Cierra la ruta crítica.'},
    'grafo': {
        'nombre': 'Grafo', 'numero': '◉', 'forma': 'circulo',
        'tipo': 'Instrumento', 'fase': 'Fase F3',
        'descripcion': 'El lienzo de fuerzas del caso: núcleo → pedimentos → '
                       'vehículos → facturas → fuentes, con la capa de entidades '
                       'extraídas encima.',
        'metricas': [('entidades', 'Entidades'), ('relaciones', 'Relaciones'),
                     ('fragmentos', 'Fragmentos')],
        'estado': 'El lienzo d3-force es el siguiente entregable de F3; la '
                  'proyección ya sirve en /api/v1/autogenes/grafo.'},
    'ingesta': {
        'nombre': 'Ingesta', 'numero': '◉', 'forma': 'circulo',
        'tipo': 'Instrumento', 'fase': 'Fase F4',
        'descripcion': 'El mapa de ingesta: dendrograma circular de la ontología '
                       'completa + extracción citada por documento con revisión HITL.',
        'metricas': [('artefactos', 'Artefactos'), ('facturas', 'Facturas')],
        'estado': 'La carga por ZIP ya opera desde el landing; la extracción por '
                  'documento llega en F4.'},
    'radar': {
        'nombre': 'Radar', 'numero': '◉', 'forma': 'circulo',
        'tipo': 'Instrumento', 'fase': 'Fase F5',
        'descripcion': 'El instrumento de atención: vencimientos, fuentes frías, '
                       'colas de adjudicación y salud del grafo.',
        'metricas': [], 'estado': 'Latente hasta F5.'},
    'vinculos': {
        'nombre': 'Vínculos', 'numero': '◉', 'forma': 'circulo',
        'tipo': 'Instrumento', 'fase': 'Fase F3',
        'descripcion': 'Caminos citados entre entidades: ruta más corta, '
                       'vecindario por grados y hubs del caso.',
        'metricas': [('productos_camino', 'Caminos guardados')],
        'estado': 'Llega con el lienzo del grafo (F3).'},
    'sintesis': {
        'nombre': 'Síntesis', 'numero': '◉', 'forma': 'circulo',
        'tipo': 'Instrumento', 'fase': 'Fase F6',
        'descripcion': 'El informe ejecutivo citado: digesto del grafo → informe '
                       'con cada afirmación anclada a su fragmento.',
        'metricas': [('productos_informe', 'Informes dockeados')],
        'estado': 'Latente hasta F6.'},
    'qualia': {
        'nombre': 'Qualia', 'numero': '◉', 'forma': 'circulo',
        'tipo': 'Instrumento', 'fase': 'Fase F7',
        'descripcion': 'La máquina de inteligencia: topología de red, comunidades, '
                       'puentes, anomalías y drift entre sesiones.',
        'metricas': [('anomalias', 'Anomalías vs base')],
        'estado': 'Activo — red, escalera, anomalías y drift.'},
}


def _sesion_activa():
    from database.persistence import get_latest_session_id
    return get_latest_session_id()


@app.route('/autogenes')
def autogenes_landing():
    from database import get_connection
    session_id = request.args.get('session_id', type=int) or _sesion_activa()
    etiqueta = '—'
    if session_id:
        conn = get_connection()
        ses = conn.execute(
            "SELECT month_processed, year_processed FROM processing_sessions WHERE id = ?",
            (session_id,)).fetchone()
        conn.close()
        if ses:
            etiqueta = f"{ses['month_processed']:02d}/{ses['year_processed']}"
    return render_template('autogenes.html', sesion_etiqueta=etiqueta)


@app.route('/autogenes/grafo')
def autogenes_grafo():
    """El lienzo de fuerzas del caso (F3): canvas + inspector sobre
    /api/v1/autogenes/grafo."""
    from database import get_connection
    session_id = request.args.get('session_id', type=int) or _sesion_activa()
    etiqueta = '—'
    if session_id:
        conn = get_connection()
        ses = conn.execute(
            "SELECT month_processed, year_processed FROM processing_sessions WHERE id = ?",
            (session_id,)).fetchone()
        conn.close()
        if ses:
            etiqueta = f"{ses['month_processed']:02d}/{ses['year_processed']}"
    return render_template('autogenes_grafo.html', sesion_etiqueta=etiqueta)


@app.route('/autogenes/<seccion>')
def autogenes_seccion(seccion):
    from database import get_connection
    from autogenes.estado import estado_de_sesion
    s = AUTOGENES_SECCIONES.get(seccion)
    if not s:
        return render_template('error.html', error_message='Sección desconocida'), 404
    metricas = []
    session_id = _sesion_activa()
    if session_id and s['metricas']:
        try:
            conn = get_connection()
            est = estado_de_sesion(conn, session_id)
            conn.close()
            for clave, etiqueta in s['metricas']:
                v = est.get(clave)
                if clave == 'conciliado_pct' and v is not None:
                    v = f"{v}%"
                metricas.append({'etiqueta': etiqueta, 'valor': v if v is not None else '—'})
        except Exception:
            metricas = []
    return render_template('autogenes_seccion.html', s=s, metricas=metricas)


@app.route('/api/v1/autogenes/estado', methods=['GET'])
def api_autogenes_estado():
    """Metricas vivas para las constelaciones y la barra de estado."""
    from database import get_connection
    from autogenes.estado import estado_de_sesion
    try:
        session_id = request.args.get('session_id', type=int) or _sesion_activa()
        if not session_id:
            return jsonify({'error': 'No hay sesiones procesadas'}), 404
        conn = get_connection()
        try:
            est = estado_de_sesion(conn, session_id)
        finally:
            conn.close()
        return jsonify(est)
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/autogenes/ingesta')
def autogenes_ingesta():
    """Ingesta (F4): mapa dendrograma + bandeja de documentos +
    extracción citada con revisión HITL."""
    return render_template('autogenes_ingesta.html',
                           sesion_etiqueta=_etiqueta_sesion())


@app.route('/autogenes/radar')
def autogenes_radar():
    """Radar (F5): vencimientos, fuentes frías, huérfanas y pendientes."""
    return render_template('autogenes_radar.html',
                           sesion_etiqueta=_etiqueta_sesion())


@app.route('/autogenes/qualia')
def autogenes_qualia():
    """Qualia (F7): la red topológica del caso — comunidades, puentes,
    escalera de renormalización, anomalías contra la base del operador."""
    return render_template('autogenes_qualia.html',
                           sesion_etiqueta=_etiqueta_sesion())


@app.route('/autogenes/qualia/terreno')
def autogenes_qualia_terreno():
    """Qualia · Terreno (F7): la malla isométrica que se abomba donde un
    detector midió una desviación — la altura es la severidad."""
    return render_template('autogenes_qualia_terreno.html',
                           sesion_etiqueta=_etiqueta_sesion())


@app.route('/autogenes/qualia/cascada')
def autogenes_qualia_cascada():
    """Qualia · Cascada (F7): el what-if como fibra óptica — caída de un
    nodo o enlace simulado, con el frente BFS del motor como pulso."""
    return render_template('autogenes_qualia_cascada.html',
                           sesion_etiqueta=_etiqueta_sesion())


@app.route('/autogenes/qualia/horizonte')
def autogenes_qualia_horizonte():
    """Qualia · Horizonte (F7): osciloscopio de la telemetría propia con
    las intervenciones de la bitácora y su delta medido."""
    return render_template('autogenes_qualia_horizonte.html',
                           sesion_etiqueta=_etiqueta_sesion())


@app.route('/autogenes/qualia/orbe')
def autogenes_qualia_orbe():
    """Qualia · Orbe (F7): sistema orbital por centralidad — masa, rango
    y plano de comunidad; tap para el porqué de cada masa."""
    return render_template('autogenes_qualia_orbe.html',
                           sesion_etiqueta=_etiqueta_sesion())


@app.route('/autogenes/qualia/cuerdas')
def autogenes_qualia_cuerdas():
    """Qualia · Cuerdas (F7): el anillo en orden de comunidad con cada
    vínculo como cuerda al centro — tocar aísla un concepto."""
    return render_template('autogenes_qualia_cuerdas.html',
                           sesion_etiqueta=_etiqueta_sesion())


@app.route('/autogenes/qualia/maquina')
def autogenes_qualia_maquina():
    """Qualia · Máquina C2 (F7): las cuatro ventanas OODA con titulares
    del motor y la lectura SYNESIS del sistema."""
    return render_template('autogenes_qualia_maquina.html',
                           sesion_etiqueta=_etiqueta_sesion())


@app.route('/autogenes/sintesis')
def autogenes_sintesis():
    """Síntesis (F6): informe ejecutivo citado, split digesto ↔ informe
    con trazas de cita al nodo del grafo que sustenta cada punto."""
    return render_template('autogenes_sintesis.html',
                           sesion_etiqueta=_etiqueta_sesion())


def _etiqueta_sesion():
    from database import get_connection
    session_id = request.args.get('session_id', type=int) or _sesion_activa()
    if not session_id:
        return '—'
    conn = get_connection()
    ses = conn.execute(
        "SELECT month_processed, year_processed FROM processing_sessions WHERE id = ?",
        (session_id,)).fetchone()
    conn.close()
    return f"{ses['month_processed']:02d}/{ses['year_processed']}" if ses else '—'


@app.route('/api/v1/autogenes/artefactos', methods=['GET'])
def api_autogenes_artefactos():
    from autogenes.ingesta import listar_artefactos

    def handler(conn, session_id):
        return jsonify({'session_id': session_id,
                        'artefactos': listar_artefactos(conn, session_id)})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/ingestar', methods=['POST'])
def api_autogenes_ingestar():
    """Un documento entra al sustrato: PDF por páginas, texto por bloques."""
    from autogenes.ingesta import ingestar_pdf, ingestar_texto
    archivo = request.files.get('documento')
    if not archivo or not archivo.filename:
        return jsonify({'error': 'Falta el archivo (campo documento)'}), 400
    nombre = secure_filename(archivo.filename)

    def handler(conn, session_id):
        if nombre.lower().endswith('.pdf'):
            r = ingestar_pdf(conn, session_id, nombre, archivo.read())
        elif nombre.lower().endswith(('.txt', '.md')):
            r = ingestar_texto(conn, session_id, nombre,
                               archivo.read().decode('utf-8', errors='replace'))
        else:
            return jsonify({'error': 'Formato no soportado: usa PDF o TXT'}), 400
        if 'error' in r:
            return jsonify(r), 422
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok', **r})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/extraer', methods=['POST'])
def api_autogenes_extraer():
    """Propuesta de grafo citada para un artefacto (NO escribe — HITL)."""
    from database.config import get_all_config
    from autogenes.extraccion import extraer_de_artefacto
    data = request.get_json(silent=True) or {}
    artefacto_id = data.get('artefacto_id', '')
    if not artefacto_id:
        return jsonify({'error': 'Falta artefacto_id'}), 400

    def handler(conn, session_id):
        config = get_all_config(conn)
        r = extraer_de_artefacto(conn, session_id, artefacto_id, config=config,
                                 con_quorum=bool(data.get('quorum')))
        if 'error' in r:
            return jsonify(r), 422
        return jsonify({'session_id': session_id, **r})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/integrar', methods=['POST'])
def api_autogenes_integrar():
    """Integra la propuesta revisada por el operador. El saneamiento
    final vive en Sustrato.integrar_propuesta — cinturón y tirantes."""
    from autogenes.sustrato import Sustrato
    from autogenes.tipos import PropuestaGrafo
    data = request.get_json(silent=True) or {}
    try:
        propuesta = PropuestaGrafo.model_validate(
            {'entidades': data.get('entidades', []),
             'relaciones': data.get('relaciones', [])})
    except Exception:
        return jsonify({'error': 'Propuesta malformada'}), 400

    def handler(conn, session_id):
        resultado = Sustrato(conn, session_id).integrar_propuesta(propuesta)
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok', **resultado})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/sintetizar', methods=['POST'])
def api_autogenes_sintetizar():
    """Genera el informe ejecutivo citado del caso (NO dockea — HITL).
    El saneamiento contra ids/nombres reales corre en servidor."""
    from database.config import get_all_config
    from autogenes.informe import redactar_informe

    def handler(conn, session_id):
        config = get_all_config(conn)
        r = redactar_informe(conn, session_id, config=config)
        if 'error' in r:
            return jsonify(r), 422
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/sintesis/dockear', methods=['POST'])
def api_autogenes_sintesis_dockear():
    """Dockea el informe revisado como Producto{clase:"informe"}. Vuelve
    a sanear contra el grafo real — cinturón y tirantes."""
    from autogenes.informe import dockear_informe
    data = request.get_json(silent=True) or {}
    informe = data.get('informe')
    if not isinstance(informe, dict):
        return jsonify({'error': 'Falta el informe a dockear'}), 400

    def handler(conn, session_id):
        r = dockear_informe(conn, session_id, informe)
        if 'error' in r:
            return jsonify(r), 422
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok', **r})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/qualia/estado', methods=['GET'])
def api_qualia_estado():
    """OBSERVAR: resumen estructural, referencia, anomalías medidas y
    telemetría — una llamada para la ventana."""
    from autogenes.qualia import estado_qualia

    def handler(conn, session_id):
        return jsonify({'session_id': session_id, **estado_qualia(conn, session_id)})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/qualia/base', methods=['POST'])
def api_qualia_base():
    """El operador fija SU referencia — nada más la mueve."""
    from autogenes.qualia import fijar_base

    def handler(conn, session_id):
        snap = fijar_base(conn, session_id)
        return jsonify({'status': 'ok', 'base': snap})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/qualia/drift', methods=['GET'])
def api_qualia_drift():
    """Drift topológico entre sesiones: ?referencia=<id> es la base."""
    from autogenes.qualia import drift_sesiones
    referencia = request.args.get('referencia', type=int)
    if not referencia:
        return jsonify({'error': 'Falta el parámetro referencia (sesión base)'}), 400

    def handler(conn, session_id):
        try:
            return jsonify(drift_sesiones(conn, referencia, session_id))
        except ValueError as e:
            return jsonify({'error': str(e)}), 404
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/qualia/cascada', methods=['GET'])
def api_qualia_cascada():
    """DECIDIR, what-if en memoria: ?caida=<id> simula quitar un nodo;
    ?enlaza=<a>,<b> simula un vínculo nuevo. Jamás escribe."""
    from autogenes.cascada import simular_caida, simular_enlace
    from autogenes.qualia import red_de_sesion
    caida = request.args.get('caida', '')
    enlaza = request.args.get('enlaza', '')
    if not caida and not enlaza:
        return jsonify({'error': 'Indica caida=<id> o enlaza=<a>,<b>'}), 400

    def handler(conn, session_id):
        red = red_de_sesion(conn, session_id)
        if caida:
            return jsonify({'session_id': session_id, 'modo': 'caida',
                            'nodo': caida, **simular_caida(red, caida)})
        partes = enlaza.split(',')
        if len(partes) != 2 or not partes[0] or not partes[1]:
            return jsonify({'error': 'enlaza requiere dos ids: a,b'}), 400
        impacto = simular_enlace(red, partes[0], partes[1])
        # el pulso del lienzo: la onda que nace del enlace simulado
        from autogenes.cascada import onda_desde
        con_enlace = {'nodos': red['nodos'],
                      'enlaces': [*red['enlaces'],
                                  {'origen': partes[0], 'destino': partes[1],
                                   'peso': 1}]}
        return jsonify({'session_id': session_id, 'modo': 'enlace',
                        'a': partes[0], 'b': partes[1],
                        'ondas': onda_desde(con_enlace, partes[0], 4),
                        **impacto})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/qualia/horizonte', methods=['GET'])
def api_qualia_horizonte():
    """ACTUAR: telemetría muestreada + intervenciones de la bitácora con
    su delta medido antes/después."""
    from autogenes.qualia import horizonte_de_sesion

    def handler(conn, session_id):
        h = horizonte_de_sesion(conn, session_id)
        if h is None:
            return jsonify({'session_id': session_id, 'horizonte': None,
                            'motivo': 'Sin telemetría aún — el horizonte '
                                      'nace con la primera mutación'})
        return jsonify({'session_id': session_id, 'horizonte': h})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/qualia/narrativa', methods=['POST'])
def api_qualia_narrativa():
    """La lectura SYNESIS de la red: el modelo interpreta el digesto ya
    calculado; el saneador de claves corre en servidor."""
    from database.config import get_all_config
    from autogenes.qualia_narrativa import redactar_narrativa

    def handler(conn, session_id):
        r = redactar_narrativa(conn, session_id, get_all_config(conn))
        if 'error' in r:
            return jsonify(r), 502
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/qualia/parte/dockear', methods=['POST'])
def api_qualia_parte_dockear():
    """HITL: dockea el parte del sistema como Producto{informe} de la
    unidad qualia. El digesto se recalcula del grafo vivo y la narrativa
    se vuelve a sanear en servidor antes de escribir."""
    from autogenes.qualia_narrativa import dockear_parte

    cuerpo = request.get_json(silent=True) or {}
    narrativa = cuerpo.get('narrativa')
    if not isinstance(narrativa, dict):
        return jsonify({'error': 'Falta la narrativa a dockear'}), 400

    def handler(conn, session_id):
        r = dockear_parte(conn, session_id, narrativa)
        if 'error' in r:
            return jsonify(r), 422
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/qualia/red', methods=['GET'])
def api_qualia_red():
    """La red del caso para el lienzo QUALIA: nivel N de la escalera de
    renormalización con comunidades, grados, masas y resumen citable."""
    from autogenes import topologia
    from autogenes.qualia import red_de_sesion
    nivel = request.args.get('nivel', default=0, type=int)
    con_espectral = request.args.get('espectral', default=0, type=int)

    def handler(conn, session_id):
        red = red_de_sesion(conn, session_id)
        escalera = topologia.escalera_renorm(red)
        if not 0 <= nivel < len(escalera):
            return jsonify({'error': f'Nivel fuera de la escalera (0–{len(escalera) - 1})'}), 400
        r = escalera[nivel]
        comunidad = topologia.detectar_comunidades(r)
        cuerpo = {
            'session_id': session_id,
            'nivel': nivel,
            'niveles': [len(x['nodos']) for x in escalera],
            'red': r,
            'comunidad': comunidad,
            'orden': topologia.ordenar_por_comunidad(r, comunidad),
            'grado': topologia.grado_ponderado(r),
            'masas': topologia.centralidad_vector_propio(r),
            'resumen': topologia.resumen_red(r),
        }
        if con_espectral:
            cuerpo['espectral'] = topologia.embedding_espectral(r)
        return jsonify(cuerpo)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/radar', methods=['GET'])
def api_autogenes_radar():
    from autogenes.senales import senales_de_sesion

    def handler(conn, session_id):
        return jsonify(senales_de_sesion(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/metabolismo', methods=['GET'])
def api_autogenes_metabolismo():
    """Radar reframeado: la vía de producción de conocimiento del caso
    como red metabólica con balance pre/post."""
    from autogenes.metabolismo import metabolismo_de_sesion

    def handler(conn, session_id):
        return jsonify(metabolismo_de_sesion(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/autogenes/vinculos')
def autogenes_vinculos():
    """Vínculos (F3): camino más corto citado, vecindario y hubs."""
    from database import get_connection
    session_id = request.args.get('session_id', type=int) or _sesion_activa()
    etiqueta = '—'
    if session_id:
        conn = get_connection()
        ses = conn.execute(
            "SELECT month_processed, year_processed FROM processing_sessions WHERE id = ?",
            (session_id,)).fetchone()
        conn.close()
        if ses:
            etiqueta = f"{ses['month_processed']:02d}/{ses['year_processed']}"
    return render_template('autogenes_vinculos.html', sesion_etiqueta=etiqueta)


def _snapshot_telemetria(conn, session_id):
    """Telemetría QUALIA tras una mutación del grafo — best-effort: un
    fallo de muestreo jamás debe tumbar la mutación que lo disparó."""
    try:
        from autogenes.qualia import registrar_snapshot
        registrar_snapshot(conn, session_id)
    except Exception:
        pass


def _con_sesion(handler):
    """Patrón común de los endpoints AUTOGENES: conexión + sesión activa
    verificada (una sesión inexistente es 404, no un 500 críptico)."""
    from database import get_connection
    session_id = request.args.get('session_id', type=int) or _sesion_activa()
    if not session_id:
        return jsonify({'error': 'No hay sesiones procesadas'}), 404
    conn = get_connection()
    try:
        existe = conn.execute(
            'SELECT 1 FROM processing_sessions WHERE id = ?', (session_id,)
        ).fetchone()
        if not existe:
            return jsonify({'error': f'Sesión inexistente: {session_id}'}), 404
        return handler(conn, session_id)
    finally:
        conn.close()


@app.route('/api/v1/autogenes/camino', methods=['GET'])
def api_autogenes_camino():
    from autogenes.caminos import camino_mas_corto
    desde = request.args.get('desde', '')
    hasta = request.args.get('hasta', '')
    if not desde or not hasta:
        return jsonify({'error': 'Faltan parámetros desde/hasta'}), 400

    def handler(conn, session_id):
        cam = camino_mas_corto(conn, session_id, desde, hasta)
        if cam is None:
            return jsonify({'camino': None,
                            'mensaje': 'No existe camino entre esos nodos'}), 200
        return jsonify({'session_id': session_id, 'camino': cam})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/vecindario', methods=['GET'])
def api_autogenes_vecindario():
    from autogenes.caminos import vecindario
    nodo = request.args.get('nodo', '')
    grados = min(max(request.args.get('grados', default=2, type=int), 1), 4)
    if not nodo:
        return jsonify({'error': 'Falta el parámetro nodo'}), 400

    def handler(conn, session_id):
        v = vecindario(conn, session_id, nodo, grados=grados)
        if v is None:
            return jsonify({'error': 'Nodo desconocido'}), 404
        return jsonify({'session_id': session_id, **v})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/hubs', methods=['GET'])
def api_autogenes_hubs():
    from autogenes.caminos import mas_conectadas
    top = min(max(request.args.get('top', default=10, type=int), 1), 50)

    def handler(conn, session_id):
        return jsonify({'session_id': session_id,
                        'hubs': mas_conectadas(conn, session_id, top=top)})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/camino/dockear', methods=['POST'])
def api_autogenes_camino_dockear():
    """Dockea el camino como Producto (recomputado en servidor — el
    cliente jamás dicta el cuerpo ni la evidencia)."""
    from autogenes.caminos import camino_mas_corto, cuerpo_camino_guardado
    from autogenes.sustrato import Sustrato
    data = request.get_json(silent=True) or {}
    desde, hasta = data.get('desde_id', ''), data.get('hasta_id', '')
    if not desde or not hasta:
        return jsonify({'error': 'Faltan desde_id/hasta_id'}), 400

    def handler(conn, session_id):
        cam = camino_mas_corto(conn, session_id, desde, hasta)
        if cam is None:
            return jsonify({'error': 'No existe camino entre esos nodos'}), 404
        cuerpo = cuerpo_camino_guardado(cam)
        anclas = [n['id'] for n in (cam['desde'], cam['hasta'])
                  if n['kind'] == 'entidad']
        p = Sustrato(conn, session_id).dockear_producto(
            'camino', f"Camino: {cuerpo['desde']} → {cuerpo['hasta']}",
            'vinculos', cuerpo, entidades=anclas, evidencia=cam['evidencia'])
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok', 'producto_id': p.id, 'titulo': p.titulo})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/grafo', methods=['GET'])
def api_autogenes_grafo():
    """La ontologia de una sesion como {nodos, enlaces} (solo lectura).

    Query params: session_id (default: la sesion mas reciente),
    limite_vehiculos (opcional, acota los nodos vehiculo)."""
    from database import get_connection
    from database.persistence import get_latest_session_id
    from autogenes.proyeccion import construir_grafo
    try:
        conn = get_connection()
        try:
            session_id = request.args.get('session_id', type=int) or get_latest_session_id()
            if not session_id:
                return jsonify({'error': 'No hay sesiones procesadas'}), 404
            limite = request.args.get('limite_vehiculos', type=int)
            grafo = construir_grafo(conn, session_id, limite_vehiculos=limite)
        finally:
            conn.close()
        return jsonify({'session_id': session_id, **grafo})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/autogenes/arbol', methods=['GET'])
def api_autogenes_arbol():
    """La ontologia de una sesion como arbol jerarquico (mapa de ingesta)."""
    from database import get_connection
    from database.persistence import get_latest_session_id
    from autogenes.proyeccion import arbol_ontologia
    try:
        conn = get_connection()
        try:
            session_id = request.args.get('session_id', type=int) or get_latest_session_id()
            if not session_id:
                return jsonify({'error': 'No hay sesiones procesadas'}), 404
            arbol = arbol_ontologia(conn, session_id)
        finally:
            conn.close()
        return jsonify({'session_id': session_id, 'arbol': arbol})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
_chat_handler = None
_chat_proveedor = None

def _get_chat_handler():
    global _chat_handler, _chat_proveedor
    if _chat_handler is None:
        try:
            from database import get_connection
            from database.config import get_all_config
            from jarvis.llm_interface import seleccionar_proveedor
            from jarvis.chat_handler import ChatHandler
            conn = get_connection()
            config = get_all_config(conn)
            conn.close()
            nombre, provider = seleccionar_proveedor(config)
            _chat_proveedor = nombre
            print(f"[Gnosis AI] Proveedor LLM activo: {nombre}")
            _chat_handler = ChatHandler(provider)
        except Exception as e:
            print(f"[Gnosis AI] Error inicializando chat: {e}")
            raise
    return _chat_handler


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
            'activo': _chat_proveedor,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/admin/llm', methods=['POST'])
def api_admin_llm_configurar():
    """Configura el selector LLM. Claves permitidas: llm_default,
    llm_fallback_claude (on/off), llm_ollama (on/off), deepseek_model,
    claude_model. Reinicia el handler para aplicar de inmediato."""
    global _chat_handler, _chat_proveedor
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
        _chat_handler = None
        _chat_proveedor = None
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
        handler = _get_chat_handler()
        result = handler.handle_message(data['message'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/chat/reset', methods=['POST'])
def api_chat_reset():
    """Reinicia la conversacion de Gnosis AI."""
    global _chat_handler
    try:
        if _chat_handler:
            _chat_handler.reset()
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
    for nombre in nombres_exito:
        orig = nombre_map.get(nombre, nombre)
        err_file = os.path.join(errores_dir, orig)
        if os.path.isfile(err_file):
            os.remove(err_file)
    for path in errores_nuevos:
        secure_name = os.path.basename(path)
        orig = nombre_map.get(secure_name, secure_name)
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

    err_file = os.path.join(app.config['UPLOAD_FOLDER'], 'errores', str(session_id), filename)
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
    app.run(host="0.0.0.0", port=5001,debug=True)