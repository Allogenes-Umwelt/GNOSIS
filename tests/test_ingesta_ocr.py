"""Ingesta de Autogenes con OCR (Tesseract) — facturas escaneadas / imágenes.

La Ingesta del sustrato antes solo leía la capa de texto; un escaneo o una
foto (sin texto) se rechazaba. Ahora `ingestar_imagen` y el relleno OCR de
`ingestar_pdf` sacan el texto con Tesseract, local, sin red. Estas pruebas
fijan ese contrato. Se saltan donde Tesseract/poppler no están instalados
(el binario va en la imagen Docker vía apt), sin romper el resto del CI.

No se importa pdfplumber aquí a propósito: se ejercita la maquinaria de OCR
(`_ocr_paginas_pdf`, `ingestar_imagen`) directamente.
"""
import io
import shutil

import pytest

Image = pytest.importorskip("PIL.Image", reason="Pillow no disponible")
from PIL import ImageDraw, ImageFont  # noqa: E402

TIENE_TESSERACT = shutil.which("tesseract") is not None
TIENE_POPPLER = shutil.which("pdftoppm") is not None
_TEXTO = ["FACTURA A-00123", "MARCA AUDI  PAIS DEU", "TOTAL 640000 MXN"]


def _imagen():
    img = Image.new("RGB", (1200, 340), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 46)
    except Exception:
        font = ImageFont.load_default()
    for i, t in enumerate(_TEXTO):
        d.text((40, 40 + i * 80), t, fill="black", font=font)
    return img


def _pdf_escaneado(n_paginas):
    """Un PDF de imagen pura (sin capa de texto) de n páginas."""
    imgs = [_imagen() for _ in range(n_paginas)]
    buf = io.BytesIO()
    imgs[0].save(buf, "PDF", save_all=True, append_images=imgs[1:])
    return buf.getvalue()


@pytest.fixture(scope="module")
def sesion(tmp_path_factory):
    import database
    database.DB_PATH = str(tmp_path_factory.mktemp("ocr") / "gnosis.db")
    database.init_db()
    conn = database.get_connection()
    conn.execute("INSERT INTO processing_sessions (session_date, month_processed,"
                 " year_processed, status) VALUES ('2026-07-13', 7, 2026, 'completed')")
    conn.commit()
    sid = conn.execute("SELECT id FROM processing_sessions ORDER BY id DESC LIMIT 1").fetchone()["id"]
    return conn, sid


def test_dispatcher_rutea_imagen_a_ocr(sesion):
    """El dispatcher manda .png a `ingestar_imagen` (OCR), no al viejo rechazo
    'las imágenes aún no se ingieren'."""
    from autogenes import ingesta
    conn, sid = sesion
    png = io.BytesIO()
    _imagen().save(png, "PNG")
    r = ingesta.ingestar_archivo(conn, sid, "algo.png", png.getvalue())
    # con tesseract: fragmentos; sin tesseract: error de OCR no-disponible.
    # En NINGÚN caso el viejo mensaje de rechazo por formato/imagen.
    err = r.get("error", "")
    assert "aún no se ingieren" not in err and "no soportado" not in err


@pytest.mark.skipif(not TIENE_TESSERACT, reason="tesseract no instalado")
def test_imagen_ocr_produce_fragmentos(sesion):
    from autogenes import ingesta
    conn, sid = sesion
    png = io.BytesIO()
    _imagen().save(png, "PNG")
    r = ingesta.ingestar_imagen(conn, sid, "factura_foto.png", png.getvalue())
    assert "error" not in r and r["fragmentos"] >= 1
    frag = conn.execute("SELECT texto FROM ag_fragmentos WHERE artefacto_id = ?",
                        (r["artefacto_id"],)).fetchone()["texto"].upper()
    assert "FACTURA" in frag and "AUDI" in frag


@pytest.mark.skipif(not (TIENE_TESSERACT and TIENE_POPPLER),
                    reason="tesseract/poppler no instalados")
def test_pdf_escaneado_ocr_relleno():
    """Un PDF de imagen pura (escaneado): _ocr_paginas_pdf lo rasteriza y OCRea,
    y respeta las páginas que ya traen texto (`saltar`)."""
    from autogenes.ingesta import _ocr_paginas_pdf
    pdf = io.BytesIO()
    _imagen().save(pdf, "PDF")
    paginas = _ocr_paginas_pdf(pdf.getvalue(), saltar=set())
    assert paginas and "FACTURA" in paginas[0][1].upper() and "AUDI" in paginas[0][1].upper()
    assert _ocr_paginas_pdf(pdf.getvalue(), saltar={1}) == []


@pytest.mark.skipif(not (TIENE_TESSERACT and TIENE_POPPLER),
                    reason="tesseract/poppler no instalados")
def test_pdf_escaneado_multipagina_ocr_por_tandas():
    """Un escaneo multipágina se OCRea COMPLETO aunque el rasterizado sea por
    tandas (>_OCR_LOTE_PAGINAS), en orden, y `saltar` cruza fronteras de tanda."""
    from autogenes import ingesta
    pdf = _pdf_escaneado(10)   # 10 > _OCR_LOTE_PAGINAS (8): fuerza 2 tandas
    todas = ingesta._ocr_paginas_pdf(pdf, saltar=set())
    assert [p for p, _ in todas] == list(range(1, 11))
    # saltar una página de cada tanda: no aparece, el resto sí
    parcial = ingesta._ocr_paginas_pdf(pdf, saltar={3, 9})
    assert [p for p, _ in parcial] == [1, 2, 4, 5, 6, 7, 8, 10]


@pytest.mark.skipif(not (TIENE_TESSERACT and TIENE_POPPLER),
                    reason="tesseract/poppler no instalados")
def test_ocr_respeta_el_tope_de_paginas():
    """El tope de OCR acota cuántas páginas se leen (guardia anti-runaway)."""
    from autogenes import ingesta
    pdf = _pdf_escaneado(5)
    limitado = ingesta._ocr_paginas_pdf(pdf, saltar=set(), max_paginas=2)
    assert [p for p, _ in limitado] == [1, 2]


def test_pdf_num_paginas_degrada_con_basura():
    """Sin poppler o con bytes que no son PDF, el conteo devuelve 0 (no revienta)
    — el llamador degrada a la detección por tanda corta."""
    from autogenes.ingesta import _pdf_num_paginas
    assert _pdf_num_paginas(b"esto no es un pdf") == 0


def test_ocr_con_basura_o_sin_deps_devuelve_lista_vacia():
    """Bytes ilegibles (o deps de OCR ausentes) -> [] sin excepción."""
    from autogenes.ingesta import _ocr_paginas_pdf
    assert _ocr_paginas_pdf(b"esto no es un pdf", saltar=set()) == []


# ── OCR en paralelo (hallazgo S5) — lo que necesita Tesseract ────────

@pytest.mark.skipif(not TIENE_TESSERACT, reason="Tesseract no instalado")
def test_paralelo_y_secuencial_leen_lo_mismo(tmp_path):
    """La prueba que el diagnóstico pedía: mismo PDF escaneado, los dos
    caminos, el mismo texto. Se salta sin Tesseract, como el resto del
    archivo."""
    from pdf2image import convert_from_bytes  # noqa: F401  (deps de OCR)

    from autogenes.ingesta import _ocr_en_paralelo, _ocr_paginas_pdf

    paginas = []
    for i in range(1, 4):
        img = Image.new("RGB", (1200, 400), "white")
        ImageDraw.Draw(img).text((40, 150), f"FACTURA NUMERO {i}00",
                                 fill="black", font=ImageFont.load_default(size=48))
        paginas.append(img)
    buf = io.BytesIO()
    paginas[0].save(buf, format="PDF", save_all=True, append_images=paginas[1:])
    pdf = buf.getvalue()

    secuencial = {p: t for p, t in _ocr_paginas_pdf(pdf, saltar=set())}
    paralelo = _ocr_en_paralelo(pdf, [1, 2, 3])
    if paralelo is None:
        pytest.skip("multiprocessing no disponible en este contenedor")
    assert {p for p, _ in paralelo} == set(secuencial)
    for pagina, texto in paralelo:
        assert texto.split() == secuencial[pagina].split()
