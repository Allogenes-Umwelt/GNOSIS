"""Spec de la IMPORTACIÓN de bundles — hallazgo G9 del diagnóstico v02.

`/exportar` prometía un bundle «re-importable y auditable fuera de GNOSIS» y
no había con qué re-importarlo.

Lo que estas pruebas defienden no es que el bundle entre: es CÓMO entra. Un
importador es una puerta nueva por la que llega evidencia de fuera, y las dos
leyes del sustrato tienen que seguir en pie al otro lado — la puerta única
(todo por `Sustrato`, con bitácora) y la de procedencia (nada cita lo que no
ha entrado).
"""
import sqlite3

import pytest

from autogenes.importacion import BundleInvalido, importar_bundle, resumen_bundle
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn(tmp_path):
    c = sqlite3.connect(tmp_path / "imp.db")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    for mes in (7, 8):
        c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                  " year_processed) VALUES (?, ?, 2026)", (f"2026-0{mes}-10", mes))
    c.commit()
    return c


def _bundle_de(conn, session_id) -> dict:
    """Un bundle como el que sirve `/exportar`."""
    return {"session_id": session_id, "grafo": Sustrato(conn, session_id).leer_grafo()}


def _sembrar(conn, session_id=1):
    s = Sustrato(conn, session_id)
    a = s.crear_artefacto("pdf", "contrato.pdf")
    f1, f2 = s.agregar_fragmentos(a.id, [(1, "Volkswagen importa por Veracruz."),
                                         (2, "El SAT audita la operación.")])
    vw = s.upsert_entidad("Volkswagen Mexico", "organizacion", "synesis", evidencia=[f1.id])
    ver = s.upsert_entidad("Veracruz", "lugar", "synesis", evidencia=[f1.id])
    s.upsert_entidad("SAT", "organizacion", "synesis", evidencia=[f2.id])
    s.agregar_relacion(vw.id, ver.id, "importa por", 0.8, [f1.id])
    conn.commit()
    return s


def test_un_bundle_exportado_vuelve_a_entrar(conn):
    _sembrar(conn, 1)
    bundle = _bundle_de(conn, 1)

    r = importar_bundle(conn, 2, bundle)
    assert r["importado"] == {"artefactos": 1, "fragmentos": 2, "entidades": 3,
                              "relaciones": 1, "eventos": 0}
    g2 = Sustrato(conn, 2).leer_grafo()
    assert {e["nombre"] for e in g2["entidades"]} == {"Volkswagen Mexico", "Veracruz", "SAT"}
    assert g2["relaciones"][0]["tipo"] == "importa_por"


def test_la_procedencia_se_REMAPEA_no_se_reutiliza(conn):
    """El punto de seguridad: si el bundle impusiera sus ids, una afirmación
    podría colgar de un fragmento de ESTA base que dice otra cosa."""
    _sembrar(conn, 1)
    bundle = _bundle_de(conn, 1)
    ids_viejos = {f["id"] for f in bundle["grafo"]["fragmentos"]}

    importar_bundle(conn, 2, bundle)
    g2 = Sustrato(conn, 2).leer_grafo()
    ids_nuevos = {f["id"] for f in g2["fragmentos"]}
    assert not (ids_viejos & ids_nuevos), "el bundle impuso sus ids"

    # y cada entidad cita un fragmento que EXISTE en la sesión destino
    for e in g2["entidades"]:
        assert e["evidencia"]
        assert set(e["evidencia"]) <= ids_nuevos


def test_una_entidad_del_modelo_sin_cita_real_no_entra(conn):
    """La ley de procedencia no se relaja porque el dato venga de un bundle."""
    bundle = {"grafo": {
        "artefactos": [{"id": "a1", "kind": "pdf", "nombre": "c.pdf"}],
        "fragmentos": [{"id": "f1", "artefacto_id": "a1", "pagina": 1, "texto": "algo"}],
        "entidades": [
            {"id": "e1", "nombre": "Con cita", "tipo": "organizacion",
             "origen": "synesis", "evidencia": ["f1"]},
            {"id": "e2", "nombre": "Sin cita", "tipo": "organizacion",
             "origen": "synesis", "evidencia": ["fragmento-que-no-vino"]},
        ],
        "relaciones": [],
    }}
    r = importar_bundle(conn, 1, bundle)
    assert r["importado"]["entidades"] == 1
    assert r["descartado"]["entidades_sin_evidencia_real"] == 1
    nombres = {e["nombre"] for e in Sustrato(conn, 1).leer_grafo()["entidades"]}
    assert nombres == {"Con cita"}


def test_lo_que_el_operador_afirmo_entra_sin_cita_documental(conn):
    """Una afirmación del operador lleva su `origen` como procedencia: es la
    misma ley que rige una entidad creada desde el Radar."""
    bundle = {"grafo": {"artefactos": [], "fragmentos": [], "relaciones": [],
              "entidades": [{"id": "e1", "nombre": "Sospecha del operador",
                             "tipo": "organizacion", "origen": "operador",
                             "evidencia": []}]}}
    assert importar_bundle(conn, 1, bundle)["importado"]["entidades"] == 1


def test_una_relacion_sin_extremos_no_entra(conn):
    bundle = {"grafo": {
        "artefactos": [{"id": "a1", "kind": "pdf", "nombre": "c.pdf"}],
        "fragmentos": [{"id": "f1", "artefacto_id": "a1", "pagina": 1, "texto": "x"}],
        "entidades": [{"id": "e1", "nombre": "Sola", "tipo": "organizacion",
                       "origen": "synesis", "evidencia": ["f1"]}],
        "relaciones": [{"id": "r1", "desde_id": "e1", "hasta_id": "fantasma",
                        "tipo": "importa por", "evidencia": ["f1"]}],
    }}
    r = importar_bundle(conn, 1, bundle)
    assert r["importado"]["relaciones"] == 0
    assert r["descartado"]["relaciones_sin_extremos"] == 1


def test_todo_pasa_por_la_puerta_y_deja_bitacora(conn):
    """Un importador que hiciera sus propios INSERT sería el agujero que la
    puerta única existe para cerrar."""
    _sembrar(conn, 1)
    importar_bundle(conn, 2, _bundle_de(conn, 1))
    acciones = [r["accion"] for r in conn.execute(
        "SELECT accion FROM ag_bitacora WHERE session_id = 2")]
    assert "dockear-fuente" in acciones and "entidad" in acciones


def test_importar_es_aditivo_y_no_borra_lo_que_ya_habia(conn):
    _sembrar(conn, 1)
    otro = Sustrato(conn, 2)
    a = otro.crear_artefacto("nota", "previo.txt")
    f = otro.agregar_fragmentos(a.id, [(1, "Nota previa del operador.")])[0]
    otro.upsert_entidad("Ya estaba", "organizacion", "operador", evidencia=[f.id])
    conn.commit()

    importar_bundle(conn, 2, _bundle_de(conn, 1))
    nombres = {e["nombre"] for e in Sustrato(conn, 2).leer_grafo()["entidades"]}
    assert "Ya estaba" in nombres and "Veracruz" in nombres


def test_un_bundle_sin_grafo_se_rechaza_con_su_razon(conn):
    with pytest.raises(BundleInvalido):
        importar_bundle(conn, 1, {"session_id": 9})
    with pytest.raises(BundleInvalido):
        importar_bundle(conn, 1, {"grafo": {"entidades": "no es una lista"}})


def test_un_bundle_desmesurado_se_rechaza_antes_de_escribir(conn):
    from autogenes.importacion import MAX_ARTEFACTOS

    bundle = {"grafo": {"artefactos": [{"id": str(i), "kind": "pdf", "nombre": "x"}
                                       for i in range(MAX_ARTEFACTOS + 1)]}}
    with pytest.raises(BundleInvalido):
        importar_bundle(conn, 1, bundle)
    assert conn.execute("SELECT COUNT(*) FROM ag_artefactos"
                        " WHERE session_id = 1").fetchone()[0] == 0


def test_el_resumen_declara_lo_que_el_bundle_DICE_traer(conn):
    _sembrar(conn, 1)
    assert resumen_bundle(_bundle_de(conn, 1))["entidades"] == 3
    assert resumen_bundle({"sin": "grafo"}) is None


def test_importar_ata_la_identidad_entre_las_dos_sesiones(conn):
    """El bundle es lo que hace útil a G1: traer el caso de otro mes y que el
    proveedor sea el mismo, no un homónimo."""
    _sembrar(conn, 1)
    importar_bundle(conn, 2, _bundle_de(conn, 1))
    identidades = conn.execute(
        "SELECT identidad_id, COUNT(DISTINCT session_id) AS n FROM ag_entidades"
        " WHERE nombre = 'Volkswagen Mexico' GROUP BY identidad_id").fetchall()
    assert len(identidades) == 1 and identidades[0]["n"] == 2


# ── rutas HTTP ────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def cliente(tmp_path_factory):
    import database
    db = tmp_path_factory.mktemp("imp") / "gnosis.db"
    original = database.DB_PATH
    database.DB_PATH = str(db)
    import app as gnosis
    database.init_db()

    c = database.get_connection()
    for mes in (7, 8):
        c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                  " year_processed, status) VALUES (?, ?, 2026, 'completed')",
                  (f"2026-0{mes}-10", mes))
    sids = [r["id"] for r in c.execute("SELECT id FROM processing_sessions ORDER BY id")]
    _sembrar(c, sids[0])
    c.commit()
    c.close()

    gnosis.app.config["TESTING"] = True
    yield {"cli": gnosis.app.test_client(), "origen": sids[0], "destino": sids[1]}
    database.DB_PATH = original


def test_exportar_e_importar_cierran_el_circulo(cliente):
    """La promesa que `/exportar` hacía y no se podía cumplir."""
    export = cliente["cli"].get(
        f"/api/v1/autogenes/exportar?session_id={cliente['origen']}")
    assert export.status_code == 200

    r = cliente["cli"].post(
        f"/api/v1/autogenes/importar?session_id={cliente['destino']}",
        json=export.get_json())
    assert r.status_code == 200
    assert r.get_json()["importado"]["entidades"] == 3


def test_importar_algo_que_no_es_un_bundle_es_422(cliente):
    r = cliente["cli"].post(
        f"/api/v1/autogenes/importar?session_id={cliente['destino']}",
        json={"cualquier": "cosa"})
    assert r.status_code == 422
    assert "error" in r.get_json()


def test_importar_sin_json_es_400(cliente):
    r = cliente["cli"].post(
        f"/api/v1/autogenes/importar?session_id={cliente['destino']}",
        data="no soy json", content_type="text/plain")
    assert r.status_code == 400


def test_la_ruta_de_identidades_enseña_lo_que_cruza_meses(cliente):
    """Después de importar, el proveedor está en dos sesiones y se sabe que
    es el mismo — la pregunta que G1 declaraba imposible."""
    r = cliente["cli"].get(
        f"/api/v1/autogenes/identidades?session_id={cliente['destino']}")
    assert r.status_code == 200
    j = r.get_json()
    cruzan = {i["nombre_display"] for i in j["entre_sesiones"]}
    assert "Volkswagen Mexico" in cruzan
    assert all(i["sesiones"] > 1 for i in j["entre_sesiones"])
    assert isinstance(j["candidatas"], list)
