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
