"""Ingesta por goteo de un ZIP grande — staging en disco + manifiesto.

Un ZIP mensual de facturas trae miles de PDFs. Procesarlos en un solo
request bloquea un worker y rebasa el timeout de gunicorn: el request muere
y la carga "se congela". Aquí el ZIP se EXPANDE a un directorio de staging
(streaming a disco, sin cargar todo en RAM) y un manifiesto lleva el estado
de cada entrada; luego el cliente pide TANDAS acotadas por tiempo, así
ningún request se acerca al timeout y el progreso es real.

La reanudación es gratis: cada archivo se ingiere atómicamente (Sustrato)
y el dedupe por contenido salta lo ya dockeado, así que reprocesar una
tanda a medias no duplica nada. El manifiesto es bookkeeping transitorio
del staging (como uploads/), NO verdad del sustrato: ningún ag_* se escribe
fuera de Sustrato.
"""
import json
import os
import re
import shutil
import time
import uuid
import zipfile
from typing import Any, Optional

from werkzeug.utils import secure_filename

from autogenes.ingesta import ingestar_archivo

STAGING_DIRNAME = "ingesta_lotes"
# El ARCHIVO lo acota MAX_CONTENT_LENGTH; esto acota lo DESCOMPRIMIDO (un zip
# bomba de 50 MB expande a gigabytes y llena el disco).
MAX_UNZIPPED_BYTES = 2 * 1024 * 1024 * 1024   # 2 GB (igual que app._extraer_zip_seguro)
MAX_ENTRADAS = 50_000                          # tope sano de nº de archivos por lote
TANDA_SEGUNDOS = 4.0                            # presupuesto de tiempo por tanda
TANDA_MAX = 300                                 # tope duro de archivos por tanda

_LOTE_ID = re.compile(r"^[0-9a-f]{32}$")        # uuid4().hex — nada de traversal


class LoteError(Exception):
    """Fallo de negocio al expandir/procesar un lote (mapea a 4xx)."""


# ── rutas de staging (a prueba de traversal / fuga de sesión) ─────────

def _staging_base(base_dir: str) -> str:
    return os.path.join(base_dir, STAGING_DIRNAME)


def _lote_dir(base_dir: str, session_id: int, lote_id: str) -> str:
    if not _LOTE_ID.match(lote_id or ""):
        raise LoteError("Identificador de lote inválido")
    d = os.path.join(_staging_base(base_dir), str(int(session_id)), lote_id)
    # el path resuelto debe seguir colgando de la base de staging
    raiz = os.path.realpath(_staging_base(base_dir))
    if os.path.commonpath([raiz, os.path.realpath(d)]) != raiz:
        raise LoteError("Ruta de lote fuera del área de staging")
    return d


def _manifiesto_path(lote_dir: str) -> str:
    return os.path.join(lote_dir, "_manifiesto.json")


def _leer_manifiesto(lote_dir: str) -> dict[str, Any]:
    try:
        with open(_manifiesto_path(lote_dir), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as e:
        raise LoteError("El lote no existe o su manifiesto está dañado") from e


def _escribir_manifiesto(lote_dir: str, man: dict[str, Any]) -> None:
    # escritura atómica: si el proceso muere a mitad, el manifiesto viejo
    # sobrevive intacto (y el dedupe corrige cualquier desfase al reanudar).
    tmp = _manifiesto_path(lote_dir) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(man, fh, ensure_ascii=False)
    os.replace(tmp, _manifiesto_path(lote_dir))


def _resumen(man: dict[str, Any]) -> dict[str, Any]:
    est = [e["estado"] for e in man["entradas"]]
    pend = est.count("pendiente")
    return {
        "lote_id": man["lote_id"],
        "total": man["total"],
        "ingeridos": est.count("ok"),
        "duplicados": est.count("dup"),
        "errores": est.count("error"),
        "pendientes": pend,
        "fragmentos": man.get("fragmentos", 0),
        "done": pend == 0,
    }


# ── expandir un ZIP a staging ────────────────────────────────────────

def _nombre_unico(usados: set[str], crudo: str) -> Optional[str]:
    """secure_filename del basename, con sufijo si colisiona (dos entradas
    en carpetas distintas pueden reducirse al mismo nombre seguro)."""
    base = secure_filename((crudo or "").split("/")[-1])
    if not base:
        return None
    nombre = base
    i = 1
    while nombre in usados:
        raiz, ext = os.path.splitext(base)
        nombre = f"{raiz}__{i}{ext}"
        i += 1
    usados.add(nombre)
    return nombre


def expandir_zip(base_dir: str, session_id: int, zip_path: str) -> dict[str, Any]:
    """Valida y expande el ZIP a un directorio de staging con manifiesto.
    NO procesa nada — devuelve {lote_id, total, ...}. El caller pide tandas."""
    try:
        zf = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as e:
        raise LoteError("El ZIP está dañado") from e
    with zf:
        entradas = [
            info for info in zf.infolist()
            if not info.is_dir() and not info.filename.startswith("__MACOSX")
            and secure_filename(info.filename.split("/")[-1])
        ]
        if not entradas:
            raise LoteError("El ZIP no trae archivos legibles")
        if len(entradas) > MAX_ENTRADAS:
            raise LoteError(f"El ZIP trae {len(entradas)} archivos, supera el "
                            f"tope de {MAX_ENTRADAS} por lote")
        total_crudo = sum(info.file_size for info in entradas)
        if total_crudo > MAX_UNZIPPED_BYTES:
            raise LoteError(
                f"El ZIP se expande a {total_crudo // (1024*1024)} MB, supera el "
                f"tope de {MAX_UNZIPPED_BYTES // (1024*1024*1024)} GB")

        lote_id = uuid.uuid4().hex
        lote_dir = _lote_dir(base_dir, session_id, lote_id)
        os.makedirs(lote_dir, exist_ok=True)
        usados: set[str] = set()
        man_entradas = []
        for info in entradas:
            nombre = _nombre_unico(usados, info.filename)
            if not nombre:
                continue
            # streaming a disco: nunca el archivo entero en RAM
            with zf.open(info) as src, open(os.path.join(lote_dir, nombre), "wb") as dst:
                shutil.copyfileobj(src, dst, length=1024 * 256)
            man_entradas.append({"archivo": nombre, "estado": "pendiente"})

    man = {"lote_id": lote_id, "session_id": int(session_id),
           "total": len(man_entradas), "fragmentos": 0, "entradas": man_entradas}
    _escribir_manifiesto(lote_dir, man)
    return _resumen(man)


# ── procesar la siguiente tanda (acotada por tiempo) ─────────────────

def procesar_tanda(conn, base_dir: str, session_id: int, lote_id: str,
                   segundos: float = TANDA_SEGUNDOS,
                   max_entradas: int = TANDA_MAX) -> dict[str, Any]:
    """Ingiere las entradas pendientes hasta agotar el presupuesto de tiempo
    (o el tope de la tanda). Devuelve el progreso; al terminar, borra el
    staging. Reanudable: una entrada ya ingerida por una corrida previa cae
    en dedupe (dup) sin duplicar fragmentos."""
    lote_dir = _lote_dir(base_dir, session_id, lote_id)
    man = _leer_manifiesto(lote_dir)
    t0 = time.monotonic()
    hechos = 0
    for entrada in man["entradas"]:
        if entrada["estado"] != "pendiente":
            continue
        if hechos >= max_entradas or (hechos and time.monotonic() - t0 > segundos):
            break
        ruta = os.path.join(lote_dir, entrada["archivo"])
        try:
            with open(ruta, "rb") as fh:
                contenido = fh.read()
            r = ingestar_archivo(conn, session_id, entrada["archivo"], contenido)
            if "duplicado" in r:
                entrada["estado"] = "dup"
            elif "error" in r:
                entrada["estado"] = "error"
                entrada["detalle"] = r["error"]
            else:
                entrada["estado"] = "ok"
                man["fragmentos"] = man.get("fragmentos", 0) + r.get("fragmentos", 0)
        except Exception as e:   # noqa: BLE001 — una entrada mala no tumba la tanda
            entrada["estado"] = "error"
            entrada["detalle"] = str(e)
        hechos += 1

    _escribir_manifiesto(lote_dir, man)
    resumen = _resumen(man)
    if resumen["done"]:
        shutil.rmtree(lote_dir, ignore_errors=True)
    return resumen


def descartar(base_dir: str, session_id: int, lote_id: str) -> None:
    """Tira el staging de un lote (cancelación/limpieza). Idempotente."""
    shutil.rmtree(_lote_dir(base_dir, session_id, lote_id), ignore_errors=True)
