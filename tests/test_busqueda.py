"""Spec de BÚSQUEDA de texto — hallazgo G6 del diagnóstico v02.

`grep 'MATCH|fts'` sobre `autogenes/` no devolvía nada: el sustrato guardaba
el texto de cada fragmento y no había forma de buscarlo. El operador no podía
preguntar «qué documentos mencionan X», y el modelo tampoco.

FTS5 viene DENTRO de SQLite: cero dependencias, local, sin red — y `bm25`
con parámetros fijos es determinista (comprobado: dos corridas idénticas),
así que cumple la ley de doble corrida.
"""
import sqlite3

import pytest

from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn(tmp_path):
    c = sqlite3.connect(tmp_path / "b.db")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-08-10', 8, 2026)")
    c.commit()
    return c


def _sembrar(conn, session_id=1):
    s = Sustrato(conn, session_id)
    a1 = s.crear_artefacto("pdf", "contrato-emden.pdf")
    s.agregar_fragmentos(a1.id, [
        (1, "El contrato ampara la importación por el puerto de Emden."),
        (2, "La fianza vence el 20 de julio y cubre a Volkswagen."),
    ])
    a2 = s.crear_artefacto("pdf", "acta-veracruz.pdf")
    s.agregar_fragmentos(a2.id, [
        (1, "Acta levantada en Veracruz sobre el pedimento observado."),
    ])
    return a1.id, a2.id


def test_busca_por_palabra_y_devuelve_su_procedencia(conn):
    """Un resultado sin procedencia no sirve: la ley pide fragmento→página→doc."""
    from autogenes.busqueda import buscar_fragmentos

    a1, _ = _sembrar(conn)
    r = buscar_fragmentos(conn, 1, "Emden")
    assert r["total"] >= 1
    primero = r["resultados"][0]
    assert primero["artefacto_id"] == a1
    assert primero["artefacto"] == "contrato-emden.pdf"
    assert primero["pagina"] == 1
    assert "fragmento_id" in primero
    assert "Emden" in primero["extracto"]


def test_la_busqueda_esta_acotada_a_la_sesion(conn):
    """Una sesión no puede ver el expediente de otra."""
    from autogenes.busqueda import buscar_fragmentos

    _sembrar(conn, session_id=1)
    _sembrar(conn, session_id=2)
    r = conn.execute("SELECT COUNT(*) FROM ag_fragmentos").fetchone()[0]
    assert r == 6, "el sembrado de las dos sesiones falló"
    assert buscar_fragmentos(conn, 1, "Emden")["total"] == 1


def test_no_encontrar_nada_se_declara(conn):
    from autogenes.busqueda import buscar_fragmentos

    _sembrar(conn)
    r = buscar_fragmentos(conn, 1, "criptomoneda")
    assert r["total"] == 0
    assert r["resultados"] == []


def test_el_indice_sigue_a_las_mutaciones(conn):
    """Un índice que envejece miente: borrar el artefacto retira su texto."""
    from autogenes.busqueda import buscar_fragmentos

    a1, _ = _sembrar(conn)
    assert buscar_fragmentos(conn, 1, "fianza")["total"] == 1
    Sustrato(conn, 1).quitar_artefacto(a1)
    assert buscar_fragmentos(conn, 1, "fianza")["total"] == 0


def test_doble_corrida_identica(conn):
    """bm25 con parámetros fijos ordena igual las dos veces."""
    from autogenes.busqueda import buscar_fragmentos

    _sembrar(conn)
    assert buscar_fragmentos(conn, 1, "pedimento") == buscar_fragmentos(conn, 1, "pedimento")


def test_una_consulta_malformada_no_revienta(conn):
    """El operador (y el modelo) escriben lo que quieran: la sintaxis de FTS5
    es estricta y un paréntesis suelto lanza. Se declara, no se cae."""
    from autogenes.busqueda import buscar_fragmentos

    _sembrar(conn)
    r = buscar_fragmentos(conn, 1, 'ampara AND (')
    assert "error" in r or r["total"] >= 0


def test_el_modelo_puede_buscar_por_el_sandbox(conn, tmp_path, monkeypatch):
    """La tool: el modelo pregunta por texto y recibe procedencia, con los
    identificadores enmascarados como cualquier otra salida."""
    import database
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "b.db"))
    _sembrar(conn)
    conn.commit()

    from jarvis.ambito import ambito_de_sesion
    from jarvis.ofuscation import ObfuscationLayer
    from jarvis.tool_executor import TOOL_FUNCTIONS, ToolExecutor

    assert "buscar_fragmentos" in TOOL_FUNCTIONS
    ex = ToolExecutor(ObfuscationLayer())
    with ambito_de_sesion(1):
        salida, crudo = ex.execute("buscar_fragmentos", {"consulta": "Emden"})
    assert "Emden" in salida
    assert "contrato-emden.pdf" in salida


def test_la_tool_esta_publicada_al_modelo(conn):
    from jarvis.tools import TOOL_DEFINITIONS

    nombres = {t["name"] for t in TOOL_DEFINITIONS}
    assert "buscar_fragmentos" in nombres


def test_el_total_se_acota_y_lo_declara(conn):
    """Contar TODOS los aciertos costaba más que buscarlos (400-1 050 ms
    contra 17-24 ms a 24 000 fragmentos). Se cuenta hasta un tope y por
    encima se declara una COTA — «más de 500», jamás una cifra inventada."""
    from autogenes.busqueda import TOPE_CONTEO, buscar_fragmentos

    s = Sustrato(conn, 1)
    a = s.crear_artefacto("pdf", "masivo.pdf")
    s.agregar_fragmentos(a.id, [(i + 1, f"linea {i} con la palabra aguja")
                                for i in range(TOPE_CONTEO + 40)])

    r = buscar_fragmentos(conn, 1, "aguja")
    assert "total" not in r, "no puede afirmar un total que no contó"
    assert r["total_minimo"] == TOPE_CONTEO
    assert str(TOPE_CONTEO) in r["aviso"]


def test_un_total_que_cabe_es_exacto(conn):
    """Por debajo del tope no hay cota que valga: el número es el número."""
    from autogenes.busqueda import buscar_fragmentos

    s = Sustrato(conn, 1)
    a = s.crear_artefacto("pdf", "treinta.pdf")
    s.agregar_fragmentos(a.id, [(i + 1, f"linea {i} con la palabra alfiler")
                                for i in range(30)])

    r = buscar_fragmentos(conn, 1, "alfiler")
    assert r["total"] == 30
    assert "total_minimo" not in r
    assert len(r["resultados"]) == 25


def test_la_busqueda_arranca_por_el_indice_no_por_la_tabla(conn):
    """El `CROSS JOIN` fija el orden de anidamiento. El plan es parte del
    contrato, así que se afirma sobre el plan y no sobre el reloj —un umbral
    en milisegundos se vuelve flaky en una máquina lenta.

    Donde esto MUERDE es en el conteo: con un `JOIN` llano el planificador
    barría `ag_fragmentos` por sesión y sondeaba el índice fila a fila, y una
    palabra poco frecuente pasaba de 0,2 ms a 324 ms. La búsqueda ya arranca
    por el índice aunque el `JOIN` sea llano, porque `bm25()` en el `ORDER BY`
    lo obliga; ahí el `CROSS JOIN` solo impide que un cambio futuro del
    planificador se lleve la propiedad por delante."""
    from autogenes.busqueda import _BUSCAR, _CONTAR

    for sql in (_BUSCAR, _CONTAR):
        pasos = [f[3] for f in conn.execute("EXPLAIN QUERY PLAN " + sql, ("x", 1, 5))]
        indice = next(i for i, p in enumerate(pasos) if "fts" in p)
        tabla = next(i for i, p in enumerate(pasos) if " f " in f" {p} " or p.endswith(" f"))
        assert indice < tabla, f"el plan no arranca por el índice: {pasos}"


def test_un_conteo_que_falla_no_se_reporta_como_cero(conn, monkeypatch):
    """Con 25 resultados en la mano, `total: 0` sería una cifra falsa. Si el
    conteo no se puede hacer, se dice lo único cierto: lo que se muestra."""
    import autogenes.busqueda as B

    s = Sustrato(conn, 1)
    a = s.crear_artefacto("pdf", "muchos.pdf")
    s.agregar_fragmentos(a.id, [(i + 1, f"linea {i} con la palabra chincheta")
                                for i in range(60)])
    monkeypatch.setattr(B, "_contar", lambda *a, **k: None)

    r = B.buscar_fragmentos(conn, 1, "chincheta")
    assert len(r["resultados"]) == 25
    assert r.get("total") != 0, "reportó un total de cero con 25 aciertos delante"
    assert r["total_minimo"] == 25
