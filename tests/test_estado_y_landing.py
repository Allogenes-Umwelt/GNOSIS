"""Spec de F3 (parte backend): estado vivo de la constelación y render
de las plantillas del landing AUTOGENES."""
import sqlite3

import pytest

from autogenes.estado import estado_de_sesion
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed,"
        " status) VALUES ('2026-07-10', 7, 2026, 'completed')"
    )
    for chasis in ("V1", "V2", "V3", "V4"):
        c.execute(
            "INSERT INTO importaciones (session_id, chasis, factura) VALUES (1, ?, 'F')",
            (chasis,),
        )
    c.execute("INSERT INTO extraccion_facturas (session_id, factura, chasis, filename)"
              " VALUES (1, 'F', 'V1', 'a.pdf')")
    c.execute("INSERT INTO facturas_faltantes (session_id, factura) VALUES (1, 'FX')")
    c.execute("INSERT INTO facturas_errores (session_id, filename) VALUES (1, 'rota.pdf')")
    c.commit()
    return c


def test_estado_reporta_metricas_reales(conn):
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("pdf", "x.pdf")
    frag = s.agregar_fragmentos(art.id, [(1, "t")])[0]
    s.upsert_entidad("Audi", "organizacion", "synesis", evidencia=[frag.id])

    est = estado_de_sesion(conn, 1)
    assert est["sesion"] == "07/2026" and est["estado_sesion"] == "completed"
    assert est["vehiculos"] == 4 and est["facturas"] == 1
    assert est["faltantes"] == 1 and est["errores"] == 1
    assert est["conciliado_pct"] == 75  # (4-1)/4
    assert est["artefactos"] == 1 and est["entidades"] == 1
    # latentes: fases no construidas se reportan None, jamás inventadas
    assert est["senales"] is None and est["hallazgos"] is None and est["reglas"] is None


def test_estado_sesion_inexistente(conn):
    with pytest.raises(ValueError):
        estado_de_sesion(conn, 99)


def test_estado_sin_vehiculos_no_divide_entre_cero(conn):
    conn.execute("DELETE FROM importaciones")
    conn.commit()
    assert estado_de_sesion(conn, 1)["conciliado_pct"] is None


# ── render de plantillas (smoke: Jinja valido + tokens presentes) ────

def _flask_render(template, **ctx):
    import os

    import flask

    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app = flask.Flask(
        __name__,
        template_folder=os.path.join(raiz, "templates"),
        static_folder=os.path.join(raiz, "static"),
    )
    with app.test_request_context("/autogenes"):
        return flask.render_template(template, **ctx)


def test_landing_autogenes_renderiza():
    html = _flask_render("autogenes.html", sesion_etiqueta="07/2026")
    assert 'data-scope="autogenes"' in html
    assert "Navegador del Sustrato" in html and "SESIÓN 07/2026" in html
    assert "constelacion.js" in html and "constelacion.css" in html
    assert 'href="/autogenes/concilia"' in html and 'href="/autogenes/qualia"' in html
    assert 'name="facturas"' in html  # carga conectada al contrato de fase1


def test_seccion_renderiza_con_metricas():
    s = {"nombre": "CONCILIA", "numero": "I", "forma": "triangulo",
         "tipo": "Dashboard", "fase": "Fase F9", "descripcion": "d", "estado": "e"}
    html = _flask_render("autogenes_seccion.html", s=s,
                         metricas=[{"etiqueta": "Conciliado %", "valor": "75%"}])
    assert "CONCILIA" in html and "75%" in html and "cst-forma" in html


def test_home_monta_la_celda_primitiva():
    with open("templates/main.html") as f:
        html = f.read()
    assert 'data-scope="app"' in html
    assert "constelacion.js" in html and "constelacion.css" in html
    assert "gd-glow" not in html  # el ojo ornamental ya no existe
    assert "Una sola fuente" in html  # el hero sobrevive (decisión de diseño)


def test_lienzo_del_grafo_renderiza():
    html = _flask_render("autogenes_grafo.html", sesion_etiqueta="07/2026")
    assert "gr-lienzo" in html and "<canvas" in html
    assert "fuerzas.js" in html and "grafo.js" in html
    assert 'data-inspector="#gr-inspector"' in html
    assert "SESIÓN 07/2026" in html


def test_vinculos_renderiza():
    html = _flask_render("autogenes_vinculos.html", sesion_etiqueta="07/2026")
    assert "vn-desde" in html and "vn-hasta" in html and "vn-dockear" in html
    assert "vinculos.js" in html and "grafo.js" in html and "<canvas" in html
