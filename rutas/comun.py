"""Helpers de sesión compartidos por las rutas (app.py y blueprints).

Sin dependencia de `app`: operan sobre el request de Flask y la conexión
SQLite. `_con_sesion` centraliza el contrato de estado vacío honesto —
una sesión inexistente es 404 declarado, no un 500 críptico."""
from flask import request, jsonify


def _sesion_activa():
    from database.persistence import get_latest_session_id
    return get_latest_session_id()


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


def _asegurar_sesion():
    """Garantiza una sesión activa para las rutas de ESCRITURA del sustrato.

    Dockear evidencia (Ingesta) es local-first e independiente del pipeline
    aduanal mensual: exigir que ya se haya procesado un mes antes de poder
    anclar un contrato o una factura es el error que dejaba la carga en blanco
    con «No hay sesiones procesadas». Si no existe ninguna sesión, se crea aquí
    una de trabajo (mes/año en curso) — el MISMO patrón que usa `app.py` al
    ingerir el primer PDF. Reutiliza la última si ya existe: no fragmenta la
    evidencia en una sesión aparte."""
    import datetime

    from database.persistence import create_session
    session_id = request.args.get('session_id', type=int) or _sesion_activa()
    if session_id:
        return session_id
    now = datetime.datetime.now()
    return create_session(now.month, now.year)


def _con_sesion(handler):
    """Patrón común de los endpoints: conexión + sesión activa verificada
    (una sesión inexistente es 404, no un 500 críptico)."""
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
