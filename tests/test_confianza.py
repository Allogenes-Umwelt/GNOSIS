"""Spec de la CONFIANZA DERIVADA — hallazgo G5 del diagnóstico v02.

`peso` era 0,5 por defecto o lo que dijera el LLM, y se leía como confianza.
No lo es: es una afirmación sobre una afirmación. ZERO SNAKE OIL pide de un
número que sea citable a algo, y «el modelo dijo 0,8» no cita nada.

Lo que estas pruebas fijan: que el número salga de contar fuentes reales, que
venga con su derivación, y que dos corridas den lo mismo (ley del repo para
toda métrica citada).
"""
import sqlite3

import pytest

from autogenes.confianza import confianza_de_sesion
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def sustrato(tmp_path):
    c = sqlite3.connect(tmp_path / "cf.db")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.commit()
    return Sustrato(c, 1)


def _dos_documentos(s):
    a1 = s.crear_artefacto("pdf", "contrato.pdf")
    f1, f2 = s.agregar_fragmentos(a1.id, [(1, "VW importa por Veracruz."),
                                          (2, "Veracruz recibe el embarque.")])
    a2 = s.crear_artefacto("pdf", "acta.pdf")
    f3 = s.agregar_fragmentos(a2.id, [(1, "Confirma la entrada por Veracruz.")])[0]
    vw = s.upsert_entidad("VW", "organizacion", "operador", evidencia=[f1.id])
    ver = s.upsert_entidad("Veracruz", "lugar", "operador", evidencia=[f1.id])
    return vw, ver, (f1.id, f2.id, f3.id)


def test_dos_documentos_pesan_mas_que_uno_citado_dos_veces(sustrato):
    """El corazón del hallazgo: la confianza cuenta ARTEFACTOS distintos.
    Citar el mismo documento dos veces no lo vuelve dos testigos."""
    vw, ver, (f1, f2, f3) = _dos_documentos(sustrato)
    una = sustrato.agregar_relacion(vw.id, ver.id, "importa por", 0.9, [f1, f2])
    dos = sustrato.agregar_relacion(ver.id, vw.id, "audita", 0.1, [f1, f3])

    c = confianza_de_sesion(sustrato.conn, 1)
    assert c[una.id]["fragmentos"] == 2 and c[una.id]["fuentes"] == 1
    assert c[dos.id]["fragmentos"] == 2 and c[dos.id]["fuentes"] == 2
    assert c[una.id]["nivel"] == "citada"
    assert c[dos.id]["nivel"] == "contrastada"


def test_el_peso_del_modelo_no_manda_sobre_la_confianza(sustrato):
    """La relación con `peso_declarado` 0,9 tiene MENOS respaldo que la de
    0,1. Ese es exactamente el número que no se podía seguir mostrando."""
    vw, ver, (f1, f2, f3) = _dos_documentos(sustrato)
    alta = sustrato.agregar_relacion(vw.id, ver.id, "importa por", 0.9, [f1])
    baja = sustrato.agregar_relacion(ver.id, vw.id, "audita", 0.1, [f1, f3])

    c = confianza_de_sesion(sustrato.conn, 1)
    assert c[alta.id]["peso_declarado"] > c[baja.id]["peso_declarado"]
    assert c[alta.id]["fuentes"] < c[baja.id]["fuentes"]


def test_todo_numero_viene_con_su_derivacion(sustrato):
    """Un número sin derivación es lo que este módulo existe para no producir."""
    vw, ver, (f1, _, f3) = _dos_documentos(sustrato)
    r = sustrato.agregar_relacion(vw.id, ver.id, "importa por", 0.5, [f1, f3])
    d = confianza_de_sesion(sustrato.conn, 1)[r.id]
    assert "2 artefactos distintos lo citan" in d["derivacion"]
    assert "propuesta por el modelo" in d["derivacion"]
    assert sorted(d["artefactos"]) == d["artefactos"]


def test_lo_que_afirma_el_operador_se_declara_como_tal(sustrato):
    """No es «más verdad»; es otra clase de afirmación, y se dice cuál."""
    vw, ver, (f1, _, _) = _dos_documentos(sustrato)
    r = sustrato.agregar_relacion(vw.id, ver.id, "importa por", 0.5, [f1],
                                  origen="operador")
    d = confianza_de_sesion(sustrato.conn, 1)[r.id]
    assert d["origen"] == "operador"
    assert "afirmada por el operador" in d["derivacion"]


def test_las_citas_al_trozo_cuentan_en_la_derivacion(sustrato):
    """Un span verificado ancla la afirmación a texto comprobado, no a una
    página entera: se cuenta y se dice."""
    from autogenes.tipos import Cita

    vw, ver, (f1, _, _) = _dos_documentos(sustrato)
    r = sustrato.agregar_relacion(vw.id, ver.id, "importa por", 0.5, [f1])
    sustrato._anclar_citas(
        "relacion", r.id,
        [Cita(fragmento_id=f1, inicio=0, fin=11, texto="VW importa")],
        sustrato.fragmento_textos())
    d = confianza_de_sesion(sustrato.conn, 1)[r.id]
    assert d["spans_verificados"] == 1
    assert "1 cita verificada al trozo" in d["derivacion"]


def test_doble_corrida_identica(sustrato):
    """Ley del repo: toda métrica citada se recalcula igual."""
    vw, ver, (f1, f2, f3) = _dos_documentos(sustrato)
    sustrato.agregar_relacion(vw.id, ver.id, "importa por", 0.9, [f1, f2, f3])
    sustrato.agregar_relacion(ver.id, vw.id, "audita", 0.4, [f3])
    assert (confianza_de_sesion(sustrato.conn, 1)
            == confianza_de_sesion(sustrato.conn, 1))


def test_una_base_sin_citas_no_es_un_error(sustrato):
    """`ag_citas` puede faltar en una base a medio migrar: cero spans, no
    una excepción que tumbe el panel."""
    vw, ver, (f1, _, _) = _dos_documentos(sustrato)
    r = sustrato.agregar_relacion(vw.id, ver.id, "importa por", 0.5, [f1])
    sustrato.conn.execute("DROP TABLE ag_citas")
    assert confianza_de_sesion(sustrato.conn, 1)[r.id]["spans_verificados"] == 0


def test_el_expediente_muestra_la_confianza_con_su_derivacion(sustrato):
    """Derivarla y no enseñarla no cierra el hallazgo: el número tiene que
    llegar donde el operador lee, con la frase que permite rehacerlo."""
    from autogenes import consultas

    vw, ver, (f1, _, f3) = _dos_documentos(sustrato)
    sustrato.agregar_relacion(vw.id, ver.id, "importa por", 0.5, [f1, f3])
    sustrato.conn.commit()

    exp = consultas.expediente_entidad(sustrato.conn, 1, "VW")
    rel = exp["relaciones"][0]
    assert rel["confianza"]["fuentes"] == 2
    assert rel["confianza"]["nivel"] == "contrastada"
    assert "2 artefactos distintos lo citan" in rel["confianza"]["derivacion"]


def test_la_derivacion_concuerda_en_singular(sustrato):
    """«1 artefacto distinto lo citan» es una frase mal escrita en un panel
    que el operador va a leer."""
    vw, ver, (f1, _, _) = _dos_documentos(sustrato)
    r = sustrato.agregar_relacion(vw.id, ver.id, "importa por", 0.5, [f1])
    d = confianza_de_sesion(sustrato.conn, 1)[r.id]["derivacion"]
    assert "1 artefacto distinto lo cita;" in d
    assert "1 fragmento en total" in d
