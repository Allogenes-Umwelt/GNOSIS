"""Spec de las REGLAS DE PATRÓN — hallazgo G8 del diagnóstico v02.

NOMOS es un motor de reglas aduanal excelente y no ve el grafo: sus
condiciones son literales `campo=valor` sobre `{pais_code, j_y_n, auto_code,
factura, chasis}`, evaluadas fila a fila. Con eso no se puede escribir «un
proveedor con más de N facturas que ningún pedimento ampara», que es
justamente la clase de pregunta para la que existe un grafo de evidencia.

Lo que lo hace posible es el vocabulario cerrado (ADR-0017): sin él «ampara»
y «cubre» eran dos condiciones distintas.
"""
import sqlite3

import pytest

from autogenes.patrones import (
    PatronInvalido,
    evaluar_patron,
    evaluar_reglas_patron,
    validar_patron,
)
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def s(tmp_path):
    c = sqlite3.connect(tmp_path / "pat.db")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.commit()
    return Sustrato(c, 1)


def _mundo(s):
    """Un proveedor con tres facturas, dos amparadas por pedimento."""
    a = s.crear_artefacto("pdf", "expediente.pdf")
    fr = s.agregar_fragmentos(a.id, [(i + 1, f"linea {i}") for i in range(6)])
    prov = s.upsert_entidad("Proveedor Norte", "organizacion", "synesis",
                            evidencia=[fr[0].id])
    # este solo emite una factura, y está amparada: no debe disparar nunca
    sur = s.upsert_entidad("Proveedor Sur", "organizacion", "synesis",
                           evidencia=[fr[0].id])
    facturas = [s.upsert_entidad(f"Factura {i}", "documento", "synesis",
                                 evidencia=[fr[i].id]) for i in range(1, 4)]
    ped = s.upsert_entidad("Pedimento 001", "documento", "synesis",
                           evidencia=[fr[4].id])
    for i, f in enumerate(facturas):
        s.agregar_relacion(prov.id, f.id, "emite factura", 0.9, [fr[i + 1].id])
    # dos de las tres SÍ están amparadas
    for f in facturas[:2]:
        s.agregar_relacion(ped.id, f.id, "ampara", 0.9, [fr[4].id])
    s.agregar_relacion(sur.id, facturas[0].id, "emite factura", 0.9, [fr[5].id])
    return {"prov": prov, "sur": sur, "facturas": facturas, "ped": ped}


def test_cuenta_relaciones_por_sujeto(s):
    m = _mundo(s)
    r = evaluar_patron(s.conn, 1, {"sujeto": "organizacion",
                                   "predicado": "emite_factura", "umbral": 2})
    assert r["n_disparos"] == 1
    assert r["disparos"][0]["entidad_id"] == m["prov"].id
    assert r["disparos"][0]["n"] == 3


def test_la_excepcion_descuenta_lo_amparado(s):
    """La pregunta del hallazgo, literal: facturas que NINGÚN pedimento
    ampara. Dos de las tres lo están, así que con umbral 2 ya no dispara."""
    m = _mundo(s)
    patron = {"sujeto": "organizacion", "predicado": "emite_factura",
              "objeto": "documento", "umbral": 2, "salvo_predicado": "ampara"}
    r = evaluar_patron(s.conn, 1, patron)
    assert r["n_disparos"] == 0

    patron["umbral"] = 1
    r = evaluar_patron(s.conn, 1, patron)
    ids = {d["entidad_id"] for d in r["disparos"]}
    assert m["prov"].id in ids           # le queda 1 factura sin amparar
    assert m["sur"].id not in ids        # la suya SÍ está amparada
    assert next(d for d in r["disparos"]
                if d["entidad_id"] == m["prov"].id)["n"] == 1


def test_el_disparo_lleva_sus_CITAS(s):
    """ZERO SNAKE OIL: ni monto ni confianza — el conteo, el umbral y los
    fragmentos que sostienen cada relación contada."""
    _mundo(s)
    r = evaluar_patron(s.conn, 1, {"sujeto": "organizacion",
                                   "predicado": "emite_factura", "umbral": 2})
    disparo = r["disparos"][0]
    assert disparo["evidencia"], "un disparo sin citas no es un hallazgo"
    reales = s.fragmento_ids()
    assert set(disparo["evidencia"]) <= reales
    assert "monto" not in disparo and "confianza" not in disparo


def test_la_derivacion_dice_como_se_contó(s):
    _mundo(s)
    r = evaluar_patron(s.conn, 1, {"sujeto": "organizacion",
                                   "predicado": "emite_factura", "umbral": 2,
                                   "salvo_predicado": "ampara"})
    assert "sin una relación 'ampara' que las ampare" in r["derivacion"]
    assert "citable a fragmento" in r["derivacion"]


def test_doble_corrida_identica(s):
    """Ley del repo para toda métrica citada."""
    _mundo(s)
    patron = {"sujeto": "organizacion", "predicado": "emite_factura", "umbral": 1}
    assert evaluar_patron(s.conn, 1, patron) == evaluar_patron(s.conn, 1, patron)


def test_un_predicado_fuera_del_vocabulario_se_rechaza(s):
    """Una regla sobre un predicado que nadie escribe jamás dispararía, y
    nadie sabría por qué. Se dice al crearla, no al no dispararse."""
    with pytest.raises(PatronInvalido) as e:
        validar_patron({"sujeto": "organizacion", "predicado": "conspira_con"})
    assert "vocabulario" in str(e.value)


def test_un_tipo_de_entidad_inventado_se_rechaza(s):
    with pytest.raises(PatronInvalido):
        validar_patron({"sujeto": "dragon", "predicado": "ampara"})


def test_un_umbral_absurdo_se_rechaza(s):
    with pytest.raises(PatronInvalido):
        validar_patron({"sujeto": "organizacion", "predicado": "ampara", "umbral": 0})


def test_la_regla_se_guarda_por_la_puerta_y_se_evalua(s):
    _mundo(s)
    regla = s.crear_regla_patron("Facturas sin amparo", {
        "sujeto": "organizacion", "predicado": "emite_factura",
        "objeto": "documento", "umbral": 1, "salvo_predicado": "ampara"})
    assert regla["clase"] == "patron"

    evaluadas = evaluar_reglas_patron(s.conn, 1)
    assert len(evaluadas) == 1
    assert evaluadas[0]["nombre"] == "Facturas sin amparo"
    assert evaluadas[0]["n_disparos"] >= 1
    acciones = [r["accion"] for r in s.conn.execute(
        "SELECT accion FROM ag_bitacora WHERE session_id = 1")]
    assert "regla" in acciones


def test_nomos_no_ve_las_reglas_de_patron(s):
    """Una regla de patrón tiene `condiciones` como objeto; si NOMOS la
    recogiera, recorrería ese objeto como si fuera su lista de condiciones."""
    from autogenes.nomos import evaluar_reglas

    _mundo(s)
    s.crear_regla_patron("De grafo", {"sujeto": "organizacion",
                                      "predicado": "emite_factura", "umbral": 1})
    s.crear_regla("De fila", [{"campo": "pais_code", "valor": "DE"}],
                  {"campo": "j_y_n", "valor": "J"})
    s.conn.commit()

    nombres = {r["nombre"] for r in evaluar_reglas(s.conn, 1)["reglas"]}
    assert nombres == {"De fila"}


def test_una_regla_invalida_guardada_no_tumba_la_evaluacion(s):
    """Si el vocabulario cambia bajo una regla vieja, se declara el problema
    de ESA regla; las demás siguen evaluándose."""
    _mundo(s)
    s.crear_regla_patron("Buena", {"sujeto": "organizacion",
                                   "predicado": "emite_factura", "umbral": 1})
    s.conn.execute(
        "INSERT INTO ag_reglas (id, session_id, nombre, condiciones, entonces,"
        " origen, clase) VALUES ('mala', 1, 'Vieja', ?, '{}', 'operador', 'patron')",
        ('{"sujeto": "organizacion", "predicado": "predicado_retirado"}',))
    s.conn.commit()

    evaluadas = {r["nombre"]: r for r in evaluar_reglas_patron(s.conn, 1)}
    assert evaluadas["Buena"]["n_disparos"] >= 1
    assert "error" in evaluadas["Vieja"]
