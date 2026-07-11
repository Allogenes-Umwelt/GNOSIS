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
    # Radar (F5) vive: Audi huérfana + faltantes + errores = 3 señales
    assert est["senales"] == 3
    # CONCILIA (F9) vive: hallazgos es conteo real del motor con datos
    # aduanales presentes; NOMOS sigue latente (None, jamás inventado)
    assert isinstance(est["hallazgos"], int) and est["hallazgos"] >= 1
    assert est["reglas"] is None


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


def test_ingesta_y_radar_renderizan():
    html = _flask_render("autogenes_ingesta.html", sesion_etiqueta="07/2026")
    assert "dn-lienzo" in html and "dendro.js" in html and "in-quorum" in html
    html2 = _flask_render("autogenes_radar.html", sesion_etiqueta="07/2026")
    assert "mt-lienzo" in html2 and "metabolismo.js" in html2
    assert "mt-urgencias" in html2 and "QUÉ SE PROCESÓ" in html2
    # sin jerga metabólica/técnica en la copia visible
    assert "metabólic" not in html2.lower() and "fuga" not in html2.lower()


def test_sintesis_renderiza():
    html = _flask_render("autogenes_sintesis.html", sesion_etiqueta="07/2026")
    assert "sn-informe" in html and "sn-trazas" in html and "sintesis.js" in html
    assert "Digesto" in html and "SESIÓN 07/2026" in html
    assert 'id="sn-redactar"' in html and 'id="sn-dockear"' in html


def test_conciliado_pct_se_acota_a_cero_cien(conn):
    """Un reproceso parcial puede dejar más faltantes que vehículos: el
    porcentaje se acota, jamás se muestra negativo."""
    conn.execute("DELETE FROM facturas_faltantes")
    for i in range(9):
        conn.execute(
            "INSERT INTO facturas_faltantes (session_id, factura) VALUES (1, ?)",
            (f"FAC-F-{i}",),
        )
    conn.commit()
    pct = estado_de_sesion(conn, 1)["conciliado_pct"]
    assert pct == 0


def test_qualia_renderiza():
    html = _flask_render("autogenes_qualia.html", sesion_etiqueta="07/2026")
    assert "QLA-01" in html
    assert "qa-dial" in html and "qa-lienzo" in html
    assert "fijar base" in html
    assert "qualia.js" in html


def test_estado_anomalias_none_sin_base(conn):
    assert estado_de_sesion(conn, 1)["anomalias"] is None


def test_estado_cuenta_anomalias_con_base(conn):
    from autogenes import qualia as q
    conn.executescript(models_autogenes.AG_SCHEMA_SQL)
    q.fijar_base(conn, 1)
    assert estado_de_sesion(conn, 1)["anomalias"] == 0


def test_qualia_terreno_renderiza():
    html = _flask_render("autogenes_qualia_terreno.html", sesion_etiqueta="07/2026")
    assert "QLA-02" in html
    assert "qt-lienzo" in html and "qualia_terreno.js" in html
    assert "Terreno de anomalías" in html


def test_qualia_cascada_renderiza():
    html = _flask_render("autogenes_qualia_cascada.html", sesion_etiqueta="07/2026")
    assert "QLA-03" in html
    assert "qc-lienzo" in html and "qualia_cascada.js" in html
    assert 'data-modo="caida"' in html and 'data-modo="enlace"' in html


def test_qualia_horizonte_renderiza():
    html = _flask_render("autogenes_qualia_horizonte.html", sesion_etiqueta="07/2026")
    assert "QLA-04" in html
    assert "qh-lienzo" in html and "qualia_horizonte.js" in html
    assert "Horizonte de eventos" in html


def test_qualia_orbe_renderiza():
    html = _flask_render("autogenes_qualia_orbe.html", sesion_etiqueta="07/2026")
    assert "QLA-05" in html
    assert "qo-lienzo" in html and "qualia_orbe.js" in html


def test_qualia_cuerdas_renderiza():
    html = _flask_render("autogenes_qualia_cuerdas.html", sesion_etiqueta="07/2026")
    assert "QLA-06" in html
    assert "qd-lienzo" in html and "qualia_cuerdas.js" in html


def test_qualia_maquina_renderiza():
    html = _flask_render("autogenes_qualia_maquina.html", sesion_etiqueta="07/2026")
    assert "QLA-C2" in html
    assert "qm-observar" in html and "qm-orientar" in html
    assert "qm-decidir" in html and "qm-actuar" in html
    assert "qualia_maquina.js" in html


def test_concilia_renderiza():
    html = _flask_render("autogenes_concilia.html", sesion_etiqueta="07/2026")
    assert "CNC-01" in html
    assert "cn-flujo" in html and "cn-hallazgos" in html
    assert "cn-banda-dwh" in html and "cn-banda-pdf" in html
    assert "cn-lienzo" in html and "cn-vin" in html
    assert "concilia.js" in html


def test_validacion_renderiza():
    html = _flask_render("autogenes_validacion.html", sesion_etiqueta="07/2026")
    assert "VLD-02" in html
    assert "vl-reglas" in html and "vl-detalle" in html
    assert "validacion.js" in html


def test_sinapsis_renderiza():
    html = _flask_render("autogenes_sinapsis.html", sesion_etiqueta="07/2026")
    assert "SNP-03" in html
    assert "sn-insights" in html
    assert "sinapsis.js" in html
