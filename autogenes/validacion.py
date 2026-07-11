"""VALIDACIÓN (F10) — la glosa preventiva: conformidad de cada fila
contra la norma, ANTES de que el SAT la encuentre.

Cada regla es determinista y se evalúa sobre TODAS las filas de su
fuente; una regla sin violaciones se reporta con n=0 — la conformidad
plena es un hecho que se muestra, no un renglón que se omite.

Reglas de estructura: campos obligatorios presentes (DWH y PDF), VIN de
17 caracteres (norma ISO 3779), fila DWH anclada a catálogo.
Reglas de catálogo: país declarado existe en el catálogo de países.
Reglas de negocio (norma documentada del dominio): BRA no aplica
preferencia (C.O + BRA = N) e IND no aplica (CUPO + IND = N) — ambas
verificables solo con país + J/N. La regla «C.O + USA = J» NO se evalúa:
exigiría comprobar la presencia del certificado de origen, que no está
en estas tablas; validar sin poder verificar la premisa sería ruido.

`conformidad_pct` = filas sin una sola violación / filas totales.
Todo es lectura pura; no hay modelo ni escritura.
"""
import sqlite3
from typing import Any

MAX_REFS = 12
LARGO_VIN = 17

# campos obligatorios por fuente: (columna, etiqueta)
_OBLIGATORIOS_DWH = [("chasis", "chasis"), ("factura", "factura"),
                     ("precio", "precio"), ("j_y_n", "preferencia J/N"),
                     ("pais_code", "país de origen")]
_OBLIGATORIOS_PDF = [("chasis", "chasis"), ("factura", "factura"),
                     ("amount", "importe"), ("moneda", "moneda")]

# norma de negocio verificable: país -> J/N obligado
_JN_POR_PAIS = {"BRA": "N", "IND": "N"}


def _vacio(v: Any) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def validar(conn: sqlite3.Connection, session_id: int,
            tope: int = MAX_REFS) -> dict[str, Any]:
    """El estado de conformidad de la sesión: todas las reglas evaluadas
    (violadas o no), ordenadas por violaciones, y el porcentaje de filas
    plenamente conformes por fuente. `tope` acota refs por regla (el
    certificado pide más); el conteo siempre cubre el total."""
    dwh = conn.execute(
        "SELECT id, chasis, factura, precio, j_y_n, pais_code, catalogo_id"
        " FROM importaciones WHERE session_id = ? ORDER BY id",
        (session_id,)).fetchall()
    pdf = conn.execute(
        "SELECT id, chasis, factura, amount, moneda, j_y_n, pais_code, filename"
        " FROM extraccion_facturas WHERE session_id = ? ORDER BY id",
        (session_id,)).fetchall()
    paises = {r[0] for r in conn.execute("SELECT codigo FROM paises")}

    reglas: list[dict[str, Any]] = []
    malas_dwh: set[int] = set()
    malas_pdf: set[int] = set()

    def regla(clave: str, titulo: str, norma: str, fuente: str,
              filas: list[sqlite3.Row], viola, ref) -> None:
        """Evalúa `viola(fila)` sobre todas las filas; registra refs y
        marca las filas violadoras para la conformidad global."""
        v = [r for r in filas if viola(r)]
        marca = malas_dwh if fuente == "dwh" else malas_pdf
        marca.update(r["id"] for r in v)
        reglas.append({
            "clave": clave,
            "titulo": titulo,
            "norma": norma,
            "fuente": fuente,
            "base": len(filas),
            "n": len(v),
            "refs": [ref(r) for r in v[:tope]],
        })

    def ref_dwh(r: sqlite3.Row) -> dict:
        return {"chasis": r["chasis"], "factura": r["factura"]}

    def ref_pdf(r: sqlite3.Row) -> dict:
        return {"chasis": r["chasis"], "factura": r["factura"],
                "filename": r["filename"]}

    # ── estructura: obligatorios ─────────────────────────────────────
    for col, etiqueta in _OBLIGATORIOS_DWH:
        regla(f"val-dwh-{col}", f"DWH sin {etiqueta}",
              f"Toda fila vendida debe declarar {etiqueta}.",
              "dwh", dwh, lambda r, c=col: _vacio(r[c]), ref_dwh)
    for col, etiqueta in _OBLIGATORIOS_PDF:
        regla(f"val-pdf-{col}", f"Factura sin {etiqueta}",
              f"Toda factura extraída debe declarar {etiqueta}.",
              "pdf", pdf, lambda r, c=col: _vacio(r[c]), ref_pdf)

    # ── estructura: VIN 17 (ISO 3779) y ancla a catálogo ─────────────
    def vin_malo(r: sqlite3.Row) -> bool:
        c = (r["chasis"] or "").strip()
        return bool(c) and len(c) != LARGO_VIN

    regla("val-dwh-vin17", "VIN malformado en DWH",
          f"Un VIN tiene {LARGO_VIN} caracteres (ISO 3779).",
          "dwh", dwh, vin_malo, ref_dwh)
    regla("val-pdf-vin17", "VIN malformado en factura",
          f"Un VIN tiene {LARGO_VIN} caracteres (ISO 3779).",
          "pdf", pdf, vin_malo, ref_pdf)
    regla("val-dwh-catalogo", "DWH sin catálogo",
          "Toda fila vendida debe anclar a un modelo del catálogo.",
          "dwh", dwh, lambda r: r["catalogo_id"] is None, ref_dwh)

    # ── catálogo: país declarado existe ──────────────────────────────
    def pais_malo(r: sqlite3.Row) -> bool:
        p = (r["pais_code"] or "").strip()
        return bool(p) and p.upper() not in paises

    regla("val-dwh-pais", "País desconocido en DWH",
          "El país declarado debe existir en el catálogo de países.",
          "dwh", dwh, pais_malo, ref_dwh)
    regla("val-pdf-pais", "País desconocido en factura",
          "El país declarado debe existir en el catálogo de países.",
          "pdf", pdf, pais_malo, ref_pdf)

    # ── negocio: J/N obligado por país (norma documentada) ───────────
    def jn_contra_norma(r: sqlite3.Row) -> bool:
        p = (r["pais_code"] or "").strip().upper()
        jn = (r["j_y_n"] or "").strip().upper()
        return p in _JN_POR_PAIS and bool(jn) and jn != _JN_POR_PAIS[p]

    norma_jn = ("C.O + BRA = N y CUPO + IND = N: esos orígenes no aplican "
                "preferencia; un J ahí es glosa segura.")
    regla("val-dwh-jn-norma", "Preferencia contra la norma en DWH",
          norma_jn, "dwh", dwh, jn_contra_norma, ref_dwh)
    regla("val-pdf-jn-norma", "Preferencia contra la norma en factura",
          norma_jn, "pdf", pdf, jn_contra_norma, ref_pdf)

    reglas.sort(key=lambda r: (-r["n"], r["clave"]))
    total_filas = len(dwh) + len(pdf)
    conformes = total_filas - len(malas_dwh) - len(malas_pdf)
    return {
        "session_id": session_id,
        "reglas": reglas,
        "total_violaciones": sum(r["n"] for r in reglas),
        "filas": {"dwh": len(dwh), "pdf": len(pdf)},
        "filas_no_conformes": {"dwh": len(malas_dwh), "pdf": len(malas_pdf)},
        "conformidad_pct": (round(100 * conformes / total_filas)
                            if total_filas else None),
    }


# ── ola 2: el expediente certificado por sesión ──────────────────────

TOPE_CERTIFICADO = 2000


def dockear_certificado(conn: sqlite3.Connection,
                        session_id: int) -> dict[str, Any]:
    """Dockea el estado de conformidad COMPLETO como Producto{informe,
    unidad validacion} — el expediente certificado: las 16 reglas con
    todas sus filas violadoras (sin tope), listo para glosa externa. El
    motor se re-ejecuta aquí: certifica el estado vivo. Cita filas
    aduanales, no fragmentos: evidencia vacía, jamás fabricada."""
    from autogenes.sustrato import Sustrato

    r = validar(conn, session_id, tope=TOPE_CERTIFICADO)
    if not r["filas"]["dwh"] and not r["filas"]["pdf"]:
        return {"error": "La sesión no tiene filas que certificar"}

    pct = r["conformidad_pct"]
    producto = Sustrato(conn, session_id).dockear_producto(
        clase="informe",
        titulo=f"Certificado de conformidad — {pct}%",
        unidad="validacion",
        cuerpo=r,
        entidades=[],
        evidencia=[],
    )
    return {"session_id": session_id, "producto": producto.model_dump()}
