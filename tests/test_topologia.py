"""Spec for the QUALIA topology engine (F7a).

Ported 1:1 from ref_karelen/capacidades/signature.test.ts — each test
mirrors a named invariant of the KARELEN engine. If a test here must
change, the spec changed: flag it to the operator first.
"""
import math

from autogenes.topologia import (
    centralidad_vector_propio,
    contar_componentes,
    contribuciones_centralidad,
    detectar_comunidades,
    distribucion_grado,
    embedding_espectral,
    escalera_renorm,
    grado_nodo,
    grado_ponderado,
    matriz_adyacencia,
    ordenar_por_comunidad,
    persistencia_h0,
    puentes_articulacion,
    renormalizar,
    resumen_red,
)


def _red(ids, enlaces):
    return {
        "nodos": [{"id": i, "etiqueta": i} for i in ids],
        "enlaces": [{"origen": a, "destino": b, "peso": w} for a, b, w in enlaces],
    }


def dos_cliques():
    """Two triangles (a,b,c) and (x,y,z) joined by one weak bridge c—x."""
    return _red(
        ["a", "b", "c", "x", "y", "z"],
        [("a", "b", 5), ("b", "c", 5), ("a", "c", 5),
         ("x", "y", 5), ("y", "z", 5), ("x", "z", 5),
         ("c", "x", 1)],
    )


# ── grado_ponderado ──────────────────────────────────────────────────

def test_grado_ponderado_suma_pesos_e_incluye_aislados_en_cero():
    red = _red(["a", "b", "solo"], [("a", "b", 3)])
    g = grado_ponderado(red)
    assert g["a"] == 3
    assert g["b"] == 3
    assert g["solo"] == 0


# ── detectar_comunidades ─────────────────────────────────────────────

def test_separa_dos_cliques_unidos_por_puente_debil():
    com = detectar_comunidades(dos_cliques())
    assert com["a"] == com["b"] == com["c"]
    assert com["x"] == com["y"] == com["z"]
    assert com["a"] != com["x"]
    assert len(set(com.values())) == 2


def test_comunidades_deterministas_entre_corridas():
    a = sorted(detectar_comunidades(dos_cliques()).items())
    b = sorted(detectar_comunidades(dos_cliques()).items())
    assert a == b


def test_comunidades_etiquetadas_densamente_desde_cero():
    com = detectar_comunidades(dos_cliques())
    assert set(com.values()) == {0, 1}


# ── ordenar_por_comunidad ────────────────────────────────────────────

def test_orden_mantiene_comunidades_contiguas():
    red = dos_cliques()
    com = detectar_comunidades(red)
    orden = ordenar_por_comunidad(red, com)
    assert len(orden) == 6
    vistos = set()
    previa = None
    for c in (com[i] for i in orden):
        if c != previa:
            assert c not in vistos  # ninguna comunidad reaparece
            vistos.add(c)
            previa = c


# ── matriz_adyacencia ────────────────────────────────────────────────

def test_matriz_simetrica_con_pesos_en_posiciones_ordenadas():
    red = _red(["a", "b"], [("a", "b", 4)])
    assert matriz_adyacencia(red, ["a", "b"]) == [[0, 4], [4, 0]]


# ── contar_componentes ───────────────────────────────────────────────

def test_cuenta_islas_desconectadas():
    red = _red(["a", "b", "c"], [("a", "b", 1)])
    assert contar_componentes(red) == 2


# ── renormalizar ─────────────────────────────────────────────────────

def test_renormalizar_colapsa_comunidades_y_agrega_el_puente():
    coarse = renormalizar(dos_cliques())
    assert len(coarse["nodos"]) == 2
    assert len(coarse["enlaces"]) == 1
    assert coarse["enlaces"][0]["peso"] == 1
    assert all(n["peso"] == 3 for n in coarse["nodos"])


def test_renormalizar_descarta_aristas_intracomunitarias():
    coarse = renormalizar(dos_cliques())
    assert all(e["origen"] != e["destino"] for e in coarse["enlaces"])


# ── escalera_renorm ──────────────────────────────────────────────────

def test_escalera_arranca_en_la_red_cruda_y_encoge_monotona():
    red = dos_cliques()
    escalera = escalera_renorm(red)
    assert escalera[0] is red
    for i in range(1, len(escalera)):
        assert len(escalera[i]["nodos"]) < len(escalera[i - 1]["nodos"])


def test_escalera_se_detiene_en_red_trivial():
    red = _red(["a"], [])
    assert len(escalera_renorm(red)) == 1


# ── grado_nodo ───────────────────────────────────────────────────────

def test_grado_nodo_cuenta_vecinos_distintos_sin_peso():
    red = _red(["a", "b", "c"], [("a", "b", 9), ("a", "c", 1)])
    g = grado_nodo(red)
    assert g["a"] == 2
    assert g["b"] == 1


# ── distribucion_grado ───────────────────────────────────────────────

def test_distribucion_rankea_y_ajusta_exponente_en_estrella():
    red = _red(["c", "l1", "l2", "l3", "l4"],
               [("c", "l1", 1), ("c", "l2", 1), ("c", "l3", 1), ("c", "l4", 1)])
    d = distribucion_grado(red)
    assert d["rank_size"][0]["id"] == "c"
    assert d["grado_max"] == 4
    assert d["exponente"] is not None
    assert d["exponente"] > 0


# ── persistencia_h0 ──────────────────────────────────────────────────

def test_persistencia_una_barra_por_nodo_cruzada_con_componentes():
    red = dos_cliques()
    per = persistencia_h0(red)
    assert len(per["barras"]) == 6           # una por nodo
    assert per["n_componentes"] == contar_componentes(red)
    sobreviven = [b for b in per["barras"] if b["muerte"] == 0]
    assert len(sobreviven) == per["n_componentes"]
    muertes = [b["muerte"] for b in per["barras"]]
    assert muertes == sorted(muertes)        # más persistente primero


# ── embedding_espectral ──────────────────────────────────────────────

def test_embedding_determinista_y_ubica_todo_nodo():
    a = embedding_espectral(dos_cliques())
    b = embedding_espectral(dos_cliques())
    assert len(a) == 6
    for nid, p in a.items():
        assert math.isfinite(p["x"]) and math.isfinite(p["y"])
        assert b[nid] == p


def test_embedding_separa_los_cliques_en_el_eje_fiedler():
    pos = embedding_espectral(dos_cliques())
    media = lambda ids: sum(pos[i]["x"] for i in ids) / len(ids)  # noqa: E731
    assert abs(media(["a", "b", "c"]) - media(["x", "y", "z"])) > 0.05


# ── resumen_red ──────────────────────────────────────────────────────

def test_resumen_reporta_hechos_estructurales_verificables():
    r = resumen_red(dos_cliques())
    assert r["n_nodos"] == 6
    assert r["n_enlaces"] == 7
    assert r["n_comunidades"] == 2
    assert r["n_componentes"] == 1
    assert r["comunidad_mayor"] == 3
    assert len(r["hubs"]) > 0
    assert 0 < r["densidad"] <= 1


# ── puentes de articulación ──────────────────────────────────────────

def test_detecta_el_nodo_que_parte_la_red_en_dos():
    barra = _red(["a", "b", "c"], [("a", "b", 1), ("b", "c", 1)])
    assert puentes_articulacion(barra) == ["b"]
    triangulo = _red(["a", "b", "c"], [("a", "b", 1), ("b", "c", 1), ("a", "c", 1)])
    assert puentes_articulacion(triangulo) == []


def test_resumen_expone_exponente_y_puentes_etiquetados():
    red = {
        "nodos": [{"id": "hub", "etiqueta": "Centro"},
                  {"id": "x", "etiqueta": "X"},
                  {"id": "y", "etiqueta": "Y"},
                  {"id": "z", "etiqueta": "Z"}],
        "enlaces": [{"origen": "hub", "destino": i, "peso": 1} for i in "xyz"],
    }
    r = resumen_red(red)
    assert [p["etiqueta"] for p in r["puentes"]] == ["Centro"]
    assert "exponente" in r   # puede ser None con pocos puntos — pero existe


# ── contribuciones_centralidad ───────────────────────────────────────

def _estrella():
    return {
        "nodos": [{"id": "sol", "etiqueta": "Sol"},
                  {"id": "a", "etiqueta": "A"}, {"id": "b", "etiqueta": "B"},
                  {"id": "c", "etiqueta": "C"}, {"id": "d", "etiqueta": "D"}],
        "enlaces": [{"origen": "sol", "destino": i, "peso": 1} for i in "abcd"],
    }


def test_explica_una_hoja_por_su_unico_vecino():
    aportes = contribuciones_centralidad(_estrella(), "a")
    assert len(aportes) == 1
    assert aportes[0]["id"] == "sol"
    assert abs(aportes[0]["masa"] - 1) < 1e-5


def test_recorta_al_top_con_desempate_determinista_por_id():
    aportes = contribuciones_centralidad(_estrella(), "sol", 3)
    assert [x["id"] for x in aportes] == ["a", "b", "c"]
    # cada hoja aporta peso 1 × masa 0.5 (teoría exacta de la estrella)
    for x in aportes:
        assert abs(x["aporte"] - 0.5) < 1e-5


def test_nodo_aislado_no_tiene_aportes():
    red = _red(["solo", "a", "b"], [("a", "b", 1)])
    assert contribuciones_centralidad(red, "solo") == []


def test_centralidad_sin_aristas_no_explota():
    red = _red(["a", "b"], [])
    masas = centralidad_vector_propio(red)
    assert set(masas) == {"a", "b"}
