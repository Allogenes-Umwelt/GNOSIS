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
