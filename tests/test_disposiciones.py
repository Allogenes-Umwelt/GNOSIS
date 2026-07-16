"""Spec del ciclo de vida de hallazgos (O1): la disposición del operador
sobre un hallazgo CONCILIA/VALIDACIÓN vive en ag_disposiciones, escrita SOLO
por Sustrato con bitácora WORM y SIN monto; la lectura une el hallazgo vivo
con su disposición y CONTRASTA lo declarado contra lo medido."""
import sqlite3

import pytest

from autogenes import disposiciones as D
from autogenes.sustrato import Sustrato
from database import models, models_autogenes

SID = 1
VIN = "WAUZZZ8Y0000000001"[:17]


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed) VALUES ('2026-07-10', 7, 2026)")
    return c


def _cat(c) -> int:
    c.execute("INSERT INTO catalogo_vehiculos (session_id, auto_code)"
              " VALUES (?, 'AAA111')", (SID,))
    return c.execute("SELECT MAX(id) FROM catalogo_vehiculos").fetchone()[0]


def _fila_dwh(c, chasis=VIN, factura="F1", precio=1.0, jn="J", pais="DEU",
              catalogo_id=None):
    c.execute(
        "INSERT INTO importaciones (session_id, chasis, factura, precio, j_y_n,"
        " pais_code, catalogo_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (SID, chasis, factura, precio, jn, pais, catalogo_id))


# ── la puerta única: Sustrato + bitácora WORM ────────────────────────


def test_puerta_unica_escribe_y_registra_worm(conn):
    s = Sustrato(conn, SID)
    out = s.disponer_hallazgo("concilia", "conc-vendido-sin-llegada",
                              "en_gestion", "en revisión con aduanal")
    assert out == {"motor": "concilia", "clave": "conc-vendido-sin-llegada",
                   "estado": "en_gestion", "nota": "en revisión con aduanal"}
    fila = conn.execute(
        "SELECT motor, clave, estado, nota FROM ag_disposiciones"
        " WHERE session_id = ?", (SID,)).fetchone()
    assert tuple(fila) == ("concilia", "conc-vendido-sin-llegada",
                           "en_gestion", "en revisión con aduanal")
    # bitácora WORM: la decisión quedó registrada
    b = conn.execute("SELECT accion, detalle FROM ag_bitacora"
                     " WHERE accion = 'hallazgo'").fetchone()
    assert b["accion"] == "hallazgo"
    assert "conc-vendido-sin-llegada → en_gestion" in b["detalle"]


def test_disponer_es_upsert_por_motor_y_clave(conn):
    s = Sustrato(conn, SID)
    s.disponer_hallazgo("concilia", "c1", "nuevo")
    s.disponer_hallazgo("concilia", "c1", "resuelto", "arreglado")
    filas = conn.execute("SELECT estado, nota FROM ag_disposiciones"
                         " WHERE session_id = ? AND clave = 'c1'", (SID,)).fetchall()
    assert len(filas) == 1                       # una sola fila: se actualizó
    assert filas[0]["estado"] == "resuelto" and filas[0]["nota"] == "arreglado"


def test_motor_estado_y_clave_invalidos_rechazados(conn):
    s = Sustrato(conn, SID)
    with pytest.raises(ValueError):
        s.disponer_hallazgo("inventado", "c1", "nuevo")
    with pytest.raises(ValueError):
        s.disponer_hallazgo("concilia", "c1", "cerrado_ya")
    with pytest.raises(ValueError):
        s.disponer_hallazgo("concilia", "  ", "nuevo")


def test_disposiciones_aisladas_por_motor(conn):
    s = Sustrato(conn, SID)
    s.disponer_hallazgo("concilia", "x", "resuelto")
    s.disponer_hallazgo("validacion", "y", "descartado")
    assert set(s.disposiciones_hallazgos("concilia")) == {"x"}
    assert set(s.disposiciones_hallazgos("validacion")) == {"y"}


def test_esquema_sin_columna_de_monto(conn):
    """Ley cero-snake-oil fijada en el esquema: la disposición no puede
    monetizar porque no existe columna donde poner un monto."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(ag_disposiciones)")}
    assert "monto" not in cols and "monetizado" not in cols
    assert cols == {"id", "session_id", "motor", "clave", "estado", "nota", "ts"}


# ── el contraste declarado vs medido (O1.3) ──────────────────────────


def test_anotar_nace_nuevo_sin_disposicion(conn):
    hs = [{"clave": "a"}, {"clave": "b"}]
    D.anotar(hs, {})
    assert all(h["estado"] == "nuevo" and h["nota"] is None
               and h["contradice"] is False for h in hs)


def test_anotar_marca_contradiccion_si_cerrado_sigue_vivo(conn):
    s = Sustrato(conn, SID)
    s.disponer_hallazgo("concilia", "a", "resuelto", "ya lo arreglé")
    s.disponer_hallazgo("concilia", "b", "en_gestion")
    disp = D.leer_disposiciones(conn, SID, "concilia")
    hs = [{"clave": "a"}, {"clave": "b"}]
    D.anotar(hs, disp)
    a, b = hs
    # 'a' está resuelto pero sigue vivo → el motor contradice al operador
    assert a["estado"] == "resuelto" and a["contradice"] is True
    assert a["nota"] == "ya lo arreglé"
    # 'b' está en gestión (abierto): no hay contradicción
    assert b["estado"] == "en_gestion" and b["contradice"] is False


def test_resoluciones_verificadas_solo_resuelto_ausente(conn):
    s = Sustrato(conn, SID)
    s.disponer_hallazgo("concilia", "vivo", "resuelto")      # sigue vivo
    s.disponer_hallazgo("concilia", "ido", "resuelto")       # ya no aparece
    s.disponer_hallazgo("concilia", "descarte", "descartado")  # descartado ausente
    disp = D.leer_disposiciones(conn, SID, "concilia")
    verif = D.resoluciones_verificadas({"vivo"}, disp)
    # solo 'ido': resuelto Y ausente de los hallazgos vivos
    assert [v["clave"] for v in verif] == ["ido"]


def test_resumen_estados_cuenta_estados_y_contradice(conn):
    hs = [{"clave": "a", "estado": "nuevo", "contradice": False},
          {"clave": "b", "estado": "resuelto", "contradice": True},
          {"clave": "c", "estado": "en_gestion", "contradice": False}]
    r = D.resumen_estados(hs)
    assert r["nuevo"] == 1 and r["resuelto"] == 1 and r["en_gestion"] == 1
    assert r["descartado"] == 0 and r["contradice"] == 1


def test_lectura_sin_tabla_degrada_honesto():
    """Sin la tabla del ciclo de vida (esquema viejo), la lectura devuelve
    vacío en vez de romper — como QUALIA."""
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)          # SIN el schema autogenes
    assert D.leer_disposiciones(c, SID, "concilia") == {}


def test_lectura_pura_doble_corrida_identica(conn):
    """Ley del render determinista: la lectura del ciclo de vida es pura —
    misma base, misma salida byte a byte."""
    s = Sustrato(conn, SID)
    s.disponer_hallazgo("concilia", "a", "resuelto")
    s.disponer_hallazgo("concilia", "b", "en_gestion")

    def corrida():
        disp = D.leer_disposiciones(conn, SID, "concilia")
        hs = [{"clave": "a"}, {"clave": "b"}, {"clave": "c"}]
        D.anotar(hs, disp)
        return (hs, D.resoluciones_verificadas({"a", "b", "c"}, disp),
                D.resumen_estados(hs))

    assert corrida() == corrida()


# ── consecuencia aguas abajo: el Radar respeta la disposición (O1.4) ──


def test_radar_calla_la_norma_dispuesta_como_resuelta(conn):
    from autogenes.metabolismo import metabolismo_de_sesion
    cat = _cat(conn)
    _fila_dwh(conn, jn="J", pais="BRA", catalogo_id=cat)     # glosa segura
    # antes de disponer: la urgencia de norma existe y es crítica
    m = metabolismo_de_sesion(conn, SID)
    assert any(u["tipo"] == "norma" for u in m["urgencias"])
    # el operador dispone la regla como resuelta → deja de gritar
    Sustrato(conn, SID).disponer_hallazgo("validacion", "val-dwh-jn-norma",
                                          "resuelto", "corregido en el DWH")
    m2 = metabolismo_de_sesion(conn, SID)
    assert not any(u["tipo"] == "norma" for u in m2["urgencias"])


# ── humo HTTP: el flujo completo a través de las rutas reales ─────────


@pytest.fixture(scope="module")
def cliente(tmp_path_factory):
    """App real con DB temporal: una sesión con una fila vendida sin llegada
    (hallazgo conc-vendido-sin-llegada garantizado)."""
    import database
    db = tmp_path_factory.mktemp("disp") / "gnosis.db"
    original = database.DB_PATH
    database.DB_PATH = str(db)
    import app as gnosis
    database.init_db()
    conn = database.get_connection()
    conn.execute(
        "INSERT INTO processing_sessions (session_date, month_processed,"
        " year_processed, status) VALUES ('2026-07-10', 7, 2026, 'completed')")
    conn.execute(
        "INSERT INTO importaciones (session_id, chasis, factura, precio)"
        " VALUES (1, ?, 'F1', 100.0)", (VIN,))     # sin factura física → hallazgo
    conn.commit()
    conn.close()
    gnosis.app.config["TESTING"] = True
    yield gnosis.app.test_client()
    database.DB_PATH = original


def test_http_disponer_valida_entrada(cliente):
    r = cliente.post("/api/v1/autogenes/concilia/disponer?session_id=1",
                     json={"clave": "", "estado": "nuevo"})
    assert r.status_code == 400


def test_http_ciclo_de_vida_declarado_vs_medido(cliente):
    # el hallazgo nace 'nuevo' y sin contradicción
    r = cliente.get("/api/v1/autogenes/concilia?session_id=1").get_json()
    h = next(x for x in r["hallazgos"] if x["clave"] == "conc-vendido-sin-llegada")
    assert h["estado"] == "nuevo" and h["contradice"] is False
    assert r["estados"]["nuevo"] >= 1

    # el operador lo marca resuelto — pero el motor lo sigue midiendo
    d = cliente.post("/api/v1/autogenes/concilia/disponer?session_id=1",
                     json={"clave": "conc-vendido-sin-llegada",
                           "estado": "resuelto", "nota": "supuestamente"})
    assert d.status_code == 200
    r2 = cliente.get("/api/v1/autogenes/concilia?session_id=1").get_json()
    h2 = next(x for x in r2["hallazgos"] if x["clave"] == "conc-vendido-sin-llegada")
    # el sistema contradice al operador: declarado resuelto, sigue vivo
    assert h2["estado"] == "resuelto" and h2["contradice"] is True
    assert r2["estados"]["contradice"] >= 1

