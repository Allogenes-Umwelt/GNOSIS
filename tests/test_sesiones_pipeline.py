"""Spec de la SESIÓN que abre el pipeline — remate R4 del diagnóstico v02.

El fix de H17 hizo que `create_session` reutilice una sesión VACÍA del mismo
mes en vez de duplicarla: el operador dockea evidencia antes de procesar,
`_asegurar_sesion` abre la sesión del mes, y sin reutilizarla el dato aduanal
caería en otra sesión — CONCILIA filtra por `session_id` y no podría cruzarlos
nunca.

R4 pedía verificar que `/procesar/historico` no dependiera de crear sesiones
mensuales frescas. **No depende: no llama a `create_session` en absoluto** —
lee a través de TODAS las sesiones (`SELECT ... FROM importaciones` sin filtro
de sesión). Esta prueba fija las dos mitades de esa verificación para que no
se pierda: la reutilización que sí ocurre, y la que no aplica.
"""
import pytest


@pytest.fixture()
def db(tmp_path, monkeypatch):
    import database
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "g.db"))
    database.init_db()
    return database


def _filas_de(conn, session_id):
    conn.execute(
        "INSERT INTO importaciones (session_id, chasis, factura)"
        " VALUES (?, 'WVWZZZ000', 'F-1')", (session_id,))
    conn.commit()


def test_una_sesion_vacia_del_mismo_mes_se_reutiliza(db):
    """El caso de H17: dockear evidencia y luego procesar ese mes."""
    from database.persistence import create_session

    primera = create_session(7, 2026)
    assert create_session(7, 2026) == primera


def test_una_sesion_YA_procesada_no_se_toca(db):
    """Reprocesar un mes es una corrida nueva y merece su propia sesión: el
    esquema lo asume (`numero_pedimento` es UNIQUE *por sesión*)."""
    from database.persistence import create_session

    primera = create_session(7, 2026)
    conn = db.get_connection()
    _filas_de(conn, primera)
    conn.close()

    assert create_session(7, 2026) != primera


def test_meses_distintos_nunca_se_mezclan(db):
    from database.persistence import create_session

    assert create_session(7, 2026) != create_session(8, 2026)


def test_quien_necesite_una_sesion_fresca_puede_pedirla(db):
    """La reutilización es el default, no una imposición."""
    from database.persistence import create_session

    primera = create_session(7, 2026)
    assert create_session(7, 2026, reutilizar_vacia=False) != primera


def test_procesar_historico_no_abre_sesiones(db, monkeypatch):
    """R4 verificado: el pipeline histórico LEE a través de todas las sesiones
    y no crea ninguna, así que la reutilización no le afecta."""
    import app as gnosis

    llamadas = []
    monkeypatch.setattr(gnosis, "create_session",
                        lambda *a, **k: llamadas.append(a) or 1)
    gnosis.app.config["TESTING"] = True
    cliente = gnosis.app.test_client()

    # sin datos aduanales responde su error de negocio, sin tocar sesiones
    cliente.post("/procesar/historico")
    assert llamadas == [], "el histórico abrió una sesión"


def test_el_historico_no_menciona_create_session_en_su_codigo():
    """La verificación de R4, fijada donde no se puede olvidar: si alguien le
    añade una creación de sesión al histórico, esto lo dice."""
    import inspect

    import app as gnosis

    fuente = inspect.getsource(gnosis.procesar_historico)
    assert "create_session" not in fuente
