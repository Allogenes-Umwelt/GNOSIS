"""Spec de ESCALA — que miles de documentos sigan siendo minutos, no horas.

`docs/DIAGNOSTICO_FABLE_v02.md` §1 midió el árbol y encontró un camino
cuadrático: `upsert_entidad` cargaba TODAS las entidades de la sesión por
pydantic y buscaba en Python, así que resolver una entidad costaba más
cuanto más sabía el sustrato — 4,8 s por cada mil upserts con el grafo
vacío, 31,3 s con 4 000 entidades dentro. Proyectado a una carga real
(5 000 documentos × ~30 entidades) son horas de puro escaneo.

**Estas pruebas afirman RATIOS, no segundos.** CI no es un banco: una
máquina lenta multiplica todos los tiempos por igual y un umbral absoluto
se vuelve flaky. Lo que no puede cambiar es la FORMA de la curva.
"""
import sqlite3
import time

import pytest

from autogenes.sustrato import Sustrato
from database import models, models_autogenes

pytestmark = pytest.mark.slow


@pytest.fixture()
def conn(tmp_path):
    """Base en archivo: en memoria no mide lo que el operador ejecuta."""
    c = sqlite3.connect(tmp_path / "escala.db", timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode = WAL")
    c.executescript(models.SCHEMA_SQL)
    c.executescript(models_autogenes.AG_SCHEMA_SQL)
    from database.migrations import apply_migrations
    apply_migrations(c)
    c.execute("INSERT INTO processing_sessions (session_date, month_processed,"
              " year_processed) VALUES ('2026-07-10', 7, 2026)")
    c.commit()
    return c


def _cronometrar(fn, veces: int) -> float:
    t0 = time.perf_counter()
    for i in range(veces):
        fn(i)
    return time.perf_counter() - t0


def test_la_resolucion_de_entidad_no_es_cuadratica(conn):
    """La forma de la curva: insertar el bloque N+1 no puede costar el doble
    que el bloque N solo porque haya el doble de entidades dentro.

    Con la implementación vieja este ratio era ~2,8 (13,5 s / 4,8 s)."""
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("nota", "semilla.txt")
    frag = s.agregar_fragmentos(art.id, [(1, "texto")])[0].id

    BLOQUE = 400
    t1 = _cronometrar(
        lambda i: s.upsert_entidad(f"Ent A{i}", "organizacion", "synesis",
                                   evidencia=[frag]), BLOQUE)
    # ahora hay BLOQUE entidades dentro; el siguiente bloque es el mismo trabajo
    t2 = _cronometrar(
        lambda i: s.upsert_entidad(f"Ent B{i}", "organizacion", "synesis",
                                   evidencia=[frag]), BLOQUE)
    t3 = _cronometrar(
        lambda i: s.upsert_entidad(f"Ent C{i}", "organizacion", "synesis",
                                   evidencia=[frag]), BLOQUE)

    # tolerancia amplia: se persigue la FORMA (lineal vs cuadrática), no el reloj
    assert t3 < t1 * 2.0, (
        f"la resolución se degrada con el tamaño del grafo: "
        f"{t1:.2f}s → {t2:.2f}s → {t3:.2f}s por {BLOQUE} entidades")


def test_reencontrar_una_entidad_no_depende_del_tamano_del_grafo(conn):
    """El caso que domina una ingesta real: la entidad YA existe y hay que
    resolverla. Debe costar lo mismo con 100 dentro que con 2 000."""
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("nota", "s.txt")
    frag = s.agregar_fragmentos(art.id, [(1, "t")])[0].id
    s.upsert_entidad("Proveedor Ancla", "organizacion", "synesis", evidencia=[frag])

    for i in range(100):
        s.upsert_entidad(f"Relleno {i}", "concepto", "synesis", evidencia=[frag])
    t_chico = _cronometrar(
        lambda _i: s.upsert_entidad("Proveedor Ancla", "organizacion", "synesis",
                                    evidencia=[frag]), 60)

    for i in range(2000):
        s.upsert_entidad(f"Relleno grande {i}", "concepto", "synesis",
                         evidencia=[frag])
    t_grande = _cronometrar(
        lambda _i: s.upsert_entidad("Proveedor Ancla", "organizacion", "synesis",
                                    evidencia=[frag]), 60)

    assert t_grande < t_chico * 3.0, (
        f"reencontrar una entidad se encareció {t_grande / max(t_chico, 1e-9):.1f}× "
        f"al pasar de 100 a 2 100 entidades ({t_chico:.3f}s → {t_grande:.3f}s)")


def test_el_alias_resuelve_a_la_misma_entidad_sin_ambiguedad(conn):
    """La resolución por alias no puede depender del orden físico de filas:
    dos entidades no pueden reclamar el mismo alias."""
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("nota", "a.txt")
    frag = s.agregar_fragmentos(art.id, [(1, "t")])[0].id

    e = s.upsert_entidad("Volkswagen", "organizacion", "operador", evidencia=[frag])
    s.editar_entidad(e.id, {"alias": ["VW MEXICO", "VWM"]})

    for consulta in ("VW MEXICO", "vw mexico", "  VWM  ", "volkswagen"):
        r = s.upsert_entidad(consulta, "organizacion", "synesis", evidencia=[frag])
        assert r.id == e.id, f"«{consulta}» no resolvió a la entidad canónica"

    total = conn.execute(
        "SELECT COUNT(*) FROM ag_entidades WHERE session_id = 1").fetchone()[0]
    assert total == 1, f"la resolución creó {total} entidades en vez de 1"


def test_doble_corrida_de_la_resolucion_es_identica(conn):
    """Ley de doble corrida aplicada a la identidad."""
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("nota", "b.txt")
    frag = s.agregar_fragmentos(art.id, [(1, "t")])[0].id
    for n in ("Aduana Manzanillo", "SAT", "Proveedor X"):
        s.upsert_entidad(n, "organizacion", "synesis", evidencia=[frag])

    primera = [s.upsert_entidad(n, "organizacion", "synesis", evidencia=[frag]).id
               for n in ("SAT", "Proveedor X", "Aduana Manzanillo")]
    segunda = [s.upsert_entidad(n, "organizacion", "synesis", evidencia=[frag]).id
               for n in ("SAT", "Proveedor X", "Aduana Manzanillo")]
    assert primera == segunda


def test_la_ingesta_se_mantiene_lineal(conn):
    """La ingesta ya era plana (~2 200 docs/s medidos); esta prueba impide
    que una ola futura la vuelva cuadrática sin que nadie lo note."""
    from autogenes.ingesta import ingestar_texto

    def doc(i):
        return f"Factura {i} de Proveedor {i % 97}.\n\n" + ("lorem ipsum " * 40)

    BLOQUE = 300
    t1 = _cronometrar(lambda i: ingestar_texto(conn, 1, f"a{i}.txt", doc(i)), BLOQUE)
    t2 = _cronometrar(
        lambda i: ingestar_texto(conn, 1, f"b{i}.txt", doc(i + 10_000)), BLOQUE)
    t3 = _cronometrar(
        lambda i: ingestar_texto(conn, 1, f"c{i}.txt", doc(i + 20_000)), BLOQUE)
    assert t3 < t1 * 2.5, (
        f"la ingesta se degrada con el tamaño: {t1:.2f}s → {t2:.2f}s → {t3:.2f}s")
