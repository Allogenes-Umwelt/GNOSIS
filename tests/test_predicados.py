"""Spec del VOCABULARIO de predicados — hallazgo G2 del diagnóstico v02.

`Relacion.tipo` era `str` libre: «importa por», «importa vía» e «importa a
través de» eran tres predicados distintos y ninguna consulta podía preguntar
«todos los proveedores de X». Las entidades ya tenían su lista cerrada; las
relaciones no.

La lista es del OPERADOR (la semilla la propone el diagnóstico); lo que estas
pruebas fijan es el MECANISMO: que normalizar no pierda nada, que la puerta
sea quien lo aplica, y que dos redacciones del mismo verbo dejen de ser dos
aristas.
"""
import sqlite3

import pytest

from autogenes.predicados import PREDICADOS, SINONIMOS, normalizar
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def sustrato(tmp_path):
    c = sqlite3.connect(tmp_path / "p.db")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.commit()
    return Sustrato(c, 1)


def _dos_entidades(s):
    a = s.crear_artefacto("pdf", "contrato.pdf")
    f = s.agregar_fragmentos(a.id, [(1, "VW importa por Veracruz.")])[0]
    return (s.upsert_entidad("VW", "organizacion", "operador", evidencia=[f.id]),
            s.upsert_entidad("Veracruz", "lugar", "operador", evidencia=[f.id]),
            f.id)


def test_las_redacciones_del_mismo_verbo_son_un_predicado():
    """Es el hallazgo entero: tres formas de decir lo mismo eran tres."""
    formas = ["importa por", "importa vía", "importa a través de", "Importa Por",
              "importa_via", "ingresa por"]
    assert {normalizar(f)[0] for f in formas} == {"importa_por"}


def test_lo_que_no_casa_cae_a_otro_SIN_perder_lo_que_decia():
    """Normalizar no puede significar perder: `otro` conserva la redacción,
    que es lo que permite decidir luego si merece entrar al vocabulario."""
    predicado, crudo = normalizar("conspira con")
    assert predicado == "otro"
    assert crudo == "conspira con"


def test_todo_sinonimo_apunta_a_un_predicado_real():
    """Una tabla de mapeo que apunta fuera del vocabulario es una trampa
    silenciosa: la relación se guardaría con un tipo que nadie valida."""
    fuera = {v for v in SINONIMOS.values() if v not in PREDICADOS}
    assert not fuera, f"sinónimos que apuntan fuera del vocabulario: {fuera}"


def test_ningun_sinonimo_pisa_un_predicado():
    """Si una clave del mapa fuese ya un predicado, habría dos caminos para
    el mismo verbo y el mapa mandaría sobre el vocabulario."""
    assert not (set(SINONIMOS) & set(PREDICADOS))


def test_la_puerta_normaliza_lo_que_le_den(sustrato):
    """No el llamador: la puerta. Una regla aplicada en tres sitios no está
    aplicada en ninguno."""
    vw, ver, frag = _dos_entidades(sustrato)
    r = sustrato.agregar_relacion(vw.id, ver.id, "importa vía", 0.8, [frag])
    assert r.tipo == "importa_por"
    assert r.tipo_crudo is None
    assert r.peso_declarado == 0.8


def test_la_puerta_conserva_el_crudo_cuando_cae_a_otro(sustrato):
    vw, ver, frag = _dos_entidades(sustrato)
    r = sustrato.agregar_relacion(vw.id, ver.id, "conspira con", 0.5, [frag])
    assert (r.tipo, r.tipo_crudo) == ("otro", "conspira con")


def test_dos_redacciones_no_duplican_la_arista(sustrato):
    """El efecto que el hallazgo pedía: reintegrar «importa vía» sobre una
    arista guardada como «importa por» ENRIQUECE, no duplica."""
    from autogenes.tipos import PropuestaEntidad, PropuestaGrafo, PropuestaRelacion

    a = sustrato.crear_artefacto("pdf", "c.pdf")
    f1, f2 = sustrato.agregar_fragmentos(a.id, [(1, "VW importa por Veracruz."),
                                                (2, "VW importa vía Veracruz.")])

    def propuesta(tipo, frag):
        return PropuestaGrafo(
            entidades=[PropuestaEntidad(nombre="VW", tipo="organizacion", evidencia=[frag]),
                       PropuestaEntidad(nombre="Veracruz", tipo="lugar", evidencia=[frag])],
            relaciones=[PropuestaRelacion(desde="VW", hasta="Veracruz", tipo=tipo,
                                          evidencia=[frag])])

    sustrato.integrar_propuesta(propuesta("importa por", f1.id))
    segunda = sustrato.integrar_propuesta(propuesta("importa vía", f2.id))
    assert segunda["relaciones"] == 0, "la redacción distinta duplicó la arista"
    filas = sustrato.conn.execute(
        "SELECT tipo, evidencia FROM ag_relaciones WHERE session_id = 1").fetchall()
    assert len(filas) == 1 and filas[0]["tipo"] == "importa_por"
    assert f1.id in filas[0]["evidencia"] and f2.id in filas[0]["evidencia"]


def test_dos_verbos_sin_nombre_NO_se_colapsan(sustrato):
    """`otro` es un CAJÓN, no un predicado. Colapsar en una arista dos verbos
    distintos que todavía no tienen nombre inventaría una relación que nadie
    afirmó — el error opuesto y peor."""
    from autogenes.tipos import PropuestaEntidad, PropuestaGrafo, PropuestaRelacion

    a = sustrato.crear_artefacto("pdf", "c.pdf")
    f1, f2 = sustrato.agregar_fragmentos(a.id, [(1, "A conspira con B."),
                                                (2, "A hereda de B.")])

    def propuesta(tipo, frag):
        return PropuestaGrafo(
            entidades=[PropuestaEntidad(nombre="A", tipo="organizacion", evidencia=[frag]),
                       PropuestaEntidad(nombre="B", tipo="organizacion", evidencia=[frag])],
            relaciones=[PropuestaRelacion(desde="A", hasta="B", tipo=tipo,
                                          evidencia=[frag])])

    sustrato.integrar_propuesta(propuesta("conspira con", f1.id))
    sustrato.integrar_propuesta(propuesta("hereda de", f2.id))
    crudos = {r["tipo_crudo"] for r in sustrato.conn.execute(
        "SELECT tipo_crudo FROM ag_relaciones WHERE session_id = 1")}
    assert crudos == {"conspira con", "hereda de"}


def test_el_prompt_publica_el_vocabulario():
    """Pedir «relaciones tipadas» sin lista es lo que produjo el problema."""
    from autogenes.extraccion import PROMPT_SISTEMA

    for predicado in PREDICADOS:
        assert predicado in PROMPT_SISTEMA
