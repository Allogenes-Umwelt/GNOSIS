"""Spec de S1 · HECHOS MEDIDOS — la columna vertebral del informe.

Contrato: los hechos son deterministas (misma DB -> mismos hechos, mismo
orden), cada uno carga su procedencia (motor + fuente + id estable), los
montos ($) solo vienen de CONCILIA/NOMOS, y un motor sin datos no inventa.
"""
import sqlite3

import pytest

from autogenes.hechos import hechos_medidos
from autogenes.sustrato import Sustrato
from database import models, models_autogenes


@pytest.fixture()
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    return c


def _sembrar_flujo(c: sqlite3.Connection) -> None:
    """DWH mínimo país→aduana→marca (mismo patrón que test_analisis_vw):
    VW usa N, AUDI usa J en DEU×Veracruz — da corte crítico y brecha J/N."""
    sid = 1
    vw = c.execute("SELECT id FROM marcas WHERE nombre='VOLKSWAGEN'").fetchone()["id"]
    audi = c.execute("SELECT id FROM marcas WHERE nombre='AUDI'").fetchone()["id"]
    c.execute("INSERT INTO catalogo_vehiculos (session_id, auto_code, tipo, marca_id)"
              " VALUES (?,?,?,?),(?,?,?,?)",
              (sid, 'VW01', 'Tiguan', vw, sid, 'AU01', 'Q5', audi))
    cvw, caudi = [r["id"] for r in c.execute("SELECT id FROM catalogo_vehiculos ORDER BY id")]
    c.execute("INSERT INTO pedimentos (session_id, numero_pedimento, aduana)"
              " VALUES (?,?,?),(?,?,?),(?,?,?)",
              (sid, 'P1', 'Veracruz', sid, 'P2', 'Manzanillo', sid, 'P3', 'Nuevo Laredo'))
    pv, pm, pn = [r["id"] for r in c.execute("SELECT id FROM pedimentos ORDER BY id")]
    plan = [(pv, cvw, 'DEU', 5, 'N'), (pm, cvw, 'DEU', 3, 'N'),
            (pn, cvw, 'USA', 2, 'J'), (pv, caudi, 'DEU', 4, 'J')]
    vin = 1
    for ped, cat, pais, n, jn in plan:
        for _ in range(n):
            c.execute("INSERT INTO importaciones (session_id, pedimento_id, catalogo_id,"
                      " chasis, pais_code, precio, auto_code, j_y_n) VALUES (?,?,?,?,?,?,?,?)",
                      (sid, ped, cat, f'VIN{vin:05d}', pais, 100000, 'X', jn))
            vin += 1
    c.commit()


def test_hechos_deterministas_doble_corrida(conn):
    _sembrar_flujo(conn)
    a = hechos_medidos(conn, 1)
    b = hechos_medidos(conn, 1)
    assert a == b, "misma DB debe dar hechos idénticos, mismo orden"
    assert a, "el DWH sembrado debe producir al menos un hecho medido"


def test_cada_hecho_carga_su_procedencia(conn):
    _sembrar_flujo(conn)
    for h in hechos_medidos(conn, 1):
        assert h["id"].startswith("hecho:")
        assert h["motor"] and h["fuente"]
        assert "texto" in h
        # los montos ($) SOLO vienen de CONCILIA/NOMOS (ley zero snake oil)
        if h["monetizado"]:
            assert h["motor"] in ("CONCILIA", "NOMOS")
            assert h["unidad"] == "MXN"


def test_analisis_no_fabrica_hecho_de_corte_critico(conn):
    _sembrar_flujo(conn)
    ids = {h["id"] for h in hechos_medidos(conn, 1)}
    # el hecho de corte-critico se retiró: su pct era 1.0 por construcción.
    # el cuello honesto se expresa vía redundancia (punto-unico-falla).
    assert "hecho:analisis:corte-critico" not in ids


def test_regla_nomos_monetizada_va_primero(conn):
    _sembrar_flujo(conn)
    # regla: "si origen DEU entonces preferencia J" — las filas VW DEU son N,
    # así que la incumplen; con precio, da un hecho monetizado (NOMOS).
    s = Sustrato(conn, 1)
    s.crear_regla("DEU debe ser J",
                  [{"campo": "pais_code", "valor": "DEU"}],
                  {"campo": "j_y_n", "valor": "J"}, origen="operador")
    hechos = hechos_medidos(conn, 1)
    nomos = [h for h in hechos if h["motor"] == "NOMOS" and h["monetizado"]]
    assert nomos, "una regla activa incumplida con precio debe dar un hecho monetizado"
    # los monetizados encabezan el orden (columna vertebral del informe)
    assert hechos[0]["monetizado"] is True


def test_sesion_vacia_no_inventa_hechos(conn):
    # sin DWH ni grafo: cero hechos, jamás relleno
    assert hechos_medidos(conn, 1) == []


def test_informe_declara_hechos_no_cubiertos(conn, monkeypatch):
    """S5: el informe declara qué hechos medidos NO teje (la sombra del
    resumen). Un modelo que cita un solo hecho deja el resto 'no cubierto'."""
    import json

    from autogenes import informe as I
    _sembrar_flujo(conn)
    hechos = hechos_medidos(conn, 1)
    assert len(hechos) >= 2
    hid = hechos[0]["id"]
    payload = json.dumps({"titulo": "T", "secciones": [{"encabezado": "H", "puntos": [
        {"texto": "Un solo punto citado.", "evidencia": [hid], "entidades": []}]}]})

    class Guion:
        def chat(self, m, tools=None, system=None):
            return {"content": payload, "tool_calls": [], "stop_reason": "e",
                    "tokens_input": 0, "tokens_output": 0}
    monkeypatch.setattr("jarvis.llm_interface.seleccionar_proveedor",
                        lambda config=None: ("g", Guion()))

    r = I.redactar_informe(conn, 1)
    assert r["cobertura_informe"] == {"cubiertos": 1, "total": len(hechos)}
    ids_no = {h["id"] for h in r["hechos_no_cubiertos"]}
    assert hid not in ids_no                       # el citado no está en la sombra
    assert len(r["hechos_no_cubiertos"]) == len(hechos) - 1
