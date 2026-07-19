"""AUTOGENES: el sustrato de ontología unificada — landing, secciones,
grafo, ingesta, QUALIA, CONCILIA, VALIDACIÓN, SINAPSIS, NOMOS, CRONOS,
síntesis y las APIs que los alimentan. Todo cuelga de `_con_sesion`
(estado vacío honesto) y las escrituras pasan por el sustrato; ninguna
ruta fabrica evidencia ni estima montos."""
from flask import Blueprint, render_template, request, jsonify
from werkzeug.utils import secure_filename

from rutas.comun import _sesion_activa, _etiqueta_sesion, _con_sesion, _asegurar_sesion

bp = Blueprint('autogenes', __name__)


# ── AUTOGENES: landing + secciones ──────────────────────────────────

AUTOGENES_SECCIONES = {
    'concilia': {
        'nombre': 'CONCILIA', 'numero': 'I', 'forma': 'triangulo',
        'tipo': 'Dashboard', 'fase': 'Fase F9',
        'descripcion': 'Coherencia entre fuentes: DWH (vendido), facturas '
                       '(llegado) y pedimentos (declarado). Estado vivo por VIN, '
                       'afirmaciones en competencia y hallazgos monetizados.',
        'metricas': [('conciliado_pct', 'Conciliado %'), ('hallazgos', 'Hallazgos'),
                     ('vehiculos', 'Vehículos')],
        'estado': 'Activo — flujo tri-fuente y hallazgos monetizados del motor '
                  'CONCILIA.'},
    'validacion': {
        'nombre': 'VALIDACIÓN', 'numero': 'II', 'forma': 'triangulo',
        'tipo': 'Dashboard', 'fase': 'Fase F10',
        'descripcion': 'La glosa preventiva: conformidad de cada documento contra '
                       'la norma — estructura, catálogo y reglas de negocio. '
                       'Expediente certificado por sesión.',
        'metricas': [('errores', 'Registros con error'), ('facturas', 'Facturas')],
        'estado': 'Activo — reglas de estructura, catálogo y negocio evaluadas '
                  'sobre toda la sesión, con filas violadoras citadas.'},
    'sinapsis': {
        'nombre': 'SINAPSIS', 'numero': 'III', 'forma': 'triangulo',
        'tipo': 'Dashboard', 'fase': 'Fase F11',
        'descripcion': 'Insights por recombinación verificada: conjunciones '
                       'entre las salidas vivas de los motores (QUALIA × '
                       'CONCILIA × VALIDACIÓN) que ninguno ve solo, con su '
                       'cadena de composición auditable.',
        'metricas': [('entidades', 'Entidades'), ('relaciones', 'Relaciones')],
        'estado': 'Activo — puentes en duda, monolitos sin conciliar, cupos '
                  'comprometidos y errores confirmados por doble motor.'},
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




@bp.route('/autogenes')
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


@bp.route('/autogenes/grafo')
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


@bp.route('/autogenes/<seccion>')
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


@bp.route('/api/v1/autogenes/estado', methods=['GET'])
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


@bp.route('/autogenes/ingesta')
def autogenes_ingesta():
    """Ingesta (F4): mapa dendrograma + bandeja de documentos +
    extracción citada con revisión HITL."""
    return render_template('autogenes_ingesta.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/radar')
def autogenes_radar():
    """Radar (F5): vencimientos, fuentes frías, huérfanas y pendientes."""
    return render_template('autogenes_radar.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/qualia')
def autogenes_qualia():
    """Qualia (F7): la red topológica del caso — comunidades, puentes,
    escalera de renormalización, anomalías contra la base del operador."""
    return render_template('autogenes_qualia.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/qualia/terreno')
def autogenes_qualia_terreno():
    """Qualia · Terreno (F7): la malla isométrica que se abomba donde un
    detector midió una desviación — la altura es la severidad."""
    return render_template('autogenes_qualia_terreno.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/qualia/cascada')
def autogenes_qualia_cascada():
    """Qualia · Cascada (F7): el what-if como fibra óptica — caída de un
    nodo o enlace simulado, con el frente BFS del motor como pulso."""
    return render_template('autogenes_qualia_cascada.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/qualia/horizonte')
def autogenes_qualia_horizonte():
    """Qualia · Horizonte (F7): osciloscopio de la telemetría propia con
    las intervenciones de la bitácora y su delta medido."""
    return render_template('autogenes_qualia_horizonte.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/qualia/orbe')
def autogenes_qualia_orbe():
    """Qualia · Orbe (F7): sistema orbital por centralidad — masa, rango
    y plano de comunidad; tap para el porqué de cada masa."""
    return render_template('autogenes_qualia_orbe.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/qualia/cuerdas')
def autogenes_qualia_cuerdas():
    """Qualia · Cuerdas (F7): el anillo en orden de comunidad con cada
    vínculo como cuerda al centro — tocar aísla un concepto."""
    return render_template('autogenes_qualia_cuerdas.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/qualia/maquina')
def autogenes_qualia_maquina():
    """Qualia · Máquina C2 (F7): las cuatro ventanas OODA con titulares
    del motor y la lectura SYNESIS del sistema."""
    return render_template('autogenes_qualia_maquina.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/qualia/deriva')
def autogenes_qualia_deriva():
    """Qualia · Deriva (F7, Q6): el octavo instrumento — cómo cambió el
    caso desde una sesión de referencia: ganado/perdido medido y la huella
    de cohesión comparada."""
    return render_template('autogenes_qualia_deriva.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/concilia')
def autogenes_concilia():
    """CONCILIA (F9): dashboard propio de la conciliación tri-fuente —
    flujo vendido/conciliado/llegado y hallazgos monetizados del motor."""
    return render_template('autogenes_concilia.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/validacion')
def autogenes_validacion():
    """VALIDACIÓN (F10): la glosa preventiva — conformidad de cada fila
    contra la norma, con cada regla evaluada y sus filas violadoras."""
    return render_template('autogenes_validacion.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/sinapsis')
def autogenes_sinapsis():
    """SINAPSIS (F11): insights por recombinación verificada — las
    conjunciones entre motores que ninguno ve solo."""
    return render_template('autogenes_sinapsis.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/autogenes/sintesis')
def autogenes_sintesis():
    """Síntesis (F6): informe ejecutivo citado, split digesto ↔ informe
    con trazas de cita al nodo del grafo que sustenta cada punto."""
    return render_template('autogenes_sintesis.html',
                           sesion_etiqueta=_etiqueta_sesion())




@bp.route('/api/v1/autogenes/artefactos', methods=['GET'])
def api_autogenes_artefactos():
    from autogenes.ingesta import listar_artefactos

    def handler(conn, session_id):
        return jsonify({'session_id': session_id,
                        'artefactos': listar_artefactos(conn, session_id)})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/ingestar', methods=['POST'])
def api_autogenes_ingestar():
    """Un documento entra al sustrato (PDF, texto, tabla). Un ZIP se
    expande y cada archivo interno se ingiere; las imágenes se rechazan."""
    import io
    import zipfile

    from autogenes.ingesta import ingestar_archivo
    archivo = request.files.get('documento')
    if not archivo or not archivo.filename:
        return jsonify({'error': 'Falta el archivo (campo documento)'}), 400
    nombre = secure_filename(archivo.filename)
    contenido = archivo.read()
    # En una carga masiva (carpeta/lote), el cliente marca lote=1: el snapshot
    # QUALIA reconstruye toda la red de la sesión, así que hacerlo por archivo
    # es O(n^2). Se difiere a un único snapshot al cerrar el lote
    # (endpoint telemetria/snapshot).
    en_lote = request.form.get('lote') in ('1', 'true', 'on')

    def handler(conn, session_id):
        # ── ZIP: ingerir cada archivo interno, resumen agregado ──
        if nombre.lower().endswith('.zip'):
            try:
                zf = zipfile.ZipFile(io.BytesIO(contenido))
            except zipfile.BadZipFile:
                return jsonify({'error': 'El ZIP está dañado'}), 400
            # Guardia anti zip-bomba (MAX_CONTENT_LENGTH acota el ARCHIVO; esto
            # lo DESCOMPRIMIDO). Este path síncrono queda para ZIPs chicos; la
            # UI manda los grandes a ingestar/zip (goteo, sin tumbar el worker).
            from autogenes.lotes import MAX_UNZIPPED_BYTES
            crudo = sum(i.file_size for i in zf.infolist()
                        if not i.is_dir() and not i.filename.startswith('__MACOSX'))
            if crudo > MAX_UNZIPPED_BYTES:
                return jsonify({'error': f'El ZIP se expande a {crudo // (1024*1024)} '
                                'MB; usa la carga por lotes'}), 400
            ok, err, dup, frags = [], [], [], 0
            for info in zf.infolist():
                if info.is_dir() or info.filename.startswith('__MACOSX'):
                    continue
                interno = secure_filename(info.filename.split('/')[-1])
                if not interno:
                    continue
                r = ingestar_archivo(conn, session_id, interno, zf.read(info))
                if 'duplicado' in r:
                    dup.append(interno)
                elif 'error' in r:
                    err.append(interno)
                else:
                    ok.append(interno)
                    frags += r.get('fragmentos', 0)
            if ok:
                _snapshot_telemetria(conn, session_id)
            return jsonify({'status': 'ok', 'lote': True,
                            'ingeridos': len(ok), 'fallidos': len(err),
                            'duplicados': len(dup), 'fragmentos': frags,
                            'errores': err})
        # ── archivo suelto ──
        r = ingestar_archivo(conn, session_id, nombre, contenido)
        if 'duplicado' in r:
            return jsonify({'error': 'Ya ingerido en esta sesión: ' + r['duplicado'],
                            'duplicado': r['duplicado']}), 409
        if 'error' in r:
            return jsonify(r), 422
        if not en_lote:
            _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok', **r})
    try:
        _asegurar_sesion()   # dockear evidencia no exige un mes ya procesado
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/telemetria/snapshot', methods=['POST'])
def api_autogenes_telemetria_snapshot():
    """Cierra un lote de ingesta con UN solo snapshot QUALIA — el cliente lo
    llama al terminar la carga masiva (que subió con lote=1, sin snapshot por
    archivo). Best-effort: nunca es un error duro para el operador."""
    def handler(conn, session_id):
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok'})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── ZIP grande por goteo: expandir a staging + procesar en tandas ────
# Un ZIP mensual de miles de facturas en un solo request bloquea un worker y
# rebasa el timeout de gunicorn (se "congela"). Se expande a disco una vez y
# el cliente ingiere en tandas acotadas por tiempo — reanudable por dedupe.

@bp.route('/api/v1/autogenes/ingestar/zip', methods=['POST'])
def api_autogenes_ingestar_zip():
    """Expande un ZIP a staging y registra el lote — NO ingiere. Devuelve
    {lote_id, total}. El cliente luego pide tandas (ingestar/lote/<id>)."""
    import os
    import uuid as _uuid

    from flask import current_app

    from autogenes.lotes import LoteError, expandir_zip
    archivo = request.files.get('documento')
    if not archivo or not archivo.filename:
        return jsonify({'error': 'Falta el archivo (campo documento)'}), 400
    if not archivo.filename.lower().endswith('.zip'):
        return jsonify({'error': 'Este endpoint solo acepta ZIP'}), 400

    def handler(conn, session_id):
        base = current_app.config['UPLOAD_FOLDER']
        os.makedirs(base, exist_ok=True)
        tmp = os.path.join(base, f'_zip_{_uuid.uuid4().hex}.zip')
        try:
            archivo.save(tmp)   # streaming a disco: el ZIP no vive entero en RAM
            r = expandir_zip(base, session_id, tmp)
        except LoteError as e:
            return jsonify({'error': str(e)}), 400
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass
        return jsonify({'status': 'ok', **r})
    try:
        _asegurar_sesion()   # dockear evidencia no exige un mes ya procesado
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/ingestar/lote/<lote_id>', methods=['POST'])
def api_autogenes_ingestar_lote(lote_id):
    """Ingiere la siguiente tanda del lote (acotada por tiempo). Devuelve el
    progreso; al terminar dispara un único snapshot y borra el staging."""
    from flask import current_app

    from autogenes.lotes import LoteError, procesar_tanda

    def handler(conn, session_id):
        base = current_app.config['UPLOAD_FOLDER']
        try:
            r = procesar_tanda(conn, base, session_id, lote_id)
        except LoteError as e:
            return jsonify({'error': str(e)}), 404
        if r['done']:
            _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok', **r})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/ingestar/lote/<lote_id>', methods=['DELETE'])
def api_autogenes_descartar_lote(lote_id):
    """Tira el staging de un lote (cancelación/limpieza). Lo ya ingerido
    permanece en el sustrato; solo se descarta lo que faltaba por procesar."""
    from flask import current_app

    from autogenes.lotes import LoteError, descartar

    def handler(conn, session_id):
        base = current_app.config['UPLOAD_FOLDER']
        try:
            descartar(base, session_id, lote_id)
        except LoteError as e:
            return jsonify({'error': str(e)}), 400
        return jsonify({'status': 'ok'})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/extraer', methods=['POST'])
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


@bp.route('/api/v1/autogenes/integrar', methods=['POST'])
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


@bp.route('/api/v1/autogenes/sintetizar', methods=['POST'])
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


@bp.route('/api/v1/autogenes/sintesis/dockear', methods=['POST'])
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


@bp.route('/api/v1/autogenes/qualia/estado', methods=['GET'])
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


@bp.route('/api/v1/autogenes/qualia/base', methods=['POST'])
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


@bp.route('/api/v1/autogenes/qualia/drift', methods=['GET'])
def api_qualia_drift():
    """Deriva entre sesiones (Q6): ?referencia=<id> es la base. Si se omite,
    toma por default la sesión inmediatamente anterior. Devuelve además la
    lista de sesiones para el selector y la huella de cohesión de ambas."""
    from autogenes.qualia import drift_sesiones
    referencia = request.args.get('referencia', type=int)

    def handler(conn, session_id):
        sesiones = [
            {'id': r['id'],
             'etiqueta': f"{r['month_processed']:02d}/{r['year_processed']}"}
            for r in conn.execute(
                "SELECT id, month_processed, year_processed FROM processing_sessions"
                " WHERE id != ? ORDER BY id DESC", (session_id,))
        ]
        ref = referencia or (sesiones[0]['id'] if sesiones else None)
        if not ref:
            return jsonify({'sin_referencia': True, 'sesiones': sesiones,
                            'motivo': 'No hay otra sesión contra la cual comparar '
                                      'la deriva del caso.'})
        try:
            d = drift_sesiones(conn, ref, session_id)
        except ValueError as e:
            return jsonify({'error': str(e)}), 404
        d['sesiones'] = sesiones
        d['referencia'] = ref
        return jsonify(d)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/qualia/cascada', methods=['GET'])
def api_qualia_cascada():
    """DECIDIR, what-if en memoria: ?caida=<id> simula quitar un nodo;
    ?enlaza=<a>,<b> simula un vínculo nuevo. Jamás escribe."""
    from autogenes.cascada import simular_caida, simular_enlace
    from autogenes.qualia import red_de_sesion, unidades_por_nodo
    caida = request.args.get('caida', '')
    enlaza = request.args.get('enlaza', '')
    if not caida and not enlaza:
        return jsonify({'error': 'Indica caida=<id> o enlaza=<a>,<b>'}), 400

    def handler(conn, session_id):
        red = red_de_sesion(conn, session_id)
        if caida:
            imp = simular_caida(red, caida)
            # Volumen afectado = Σ unidades MEDIDAS de las entidades que
            # quedan desconectadas (base atómica: no infla, es citable).
            unid = unidades_por_nodo(conn, session_id)
            for d in imp['desconectados']:
                d['unidades'] = unid.get(d['id'], 0)
            imp['volumen_afectado'] = sum(d['unidades'] for d in imp['desconectados'])
            return jsonify({'session_id': session_id, 'modo': 'caida',
                            'nodo': caida, **imp})
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


@bp.route('/api/v1/autogenes/qualia/anomalia', methods=['POST'])
def api_qualia_anomalia():
    """Ciclo de vida de una anomalía (Q5): fija la disposición del operador
    (nuevo→en_gestion→resuelto/descartado) + nota. Puerta única: escribe por
    Sustrato con bitácora WORM; la anomalía nunca se monetiza (lo veta el
    esquema)."""
    from autogenes.sustrato import Sustrato
    data = request.get_json(silent=True) or {}
    clave = (data.get('clave') or '').strip()
    estado = (data.get('estado') or '').strip()
    nota = data.get('nota')
    if not clave or not estado:
        return jsonify({'error': 'Indica clave y estado'}), 400

    def handler(conn, session_id):
        s = Sustrato(conn, session_id)
        try:
            return jsonify(s.disponer_anomalia(clave, estado, nota))
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/qualia/dossier', methods=['GET'])
def api_qualia_dossier():
    """Drill-down Q4: el dossier de negocio de una entidad del caso — qué
    es, qué fragmentos la citan (fuente + página), con quién se relaciona,
    en qué eventos aparece y qué productos la anclan. Lectura pura sobre
    consultas.expediente_entidad; jamás escribe. El cliente lo abre desde
    cualquier instrumento con la etiqueta del nodo."""
    from autogenes.consultas import expediente_entidad
    nombre = request.args.get('nombre', '').strip()
    if not nombre:
        return jsonify({'error': 'Indica nombre=<etiqueta>'}), 400

    def handler(conn, session_id):
        return jsonify(expediente_entidad(conn, session_id, nombre))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/qualia/horizonte', methods=['GET'])
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


@bp.route('/api/v1/autogenes/qualia/narrativa', methods=['POST'])
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


@bp.route('/api/v1/autogenes/qualia/parte/dockear', methods=['POST'])
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


@bp.route('/api/v1/autogenes/concilia', methods=['GET'])
def api_concilia():
    """CONCILIA (F9): flujo tri-fuente + hallazgos tipados, monetizados
    y referenciados — todo salida determinista del motor. La lectura une
    cada hallazgo vivo con su disposición (O1) y contrasta lo declarado
    contra lo medido (`contradice`, `resoluciones_verificadas`)."""
    from autogenes.concilia import conciliar
    from autogenes.disposiciones import (anotar, leer_disposiciones,
                                         resoluciones_verificadas,
                                         resumen_estados)

    def handler(conn, session_id):
        from autogenes.concilia import SEVERIDAD, cobertura
        r = conciliar(conn, session_id)
        disp = leer_disposiciones(conn, session_id, 'concilia')
        anotar(r['hallazgos'], disp)
        for h in r['hallazgos']:
            h['severidad'] = SEVERIDAD.get(h['clase'], 'warn')
        claves = {h['clave'] for h in r['hallazgos']}
        r['resoluciones_verificadas'] = resoluciones_verificadas(claves, disp)
        r['estados'] = resumen_estados(r['hallazgos'])
        r['cobertura'] = cobertura(conn, session_id)
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/validacion', methods=['GET'])
def api_validacion():
    """VALIDACIÓN (F10): todas las reglas evaluadas (violadas o no) y la
    conformidad por filas — salida determinista del motor. Sólo las reglas
    violadas (n>0) son 'hallazgos' con ciclo de vida (O1): se anotan con su
    disposición y su contraste declarado/medido."""
    from autogenes.validacion import validar
    from autogenes.disposiciones import (anotar, leer_disposiciones,
                                         resoluciones_verificadas,
                                         resumen_estados)

    def handler(conn, session_id):
        from autogenes.validacion import severidad_regla
        r = validar(conn, session_id)
        disp = leer_disposiciones(conn, session_id, 'validacion')
        violadas = [rg for rg in r['reglas'] if rg['n'] > 0]
        anotar(violadas, disp)          # muta los dicts en r['reglas']
        for rg in violadas:
            rg['severidad'] = severidad_regla(rg['clave'])
        claves = {rg['clave'] for rg in violadas}
        r['resoluciones_verificadas'] = resoluciones_verificadas(claves, disp)
        r['estados'] = resumen_estados(violadas)
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _disponer_hallazgo(motor: str):
    """Ciclo de vida de un hallazgo de descuadre (O1): fija la disposición
    del operador (nuevo→en_gestion→resuelto/descartado) + nota. Puerta única:
    escribe por Sustrato con bitácora WORM; jamás monetiza (el esquema no
    tiene columna de monto)."""
    from autogenes.sustrato import Sustrato
    data = request.get_json(silent=True) or {}
    clave = (data.get('clave') or '').strip()
    estado = (data.get('estado') or '').strip()
    nota = data.get('nota')
    if not clave or not estado:
        return jsonify({'error': 'Indica clave y estado'}), 400

    def handler(conn, session_id):
        s = Sustrato(conn, session_id)
        try:
            return jsonify(s.disponer_hallazgo(motor, clave, estado, nota))
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/concilia/disponer', methods=['POST'])
def api_concilia_disponer():
    """Dispone un hallazgo CONCILIA por clave (O1)."""
    return _disponer_hallazgo('concilia')


@bp.route('/api/v1/autogenes/validacion/disponer', methods=['POST'])
def api_validacion_disponer():
    """Dispone una regla VALIDACIÓN violada por clave (O1)."""
    return _disponer_hallazgo('validacion')


@bp.route('/api/v1/autogenes/control', methods=['GET'])
def api_control():
    """CONTROL (A3): SPC transversal — cada métrica citada de la sesión
    contra su historia, con banda medida y señal de cambio de régimen."""
    from autogenes.control import control

    def handler(conn, session_id):
        return jsonify(control(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/sinapsis', methods=['GET'])
def api_sinapsis():
    """SINAPSIS (F11): conjunciones verificadas entre las salidas vivas
    de los motores; sin conjunción, lista vacía honesta."""
    from autogenes.sinapsis import insights_de_sesion

    def handler(conn, session_id):
        return jsonify(insights_de_sesion(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── TABLEROS VW (TBV): registrados desde rutas/tableros.py (blueprint) ──


@bp.route('/autogenes/cronos')
def autogenes_cronos():
    """CRONOS (F13): time travel del sustrato — reconstrucción aditiva
    por created_at con los momentos de la bitácora como línea de tiempo."""
    return render_template('autogenes_cronos.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/api/v1/autogenes/cronos', methods=['GET'])
def api_cronos():
    """CRONOS: estratos acumulados por momento de bitácora."""
    from autogenes.cronos import estratos

    def handler(conn, session_id):
        return jsonify(estratos(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/cronos/estado', methods=['GET'])
def api_cronos_estado():
    """CRONOS: el sustrato reconstruido en el instante ts (sin ts = ahora)."""
    from autogenes.cronos import estado_en

    ts = request.args.get('ts') or None

    def handler(conn, session_id):
        return jsonify(estado_en(conn, session_id, ts))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/exportar', methods=['GET'])
def api_autogenes_exportar():
    """Soberanía del dato: la sesión AUTOGENES completa como bundle JSON
    — grafo de evidencia, reglas NOMOS y bitácora WORM. Todo re-importable
    y auditable fuera de GNOSIS."""
    from autogenes.sustrato import Sustrato

    def handler(conn, session_id):
        s = Sustrato(conn, session_id)
        bitacora = [dict(r) for r in conn.execute(
            "SELECT ts, accion, detalle FROM ag_bitacora WHERE session_id = ?"
            " ORDER BY id", (session_id,))]
        return jsonify({
            'session_id': session_id,
            'grafo': s.leer_grafo(),
            'reglas': s.leer_reglas(),
            'bitacora': bitacora,
        })
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/bitacora', methods=['GET'])
def api_autogenes_bitacora():
    """La bitácora WORM de la sesión: cada mutación del sustrato, en
    orden, solo-lectura — el pendiente menor de la auditoría F6."""
    def handler(conn, session_id):
        filas = [dict(r) for r in conn.execute(
            "SELECT ts, accion, detalle FROM ag_bitacora WHERE session_id = ?"
            " ORDER BY id DESC LIMIT 200", (session_id,))]
        return jsonify({'session_id': session_id, 'bitacora': filas,
                        'total': conn.execute(
                            "SELECT COUNT(*) FROM ag_bitacora WHERE session_id = ?",
                            (session_id,)).fetchone()[0]})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/nomos', methods=['GET'])
def api_nomos():
    """NOMOS (F12): todas las reglas evaluadas como neuronas M-P, con
    anatomía por condición, disparos, violaciones y P&L en MXN. Las reglas
    CON violaciones son 'hallazgos' con ciclo de vida (O1): se anotan con su
    disposición y el motor las contradice si dices resuelto lo que sigue
    incumpliéndose. La clave de disposición es el id de la regla."""
    from autogenes.disposiciones import leer_disposiciones
    from autogenes.nomos import evaluar_reglas, triaje_o1

    def handler(conn, session_id):
        r = evaluar_reglas(conn, session_id)
        disp = leer_disposiciones(conn, session_id, 'nomos')
        # 'vivo' para NOMOS = regla ACTIVA que SIGUE incumpliéndose; una inactiva
        # es backtest, no un hallazgo que contradiga o cuente en estados (O1)
        return jsonify(triaje_o1(r, disp))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/nomos/disponer', methods=['POST'])
def api_nomos_disponer():
    """Dispone una regla NOMOS incumplida por su id (O1)."""
    return _disponer_hallazgo('nomos')


@bp.route('/api/v1/autogenes/nomos/regla', methods=['POST'])
def api_nomos_regla():
    """HITL: crea una regla (Sustrato valida campos en la puerta) o
    alterna activa/inactiva con {id, activa}."""
    from autogenes.sustrato import Sustrato

    cuerpo = request.get_json(silent=True) or {}

    def handler(conn, session_id):
        s = Sustrato(conn, session_id)
        if 'id' in cuerpo:                    # alternar
            s.alternar_regla(cuerpo['id'], bool(cuerpo.get('activa')))
            return jsonify({'status': 'ok'})
        try:
            regla = s.crear_regla(
                cuerpo.get('nombre', ''),
                cuerpo.get('condiciones', []),
                cuerpo.get('entonces', {}),
                cuerpo.get('origen', 'operador'))
        except ValueError as e:
            return jsonify({'error': str(e)}), 422
        return jsonify({'regla': regla})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/nomos/backtest', methods=['GET'])
def api_nomos_backtest():
    """Backtest: la regla evaluada contra todas las sesiones procesadas."""
    from autogenes.nomos import backtest_regla

    regla_id = request.args.get('id', '')

    def handler(conn, session_id):
        r = backtest_regla(conn, session_id, regla_id)
        if 'error' in r:
            return jsonify(r), 404
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/autogenes/nomos')
def autogenes_nomos():
    """NOMOS (F12): reglas como ciudadanos del grafo — neuronas M-P con
    P&L por regla; dashboard propio bipartito."""
    return render_template('autogenes_nomos.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/api/v1/autogenes/sinapsis/dockear', methods=['POST'])
def api_sinapsis_dockear():
    """HITL: dockea un insight como producto re-anclador — el motor se
    re-ejecuta y solo se anclan entidades reales del sustrato."""
    from autogenes.sinapsis import dockear_insight

    cuerpo = request.get_json(silent=True) or {}
    clave = cuerpo.get('clave')
    if not clave or not isinstance(clave, str):
        return jsonify({'error': 'Falta la clave del insight'}), 400

    def handler(conn, session_id):
        r = dockear_insight(conn, session_id, clave)
        if 'error' in r:
            return jsonify(r), 422
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/validacion/certificado', methods=['POST'])
def api_validacion_certificado():
    """HITL: dockea el expediente certificado — el estado de conformidad
    completo (reglas + filas violadoras sin tope) como producto."""
    from autogenes.validacion import dockear_certificado

    def handler(conn, session_id):
        r = dockear_certificado(conn, session_id)
        if 'error' in r:
            return jsonify(r), 422
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/autogenes/expediente/<producto_id>')
def autogenes_expediente(producto_id):
    """Expediente de defensa imprimible (A8): renderiza un producto dockeado
    (dossier CONCILIA o certificado VALIDACIÓN) como documento de defensa —
    hallazgo/reglas → filas → cobertura → sello → cronología de bitácora.
    El navegador imprime a PDF; cero dependencias nuevas. Lectura pura."""
    import json as _json

    from autogenes.sello import verificar
    from database import get_connection
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT p.id, p.session_id, p.titulo, p.unidad, p.cuerpo,"
            " p.created_at, s.month_processed, s.year_processed"
            " FROM ag_productos p JOIN processing_sessions s"
            " ON p.session_id = s.id WHERE p.id = ?", (producto_id,)).fetchone()
        if row is None:
            return "Expediente inexistente", 404
        cuerpo = _json.loads(row['cuerpo']) if row['cuerpo'] else {}
        bitacora = [dict(b) for b in conn.execute(
            "SELECT ts, accion, detalle FROM ag_bitacora WHERE session_id = ?"
            " ORDER BY id DESC LIMIT 20", (row['session_id'],))]
    finally:
        conn.close()
    return render_template(
        'autogenes_expediente.html',
        pid=row['id'], titulo=row['titulo'], unidad=row['unidad'],
        sesion=f"{row['month_processed']:02d}/{row['year_processed']}",
        dockeado=row['created_at'], cuerpo=cuerpo,
        verif=verificar(cuerpo), bitacora=bitacora)


@bp.route('/api/v1/autogenes/producto/<producto_id>/verificar', methods=['GET'])
def api_producto_verificar(producto_id):
    """SELLO (C1-lite): re-deriva el hash del cuerpo del producto dockeado
    (dossier/certificado) y lo compara con el sello guardado — el expediente
    es tamper-evident. Lectura pura; jamás escribe."""
    import json as _json

    from autogenes.sello import verificar

    def handler(conn, session_id):
        row = conn.execute(
            "SELECT id, titulo, unidad, cuerpo FROM ag_productos"
            " WHERE id = ? AND session_id = ?",
            (producto_id, session_id)).fetchone()
        if row is None:
            return jsonify({'error': f'Producto inexistente: {producto_id}'}), 404
        cuerpo = _json.loads(row['cuerpo']) if row['cuerpo'] else {}
        v = verificar(cuerpo)
        return jsonify({'producto_id': row['id'], 'titulo': row['titulo'],
                        'unidad': row['unidad'], **v})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/concilia/vin', methods=['GET'])
def api_concilia_vin():
    """Lookup directo: estado vivo tri-fuente de un chasis (parcial
    permitido; ambigüedad honesta con candidatos)."""
    from autogenes.concilia import estado_vin

    chasis = request.args.get('chasis', '')

    def handler(conn, session_id):
        return jsonify(estado_vin(conn, session_id, chasis))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/concilia/cupos', methods=['GET'])
def api_concilia_cupos():
    """What-if de cupos: proyección lineal sobre el run-rate MEDIDO en
    seguimiento_mensual; sin historia suficiente no se proyecta."""
    from autogenes.concilia import cupos_what_if

    def handler(conn, session_id):
        return jsonify(cupos_what_if(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/concilia/dossier', methods=['POST'])
def api_concilia_dossier():
    """HITL: dockea un hallazgo como dossier de defensa — snapshot
    completo sin tope, re-ejecutando el motor sobre el estado vivo."""
    from autogenes.concilia import dockear_dossier

    cuerpo = request.get_json(silent=True) or {}
    clave = cuerpo.get('clave')
    if not clave or not isinstance(clave, str):
        return jsonify({'error': 'Falta la clave del hallazgo'}), 400

    def handler(conn, session_id):
        r = dockear_dossier(conn, session_id, clave)
        if 'error' in r:
            return jsonify(r), 422
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/qualia/red', methods=['GET'])
def api_qualia_red():
    """La red del caso para el lienzo QUALIA: nivel N de la escalera de
    renormalización con comunidades, grados, masas y resumen citable."""
    from autogenes import topologia
    from autogenes.qualia import red_de_sesion
    nivel = request.args.get('nivel', default=0, type=int)
    con_espectral = request.args.get('espectral', default=0, type=int)
    # lente=negocio (default) oculta la fontanería documental; lente=completa
    # muestra la capa de artefactos/fragmentos (el toggle del instrumento Red).
    lente = 'completa' if request.args.get('lente') == 'completa' else 'negocio'

    def handler(conn, session_id):
        red = red_de_sesion(conn, session_id, lente=lente)
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


@bp.route('/api/v1/autogenes/radar', methods=['GET'])
def api_autogenes_radar():
    from autogenes.senales import senales_de_sesion

    def handler(conn, session_id):
        return jsonify(senales_de_sesion(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/metabolismo', methods=['GET'])
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


@bp.route('/api/v1/autogenes/relacion', methods=['POST'])
def api_autogenes_relacion():
    """Crea UNA relación tipada entre dos entidades de la sesión (triage del
    Radar). Puerta única: escribe por Sustrato con origen='operador'. Valida
    que ambos extremos existen; la evidencia se sanea contra fragmentos
    reales (nunca ids fabricados; vacía es válida — es una afirmación del
    operador)."""
    from autogenes.sustrato import Sustrato
    data = request.get_json(silent=True) or {}
    desde_id = (data.get('desde_id') or '').strip()
    hasta_id = (data.get('hasta_id') or '').strip()
    tipo = (data.get('tipo') or '').strip()
    if not desde_id or not hasta_id or not tipo:
        return jsonify({'error': 'Faltan desde_id, hasta_id o tipo'}), 400
    if desde_id == hasta_id:
        return jsonify({'error': 'Una relación no puede unir una entidad consigo misma'}), 422

    def handler(conn, session_id):
        s = Sustrato(conn, session_id)
        if not s.entidad_por_id(desde_id) or not s.entidad_por_id(hasta_id):
            return jsonify({'error': 'Una de las entidades no existe en la sesión'}), 422
        reales = s.fragmento_ids()
        evidencia = [x for x in (data.get('evidencia') or []) if x in reales]
        try:
            peso = float(data.get('peso', 0.5))
        except (TypeError, ValueError):
            peso = 0.5
        peso = min(1.0, max(0.0, peso))
        rel = s.agregar_relacion(desde_id, hasta_id, tipo, peso, evidencia,
                                 origen='operador')
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok', 'relacion': rel.model_dump()})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/relacion/<relacion_id>', methods=['DELETE'])
def api_autogenes_relacion_delete(relacion_id):
    """Deshace (corta) una relación — el 'deshacer' del triage (T6). Escribe
    por Sustrato (bitácora WORM). Idempotente: si ya no está, responde ok."""
    from autogenes.sustrato import Sustrato

    def handler(conn, session_id):
        Sustrato(conn, session_id).cortar_relacion(relacion_id)
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok'})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/entidades', methods=['GET'])
def api_autogenes_entidades():
    """Entidades de la sesión (id, nombre, tipo) y los verbos de relación ya
    usados — alimenta el typeahead de 'Vincular' del triage del Radar. Los
    verbos son DERIVADOS (los que ya existen), nunca una lista inventada."""
    def handler(conn, session_id):
        entidades = [
            {'id': r['id'], 'nombre': r['nombre'], 'tipo': r['tipo']}
            for r in conn.execute(
                "SELECT id, nombre, tipo FROM ag_entidades WHERE session_id = ?"
                " ORDER BY nombre", (session_id,))
        ]
        verbos = [r['tipo'] for r in conn.execute(
            "SELECT DISTINCT tipo FROM ag_relaciones WHERE session_id = ?"
            " ORDER BY tipo", (session_id,))]
        return jsonify({'entidades': entidades, 'verbos': verbos})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/evento/<evento_id>', methods=['DELETE'])
def api_autogenes_evento_delete(evento_id):
    """Resuelve (elimina) un vencimiento del Radar. Escribe por Sustrato
    (bitácora WORM incluida). Idempotente: si ya no está, responde ok."""
    from autogenes.sustrato import Sustrato

    def handler(conn, session_id):
        Sustrato(conn, session_id).quitar_evento(evento_id)
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok'})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/autogenes/vinculos')
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



@bp.route('/api/v1/autogenes/camino', methods=['GET'])
def api_autogenes_camino():
    """El camino citado entre dos nodos. Retrocompatible: sin k/evitar/via
    devuelve {camino} (el más corto). Con ?k=<=3, ?evitar=<id> o ?via=<id>
    añade {caminos:[...]} con las alternativas TOPOLÓGICAS declaradas."""
    from autogenes.analisis_vw import volumenes_por_nodo
    from autogenes.caminos import (
        anotar_volumen_extremos, camino_mas_corto, caminos, comparar_caminos)
    desde = request.args.get('desde', '')
    hasta = request.args.get('hasta', '')
    if not desde or not hasta:
        return jsonify({'error': 'Faltan parámetros desde/hasta'}), 400
    k = request.args.get('k', type=int) or 1
    evitar = request.args.get('evitar') or None
    via = request.args.get('via') or None

    def handler(conn, session_id):
        # una restricción evitar/via sobre un nodo inexistente NO se ignora en
        # silencio (devolvería caminos que no respetan lo pedido): se declara
        if evitar or via:
            from autogenes.red import red_de_sesion
            red = red_de_sesion(conn, session_id)
            for etq in (evitar, via):
                if etq and etq not in red:
                    return jsonify(
                        {'error': f'Nodo desconocido para la restricción: {etq}'}), 404
        vols = volumenes_por_nodo(conn, session_id)
        if k <= 1 and not evitar and not via:
            cam = camino_mas_corto(conn, session_id, desde, hasta)
            if cam is None:
                return jsonify({'camino': None,
                                'mensaje': 'No existe camino entre esos nodos'}), 200
            anotar_volumen_extremos([cam], vols)
            return jsonify({'session_id': session_id, 'camino': cam})
        lista = caminos(conn, session_id, desde, hasta,
                        k=min(k, 3), evitar=evitar, via=via)
        if not lista:
            return jsonify({'camino': None, 'caminos': [],
                            'mensaje': 'No existe camino entre esos nodos'}), 200
        lista = anotar_volumen_extremos(comparar_caminos(lista), vols)
        return jsonify({'session_id': session_id,
                        'camino': lista[0], 'caminos': lista})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/vecindario', methods=['GET'])
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


@bp.route('/api/v1/autogenes/hubs', methods=['GET'])
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


@bp.route('/api/v1/autogenes/camino/dockear', methods=['POST'])
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


@bp.route('/api/v1/autogenes/sesiones', methods=['GET'])
def api_autogenes_sesiones():
    """Las sesiones procesadas (para el selector de deriva de P5)."""
    from database import get_connection
    try:
        conn = get_connection()
        try:
            filas = [dict(r) for r in conn.execute(
                "SELECT id, month_processed AS m, year_processed AS y FROM processing_sessions"
                " ORDER BY year_processed DESC, month_processed DESC, id DESC")]
        finally:
            conn.close()
        return jsonify({'sesiones': [
            {'id': f['id'], 'etiqueta': f"{f['m']:02d}/{f['y']}"} for f in filas]})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── P1 · Investigaciones guardadas ──────────────────────────────────


@bp.route('/api/v1/autogenes/investigacion', methods=['POST'])
def api_autogenes_investigacion_guardar():
    """Guarda el estado del lienzo como Producto{investigacion} reabrible: el
    snapshot semántico (deep-link de L1) y la nota del operador. La escritura
    pasa por Sustrato — procedencia y bitácora WORM; el cuerpo guarda estado
    semántico (ids, filtros, viewport), nunca píxeles."""
    from autogenes.sustrato import Sustrato
    data = request.get_json(silent=True) or {}
    titulo = (data.get('titulo') or '').strip()
    estado = data.get('estado')
    if not titulo:
        return jsonify({'error': 'Falta el título de la investigación'}), 400
    if not isinstance(estado, str) or not estado:
        return jsonify({'error': 'Falta el estado del lienzo'}), 400

    def handler(conn, session_id):
        cuerpo = {'estado': estado, 'nota': str(data.get('nota') or '')[:4000],
                  'titulo': titulo}
        p = Sustrato(conn, session_id).dockear_producto(
            'investigacion', titulo, 'grafo', cuerpo)
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok', 'producto_id': p.id, 'titulo': p.titulo})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/investigaciones', methods=['GET'])
def api_autogenes_investigaciones():
    """Las investigaciones guardadas de la sesión, con su estado embebido para
    reabrir sin otra llamada."""
    import json as _json

    def handler(conn, session_id):
        out = []
        for r in conn.execute(
                "SELECT id, titulo, cuerpo, created_at FROM ag_productos"
                " WHERE session_id = ? AND clase = 'investigacion'"
                " ORDER BY created_at DESC, id", (session_id,)):
            cuerpo = _json.loads(r["cuerpo"]) if r["cuerpo"] else {}
            out.append({'id': r["id"], 'titulo': r["titulo"],
                        'created_at': r["created_at"],
                        'estado': cuerpo.get('estado', ''),
                        'nota': cuerpo.get('nota', '')})
        return jsonify({'session_id': session_id, 'investigaciones': out})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/investigacion/<producto_id>', methods=['DELETE'])
def api_autogenes_investigacion_borrar(producto_id):
    """Retira una investigación (Producto). No toca evidencia: un producto no
    es procedencia."""
    from autogenes.sustrato import Sustrato

    def handler(conn, session_id):
        try:
            Sustrato(conn, session_id).quitar_producto(producto_id)
        except Exception:
            return jsonify({'error': 'No se encontró la investigación'}), 404
        return jsonify({'status': 'ok'})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/analisis', methods=['GET'])
def api_autogenes_analisis():
    """Análisis de red de negocio (I1): la red de flujo derivada
    país→aduana→marca y sus lentes — brokers por intermediación, corte
    crítico y redundancia de rutas de la marca foco, y HHI de concentración.
    Todo derivable y citable; ?marca=<nombre> fija el sujeto (default VW)."""
    from autogenes import analisis_vw
    marca = request.args.get('marca') or None
    sesion_ref = request.args.get('deriva', type=int)

    def handler(conn, session_id):
        return jsonify({'session_id': session_id,
                        **analisis_vw.analisis(conn, session_id, marca=marca,
                                               sesion_ref=sesion_ref)})
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/grafo', methods=['GET'])
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


@bp.route('/api/v1/autogenes/arbol', methods=['GET'])
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


@bp.route('/api/v1/autogenes/chord_ingesta', methods=['GET'])
def api_autogenes_chord_ingesta():
    """El mapa de ingesta como chord bipartito: fuentes -> entidades, con las
    fuentes frias (que nadie cita) visibles como arcos sin cintas."""
    from database import get_connection
    from database.persistence import get_latest_session_id
    from autogenes.chord_ingesta import chord_ingesta
    try:
        conn = get_connection()
        try:
            session_id = request.args.get('session_id', type=int) or get_latest_session_id()
            if not session_id:
                return jsonify({'error': 'No hay sesiones procesadas'}), 404
            chord = chord_ingesta(conn, session_id)
        finally:
            conn.close()
        return jsonify(chord)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/detalle_ingesta', methods=['GET'])
def api_autogenes_detalle_ingesta():
    """El dossier detras de un arco del chord: para un artefacto sus
    fragmentos y entidades citantes; para una entidad sus fuentes."""
    from autogenes.chord_ingesta import detalle_ingesta
    node_id = request.args.get('id', '')
    if not node_id:
        return jsonify({'error': 'Falta id'}), 400

    def handler(conn, session_id):
        r = detalle_ingesta(conn, session_id, node_id)
        if 'error' in r:
            return jsonify(r), 404
        return jsonify(r)
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
