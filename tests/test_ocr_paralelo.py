"""OCR en PARALELO — hallazgo S5 del diagnóstico v02.

El OCR es el techo real de la ingesta a escala: Tesseract va página a página,
en el hilo del request, y con 1-3 s/página unas 2 000 facturas escaneadas de
3 páginas son 2-5 HORAS secuenciales. Tesseract es un proceso externo, así
que paraleliza sin pelearse con el GIL.

Estas pruebas NO necesitan Tesseract ni Pillow: fijan el contrato del
repartidor —cuándo monta un pool, cuándo no, y que el orden se conserva—.
La comparación real contra el camino secuencial vive en
`tests/test_ingesta_ocr.py`, que se salta sin Tesseract.
"""

def test_sin_paginas_suficientes_no_se_monta_un_pool():
    """Levantar cuatro procesos para una página cuesta más que la página."""
    from autogenes.ingesta import _ocr_en_paralelo

    assert _ocr_en_paralelo(b"%PDF-1.4", [1]) is None
    assert _ocr_en_paralelo(b"%PDF-1.4", []) is None


def test_si_multiprocessing_no_esta_disponible_se_degrada(monkeypatch):
    """Un entorno que no permite `multiprocessing` (sandbox, /dev/shm ausente)
    tiene que caer al camino secuencial, no quedarse sin ingesta."""
    import multiprocessing as mp

    from autogenes.ingesta import _ocr_en_paralelo

    def explota(_):
        raise OSError("sin /dev/shm")
    monkeypatch.setattr(mp, "get_context", explota)
    assert _ocr_en_paralelo(b"%PDF-1.4", [1, 2, 3]) is None


def _pagina_de_mentira(pagina: int) -> tuple[int, str]:
    """Suplantador del trabajador. Vive al nivel del módulo a propósito: una
    lambda no se puede picklear, y `Pool.map` picklea la función — con una
    lambda el pool falla, `_ocr_en_paralelo` devuelve None y la prueba se
    saltaría sola sin comprobar nada."""
    return pagina, f"texto de la pagina {pagina}"


def test_el_pool_conserva_el_orden_de_las_paginas(monkeypatch):
    """La ley de doble corrida: el resultado tiene que ser el mismo con uno o
    con cuatro procesos. `Pool.map` conserva el orden de entrada — se afirma
    porque de ello depende que los fragmentos salgan por página."""
    from autogenes import ingesta

    monkeypatch.setattr(ingesta, "_ocr_una_pagina", _pagina_de_mentira)
    salida = ingesta._ocr_en_paralelo(b"%PDF-1.4", [1, 2, 3, 4, 5])
    assert salida is not None, "el pool no arrancó y la prueba no comprobaría nada"
    assert [p for p, _ in salida] == [1, 2, 3, 4, 5]
