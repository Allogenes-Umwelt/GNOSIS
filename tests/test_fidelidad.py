"""Spec de S2 · verificación de fidelidad afirmación↔evidencia.

El saneo prueba que la cita EXISTE; esto prueba que la cifra del punto está
EN la cita. Determinista, sin segundo LLM.
"""
from autogenes.informe import (
    podar_no_verificados,
    verificar_fidelidad,
)


def _inf(texto, evidencia):
    return {"titulo": "T", "secciones": [
        {"encabezado": "H", "puntos": [
            {"texto": texto, "evidencia": evidencia, "entidades": []}]}]}


def _punto(inf):
    return inf["secciones"][0]["puntos"][0]


FRAG = {"f1": "La unidad ampara 60 unidades con VIN VSSAAAKP3T1077301."}
HECHO = {"hecho:concilia:x": "1,400,000"}


def test_cifra_correcta_verifica():
    inf = verificar_fidelidad(_inf("El amparo cubre 60 unidades.", ["f1"]), FRAG, HECHO)
    assert _punto(inf)["verificado"] is True
    assert _punto(inf)["tokens_huerfanos"] == []


def test_cifra_alterada_no_verifica():
    inf = verificar_fidelidad(_inf("El amparo cubre 90 unidades.", ["f1"]), FRAG, HECHO)
    assert _punto(inf)["verificado"] is False
    assert "90" in _punto(inf)["tokens_huerfanos"]


def test_formato_de_miles_distinto_verifica():
    # el hecho vale '1,400,000'; el punto lo escribe sin comas -> misma cifra
    inf = verificar_fidelidad(_inf("El riesgo es 1400000 MXN.", ["hecho:concilia:x"]),
                              FRAG, HECHO)
    assert _punto(inf)["verificado"] is True


def test_monto_con_decimales_verifica_contra_entero():
    inf = verificar_fidelidad(_inf("Suma 1,400,000.00 en riesgo.", ["hecho:concilia:x"]),
                              FRAG, HECHO)
    assert _punto(inf)["verificado"] is True


def test_vin_fabricado_no_verifica():
    inf = verificar_fidelidad(
        _inf("El vehículo VSSAAAKP3T1099999 no llegó.", ["f1"]), FRAG, HECHO)
    assert _punto(inf)["verificado"] is False
    assert "VSSAAAKP3T1099999" in _punto(inf)["tokens_huerfanos"]


def test_vin_real_de_la_evidencia_verifica():
    inf = verificar_fidelidad(
        _inf("El VIN VSSAAAKP3T1077301 figura en la factura.", ["f1"]), FRAG, HECHO)
    assert _punto(inf)["verificado"] is True


def test_un_solo_digito_no_es_cifra_dura():
    # 'una ruta', '3 aduanas' no deben marcar el punto (ruido)
    inf = verificar_fidelidad(_inf("Depende de 1 sola vía en 3 aduanas.", ["f1"]),
                              FRAG, HECHO)
    assert _punto(inf)["verificado"] is True


def test_punto_sin_cifras_se_verifica():
    inf = verificar_fidelidad(_inf("El proveedor concentra el suministro.", ["f1"]),
                              FRAG, HECHO)
    assert _punto(inf)["verificado"] is True


def test_cita_a_hecho_inexistente_no_da_corpus():
    # el punto cita un id que no es fragmento ni hecho -> sin corpus -> la
    # cifra queda huérfana (honesto: nada la sustenta)
    inf = verificar_fidelidad(_inf("Riesgo de 55000 MXN.", ["fantasma"]), FRAG, HECHO)
    assert _punto(inf)["verificado"] is False
    assert "55000" in _punto(inf)["tokens_huerfanos"]


def test_modo_estricto_poda_no_verificados():
    inf = _inf("El amparo cubre 90 unidades.", ["f1"])
    inf["secciones"][0]["puntos"].append(
        {"texto": "El proveedor concentra el flujo.", "evidencia": ["f1"], "entidades": []})
    verificar_fidelidad(inf, FRAG, HECHO)
    podado = podar_no_verificados(inf)
    # el punto con '90' huérfano se fue; el verificado permanece
    assert len(podado["secciones"][0]["puntos"]) == 1
    assert "concentra" in podado["secciones"][0]["puntos"][0]["texto"]
