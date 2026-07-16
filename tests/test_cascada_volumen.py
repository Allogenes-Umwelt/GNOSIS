"""Q7 — volumen afectado de una caída (PLAN_QUALIA_UPLIFT).

Cuando un nodo cae, el "volumen afectado" es la Σ de unidades MEDIDAS de
las entidades que quedan desconectadas — derivable y citable, no una
proyección. La base es atómica (un vehículo = 1); marca y país son vistas
agregadas del mismo padrón y NO se recuentan, así el número jamás infla.
Cierra con la ley de determinismo: doble corrida idéntica.
"""
import database
from autogenes.cascada import simular_caida
from autogenes.qualia import unidades_por_nodo


def _volumen(red, nodo, unid):
    """Compone lo que hace la ruta: anota unidades por desconectado y suma."""
    imp = simular_caida(red, nodo)
    for d in imp["desconectados"]:
        d["unidades"] = unid.get(d["id"], 0)
    return sum(d["unidades"] for d in imp["desconectados"]), imp


def test_volumen_suma_unidades_de_los_desconectados():
    # estrella: un concentrador con tres hojas; si cae, las tres orfandan
    red = {
        "nodos": [{"id": "H", "etiqueta": "hub"}, {"id": "a", "etiqueta": "a"},
                  {"id": "b", "etiqueta": "b"}, {"id": "c", "etiqueta": "c"}],
        "enlaces": [{"origen": "H", "destino": "a", "peso": 1},
                    {"origen": "H", "destino": "b", "peso": 1},
                    {"origen": "H", "destino": "c", "peso": 1}],
    }
    vol, imp = _volumen(red, "H", {"H": 0, "a": 1, "b": 1, "c": 0})
    assert sorted(d["id"] for d in imp["desconectados"]) == ["a", "b", "c"]
    assert vol == 2                       # solo a y b llevan una unidad medida


def test_volumen_cero_si_nadie_queda_aislado():
    # cadena a-b-c: cae la punta a, b sigue atado a c → nadie orfanda
    red = {
        "nodos": [{"id": "a", "etiqueta": "a"}, {"id": "b", "etiqueta": "b"},
                  {"id": "c", "etiqueta": "c"}],
        "enlaces": [{"origen": "a", "destino": "b", "peso": 1},
                    {"origen": "b", "destino": "c", "peso": 1}],
    }
    vol, imp = _volumen(red, "a", {"a": 0, "b": 1, "c": 1})
    assert imp["desconectados"] == []
    assert vol == 0


def test_unidades_por_nodo_doble_corrida_identica(tmp_path):
    db = tmp_path / "gnosis.db"
    original = database.DB_PATH
    database.DB_PATH = str(db)
    try:
        import app  # noqa: F401  (dispara init_db sobre la DB temporal)
        database.init_db()
        from autogenes.sustrato import Sustrato
        conn = database.get_connection()
        conn.execute(
            "INSERT INTO processing_sessions (session_date, month_processed,"
            " year_processed, status) VALUES ('2026-07-10', 7, 2026, 'completed')")
        sid = conn.execute("SELECT MAX(id) FROM processing_sessions").fetchone()[0]
        s = Sustrato(conn, sid)
        art = s.crear_artefacto("pdf", "f.pdf", paginas=1)
        fr = s.agregar_fragmentos(art.id, [(1, "texto")])[0]
        m = s.upsert_entidad("VOLKSWAGEN", "organizacion", "synesis", evidencia=[fr.id])
        p = s.upsert_entidad("Alemania", "lugar", "synesis", evidencia=[fr.id])
        s.agregar_relacion(m.id, p.id, "origen", 0.8, [fr.id])
        conn.commit()
        u1 = unidades_por_nodo(conn, sid)
        u2 = unidades_por_nodo(conn, sid)
        conn.close()
        assert u1 == u2                       # doble corrida idéntica
        assert set(u1.values()) <= {0, 1}     # base atómica: 0 o 1, nunca infla
    finally:
        database.DB_PATH = original
