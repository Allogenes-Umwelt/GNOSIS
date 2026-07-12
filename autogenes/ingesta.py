"""Ingesta de documentos al sustrato — el artefacto y sus fragmentos.

Un documento entra como Artefacto y su texto se parte en Fragmentos
(la unidad de procedencia): PDFs por página (pdfplumber — el stack que
GNOSIS ya usa), texto plano por bloques de párrafos. Todo pasa por
Sustrato — bitácora incluida.
"""
import sqlite3
from typing import Any

from autogenes.sustrato import Sustrato

MAX_BLOQUE = 1600


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
                   nombre: str, texto: str) -> dict[str, Any]:
    texto = (texto or "").strip()
    if not texto:
        return {"error": "El documento no trae texto legible"}
    bloques = partir_texto(texto)
    s = Sustrato(conn, session_id)
    art = s.crear_artefacto("nota", nombre)
    frags = s.agregar_fragmentos(art.id, [(i + 1, b) for i, b in enumerate(bloques)])
    return {"artefacto_id": art.id, "nombre": art.nombre, "fragmentos": len(frags)}


def ingestar_pdf(conn: sqlite3.Connection, session_id: int,
                 nombre: str, contenido: bytes) -> dict[str, Any]:
    try:
        import io

        import pdfplumber
    except ImportError:
        return {"error": "pdfplumber no está disponible en este despliegue"}
    paginas: list[tuple[int, str]] = []
    try:
        with pdfplumber.open(io.BytesIO(contenido)) as pdf:
            for i, pagina in enumerate(pdf.pages):
                texto = (pagina.extract_text() or "").strip()
                if texto:
                    paginas.append((i + 1, texto[:12000]))
    except Exception:
        return {"error": "El PDF no se pudo leer — ¿está dañado o es imagen?"}
    if not paginas:
        return {"error": "El PDF no trae texto extraíble (puede ser escaneado)"}
    s = Sustrato(conn, session_id)
    art = s.crear_artefacto("pdf", nombre, paginas=len(paginas))
    frags = s.agregar_fragmentos(art.id, paginas)
    return {"artefacto_id": art.id, "nombre": art.nombre, "fragmentos": len(frags)}


def ingestar_tabla(conn: sqlite3.Connection, session_id: int,
                   nombre: str, contenido: bytes) -> dict[str, Any]:
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
    art = s.crear_artefacto("estructurado", nombre)
    frags = s.agregar_fragmentos(art.id, fragmentos)
    return {"artefacto_id": art.id, "nombre": art.nombre, "fragmentos": len(frags)}


# Extensiones de imagen: rechazadas por ahora (falta OCR para sacar texto).
_IMAGENES = (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff", ".heic")


def ingestar_archivo(conn: sqlite3.Connection, session_id: int,
                     nombre: str, contenido: bytes) -> dict[str, Any]:
    """Dispatcher por extensión: PDF, texto (txt/md/xml), tabla (xls/xlsx/
    csv). Las imágenes se rechazan con mensaje claro (sin OCR aún)."""
    bajo = nombre.lower()
    if bajo.endswith(".pdf"):
        return ingestar_pdf(conn, session_id, nombre, contenido)
    if bajo.endswith((".txt", ".md", ".xml")):
        return ingestar_texto(conn, session_id, nombre,
                              contenido.decode("utf-8", errors="replace"))
    if bajo.endswith((".xls", ".xlsx", ".csv")):
        return ingestar_tabla(conn, session_id, nombre, contenido)
    if bajo.endswith(_IMAGENES):
        return {"error": "Las imágenes aún no se ingieren (falta OCR). "
                         "Usa PDF, texto o Excel."}
    return {"error": f"Formato no soportado: {nombre}. "
                     "Usa PDF, TXT, XML o Excel (xls/xlsx/csv)."}


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
    return [{**dict(f), "entidades": conteo.get(f["id"], 0)} for f in filas]
