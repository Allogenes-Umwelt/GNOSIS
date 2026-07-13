"""IV — Ingesta robusta del archivo de Divisiones (ranura «Incrementales»).

El pipeline legado (concentrado1.Concentrado) NO se toca: fuerza
`engine='openpyxl'` (solo .xlsx) y accede a `df['CLAVES']` directo, así que un
.xls viejo reventaba con BadZipFile y un archivo equivocado con
`KeyError: 'CLAVES'`. La normalización/validación vive en el BORDE
(`app._preparar_divisiones`): esta suite fija ese contrato para que ambos
formatos procesen y el archivo equivocado dé un error accionable.
"""
import os

import pandas as pd
import pytest

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture(scope="module")
def helpers(tmp_path_factory):
    import database
    database.DB_PATH = str(tmp_path_factory.mktemp("ing") / "gnosis.db")
    import app
    database.init_db()
    return app


def _divisiones_df():
    return pd.DataFrame(
        [["ABC123", "PRODUCCION", "8703.23.01", "DEU", "1.5", "200", "AUDI"],
         ["XYZ999", "INVERSION", "8703.24.01", "ESP", "2.0", "150", "SEAT"]],
        columns=["CLAVES", "Tipo", "FRACCIÓN", "Pais",
                 "Seguro (Incrementables)", "Flete (Incrementables)", "MARCA"])


def test_xlsx_nuevo_pasa_sin_cambios(helpers, tmp_path):
    p = tmp_path / "DIVISIONES.xlsx"
    _divisiones_df().to_excel(p, index=False)
    assert helpers._preparar_divisiones(str(p)) == str(p)


def test_xls_viejo_se_normaliza_y_lo_lee_openpyxl(helpers):
    """El .xls viejo se lee (xlrd) y se reescribe a .xlsx; el pipeline, que
    SIEMPRE usa openpyxl, ahora sí lo lee con sus 7 columnas y CLAVES intacta."""
    salida = helpers._preparar_divisiones(os.path.join(FIXTURES, "divisiones_legacy.xls"))
    assert salida.endswith(".xlsx")
    df = pd.read_excel(salida, engine="openpyxl")   # el engine del pipelegado
    assert list(df.columns) == helpers._COLS_DIVISIONES
    assert list(df["CLAVES"].astype(str)) == ["ABC123", "XYZ999"]


def test_archivo_equivocado_da_error_accionable(helpers, tmp_path):
    """Sin la columna CLAVES: en vez del KeyError críptico del pipeline, un
    ConcentradoError que nombra lo que falta y qué subir."""
    p = tmp_path / "incrementables_equivocado.xlsx"
    _divisiones_df().drop(columns=["CLAVES", "MARCA"]).to_excel(p, index=False)
    with pytest.raises(helpers.ConcentradoError) as exc:
        helpers._preparar_divisiones(str(p))
    msg = str(exc.value)
    assert "CLAVES" in msg and "MARCA" in msg and "Incrementales" in msg


def test_no_excel_da_error_accionable(helpers, tmp_path):
    p = tmp_path / "no_es_excel.xlsx"
    p.write_text("esto no es un excel")
    with pytest.raises(helpers.ConcentradoError):
        helpers._preparar_divisiones(str(p))
