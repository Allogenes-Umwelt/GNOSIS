"""Spec for the event horizon (F7c) — ported 1:1 from
ref_karelen/capacidades/horizonte.test.ts."""
from autogenes.horizonte import construir_horizonte


def snap(ts, n_nodos, n_enlaces):
    return {"ts": ts, "n_nodos": n_nodos, "n_enlaces": n_enlaces,
            "densidad": 0.5, "n_comunidades": 1, "n_componentes": 1,
            "exponente": None, "hubs": [], "puentes": []}


def test_nulo_sin_muestras_y_ordena_del_mas_viejo():
    assert construir_horizonte([], []) is None
    # el store guarda lo más nuevo primero; el horizonte re-ordena
    h = construir_horizonte([snap(300, 8, 12), snap(100, 4, 5)], [])
    assert [p["ts"] for p in h["puntos"]] == [100, 300]
    assert h["t0"] == 100 and h["t1"] == 300
    assert h["max_nodos"] == 8
    assert h["max_enlaces"] == 12


def test_mide_delta_entre_muestras_que_flanquean():
    h = construir_horizonte(
        [snap(100, 4, 5), snap(300, 8, 12)],
        [{"ts": 200, "accion": "plan", "detalle": "Plan aprobado"}],
    )
    assert len(h["lineas"]) == 1
    assert h["lineas"][0]["delta"] == {"nodos": 4, "enlaces": 7}


def test_delta_nulo_sin_muestra_posterior():
    h = construir_horizonte(
        [snap(100, 4, 5), snap(300, 8, 12)],
        [{"ts": 300, "accion": "dock", "detalle": "Informe dockeado"}],
    )
    assert h["lineas"][0]["delta"] is None


def test_descarta_fuera_de_ventana_y_acota():
    dentro = [{"ts": 110 + k, "accion": "op", "detalle": f"n{k}"} for k in range(15)]
    h = construir_horizonte(
        [snap(100, 4, 5), snap(300, 8, 12)],
        [{"ts": 50, "accion": "antes", "detalle": "fuera"}, *dentro],
        max_lineas=12,
    )
    assert len(h["lineas"]) == 12
    assert all(li["accion"] == "op" for li in h["lineas"])
    # conserva las ÚLTIMAS 12, viejo → nuevo
    assert h["lineas"][0]["detalle"] == "n3"
