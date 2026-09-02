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


# ── el enmascarado de la frontera LLM (R1 del diagnóstico v02) ───────

def _identificadores(n: int) -> dict[str, str]:
    ids = {f"WVWZZZ3CZWE{i:06d}": "chasis" for i in range(n)}
    ids.update({f"FA-2026-{i:05d}": "factura" for i in range(n // 2)})
    return ids


def test_el_enmascarado_no_depende_del_numero_de_identificadores():
    """Se aplica a CADA resultado de tool y a CADA mensaje del operador.

    `enmascarar_troceado` compilaba una regex por identificador y la corría
    sobre el texto entero: 2,33 s por llamada con 15 000 identificadores —
    una sesión de 10 000 vehículos— o ~7 s de regex por turno de chat. Las
    pruebas de la ola 1 usaban dos identificadores y no podían verlo.

    Lo que se fija es la independencia: el coste lo pone el TEXTO, no cuántos
    identificadores tenga la sesión."""
    import json

    from jarvis.identidades import enmascarar
    from jarvis.ofuscation import ObfuscationLayer

    texto = json.dumps([{"chasis": f"WVWZZZ3CZWE{i:06d}", "nota": "x" * 40}
                        for i in range(150)])

    def coste(n: int) -> float:
        ids = _identificadores(n)
        capa = ObfuscationLayer("hilo")
        t0 = time.perf_counter()
        enmascarar(texto, ids, capa)
        return time.perf_counter() - t0

    chico = coste(150)
    grande = coste(15000)
    assert grande < max(chico, 0.02) * 8, (
        f"el enmascarado escala con el nº de identificadores: {chico:.3f}s con 225 "
        f"→ {grande:.3f}s con 22 500 ({grande / max(chico, 1e-9):.0f}×)")


def test_el_enmascarado_sigue_atrapando_las_evasiones_a_escala():
    """Rápido no sirve si deja pasar el dato: el corpus de evasión de la ola 1
    tiene que seguir cerrado con el conjunto grande."""
    from jarvis.identidades import enmascarar
    from jarvis.ofuscation import ObfuscationLayer

    ids = _identificadores(15000)
    secreto = "WVWZZZ3CZWE000042"
    assert secreto in ids
    capa = ObfuscationLayer("hilo")
    for forma in (secreto, secreto.lower(),
                  secreto[:8] + "-" + secreto[8:],
                  secreto.encode().hex().upper(),
                  f"el chasis {secreto} viene de Emden"):
        salida = enmascarar(forma, ids, capa)
        plano = "".join(ch for ch in salida.lower() if ch.isalnum())
        assert secreto.lower() not in plano, f"se escapó en la forma: {forma[:40]}"


# ── la proyección del grafo (S2 y S3 del diagnóstico v02) ────────────

def _sembrar_documentos(conn, n: int) -> None:
    from autogenes.ingesta import ingestar_texto
    for i in range(n):
        ingestar_texto(conn, 1, f"d{i}.txt", f"Documento {i}.\n\n" + "texto " * 30)


def test_la_lente_de_negocio_no_paga_la_capa_documental(conn):
    """`red_de_sesion` construía TODO el grafo —cada artefacto y cada
    fragmento como nodo— y luego tiraba la capa documental. A 8 000
    documentos son 16 000 nodos materializados para descartarlos, y lo paga
    cada lente, cada snapshot y cada tool de chat que toque el grafo."""
    from autogenes.qualia import red_de_sesion

    from autogenes.proyeccion import construir_grafo

    _sembrar_documentos(conn, 600)
    completo = construir_grafo(conn, 1)          # calienta cualquier caché
    t0 = time.perf_counter()
    construir_grafo(conn, 1, con_analitica=False, con_anomalias=False)
    coste_completo = time.perf_counter() - t0
    t0 = time.perf_counter()
    red = red_de_sesion(conn, 1)
    coste_negocio = time.perf_counter() - t0

    assert not any(n.get("kind") in ("artefacto", "fragmento") for n in red["nodos"])
    documentales = sum(1 for n in completo["nodos"]
                       if n.get("kind") in ("artefacto", "fragmento"))
    assert documentales > 1000, "el sembrado no produjo capa documental que ahorrar"
    # no puede costar lo mismo devolver 600 nodos que 1 800
    assert coste_negocio < coste_completo, (
        f"la lente de negocio ({coste_negocio:.3f}s) cuesta como la completa "
        f"({coste_completo:.3f}s): sigue construyendo {documentales} nodos para tirarlos")


def test_la_proyeccion_se_cachea_mientras_nada_muta(conn):
    """Un grafo que no ha cambiado no se reconstruye: lo piden varias
    superficies en la misma pantalla."""
    from autogenes.proyeccion import construir_grafo

    _sembrar_documentos(conn, 400)
    t0 = time.perf_counter()
    construir_grafo(conn, 1)
    frio = time.perf_counter() - t0
    t0 = time.perf_counter()
    construir_grafo(conn, 1)
    caliente = time.perf_counter() - t0
    assert caliente < frio / 3, (
        f"la segunda construcción costó {caliente:.3f}s vs {frio:.3f}s: sin caché")


def test_la_cache_no_sirve_un_grafo_viejo(conn):
    """Y la caché no puede mentir: una mutación la invalida."""
    from autogenes.ingesta import ingestar_texto
    from autogenes.proyeccion import construir_grafo

    _sembrar_documentos(conn, 20)
    antes = len(construir_grafo(conn, 1)["nodos"])
    ingestar_texto(conn, 1, "nuevo.txt", "Documento nuevo.\n\ncon texto")
    despues = len(construir_grafo(conn, 1)["nodos"])
    assert despues > antes, "la caché sirvió un grafo anterior a la mutación"


def test_el_lienzo_puede_acotar_los_documentos(conn):
    """5 000 PDFs de 3 páginas son 20 000 nodos documentales en el JSON y en
    la simulación de fuerzas del navegador. El servidor tiene que poder
    acotar, y declarar lo que recorta."""
    from autogenes.proyeccion import construir_grafo

    _sembrar_documentos(conn, 300)
    g = construir_grafo(conn, 1, limite_documentos=50)
    artefactos = [n for n in g["nodos"] if n.get("kind") == "artefacto"]
    assert len(artefactos) <= 51, f"{len(artefactos)} artefactos pese al tope de 50"
    assert any(n.get("kind") == "agregado" for n in g["nodos"]), \
        "el recorte no se declaró con un nodo agregado"


# ── la búsqueda de texto (G6 del diagnóstico v02) ────────────────────

def test_buscar_no_se_degrada_con_el_tamano_del_corpus(conn):
    """El índice existe justo para esto: encontrar no puede costar más
    porque haya más documentos donde no está lo buscado.

    Sin índice, `LIKE '%aguja%'` recorre la tabla entera y el coste sube
    con el corpus. Con FTS5 la lista de aciertos de un término raro no
    crece porque crezca lo demás."""
    from autogenes.busqueda import buscar_fragmentos

    _sembrar_documentos(conn, 200)
    from autogenes.ingesta import ingestar_texto
    ingestar_texto(conn, 1, "aguja.txt", "Documento con la aguja.\n\nla aguja aparece aqui")
    buscar_fragmentos(conn, 1, "aguja")                      # calienta páginas

    t1 = _cronometrar(lambda i: buscar_fragmentos(conn, 1, "aguja"), 20)
    _sembrar_documentos(conn, 800)
    t2 = _cronometrar(lambda i: buscar_fragmentos(conn, 1, "aguja"), 20)
    assert t2 < t1 * 3, (
        f"buscar se degrada con el corpus: {t1:.3f}s → {t2:.3f}s con 5× documentos")


def test_el_total_no_recorre_todos_los_aciertos(conn):
    """Contar exacto costaba 400-1 050 ms contra 17-24 ms de búsqueda a
    24 000 fragmentos: el conteo dominaba la llamada que anotaba. El tope
    corta el recorrido.

    Aquí NO se mide el reloj: a los tamaños que un test puede sembrar la
    diferencia en milisegundos es ruido, y una prueba que pasa igual con el
    fallo dentro no prueba nada. Se cuenta el TRABAJO —pasos de la máquina
    virtual de SQLite, vía `set_progress_handler`— que no depende de lo
    rápida que sea la máquina. La propiedad es que el conteo acotado cuesta
    lo mismo con el doble de corpus, y el exacto no."""
    from autogenes.busqueda import TOPE_CONTEO, _CONTAR
    from autogenes.ingesta import ingestar_texto

    def pasos(limite: int) -> int:
        n = [0]
        conn.set_progress_handler(lambda: (n.__setitem__(0, n[0] + 1), 0)[1], 100)
        try:
            conn.execute(_CONTAR, ("texto", 1, limite)).fetchall()
        finally:
            conn.set_progress_handler(None, 0)
        return n[0]

    _sembrar_documentos(conn, 600)          # 'texto' sale en todos
    acotado_1, exacto_1 = pasos(TOPE_CONTEO + 1), pasos(10 ** 9)
    for i in range(600, 1800):
        ingestar_texto(conn, 1, f"x{i}.txt", f"Documento {i}.\n\n" + "texto " * 30)
    acotado_2, exacto_2 = pasos(TOPE_CONTEO + 1), pasos(10 ** 9)

    assert acotado_2 <= acotado_1 * 1.2, (
        f"el conteo acotado crece con el corpus: {acotado_1} → {acotado_2} pasos")
    assert exacto_2 > exacto_1, (
        "el conteo exacto no creció: el corpus no llegó a ser mayor, "
        f"la prueba no está midiendo nada ({exacto_1} → {exacto_2} pasos)")


# ── la identidad entre sesiones (G1 del diagnóstico v02) ─────────────

def test_las_candidatas_de_fusion_no_comparan_todos_contra_todos(conn, monkeypatch):
    """Proponer fusiones es, en su forma ingenua, O(E²) — el mismo patrón que
    la ola 1 quitó de `upsert_entidad`. El bloqueo por tokens lo impide.

    Se cuentan las COMPARACIONES, no los segundos. Un umbral de reloj sobre
    unos milisegundos es ruido: la primera versión de esta prueba fallaba una
    de cada tres corridas, que es peor que no tenerla. El número de pares
    examinados, en cambio, es el mismo en cualquier máquina."""
    import autogenes.similitud as sim

    s = Sustrato(conn, 1)
    art = s.crear_artefacto("nota", "semilla.txt")
    frag = s.agregar_fragmentos(art.id, [(1, "texto")])[0].id

    def sembrar(desde, hasta):
        # cada par comparte un token propio («alfa7») y por tanto un bloque de
        # dos; los tokens comunes («corporativo») caen en bloques enormes que
        # el tope descarta, que es justo lo que deben hacer
        for i in range(desde, hasta):
            for cola in ("", " Servicios"):
                s.upsert_entidad(f"Alfa{i} Corporativo{cola}", "organizacion",
                                 "synesis", evidencia=[frag])

    def comparaciones() -> int:
        n = [0]
        original = sim._juzgar
        monkeypatch.setattr(sim, "_juzgar",
                            lambda *a, **k: (n.__setitem__(0, n[0] + 1),
                                             original(*a, **k))[1])
        sim.candidatas(conn, 1)
        monkeypatch.undo()
        return n[0]

    sembrar(0, 150)                   # 300 entidades
    con_300 = comparaciones()
    sembrar(150, 300)                 # 600 entidades
    con_600 = comparaciones()

    assert con_300 > 0, "no se comparó nada: la prueba no está midiendo"
    # cuadrático sería ×4 al doblar; el bloqueo lo deja en ×2
    assert con_600 < con_300 * 3, (
        f"las comparaciones crecen como el cuadrado: {con_300} → {con_600} "
        "al doblar las entidades")
    assert con_600 < 600 * 599 / 2, "se comparó todo contra todo"


def test_la_identidad_no_encarece_el_alta_de_entidades(conn):
    """Resolver la identidad es una lectura indexada por `nombre_canon`; si
    se volviera un escaneo, el alta de entidades se degradaría otra vez."""
    s = Sustrato(conn, 1)
    art = s.crear_artefacto("nota", "semilla.txt")
    frag = s.agregar_fragmentos(art.id, [(1, "texto")])[0].id

    BLOQUE = 400
    t1 = _cronometrar(lambda i: s.upsert_entidad(
        f"Ent I{i}", "organizacion", "synesis", evidencia=[frag]), BLOQUE)
    t2 = _cronometrar(lambda i: s.upsert_entidad(
        f"Ent J{i}", "organizacion", "synesis", evidencia=[frag]), BLOQUE)
    t3 = _cronometrar(lambda i: s.upsert_entidad(
        f"Ent K{i}", "organizacion", "synesis", evidencia=[frag]), BLOQUE)
    assert t3 < t1 * 2.5, (
        f"el alta se degrada con el número de identidades: {t1:.2f}s → "
        f"{t2:.2f}s → {t3:.2f}s")
