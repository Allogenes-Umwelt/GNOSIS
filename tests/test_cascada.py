"""Spec for the simulated cascade (F7c) — ported 1:1 from
ref_karelen/capacidades/cascada.test.ts."""
from autogenes.cascada import onda_desde, simular_caida, simular_enlace

# barra a—b—c—d + isla x—y : b y c son puentes; d es hoja.
RED = {
    "nodos": [{"id": i, "etiqueta": i.upper()} for i in "abcdxy"],
    "enlaces": [
        {"origen": "a", "destino": "b", "peso": 1},
        {"origen": "b", "destino": "c", "peso": 1},
        {"origen": "c", "destino": "d", "peso": 1},
        {"origen": "x", "destino": "y", "peso": 1},
    ],
}


def test_onda_bfs_avanza_por_pasos_deterministas():
    assert onda_desde(RED, "a") == [["a"], ["b"], ["c"], ["d"]]


def test_deduccion_destructiva_quitar_puente_parte_y_mide():
    impacto = simular_caida(RED, "b")
    assert impacto["relaciones_caidas"] == 2
    assert impacto["islas_antes"] == 2
    assert impacto["islas_despues"] == 3       # {a}, {c,d}, {x,y}
    assert [d["id"] for d in impacto["desconectados"]] == ["a"]
    assert impacto["peso_estructural"] > 0
    # la simulación NO muta la red original
    assert len(RED["nodos"]) == 6
    assert len(RED["enlaces"]) == 4


def test_quitar_una_hoja_no_parte_nada():
    impacto = simular_caida(RED, "d")
    assert impacto["islas_despues"] == 2
    assert impacto["desconectados"] == []


def test_induccion_creativa_enlazar_islas_fusiona_y_acerca():
    impacto = simular_enlace(RED, "a", "x")
    assert impacto["fusiona_islas"] is True
    assert impacto["islas_antes"] == 2
    assert impacto["islas_despues"] == 1
    assert impacto["saltos_antes"] is None      # inalcanzable antes
    assert impacto["acercados"] > 0


def test_enlazar_dentro_de_la_misma_isla_reporta_atajo():
    impacto = simular_enlace(RED, "a", "d")
    assert impacto["fusiona_islas"] is False
    assert impacto["saltos_antes"] == 3


def test_caida_de_nodo_inexistente_no_inventa_impacto():
    impacto = simular_caida(RED, "fantasma")
    assert impacto["ondas"] == []
    assert impacto["relaciones_caidas"] == 0
    assert impacto["islas_antes"] == impacto["islas_despues"] == 2
