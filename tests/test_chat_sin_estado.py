"""Spec del ESTADO CONVERSACIONAL — hallazgo H3 del diagnóstico.

`docker/Containerfile` arranca gunicorn con `--workers 2`, pero el chat vivía
en globales de módulo (`app._chat_handler`). Consecuencias medidas: el modelo
veía la mitad del historial, `chat/reset` reiniciaba un worker y no el otro, y
`GET /api/v1/admin/llm` devolvía un `activo` que ALTERNABA según a quién
cayera la petición.

La ley que se restaura es 12-factor: procesos sin estado; la verdad vive en
SQLite. Estas pruebas no simulan dos procesos — simulan lo que dos procesos
implican: dos manejadores distintos sobre la MISMA base deben ver la misma
conversación.
"""
import sqlite3

import pytest

from database import models, models_autogenes


@pytest.fixture()
def base(tmp_path, monkeypatch):
    import database
    ruta = tmp_path / "gnosis.db"
    c = sqlite3.connect(ruta)
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed, status) VALUES ('2026-07-10', 7, 2026, 'completed')")
    c.commit()
    sid = c.execute("SELECT id FROM processing_sessions").fetchone()[0]
    c.close()
    monkeypatch.setattr(database, "DB_PATH", str(ruta))
    from database.migrations import apply_migrations
    conn = database.get_connection()
    apply_migrations(conn)
    conn.commit()
    conn.close()
    return {"ruta": str(ruta), "sid": sid}


class Loro:
    """Proveedor que devuelve cuántos turnos de historia recibió."""

    def __init__(self):
        self.historias = []

    def chat(self, messages, tools=None, system=None):
        self.historias.append(list(messages))
        return {"content": f"vi {len(messages)} mensajes", "tool_calls": [],
                "stop_reason": "end_turn", "tokens_input": 1, "tokens_output": 1}


def test_dos_manejadores_ven_la_misma_conversacion(base):
    """El caso de los dos workers: cada petición puede caer en un proceso
    distinto y la conversación tiene que ser una sola."""
    from jarvis.chat_handler import ChatHandler

    a = ChatHandler(Loro(), session_id=base["sid"], chat_session_id="hilo-1")
    a.handle_message("primera")

    b = ChatHandler(Loro(), session_id=base["sid"], chat_session_id="hilo-1")
    p = Loro()
    b.llm = p
    b.handle_message("segunda")

    # el segundo manejador tuvo que RECONSTRUIR la historia desde SQLite:
    # usuario1, asistente1, usuario2
    assert len(p.historias[0]) >= 3, \
        f"el segundo proceso vio {len(p.historias[0])} mensajes: perdió la historia"
    textos = " ".join(str(m.get("content")) for m in p.historias[0])
    assert "primera" in textos


def test_la_ventana_de_historia_esta_acotada(base):
    """`self.messages` crecía sin cota: el coste por turno subía hasta que el
    proveedor rechazaba el contexto."""
    from jarvis.chat_handler import MAX_TURNOS_HISTORIA, ChatHandler

    p = Loro()
    h = ChatHandler(p, session_id=base["sid"], chat_session_id="largo")
    for i in range(MAX_TURNOS_HISTORIA + 5):
        h.llm = p
        h.handle_message(f"mensaje {i}")
    ultimo = p.historias[-1]
    assert len(ultimo) <= MAX_TURNOS_HISTORIA * 2 + 1, \
        f"la historia enviada creció a {len(ultimo)} mensajes"


def test_reset_borra_para_todos_los_procesos(base):
    from jarvis.chat_handler import ChatHandler, olvidar_conversacion

    a = ChatHandler(Loro(), session_id=base["sid"], chat_session_id="hilo-2")
    a.handle_message("hola")
    olvidar_conversacion("hilo-2")

    p = Loro()
    b = ChatHandler(p, session_id=base["sid"], chat_session_id="hilo-2")
    b.handle_message("de nuevo")
    assert len(p.historias[0]) == 1, "el reset no alcanzó al otro proceso"


# ── la ruta HTTP ─────────────────────────────────────────────────────

@pytest.fixture()
def cliente(base, monkeypatch):
    import database
    database.init_db()
    import app as gnosis
    gnosis.app.config["TESTING"] = True
    return gnosis.app.test_client()


def test_el_hilo_de_chat_viaja_en_una_cookie_firmada(cliente, monkeypatch):
    """La identidad de la conversación no puede vivir en el proceso."""
    import jarvis.llm_interface as li

    class Fijo:
        def chat(self, messages, tools=None, system=None):
            return {"content": "ok", "tool_calls": [], "stop_reason": "end_turn",
                    "tokens_input": 0, "tokens_output": 0}

    monkeypatch.setattr(li, "seleccionar_proveedor", lambda cfg=None: ("fijo", Fijo()))
    r = cliente.post("/api/v1/chat", json={"message": "hola"})
    assert r.status_code == 200
    # el hilo viaja dentro de la cookie de sesión de Flask, FIRMADA con
    # SECRET_KEY: el cliente no puede fabricarse el hilo de otro
    galletas = r.headers.getlist("Set-Cookie")
    assert any(c.startswith("session=") and "HttpOnly" in c for c in galletas), \
        f"no se emitió cookie de sesión firmada: {galletas}"
    with cliente.session_transaction() as ses:
        primer_hilo = ses.get("gnosis_chat")
    assert primer_hilo, "el hilo no quedó en la sesión firmada"

    # una segunda petición reusa el MISMO hilo (no se inventa uno por request)
    cliente.post("/api/v1/chat", json={"message": "otra"})
    with cliente.session_transaction() as ses:
        assert ses.get("gnosis_chat") == primer_hilo


def test_el_estado_llm_no_depende_del_proceso(cliente):
    """`activo` alternaba entre workers porque era un global. Ahora sale de
    la configuración persistida, así que dos lecturas coinciden."""
    a = cliente.get("/api/v1/admin/llm").get_json()
    b = cliente.get("/api/v1/admin/llm").get_json()
    assert a["default"] == b["default"]
    assert "activo" not in a or a["activo"] == b["activo"]
