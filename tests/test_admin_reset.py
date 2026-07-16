"""El reset de operador: doble compuerta (confirmación obligatoria en el
POST) y reinicio limpio — base recreada con esquema, sesiones fuera."""
import os

import pytest


@pytest.fixture()
def cliente(tmp_path):
    import database
    db = tmp_path / "gnosis.db"
    original = database.DB_PATH
    database.DB_PATH = str(db)

    import app as gnosis
    database.init_db()

    conn = database.get_connection()
    conn.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed, status) VALUES ('2026-07-10', 7, 2026, 'completed')")
    conn.commit()
    conn.close()

    gnosis.app.config['TESTING'] = True
    with gnosis.app.test_client() as c:
        yield c, database
    database.DB_PATH = original


def test_sin_confirmacion_rechaza(cliente):
    c, database = cliente
    r = c.post('/api/admin/reset', json={})
    assert r.status_code == 400
    assert 'Confirmaci' in r.get_json()['error']
    # la sesión sembrada sigue viva: nada se borró
    conn = database.get_connection()
    assert conn.execute("SELECT COUNT(*) FROM processing_sessions").fetchone()[0] == 1
    conn.close()


def test_confirmacion_borra_y_reinicia_esquema(cliente):
    c, database = cliente
    r = c.post('/api/admin/reset', json={'confirmar': 'BORRAR'})
    assert r.status_code == 200
    assert r.get_json()['ok'] is True
    # base recreada: el esquema existe y está vacío
    assert os.path.exists(database.DB_PATH)
    conn = database.get_connection()
    assert conn.execute("SELECT COUNT(*) FROM processing_sessions").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM ag_entidades").fetchone()[0] == 0
    conn.close()


def test_confirmacion_incorrecta_rechaza(cliente):
    c, _ = cliente
    r = c.post('/api/admin/reset', json={'confirmar': 'borrar'})
    assert r.status_code == 400
