"""AUTOGENES: el sustrato de ontología unificada — landing, secciones,
grafo, ingesta, QUALIA, CONCILIA, VALIDACIÓN, SINAPSIS, NOMOS, CRONOS,
síntesis y las APIs que los alimentan. Todo cuelga de `_con_sesion`
(estado vacío honesto) y las escrituras pasan por el sustrato; ninguna
ruta fabrica evidencia ni estima montos."""
from flask import Blueprint, render_template, request, jsonify
from werkzeug.utils import secure_filename

from rutas.comun import _sesion_activa, _etiqueta_sesion, _con_sesion

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

    def handler(conn, session_id):
        # ── ZIP: ingerir cada archivo interno, resumen agregado ──
        if nombre.lower().endswith('.zip'):
            try:
                zf = zipfile.ZipFile(io.BytesIO(contenido))
            except zipfile.BadZipFile:
                return jsonify({'error': 'El ZIP está dañado'}), 400
            ok, err, frags = [], [], 0
            for info in zf.infolist():
                if info.is_dir() or info.filename.startswith('__MACOSX'):
                    continue
                interno = secure_filename(info.filename.split('/')[-1])
                if not interno:
                    continue
                r = ingestar_archivo(conn, session_id, interno, zf.read(info))
                if 'error' in r:
                    err.append(interno)
                else:
                    ok.append(interno)
                    frags += r.get('fragmentos', 0)
            if ok:
                _snapshot_telemetria(conn, session_id)
            return jsonify({'status': 'ok', 'lote': True,
                            'ingeridos': len(ok), 'fallidos': len(err),
                            'fragmentos': frags, 'errores': err})
        # ── archivo suelto ──
        r = ingestar_archivo(conn, session_id, nombre, contenido)
        if 'error' in r:
            return jsonify(r), 422
        _snapshot_telemetria(conn, session_id)
        return jsonify({'status': 'ok', **r})
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


@bp.route('/api/v1/autogenes/qualia/cascada', methods=['GET'])
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
    y referenciados — todo salida determinista del motor."""
    from autogenes.concilia import conciliar

    def handler(conn, session_id):
        return jsonify(conciliar(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/v1/autogenes/validacion', methods=['GET'])
def api_validacion():
    """VALIDACIÓN (F10): todas las reglas evaluadas (violadas o no) y la
    conformidad por filas — salida determinista del motor."""
    from autogenes.validacion import validar

    def handler(conn, session_id):
        return jsonify(validar(conn, session_id))
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
    anatomía por condición, disparos, violaciones y P&L en MXN."""
    from autogenes.nomos import evaluar_reglas

    def handler(conn, session_id):
        return jsonify(evaluar_reglas(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
