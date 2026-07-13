"""Ingesta de documentos al sustrato — el artefacto y sus fragmentos.

Un documento entra como Artefacto y su texto se parte en Fragmentos
(la unidad de procedencia): PDFs por página (pdfplumber — el stack que
GNOSIS ya usa), texto plano por bloques de párrafos. Todo pasa por
Sustrato — bitácora incluida.
"""
import hashlib
import sqlite3
from typing import Any, Optional

from autogenes.sustrato import Sustrato

MAX_BLOQUE = 1600


def _hash(contenido: bytes) -> str:
    """sha256 del binario — la huella de contenido para el dedupe."""
    return hashlib.sha256(contenido).hexdigest()


def artefacto_por_hash(conn: sqlite3.Connection, session_id: int,
                       h: str) -> Optional[str]:
    """El nombre del artefacto de la sesión con ese hash, si ya existe."""
    r = conn.execute(
        "SELECT nombre FROM ag_artefactos WHERE session_id = ? AND hash = ?",
        (session_id, h)).fetchone()
    return r["nombre"] if r else None


def partir_texto(texto: str, max_bloque: int = MAX_BLOQUE) -> list[str]:
    """Bloques por párrafos, sin cortar ninguno a la mitad salvo que un
    párrafo solo exceda el máximo (port de partirTexto)."""
    bloques, actual = [], ""
    for parrafo in texto.split("\n\n"):
        parrafo = parrafo.strip()
        if not parrafo:
            continue
        if len(parrafo) > max_bloque:
            if actual:
                bloques.append(actual)
                actual = ""
            while len(parrafo) > max_bloque:
                bloques.append(parrafo[:max_bloque])
                parrafo = parrafo[max_bloque:]
        if len(actual) + len(parrafo) + 2 > max_bloque and actual:
            bloques.append(actual)
            actual = parrafo
        else:
            actual = (actual + "\n\n" + parrafo) if actual else parrafo
    if actual:
        bloques.append(actual)
    return bloques


def ingestar_texto(conn: sqlite3.Connection, session_id: int,
                   nombre: str, texto: str, hash: Optional[str] = None) -> dict[str, Any]:
    texto = (texto or "").strip()
    if not texto:
        return {"error": "El documento no trae texto legible"}
    bloques = partir_texto(texto)
    s = Sustrato(conn, session_id)
    art = s.crear_artefacto("nota", nombre, hash=hash)
    frags = s.agregar_fragmentos(art.id, [(i + 1, b) for i, b in enumerate(bloques)])
    return {"artefacto_id": art.id, "nombre": art.nombre, "fragmentos": len(frags)}


# ── OCR (facturas escaneadas / imágenes) ─────────────────────────────
# El sustrato es local-first: el OCR corre con Tesseract DENTRO del
# contenedor — el documento nunca sale a la red. spa+eng cubre facturas MX.
_OCR_LANG = "spa+eng"
_OCR_DPI = 250


def _ocr_paginas_pdf(contenido: bytes, saltar: set[int]) -> list[tuple[int, str]]:
    """Rasteriza el PDF y corre OCR SOLO en las páginas sin capa de texto
    (`saltar` = las que ya trajeron texto). Devuelve [] si faltan los deps de
    OCR o si el render falla — el llamador degrada con gracia."""
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
    except ImportError:
        return []
    try:
        imagenes = convert_from_bytes(contenido, dpi=_OCR_DPI)
    except Exception:
        return []
    out: list[tuple[int, str]] = []
    for i, img in enumerate(imagenes, 1):
        if i in saltar:
            continue
        try:
            texto = pytesseract.image_to_string(img, lang=_OCR_LANG).strip()
        except Exception:
            texto = ""
        if texto:
            out.append((i, texto[:12000]))
    return out


def ingestar_pdf(conn: sqlite3.Connection, session_id: int,
                 nombre: str, contenido: bytes, hash: Optional[str] = None) -> dict[str, Any]:
    """PDF → fragmentos por página, híbrido: usa la capa de texto (pdfplumber,
    rápido) y para las páginas escaneadas (sin texto) cae a OCR (Tesseract).
    Así entran facturas digitales Y escaneadas por igual."""
    try:
        import io

        import pdfplumber
    except ImportError:
        return {"error": "pdfplumber no está disponible en este despliegue"}
    paginas: list[tuple[int, str]] = []
    n_paginas = 0
    try:
        with pdfplumber.open(io.BytesIO(contenido)) as pdf:
            n_paginas = len(pdf.pages)
            for i, pagina in enumerate(pdf.pages):
                texto = (pagina.extract_text() or "").strip()
                if texto:
                    paginas.append((i + 1, texto[:12000]))
    except Exception:
        # un PDF 100% imagen (escaneado) puede fallar en pdfplumber pero SÍ en OCR
        pass
    # OCR de relleno para las páginas sin capa de texto (o el PDF entero)
    if len(paginas) < n_paginas or n_paginas == 0:
        con_texto = {p for p, _ in paginas}
        paginas.extend(_ocr_paginas_pdf(contenido, con_texto))
    if not paginas:
        return {"error": "El PDF no trae texto ni pudo leerse por OCR "
                         "(¿dañado, protegido, o falta Tesseract en el despliegue?)"}
    paginas.sort(key=lambda t: t[0])
    s = Sustrato(conn, session_id)
    art = s.crear_artefacto("pdf", nombre, paginas=len(paginas), hash=hash)
    frags = s.agregar_fragmentos(art.id, paginas)
    return {"artefacto_id": art.id, "nombre": art.nombre, "fragmentos": len(frags)}


def ingestar_imagen(conn: sqlite3.Connection, session_id: int,
                    nombre: str, contenido: bytes, hash: Optional[str] = None) -> dict[str, Any]:
    """Imagen (foto/escaneo de una factura) → OCR (Tesseract) → fragmentos."""
    try:
        import io

        import pytesseract
        from PIL import Image
    except ImportError:
        return {"error": "OCR no disponible (falta Tesseract/Pillow en el despliegue)"}
    try:
        img = Image.open(io.BytesIO(contenido))
    except Exception:
        return {"error": "La imagen no se pudo abrir"}
    try:
        texto = pytesseract.image_to_string(img, lang=_OCR_LANG).strip()
    except Exception:
        texto = ""
    if not texto:
        return {"error": "La imagen no trae texto legible por OCR "
                         "(¿foto borrosa, muy chica, o sin texto?)"}
    bloques = partir_texto(texto)
    s = Sustrato(conn, session_id)
    art = s.crear_artefacto("imagen", nombre, hash=hash)
    frags = s.agregar_fragmentos(art.id, [(i + 1, b) for i, b in enumerate(bloques)])
    return {"artefacto_id": art.id, "nombre": art.nombre, "fragmentos": len(frags)}


def ingestar_tabla(conn: sqlite3.Connection, session_id: int,
                   nombre: str, contenido: bytes, hash: Optional[str] = None) -> dict[str, Any]:
    """Hoja de cálculo (XLS/XLSX/CSV) → bloques de filas como fragmentos
    citables (kind 'estructurado'). Cada bloque cita su hoja y su rango."""
    try:
        import io

        import pandas as pd
    except ImportError:
        return {"error": "pandas no está disponible en este despliegue"}
    bajo = nombre.lower()
    try:
        if bajo.endswith(".csv"):
            hojas = {"csv": pd.read_csv(io.BytesIO(contenido), header=None,
                                        dtype=str, keep_default_na=False)}
        else:
            xls = pd.ExcelFile(io.BytesIO(contenido))
            hojas = {h: xls.parse(h, header=None, dtype=str).fillna("")
                     for h in xls.sheet_names}
    except Exception:
        return {"error": "La hoja de cálculo no se pudo leer (¿formato .xls muy "
                         "antiguo o dañado?)"}
    fragmentos: list[tuple[int, str]] = []
    orden = 0
    for hoja, df in hojas.items():
        filas = ["\t".join(str(c) for c in fila) for fila in df.values.tolist()]
        for i in range(0, len(filas), 40):   # ~40 filas por fragmento
            bloque = f"[{hoja} · filas {i + 1}-{i + len(filas[i:i + 40])}]\n" + \
                     "\n".join(filas[i:i + 40])
            orden += 1
            fragmentos.append((orden, bloque[:12000]))
    if not fragmentos:
        return {"error": "La hoja de cálculo no trae filas legibles"}
    s = Sustrato(conn, session_id)
    art = s.crear_artefacto("estructurado", nombre, hash=hash)
    frags = s.agregar_fragmentos(art.id, fragmentos)
    return {"artefacto_id": art.id, "nombre": art.nombre, "fragmentos": len(frags)}


# Extensiones de imagen: ahora entran por OCR (Tesseract).
_IMAGENES = (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff", ".heic")


def ingestar_archivo(conn: sqlite3.Connection, session_id: int,
                     nombre: str, contenido: bytes) -> dict[str, Any]:
    """Dispatcher por extensión: PDF (con capa de texto y/o escaneado vía OCR),
    texto (txt/md/xml), tabla (xls/xlsx/csv) e imagen (jpg/png… vía OCR).

    Dedupe por contenido: si la sesión ya tiene un artefacto con el mismo
    sha256, se rechaza (evita duplicar fragmentos y contaminar la cobertura)."""
    bajo = nombre.lower()
    h = _hash(contenido)
    ya = artefacto_por_hash(conn, session_id, h)
    if ya:
        return {"duplicado": ya}
    if bajo.endswith(".pdf"):
        return ingestar_pdf(conn, session_id, nombre, contenido, hash=h)
    if bajo.endswith((".txt", ".md", ".xml")):
        return ingestar_texto(conn, session_id, nombre,
                              contenido.decode("utf-8", errors="replace"), hash=h)
    if bajo.endswith((".xls", ".xlsx", ".csv")):
        return ingestar_tabla(conn, session_id, nombre, contenido, hash=h)
    if bajo.endswith(_IMAGENES):
        return ingestar_imagen(conn, session_id, nombre, contenido, hash=h)
    return {"error": f"Formato no soportado: {nombre}. "
                     "Usa PDF, TXT, XML, Excel (xls/xlsx/csv) o imagen (jpg/png)."}


def listar_artefactos(conn: sqlite3.Connection, session_id: int) -> list[dict[str, Any]]:
    """Los artefactos del sustrato con su pulso: fragmentos y entidades
    que los citan (para la bandeja de ingesta)."""
    filas = conn.execute(
        """SELECT a.id, a.kind, a.nombre, a.paginas, a.created_at,
                  COUNT(DISTINCT f.id) AS fragmentos
           FROM ag_artefactos a
           LEFT JOIN ag_fragmentos f ON f.artefacto_id = a.id
           WHERE a.session_id = ?
           GROUP BY a.id ORDER BY a.created_at DESC""",
        (session_id,),
    ).fetchall()
    entidades = conn.execute(
        "SELECT evidencia FROM ag_entidades WHERE session_id = ?", (session_id,)
    ).fetchall()
    frag_a_art = {
        r["id"]: r["artefacto_id"]
        for r in conn.execute(
            "SELECT id, artefacto_id FROM ag_fragmentos WHERE session_id = ?",
            (session_id,),
        )
    }
    import json as _json
    conteo: dict[str, int] = {}
    for e in entidades:
        artes = {frag_a_art.get(fid) for fid in _json.loads(e["evidencia"] or "[]")}
        for aid in artes:
            if aid:
                conteo[aid] = conteo.get(aid, 0) + 1
    return [{**dict(f), "entidades": conteo.get(f["id"], 0),
             # fría: tiene fragmentos pero ninguna entidad la cita (señal C5)
             "fria": bool(f["fragmentos"]) and conteo.get(f["id"], 0) == 0}
            for f in filas]
