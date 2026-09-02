"""Spec de la FRONTERA LLM — la ley que el diagnóstico encontró rota.

`docs/architecture/adr/0007-ofuscacion-antes-del-llm.md` dice "nunca": ningún
identificador (VIN/chasis, factura, pedimento, patente) cruza al modelo en
claro. El enmascarado por NOMBRE de columna y por forma de VIN anclada se
evade con una expresión SQL trivial, así que la ley se sostiene aquí:

1. el modelo consulta una base de SOLO LECTURA, acotada a su sesión por
   vistas y con una allowlist de tablas (nada de bitácora ni de chat);
2. lo que sale hacia el modelo se enmascara contra el CONJUNTO de
   identificadores reales de la sesión, en el punto de serialización —
   alias, expresiones y JSON anidado incluidos;
3. lo que el operador escribe se enmascara antes de salir;
4. la conversación se persiste ENMASCARADA (si no, el turno 2 lee en claro
   lo que el turno 1 guardó).
"""
import json
import sqlite3

import pytest

from database import models, models_autogenes

VIN_A = "WVWZZZ3CZWE123456"
VIN_B = "WAUZZZ4G7DN654321"
FACTURA_A = "FA-2026-0001"
PEDIMENTO_A = "26 47 3807 6000123"
PATENTE_A = "3807"


def _sembrar(c: sqlite3.Connection) -> tuple[int, int]:
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    for mes in (7, 8):
        c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                  " year_processed, status) VALUES (?, ?, 2026, 'completed')",
                  (f"2026-{mes:02d}-10", mes))
    sid_a, sid_b = [r[0] for r in c.execute(
        "SELECT id FROM processing_sessions ORDER BY id")]
    c.execute("INSERT INTO pedimentos (session_id, numero_pedimento, patente)"
              " VALUES (?, ?, ?)", (sid_a, PEDIMENTO_A, PATENTE_A))
    ped = c.execute("SELECT id FROM pedimentos").fetchone()[0]
    c.execute("INSERT INTO importaciones (session_id, pedimento_id, chasis, factura,"
              " auto_code, precio) VALUES (?, ?, ?, ?, 'X1', 100.0)",
              (sid_a, ped, VIN_A, FACTURA_A))
    c.execute("INSERT INTO importaciones (session_id, chasis, factura, auto_code,"
              " precio) VALUES (?, ?, 'FB-2026-0002', 'X2', 200.0)", (sid_b, VIN_B))
    c.execute("INSERT INTO extraccion_facturas (session_id, chasis, factura, filename)"
              " VALUES (?, ?, ?, 'a.pdf')", (sid_a, VIN_A, FACTURA_A))
    c.execute("INSERT INTO chat_conversations (chat_session_id, role, content)"
              " VALUES ('previa', 'assistant', ?)", (f"el chasis {VIN_A} viene de Emden",))
    c.commit()
    return sid_a, sid_b


@pytest.fixture()
def base(tmp_path, monkeypatch):
    """Base en ARCHIVO: el sandbox abre su propia conexión de solo lectura."""
    import database
    ruta = tmp_path / "gnosis.db"
    c = sqlite3.connect(ruta)
    c.row_factory = sqlite3.Row
    sid_a, sid_b = _sembrar(c)
    c.close()
    monkeypatch.setattr(database, "DB_PATH", str(ruta))
    return {"ruta": str(ruta), "a": sid_a, "b": sid_b}


# ── 1 · el sandbox de consulta_sql ───────────────────────────────────

#: Corpus de evasión del diagnóstico. Cada una devolvía el identificador
#: REAL porque `mask_row` casa por nombre de columna o por una regex de VIN
#: anclada y en mayúsculas.
EVASIONES = [
    "SELECT lower(chasis) AS c FROM importaciones",
    "SELECT substr(chasis,1,8)||'-'||substr(chasis,9) AS c FROM importaciones",
    "SELECT chasis||' ' AS c FROM importaciones",
    "SELECT hex(chasis) AS c FROM importaciones",
    "SELECT factura AS f FROM importaciones",
    "SELECT replace(chasis,'W','w') AS c FROM importaciones",
]


def _reconstruible(salida: str, secreto: str) -> bool:
    """¿Se puede sacar el identificador de esta salida?

    No basta con buscarlo literal: `substr(a,1,8)||'-'||substr(a,9)` lo
    devuelve troceado y `hex(a)` codificado, y ninguna de las dos formas
    contiene la cadena original. Una prueba que solo mire el literal pasa
    en verde mientras el dato se escapa."""
    plano = salida.lower()
    sin_separadores = "".join(ch for ch in plano if ch.isalnum())
    formas = (
        secreto.lower(),                                   # literal
        secreto.encode("utf-8").hex().lower(),             # hex(col)
    )
    if any(f in plano or f in sin_separadores for f in formas):
        return True
    # troceado por cualquier separador: se normaliza y se vuelve a buscar
    return secreto.lower() in sin_separadores


@pytest.mark.parametrize("consulta", EVASIONES)
def test_consulta_sql_no_deja_salir_el_identificador_real(base, consulta):
    from jarvis.ambito import ambito_de_sesion
    from jarvis.ofuscation import ObfuscationLayer
    from jarvis.tool_executor import ToolExecutor

    ex = ToolExecutor(ObfuscationLayer())
    with ambito_de_sesion(base["a"]):
        salida, _ = ex.execute("consulta_sql", {"query": consulta})
    assert not _reconstruible(salida, VIN_A), f"VIN reconstruible desde: {salida[:200]}"
    assert not _reconstruible(salida, FACTURA_A), f"factura reconstruible: {salida[:200]}"


@pytest.mark.parametrize("consulta", [
    "SELECT content FROM chat_conversations",
    "SELECT accion, detalle FROM ag_bitacora",
    "SELECT name FROM sqlite_master",
    "SELECT clave, valor FROM config",
])
def test_consulta_sql_rechaza_las_tablas_prohibidas(base, consulta):
    from jarvis.ambito import ambito_de_sesion
    from jarvis.tools import consulta_sql

    with ambito_de_sesion(base["a"]):
        r = consulta_sql(consulta)
    assert isinstance(r, dict) and "error" in r, f"debió rechazarse: {consulta}"


def test_consulta_sql_solo_ve_la_sesion_del_ambito(base):
    from jarvis.ambito import ambito_de_sesion
    from jarvis.tools import consulta_sql

    with ambito_de_sesion(base["a"]):
        filas = consulta_sql("SELECT auto_code FROM importaciones")
    assert isinstance(filas, list)
    codigos = {f["auto_code"] for f in filas}
    assert codigos == {"X1"}, "la sesión B no debe ser visible desde el ámbito A"


def test_consulta_sql_no_escribe(base):
    from jarvis.ambito import ambito_de_sesion
    from jarvis.tools import consulta_sql

    with ambito_de_sesion(base["a"]):
        r = consulta_sql("SELECT 1; DROP TABLE importaciones")
    assert isinstance(r, dict) and "error" in r
    c = sqlite3.connect(base["ruta"])
    assert c.execute("SELECT COUNT(*) FROM importaciones").fetchone()[0] == 2
    c.close()


# ── 2 · enmascarado por conjunto en la frontera ──────────────────────

def test_enmascarado_cubre_alias_expresion_y_anidado(base):
    from jarvis.ambito import ambito_de_sesion
    from jarvis.identidades import enmascarar_texto, identificadores_de_sesion
    import database

    conn = database.get_connection()
    ident = identificadores_de_sesion(conn, base["a"])
    conn.close()
    assert VIN_A in ident and FACTURA_A in ident
    assert PEDIMENTO_A in ident and PATENTE_A not in ident, \
        "la patente es corta y ambigua: se enmascara por columna, no por texto"

    from jarvis.ofuscation import ObfuscationLayer
    o = ObfuscationLayer()
    crudo = json.dumps({"nota": f"el {VIN_A} y la {FACTURA_A}",
                        "anidado": [{"x": VIN_A.lower()}]})
    salida = enmascarar_texto(crudo, ident, o)
    assert VIN_A not in salida and VIN_A.lower() not in salida.lower()
    assert FACTURA_A not in salida
    with ambito_de_sesion(base["a"]):
        pass


def test_enmascarado_es_reversible(base):
    from jarvis.identidades import enmascarar_texto, identificadores_de_sesion
    from jarvis.ofuscation import ObfuscationLayer
    import database

    conn = database.get_connection()
    ident = identificadores_de_sesion(conn, base["a"])
    conn.close()
    o = ObfuscationLayer()
    texto = f"revisa {VIN_A}"
    enmascarado = enmascarar_texto(texto, ident, o)
    assert o.unmask_text(enmascarado) == texto


# ── 3 · la entrada del operador ──────────────────────────────────────

def test_la_entrada_del_operador_se_enmascara(base):
    from jarvis.chat_handler import ChatHandler
    from jarvis.llm_interface import LLMProvider

    class Guionado(LLMProvider):
        def __init__(self):
            self.visto = []

        def chat(self, messages, tools=None, system=None):
            self.visto.append(json.dumps(messages, ensure_ascii=False, default=str))
            return {"content": "listo", "tool_calls": [], "stop_reason": "end_turn",
                    "tokens_input": 1, "tokens_output": 1}

    p = Guionado()
    h = ChatHandler(p, session_id=base["a"])
    h.handle_message(f"que pasa con el chasis {VIN_A}")
    assert p.visto, "el proveedor no recibió nada"
    assert VIN_A not in p.visto[0], "el VIN del operador salió en claro al modelo"


# ── 4 · la conversación se persiste enmascarada ──────────────────────

def test_la_conversacion_se_guarda_enmascarada(base):
    import database
    from jarvis.chat_handler import ChatHandler
    from jarvis.llm_interface import LLMProvider

    class Guionado(LLMProvider):
        def chat(self, messages, tools=None, system=None):
            return {"content": "el vehiculo esta en Veracruz", "tool_calls": [],
                    "stop_reason": "end_turn", "tokens_input": 1, "tokens_output": 1}

    h = ChatHandler(Guionado(), session_id=base["a"])
    h.handle_message(f"y el {VIN_A}?")

    conn = database.get_connection()
    guardado = " ".join(r["content"] for r in conn.execute(
        "SELECT content FROM chat_conversations WHERE chat_session_id != 'previa'"))
    conn.close()
    assert VIN_A not in guardado, "el identificador quedó en claro en reposo"


# ── 5 · el ámbito de sesión lo fija el operador, no el modelo ────────

def test_una_tool_no_puede_saltar_a_otra_sesion(base):
    """La llamada directa FALLA fuerte: un salto de sesión es un defecto de
    programación, no un caso de uso, y morir ruidosamente es lo correcto."""
    from jarvis.ambito import FueraDeAmbito, ambito_de_sesion
    from jarvis.tools import resumen_sesion

    with ambito_de_sesion(base["a"]), pytest.raises(FueraDeAmbito):
        resumen_sesion(session_id=base["b"])


def test_el_modelo_recibe_un_error_declarado_no_los_datos(base):
    """Y por el camino REAL (el executor) el modelo recibe un error legible
    en vez de las cifras del otro mes."""
    from jarvis.ambito import ambito_de_sesion
    from jarvis.ofuscation import ObfuscationLayer
    from jarvis.tool_executor import ToolExecutor

    ex = ToolExecutor(ObfuscationLayer())
    with ambito_de_sesion(base["a"]):
        salida, crudo = ex.execute("resumen_sesion", {"session_id": base["b"]})
    assert crudo is None
    assert "fuera del ámbito" in json.loads(salida)["error"]


def test_sin_ambito_declarado_se_usa_la_sesion_del_ambito(base):
    from jarvis.ambito import ambito_de_sesion, sesion_en_ambito

    with ambito_de_sesion(base["a"]):
        assert sesion_en_ambito(None) == base["a"]


def test_comparar_meses_sigue_siendo_posible_si_el_operador_lo_pide(base):
    """El ámbito acota, no prohíbe: con dos sesiones declaradas, las dos son
    consultables. La diferencia es quién lo decide."""
    from jarvis.ambito import ambito_de_sesion, sesion_en_ambito

    with ambito_de_sesion(base["a"], base["b"]):
        assert sesion_en_ambito(base["b"]) == base["b"]
        assert sesion_en_ambito(None) == base["a"]
