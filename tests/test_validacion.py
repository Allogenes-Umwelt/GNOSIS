"""Spec for VALIDACIÓN (F10): every rule evaluated over every row of its
source; zero-violation rules are reported (full conformity is a fact,
not an omitted line); the USA=J rule is deliberately NOT evaluated."""
import sqlite3

import pytest

from autogenes.validacion import validar
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute(
        "INSERT INTO processing_sessions (session_date, month_processed, year_processed)"
        " VALUES ('2026-07-10', 7, 2026)"
    )
    # paises viene pre-sembrado por el schema (DEU, BRA, ... ya existen)
    return c


SID = 1
VIN = "WAUZZZ8Y0000000001"[:17]


def _cat(c) -> int:
    c.execute(
        "INSERT INTO catalogo_vehiculos (session_id, auto_code) VALUES (?, 'AAA111')",
        (SID,))
    return c.execute("SELECT MAX(id) FROM catalogo_vehiculos").fetchone()[0]


def _fila_dwh(c, chasis=VIN, factura="F1", precio=1.0, jn="J", pais="DEU",
              catalogo_id=None):
    c.execute(
        "INSERT INTO importaciones (session_id, chasis, factura, precio, j_y_n,"
        " pais_code, catalogo_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (SID, chasis, factura, precio, jn, pais, catalogo_id))


def _fila_pdf(c, chasis=VIN, factura="F1", amount="1", moneda="EUR",
              jn="J", pais="DEU"):
    c.execute(
        "INSERT INTO extraccion_facturas (session_id, chasis, factura, amount,"
        " moneda, j_y_n, pais_code, filename) VALUES (?, ?, ?, ?, ?, ?, ?, 'x.pdf')",
        (SID, chasis, factura, amount, moneda, jn, pais))


def test_sesion_conforme_reporta_reglas_en_cero(conn):
    cat = _cat(conn)
    _fila_dwh(conn, catalogo_id=cat)
    _fila_pdf(conn)
    r = validar(conn, SID)
    assert r["conformidad_pct"] == 100 and r["total_violaciones"] == 0
    assert all(x["n"] == 0 for x in r["reglas"])
    assert len(r["reglas"]) == 16           # todas evaluadas, ninguna omitida
    # la regla USA=J NO existe: no se valida lo que no se puede verificar
    assert not any("usa" in x["clave"] for x in r["reglas"])


def test_obligatorios_y_vin17_con_refs(conn):
    cat = _cat(conn)
    _fila_dwh(conn, chasis="CORTO", precio=None, catalogo_id=cat)
    r = validar(conn, SID)
    por = {x["clave"]: x for x in r["reglas"]}
    assert por["val-dwh-precio"]["n"] == 1
    assert por["val-dwh-vin17"]["n"] == 1
    assert por["val-dwh-vin17"]["refs"][0]["chasis"] == "CORTO"
    assert por["val-dwh-chasis"]["n"] == 0      # presente aunque malformado
    # una fila con dos violaciones cuenta UNA vez en la conformidad
    assert r["filas_no_conformes"]["dwh"] == 1
    assert r["conformidad_pct"] == 0


def test_pais_desconocido_y_jn_contra_norma(conn):
    cat = _cat(conn)
    # producción no siempre corre con foreign_keys=ON: un país fantasma
    # PUEDE colarse al DWH — la regla existe para atraparlo. (El PRAGMA
    # es no-op dentro de una transacción: hay que cerrar la abierta.)
    conn.commit()
    conn.execute("PRAGMA foreign_keys = OFF")
    _fila_dwh(conn, pais="XXX", catalogo_id=cat)               # país fantasma
    _fila_dwh(conn, chasis="WAUZZZ8Y0000000002"[:17], factura="F2",
              jn="J", pais="BRA", catalogo_id=cat)             # BRA debe ser N
    _fila_pdf(conn, jn="N", pais="BRA")                        # conforme
    r = validar(conn, SID)
    por = {x["clave"]: x for x in r["reglas"]}
    assert por["val-dwh-pais"]["n"] == 1
    assert por["val-dwh-jn-norma"]["n"] == 1
    assert por["val-pdf-jn-norma"]["n"] == 0
    assert "glosa" in por["val-dwh-jn-norma"]["norma"]


def test_sin_filas_conformidad_es_nula_no_cien(conn):
    r = validar(conn, SID)
    assert r["conformidad_pct"] is None
    assert r["filas"] == {"dwh": 0, "pdf": 0}
