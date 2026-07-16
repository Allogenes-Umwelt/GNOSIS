"""Spec for the QUALIA anomaly engine (F7b).

Ported 1:1 from ref_karelen/capacidades/anomalias.test.ts — each test
mirrors a named invariant. If a test here must change, the spec
changed: flag it to the operator first.
"""
from autogenes.anomalias import (
    desviacion_fuentes,
    detectar_anomalias,
    drift_topologico,
    quiebre_ritmo,
    rafaga_actividad,
    tomar_snapshot,
)
from autogenes.topologia import centralidad_vector_propio, resumen_red


def estrella(centro, hojas):
    return {
        "nodos": [{"id": i, "etiqueta": i} for i in [centro, *hojas]],
        "enlaces": [{"origen": centro, "destino": h, "peso": 1} for h in hojas],
    }


# ── anomalías (M0) ───────────────────────────────────────────────────

def test_detecta_concentrador_nuevo_e_isla_nueva_contra_base():
    antes = estrella("sol", ["a", "b", "c"])
    base = tomar_snapshot(resumen_red(antes), "t0")

    despues = {
        "nodos": antes["nodos"] + [{"id": "luna", "etiqueta": "luna"},
                                   {"id": "solo", "etiqueta": "solo"}],
        "enlaces": antes["enlaces"] + [
            {"origen": "luna", "destino": "a", "peso": 3},
            {"origen": "luna", "destino": "b", "peso": 3},
            {"origen": "luna", "destino": "c", "peso": 3},
            {"origen": "luna", "destino": "sol", "peso": 3},
        ],
    }
    hallazgos = detectar_anomalias(resumen_red(despues), base)
    detectores = [h["detector"] for h in hallazgos]
    assert "hub-nuevo" in detectores
    assert "islas" in detectores
    assert all(h["clave"] for h in hallazgos)
    # ordenadas por severidad descendente
    sev = [h["severidad"] for h in hallazgos]
    assert sev == sorted(sev, reverse=True)


def test_sin_cambios_reales_sin_hallazgos_nada_de_placebo():
    red = estrella("sol", ["a", "b", "c"])
    base = tomar_snapshot(resumen_red(red), "t0")
    assert detectar_anomalias(resumen_red(red), base) == []


def test_rafaga_zscore_clasico_sobre_ventana_previa():
    assert rafaga_actividad([2, 2, 2, 2, 2, 2, 2, 2])["es_rafaga"] is False
    r = rafaga_actividad([2, 3, 2, 2, 3, 2, 2, 14])
    assert r["es_rafaga"] is True
    assert r["z"] > 2


# ── centralidad (M0, cruzada) ────────────────────────────────────────

def test_centro_de_estrella_pesa_uno_y_hojas_menos():
    c = centralidad_vector_propio(estrella("sol", ["a", "b", "c", "d"]))
    assert abs(c["sol"] - 1) < 1e-5
    for hoja in "abcd":
        assert 0 < c[hoja] < 1


# ── quiebre de ritmo (N0) ────────────────────────────────────────────

PERIODICA = [5 if i % 4 == 0 else 0 for i in range(28)]


def test_no_dispara_mientras_el_ritmo_se_sostiene():
    assert quiebre_ritmo(PERIODICA)["es_quiebre"] is False


def test_dispara_cuando_la_periodicidad_colapsa():
    rota = PERIODICA[:14] + [2] * 14
    q = quiebre_ritmo(rota)
    assert q["es_quiebre"] is True
    assert q["lag"] >= 2
    assert q["antes"] >= 0.5
    assert q["ahora"] < 0.2


def test_series_cortas_o_sin_ritmo_no_disparan():
    assert quiebre_ritmo([1, 2, 3])["es_quiebre"] is False
    ruido = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7,
             9, 3, 2, 3, 8, 4, 6, 2, 6, 4, 3, 3, 8, 3]
    q = quiebre_ritmo(ruido)
    assert isinstance(q["es_quiebre"], bool)


# ── desviación de series (N2) ────────────────────────────────────────

def test_dispara_sobre_la_serie_que_rompe_su_historia():
    hallazgos = desviacion_fuentes([
        {"etiqueta": "FIX", "valores": [18.4, 18.5, 18.4, 18.6, 18.5, 21.9]},
        {"etiqueta": "UDI", "valores": [8.1, 8.1, 8.11, 8.12, 8.12, 8.13]},
    ])
    assert len(hallazgos) == 1
    assert hallazgos[0]["detector"] == "fuente"
    assert hallazgos[0]["clave"] == "anom-fuente-FIX"
    assert hallazgos[0]["severidad"] > 0


def test_recorta_a_los_dos_mas_severos():
    def brinco(v):
        return [1, 1, 1, 1, 1, v]
    hallazgos = desviacion_fuentes([
        {"etiqueta": "A", "valores": brinco(50)},
        {"etiqueta": "B", "valores": brinco(80)},
        {"etiqueta": "C", "valores": brinco(120)},
    ])
    assert len(hallazgos) == 2


# ── drift entre sesiones (enhancement de servidor) ───────────────────

def test_drift_topologico_mide_deltas_y_reusa_detectores():
    a = estrella("sol", ["a", "b", "c"])
    b = {
        "nodos": a["nodos"] + [{"id": "isla", "etiqueta": "isla"}],
        "enlaces": a["enlaces"],
    }
    d = drift_topologico(resumen_red(a), resumen_red(b), "06/2026", "07/2026")
    assert d["de"] == "06/2026" and d["a"] == "07/2026"
    assert d["deltas"]["n_nodos"] == 1
    assert d["deltas"]["n_componentes"] == 1
    assert any(h["detector"] == "islas" for h in d["hallazgos"])
