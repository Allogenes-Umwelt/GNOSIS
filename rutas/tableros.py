"""TABLEROS VW (TBV): la zona de tableros de negocio, no-autogenes.

Cinco páginas bipartitas (insight izquierda, lienzo pirotécnico derecha)
sobre motores puros del paquete `tableros/`. Cada API pasa por
`_con_sesion` (estado vacío honesto) y jamás estima ni proyecta."""
from flask import Blueprint, render_template, request, jsonify

from rutas.comun import _etiqueta_sesion, _con_sesion, error_api

bp = Blueprint('tableros', __name__)


@bp.route('/tableros')
def tableros_indice():
    """El índice de los tableros de negocio VW (TBV-01..05)."""
    return render_template('tableros_index.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/tableros/dominio')
def tableros_dominio():
    """TBV-02 · DOMINIO: escalera de rangos de los modelos más vendidos
    por periodo + ranking escalonado por marca con desglose."""
    return render_template('tableros_dominio.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/tableros/maduracion')
def tableros_maduracion():
    """TBV-01 · MADURACIÓN: días de importación a venta por marca —
    espectro de densidad con percentiles y toggle de marca."""
    return render_template('tableros_maduracion.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/api/v1/tableros/maduracion', methods=['GET'])
def api_tableros_maduracion():
    from tableros.maduracion import maduracion

    def handler(conn, session_id):
        return jsonify(maduracion(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return error_api(e)


@bp.route('/tableros/rechazos')
def tableros_rechazos():
    """TBV-04 · RECHAZOS: Pareto de razones de falla con archivos citados."""
    return render_template('tableros_rechazos.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/api/v1/tableros/rechazos', methods=['GET'])
def api_tableros_rechazos():
    from tableros.rechazos import rechazos

    def handler(conn, session_id):
        return jsonify(rechazos(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return error_api(e)


@bp.route('/tableros/cupo')
def tableros_cupo():
    """TBV-05 · CUPO: libro mayor mensual — pasado y presente, sin futuro."""
    return render_template('tableros_cupo.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/api/v1/tableros/cupo', methods=['GET'])
def api_tableros_cupo():
    from tableros.cupo import libro_cupo

    def handler(conn, session_id):
        return jsonify(libro_cupo(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return error_api(e)


@bp.route('/tableros/rutas')
def tableros_rutas():
    """TBV-03 · RUTAS: flujo país → aduana sobre mapa OSM con arcos
    por volumen; lo no ubicable se declara, no se dibuja."""
    return render_template('tableros_rutas.html',
                           sesion_etiqueta=_etiqueta_sesion())


@bp.route('/api/v1/tableros/rutas', methods=['GET'])
def api_tableros_rutas():
    from tableros.rutas import rutas

    def handler(conn, session_id):
        return jsonify(rutas(conn, session_id))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return error_api(e)


@bp.route('/api/v1/tableros/dominio', methods=['GET'])
def api_tableros_dominio():
    from tableros.dominio import dominio

    escala = request.args.get('escala', 'mes')

    def handler(conn, session_id):
        return jsonify(dominio(conn, session_id, escala))
    try:
        return _con_sesion(handler)
    except Exception as e:
        return error_api(e)
