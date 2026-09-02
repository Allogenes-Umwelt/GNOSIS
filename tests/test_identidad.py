"""Spec de la IDENTIDAD ENTRE SESIONES — hallazgo G1 del diagnóstico v02.

`ag_entidades` lleva `session_id`: cada mes era un espacio de nombres propio.
«Volkswagen de México S.A. de C.V.» y «Volkswagen Mexico» eran dos nodos, y
el mismo proveedor en doce meses eran doce nodos sin arista entre ellos. Un
grafo que no sabe que dos cosas son la misma no es de conocimiento: es un
índice.

La línea que estas pruebas defienden es la que separa NORMALIZAR de INVENTAR:
la igualdad se resuelve sola (es determinista y defendible ante un auditor);
el PARECIDO se propone y lo decide una persona.
"""
import sqlite3

import pytest

from autogenes.canon import canonizar, claves_bloque
from autogenes.similitud import candidatas, jaccard
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn(tmp_path):
    c = sqlite3.connect(tmp_path / "id.db")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    for mes in (7, 8, 9):
        c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                  " year_processed) VALUES (?, ?, 2026)", (f"2026-0{mes}-10", mes))
    c.commit()
    return c


def _entidad(conn, session_id, nombre, tipo="organizacion", origen="synesis"):
    s = Sustrato(conn, session_id)
    a = s.crear_artefacto("pdf", f"doc-{session_id}.pdf")
    f = s.agregar_fragmentos(a.id, [(1, f"{nombre} aparece en el documento.")])[0]
    return s.upsert_entidad(nombre, tipo, origen, evidencia=[f.id])


# ── la parte determinista: la igualdad se resuelve sola ──────────────

def test_las_formas_legales_no_hacen_a_dos_empresas():
    """El caso del hallazgo, literal."""
    assert (canonizar("Volkswagen de México S.A. de C.V.")
            == canonizar("Volkswagen Mexico")
            == canonizar("VOLKSWAGEN MÉXICO"))


def test_el_orden_de_las_palabras_no_es_una_identidad_distinta():
    assert canonizar("Aduanal Agencia Pérez") == canonizar("Agencia Aduanal Perez")


def test_un_nombre_que_es_solo_forma_legal_no_se_queda_en_nada():
    """Perder la identidad por normalizarla sería peor que no normalizar."""
    assert canonizar("S.A. de C.V.") != ""


def test_el_mismo_proveedor_en_tres_meses_es_UNA_identidad(conn):
    """La pregunta que G1 declaraba imposible: «todo lo que sabemos de este
    proveedor», a través de los meses."""
    a = _entidad(conn, 1, "Volkswagen de México S.A. de C.V.")
    b = _entidad(conn, 2, "Volkswagen Mexico")
    c = _entidad(conn, 3, "VOLKSWAGEN MÉXICO")

    ids = {x.id for x in (a, b, c)}
    identidades = {r["identidad_id"] for r in conn.execute(
        "SELECT identidad_id FROM ag_entidades")}
    assert len(identidades) == 1, "tres escrituras del mismo nombre, tres identidades"

    identidad = identidades.pop()
    filas = Sustrato(conn, 1).entidades_de_identidad(identidad)
    assert {f["id"] for f in filas} == ids
    assert {f["session_id"] for f in filas} == {1, 2, 3}


def test_la_evidencia_NO_cruza_de_mes(conn):
    """Compartir identidad no es compartir expediente: la fila sigue siendo
    de SU sesión y su evidencia, de sus documentos."""
    a = _entidad(conn, 1, "Volkswagen Mexico")
    b = _entidad(conn, 2, "Volkswagen Mexico")
    assert a.evidencia and b.evidencia
    assert set(a.evidencia).isdisjoint(b.evidencia)


def test_dos_empresas_distintas_no_se_confunden(conn):
    _entidad(conn, 1, "Audi AG")
    _entidad(conn, 1, "Porsche AG")
    assert conn.execute(
        "SELECT COUNT(DISTINCT identidad_id) FROM ag_entidades").fetchone()[0] == 2


# ── la parte que propone: el parecido lo decide una persona ──────────

def test_la_abreviatura_NO_se_funde_sola(conn):
    """«VW» y «Volkswagen» es un parecido, no una igualdad. Fundirlo solo
    sería inventar; esa es toda la línea que este módulo defiende."""
    _entidad(conn, 1, "Volkswagen Mexico")
    _entidad(conn, 1, "VW Mexico")
    assert conn.execute(
        "SELECT COUNT(DISTINCT identidad_id) FROM ag_entidades").fetchone()[0] == 2


def test_pero_SI_se_propone_con_su_numero_y_su_umbral(conn):
    _entidad(conn, 1, "Agencia Aduanal Perez")
    _entidad(conn, 1, "Agencia Aduanal Perez y Asociados")
    props = candidatas(conn, 1)
    assert len(props) == 1
    p = props[0]
    assert p["umbral"] == 0.6
    assert 0 < p["puntuacion"] <= 1
    assert "Decide el operador" in p["razon"]


def test_jamas_se_propone_corregir_al_operador(conn):
    """Una entidad con origen='operador' es una afirmación humana; proponer
    fundirla sería que la máquina corrija al operador (ley aditiva)."""
    _entidad(conn, 1, "Agencia Aduanal Perez", origen="operador")
    _entidad(conn, 1, "Agencia Aduanal Perez y Asociados")
    assert candidatas(conn, 1) == []


def test_no_se_proponen_fusiones_entre_tipos_distintos(conn):
    _entidad(conn, 1, "Veracruz Servicios", tipo="organizacion")
    _entidad(conn, 1, "Veracruz Servicios", tipo="lugar")
    assert candidatas(conn, 1) == []


def test_una_filial_se_propone_aunque_jaccard_no_llegue(conn):
    """«Volkswagen» y «Volkswagen Mexico Servicios Logisticos» comparten poco
    en proporción, pero uno contiene al otro entero — que es la forma normal
    de escribir una filial. Se declara aparte, no se disfraza el número."""
    _entidad(conn, 1, "Volkswagen")
    _entidad(conn, 1, "Volkswagen Mexico Servicios Logisticos")
    props = candidatas(conn, 1)
    assert len(props) == 1
    assert "contiene al otro entero" in props[0]["razon"]
    assert props[0]["puntuacion"] < 0.6, "no se infló el número para que pasara"


def test_la_propuesta_es_determinista(conn):
    """Ley del repo: la misma base propone lo mismo, en el mismo orden."""
    for nombre in ("Agencia Aduanal Perez", "Agencia Aduanal Perez y Asociados",
                   "Transportes del Golfo", "Transportes Golfo Express"):
        _entidad(conn, 1, nombre)
    assert candidatas(conn, 1) == candidatas(conn, 1)


def test_el_bloqueo_evita_comparar_todos_contra_todos():
    """La ola 1 se dedicó a quitar el patrón cuadrático; no se vuelve a meter
    por la puerta de atrás."""
    assert set(claves_bloque("Volkswagen de México S.A. de C.V.")) & \
           set(claves_bloque("Volkswagen Mexico"))
    assert not (set(claves_bloque("Audi AG")) & set(claves_bloque("Porsche AG")))


def test_anadir_una_palabra_no_cambia_con_quien_se_compara():
    """Una clave de bloqueo única —el token más largo, digamos— es inestable:
    «Agencia Aduanal Perez» y «...y Asociados» dejarían de compararse justo
    cuando más falta hace."""
    a = set(claves_bloque("Agencia Aduanal Perez"))
    b = set(claves_bloque("Agencia Aduanal Perez y Asociados"))
    assert a & b


def test_jaccard_se_puede_rehacer_a_mano():
    """Un número citado tiene que ser reproducible con papel."""
    assert jaccard("agencia aduanal", "agencia aduanal") == 1.0
    assert jaccard("agencia aduanal", "agencia naviera") == pytest.approx(1 / 3)
    assert jaccard("", "algo") == 0.0
