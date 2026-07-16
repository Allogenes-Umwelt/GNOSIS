"""Spec del SELLO (C1-lite): el hash re-derivable de un producto dockeado.
Prueba que el sello es determinista, que verifica un cuerpo intacto y que
detecta cualquier manipulación."""
from autogenes.sello import sellar, verificar


def test_sellar_determinista_e_independiente_del_orden():
    a = {"b": 2, "a": 1, "lista": [3, 2, 1]}
    b = {"a": 1, "lista": [3, 2, 1], "b": 2}   # mismas claves, otro orden
    assert sellar(a) == sellar(b)              # canónico: orden no importa
    assert sellar(a) == sellar(a)              # doble corrida idéntica


def test_sellar_ignora_el_propio_campo_sello():
    cuerpo = {"dato": 42}
    s = sellar(cuerpo)
    cuerpo["sello"] = s
    assert sellar(cuerpo) == s                 # el sello no se hashea a sí mismo


def test_verificar_cuerpo_intacto():
    cuerpo = {"hallazgo": {"monto": 1000}, "flujo": {"vendidos": 5}}
    cuerpo["sello"] = sellar(cuerpo)
    v = verificar(cuerpo)
    assert v["valido"] is True
    assert v["sello_guardado"] == v["sello_rederivado"]


def test_verificar_detecta_manipulacion():
    cuerpo = {"hallazgo": {"monto": 1000}}
    cuerpo["sello"] = sellar(cuerpo)
    cuerpo["hallazgo"]["monto"] = 9999          # alguien alteró el monto
    v = verificar(cuerpo)
    assert v["valido"] is False


def test_verificar_sin_sello_es_invalido():
    assert verificar({"dato": 1})["valido"] is False
