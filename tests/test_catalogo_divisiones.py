"""Robustez del catálogo país/divisiones (ranura Incrementales del pipeline).

`save_catalogo_vehiculos` procesaba las filas sin aislar y con un solo commit
al final: una celda sucia en Flete/Seguro (un '-', 'N/A', '5%') reventaba con
ValueError y, al no llegar el commit, se perdía el catálogo COMPLETO en silencio
→ importaciones.catalogo_id en NULL. Ahora cada fila va aislada y los números
se parsean con guarda. Esta prueba fija ese contrato.
"""
import pandas as pd
import pytest

COLS = ["CLAVES", "Tipo", "FRACCIÓN", "Pais",
        "Seguro (Incrementables)", "Flete (Incrementables)", "MARCA"]


@pytest.fixture()
def sesion(tmp_path_factory):
    import database
    database.DB_PATH = str(tmp_path_factory.mktemp("cat") / "gnosis.db")
    database.init_db()
    conn = database.get_connection()
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed, status) VALUES ('2026-07-13', 7, 2026, 'completed')")
    conn.commit()
    sid = conn.execute("SELECT id FROM processing_sessions ORDER BY id DESC LIMIT 1").fetchone()["id"]
    return sid


def _fila(clave, flete, seguro):
    return {"CLAVES": clave, "Tipo": "PRODUCCION", "FRACCIÓN": "8703.23.01",
            "Pais": "DEU", "Seguro (Incrementables)": seguro,
            "Flete (Incrementables)": flete, "MARCA": "AUDI"}


def test_celda_sucia_no_tumba_el_catalogo(sesion):
    import database
    from database.persistence import save_catalogo_vehiculos
    df = pd.DataFrame([
        _fila("AAA111", "200", "1.5"),      # buena
        _fila("BBB222", "N/A", "-"),        # Flete/Seguro no numéricos
        _fila("CCC333", "150", "2.0"),      # buena
    ], columns=COLS)
    n = save_catalogo_vehiculos(sesion, df)
    assert n == 3                            # antes: 0 (todo se perdía)
    conn = database.get_connection()
    filas = {r["auto_code"]: r for r in conn.execute(
        "SELECT auto_code, fletes, seguros FROM catalogo_vehiculos WHERE session_id = ?",
        (sesion,)).fetchall()}
    assert set(filas) == {"AAA111", "BBB222", "CCC333"}
    assert filas["AAA111"]["fletes"] == pytest.approx(2.0)   # 200/100
    assert filas["BBB222"]["fletes"] is None                 # 'N/A' → None, no revienta
    assert filas["BBB222"]["seguros"] == 0.0                 # '-' → default 0.0


def test_porcentaje_con_simbolo_se_parsea(sesion):
    from database.persistence import _num_pct
    assert _num_pct("5%") == pytest.approx(0.05)
    assert _num_pct("1,250") == pytest.approx(12.5)
    assert _num_pct("N/A") is None
    assert _num_pct(None) is None
