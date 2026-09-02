"""Spec de la CITA CON SPAN — hallazgo G4 del diagnóstico v02.

La procedencia era de página: `evidencia` es una lista de ids y un fragmento
puede tener 12 000 caracteres. La cita era cierta y a la vez inútil.

Lo importante no es el resaltado. Es que un span se puede COMPROBAR: un
modelo puede citar el id correcto y atribuirle una frase que no está, y con
la cita por id eso era indetectable. Aquí se detecta.
"""
import sqlite3

import pytest

from autogenes.citas import verificar, verificar_todas
from autogenes.extraccion import sanear_propuesta
from autogenes.sustrato import Sustrato
from autogenes.tipos import Cita
from database import models, models_autogenes

TEXTO = "El contrato ampara la importación\npor el puerto de Emden, 2026."


@pytest.fixture()
def sustrato(tmp_path):
    c = sqlite3.connect(tmp_path / "c.db")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.commit()
    return Sustrato(c, 1)


def test_una_frase_que_no_esta_en_el_fragmento_se_rechaza():
    """EL punto del hallazgo: el id era correcto, la frase inventada."""
    cita = Cita(fragmento_id="f1", inicio=0, fin=20, texto="paga un soborno")
    assert verificar(cita, TEXTO) is None


def test_una_frase_que_si_esta_sobrevive_aunque_las_cifras_esten_mal():
    """Un modelo cuenta caracteres fatal; eso no lo vuelve un mentiroso. Lo
    que no se perdona es la frase que no existe, no el offset torcido."""
    cita = Cita(fragmento_id="f1", inicio=999, fin=1010, texto="puerto de Emden")
    ok = verificar(cita, TEXTO)
    assert ok is not None
    assert TEXTO[ok.inicio:ok.fin] == "puerto de Emden"


def test_el_span_se_reubica_sobre_el_texto_real_no_sobre_el_aplanado():
    """El fragmento trae saltos de línea del extractor; el span tiene que
    indexar el texto REAL, que es el que la pantalla resalta."""
    cita = Cita(fragmento_id="f1", inicio=0, fin=5, texto="importación por el puerto")
    ok = verificar(cita, TEXTO)
    assert ok is not None
    assert "\n" in TEXTO[ok.inicio:ok.fin], "se reubicó sobre el texto aplanado"


def test_un_span_desmesurado_no_es_una_cita():
    """Copiar el fragmento entero y llamarlo cita no cita nada."""
    largo = "palabra " * 200
    assert verificar(Cita(fragmento_id="f1", inicio=0, fin=1500), largo) is None


def test_una_cita_a_un_fragmento_ajeno_no_existe():
    """`textos` solo trae los de la sesión: la frontera se aplica sola."""
    cita = Cita(fragmento_id="de-otra-sesion", inicio=0, fin=3, texto="El ")
    assert verificar_todas([cita], {"f1": TEXTO}) == []


def test_el_saneador_tira_la_cita_fabricada_y_conserva_la_buena():
    cruda = {
        "entidades": [{"nombre": "Emden", "tipo": "lugar", "evidencia": ["f1"],
                       "citas": [
                           {"fragmento_id": "f1", "inicio": 0, "fin": 15,
                            "texto": "puerto de Emden"},
                           {"fragmento_id": "f1", "inicio": 0, "fin": 15,
                            "texto": "sobornó al agente"}]}],
        "relaciones": [],
    }
    p = sanear_propuesta(cruda, {"f1"}, {"f1": TEXTO})
    assert len(p.entidades) == 1
    assert [c.texto for c in p.entidades[0].citas] == ["puerto de Emden"]


def test_sin_textos_no_se_verifica_nada_y_los_spans_se_caen():
    """No se puede comprobar sin el texto, así que no se afirma: la evidencia
    por id —la ley vieja— sigue intacta, pero un span sin verificar no entra."""
    cruda = {"entidades": [{"nombre": "Emden", "tipo": "lugar", "evidencia": ["f1"],
                            "citas": [{"fragmento_id": "f1", "inicio": 0, "fin": 5,
                                       "texto": "lo que sea"}]}],
             "relaciones": []}
    p = sanear_propuesta(cruda, {"f1"})
    assert p.entidades[0].evidencia == ["f1"]
    assert p.entidades[0].citas == []


def test_la_integracion_ancla_las_citas_verificadas(sustrato):
    from autogenes.tipos import PropuestaEntidad, PropuestaGrafo

    a = sustrato.crear_artefacto("pdf", "contrato.pdf")
    f = sustrato.agregar_fragmentos(a.id, [(1, TEXTO)])[0]
    propuesta = PropuestaGrafo(entidades=[
        PropuestaEntidad(nombre="Emden", tipo="lugar", evidencia=[f.id],
                         citas=[Cita(fragmento_id=f.id, inicio=0, fin=15,
                                     texto="puerto de Emden"),
                                Cita(fragmento_id=f.id, inicio=0, fin=15,
                                     texto="frase inventada")])])
    resultado = sustrato.integrar_propuesta(propuesta)
    assert resultado["citas"] == 1, "entró una cita que no se sostiene"

    entidad = sustrato.conn.execute(
        "SELECT id FROM ag_entidades WHERE session_id = 1").fetchone()["id"]
    citas = sustrato.citas_de("entidad", entidad)
    assert len(citas) == 1
    assert citas[0]["texto"] == "puerto de Emden"
    assert citas[0]["pagina"] == 1 and citas[0]["artefacto_id"] == a.id


def test_la_puerta_reverifica_aunque_el_saneador_ya_lo_hiciera(sustrato):
    """Cinturón y tirantes: `integrar_propuesta` es la puerta, y la puerta no
    confía en que alguien haya saneado antes."""
    from autogenes.tipos import PropuestaEntidad, PropuestaGrafo

    a = sustrato.crear_artefacto("pdf", "contrato.pdf")
    f = sustrato.agregar_fragmentos(a.id, [(1, TEXTO)])[0]
    # una propuesta construida a mano, SIN pasar por el saneador
    propuesta = PropuestaGrafo(entidades=[
        PropuestaEntidad(nombre="Emden", tipo="lugar", evidencia=[f.id],
                         citas=[Cita(fragmento_id=f.id, inicio=0, fin=10,
                                     texto="jamás dicho")])])
    assert sustrato.integrar_propuesta(propuesta)["citas"] == 0


def test_borrar_el_sujeto_se_lleva_sus_citas(sustrato):
    """Una cita huérfana es evidencia colgando de algo que ya no existe. La
    referencia es polimórfica (kind + id), así que la cascada no la puede
    hacer una FOREIGN KEY: la hacen disparadores, en el esquema y no en los
    ocho sitios que borran — un sitio nuevo se olvidaría."""
    from autogenes.tipos import PropuestaEntidad, PropuestaGrafo

    a = sustrato.crear_artefacto("pdf", "contrato.pdf")
    f = sustrato.agregar_fragmentos(a.id, [(1, TEXTO)])[0]
    sustrato.integrar_propuesta(PropuestaGrafo(entidades=[
        PropuestaEntidad(nombre="Emden", tipo="lugar", evidencia=[f.id],
                         citas=[Cita(fragmento_id=f.id, inicio=0, fin=15,
                                     texto="puerto de Emden")])]))
    n = lambda: sustrato.conn.execute(  # noqa: E731
        "SELECT COUNT(*) FROM ag_citas").fetchone()[0]
    assert n() == 1

    eid = sustrato.conn.execute(
        "SELECT id FROM ag_entidades WHERE session_id = 1").fetchone()["id"]
    sustrato.quitar_entidad(eid)
    assert n() == 0, "la cita sobrevivió a su entidad"


def test_cortar_una_relacion_se_lleva_sus_citas(sustrato):
    a = sustrato.crear_artefacto("pdf", "contrato.pdf")
    f = sustrato.agregar_fragmentos(a.id, [(1, TEXTO)])[0]
    e1 = sustrato.upsert_entidad("VW", "organizacion", "operador", evidencia=[f.id])
    e2 = sustrato.upsert_entidad("Emden", "lugar", "operador", evidencia=[f.id])
    r = sustrato.agregar_relacion(e1.id, e2.id, "importa por", 0.5, [f.id])
    sustrato._anclar_citas("relacion", r.id,
                           [Cita(fragmento_id=f.id, inicio=0, fin=15,
                                 texto="puerto de Emden")],
                           sustrato.fragmento_textos())
    assert sustrato.conn.execute("SELECT COUNT(*) FROM ag_citas").fetchone()[0] == 1
    sustrato.cortar_relacion(r.id)
    assert sustrato.conn.execute("SELECT COUNT(*) FROM ag_citas").fetchone()[0] == 0
