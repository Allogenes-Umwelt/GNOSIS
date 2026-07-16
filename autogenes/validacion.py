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

# ISO 3779 excluye I, O, Q del VIN (para no confundir con 1 y 0)
_VIN_PROHIBIDOS = frozenset("IOQ")

# catálogo ISO 4217 acotado al dominio: MXN/USD/EUR/GBP observados en la
# extracción real, más las divisas mayores y las europeas de la flota
# VW-grupo. Método declarado: un código fuera de este conjunto se marca para
# REVISIÓN, no se rechaza — suele ser extracción fallida (p. ej. el centinela
# 'No se encontro coincidencia' que emite PDFs_v2).
_MONEDAS_ISO = frozenset({
    "MXN", "USD", "EUR", "GBP", "JPY", "CAD", "CHF", "CNY",
    "CZK", "HUF", "PLN", "SEK", "DKK", "NOK", "BRL", "INR", "ZAR", "ARS",
})


def severidad_regla(clave: str) -> str:
    """Clasificación FIJA de severidad de una regla: preferencia contra la
    norma es exposición arancelaria (danger, glosa segura); el resto son
    huecos de estructura/catálogo a reparar (warn). Nunca un monto estimado.
    Fuente única: la proyección del grafo la importa de aquí."""
    return "danger" if "jn-norma" in clave else "warn"


# O5.3 — el veredicto en capas (mapeo del operador, aprobado). Las reglas
# 'observado' son sospechas a revisar (fecha, ceros fabricados, VIN con I/O/Q,
# moneda fuera de catálogo, VIN de largo ≠ 17); TODA otra regla violada es
# 'rechazado' = glosa segura (obligatorios ausentes, sin catálogo, país fuera
# de catálogo, preferencia contra la norma). Eje distinto de `severidad_regla`
# (que colorea el grafo): aquí clasificamos la CAPA del lattice, no el nodo.
_OBSERVADO = frozenset({
    "val-dwh-fecha",
    "val-dwh-precio-cero", "val-pdf-importe-cero",
    "val-dwh-vin-chars", "val-pdf-vin-chars",
    "val-pdf-moneda-cat",
    "val-dwh-vin17", "val-pdf-vin17",
})


def veredicto_regla(clave: str) -> str:
    """La capa del veredicto de una regla (O5.3): 'observado' si es una
    sospecha a revisar, 'rechazado' si es glosa segura. Fija y pura: una
    fila hereda el PEOR veredicto de las reglas que la capturan."""
    return "observado" if clave in _OBSERVADO else "rechazado"


def _vacio(v: Any) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def validar(conn: sqlite3.Connection, session_id: int,
            tope: int = MAX_REFS, con_particion: bool = False) -> dict[str, Any]:
    """El estado de conformidad de la sesión: todas las reglas evaluadas
    (violadas o no), ordenadas por violaciones, y el porcentaje de filas
    plenamente conformes por fuente. `tope` acota refs por regla (el
    certificado pide más); `con_particion` agrega la partición del
    universo DWH por ids de fila (la pide SINAPSIS, no el API)."""
    dwh = conn.execute(
        "SELECT id, chasis, factura, precio, fecha_factura, j_y_n, pais_code,"
        " catalogo_id FROM importaciones WHERE session_id = ? ORDER BY id",
        (session_id,)).fetchall()
    pdf = conn.execute(
        "SELECT id, chasis, factura, amount, moneda, j_y_n, pais_code, filename"
        " FROM extraccion_facturas WHERE session_id = ? ORDER BY id",
        (session_id,)).fetchall()
    paises = {r[0] for r in conn.execute("SELECT codigo FROM paises")}

    reglas: list[dict[str, Any]] = []
    malas_dwh: set[int] = set()
    malas_pdf: set[int] = set()
    ids_por_regla: dict[str, set[int]] = {}

    def regla(clave: str, titulo: str, norma: str, fuente: str,
              filas: list[sqlite3.Row], viola, ref) -> None:
        """Evalúa `viola(fila)` sobre todas las filas; registra refs y
        marca las filas violadoras para la conformidad global."""
        v = [r for r in filas if viola(r)]
        marca = malas_dwh if fuente == "dwh" else malas_pdf
        marca.update(r["id"] for r in v)
        ids_por_regla[clave] = {r["id"] for r in v}
        reglas.append({
            "clave": clave,
            "titulo": titulo,
            "norma": norma,
            "fuente": fuente,
            "veredicto": veredicto_regla(clave),
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

    # ── ola 2: fecha de factura malformada (formato documentado DDMMYY) ─
    def fecha_mala(r: sqlite3.Row) -> bool:
        f = (r["fecha_factura"] or "").strip()
        if not f:
            return False                    # ausente no se penaliza aquí
        if not (len(f) == 6 and f.isdigit()):
            return True
        dia, mes = int(f[0:2]), int(f[2:4])
        return not (1 <= dia <= 31 and 1 <= mes <= 12)

    regla("val-dwh-fecha", "Fecha de factura malformada en DWH",
          "La fecha de factura sigue el formato DDMMYY (6 dígitos, día 01-31 "
          "y mes 01-12) que el pipeline declara; otra cosa es dato sucio.",
          "dwh", dwh, fecha_mala, ref_dwh)

    # ── ola 2: ceros fabricados / slices de precio vacíos ────────────
    from autogenes.concilia import parse_monto
    regla("val-dwh-precio-cero", "Precio en cero en DWH",
          "Un precio de 0 es un campo de precio VACÍO en el DWH, no un auto "
          "que valga cero — se revisa, no se monetiza.",
          "dwh", dwh, lambda r: r["precio"] == 0, ref_dwh)
    regla("val-pdf-importe-cero", "Importe fabricado en cero en factura",
          "Un importe que extrae exactamente 0 es fabricación de la extracción "
          "('0,00' cuando el precio no casa) — no un importe real de $0.",
          "pdf", pdf, lambda r: parse_monto(r["amount"]) == 0, ref_pdf)

    # ── ola 2: VIN con caracteres prohibidos (ISO 3779: sin I, O, Q) ──
    def vin_chars_malo(r: sqlite3.Row) -> bool:
        c = (r["chasis"] or "").strip().upper()
        return len(c) == LARGO_VIN and bool(set(c) & _VIN_PROHIBIDOS)

    norma_vin_chars = ("Un VIN válido no contiene I, O ni Q (ISO 3779 los "
                       "excluye para no confundir con 1 y 0); su presencia en "
                       "un VIN de largo correcto suele ser error de OCR.")
    regla("val-dwh-vin-chars", "VIN con caracteres prohibidos en DWH",
          norma_vin_chars, "dwh", dwh, vin_chars_malo, ref_dwh)
    regla("val-pdf-vin-chars", "VIN con caracteres prohibidos en factura",
          norma_vin_chars, "pdf", pdf, vin_chars_malo, ref_pdf)

    # ── ola 2: moneda fuera de catálogo ISO 4217 ─────────────────────
    def moneda_mala(r: sqlite3.Row) -> bool:
        m = (r["moneda"] or "").strip().upper()
        return bool(m) and m not in _MONEDAS_ISO

    regla("val-pdf-moneda-cat", "Moneda fuera de catálogo en factura",
          "La moneda debe ser un código ISO 4217 conocido del dominio "
          "(MXN, USD, EUR, GBP…); fuera de catálogo suele ser extracción "
          "fallida (p. ej. el centinela 'No se encontro coincidencia').",
          "pdf", pdf, moneda_mala, ref_pdf)

    reglas.sort(key=lambda r: (-r["n"], r["clave"]))
    total_filas = len(dwh) + len(pdf)
    conformes = total_filas - len(malas_dwh) - len(malas_pdf)

    # descomposición del veredicto por riel: cada fila cuenta UNA vez, en su
    # PEOR capa (rechazado manda sobre observado). Alimenta el flujo del
    # lattice (base → base-rechazado → conformes) y la retícula. Determinista.
    dwh_ids = {r["id"] for r in dwh}
    pdf_ids = {r["id"] for r in pdf}
    rech_dwh: set[int] = set()
    rech_pdf: set[int] = set()
    for rg in reglas:
        if rg["veredicto"] != "rechazado":
            continue
        pool = rech_dwh if rg["fuente"] == "dwh" else rech_pdf
        pool.update(ids_por_regla.get(rg["clave"], set()))

    def _capa(base_ids: set[int], malas: set[int], rech: set[int]) -> dict:
        rech = rech & malas                 # defensivo: rechazado ⊆ no-conforme
        return {"base": len(base_ids),
                "rechazado": len(rech),
                "observado": len(malas - rech),
                "pasa": len(base_ids - malas)}

    conf_dwh = _capa(dwh_ids, malas_dwh, rech_dwh)
    conf_pdf = _capa(pdf_ids, malas_pdf, rech_pdf)

    salida = {
        "session_id": session_id,
        "reglas": reglas,
        "total_violaciones": sum(r["n"] for r in reglas),
        "filas": {"dwh": len(dwh), "pdf": len(pdf)},
        "filas_no_conformes": {"dwh": len(malas_dwh), "pdf": len(malas_pdf)},
        "conformidad_pct": (round(100 * conformes / total_filas)
                            if total_filas else None),
        # O5.4: la conformidad por riel y la retícula (una celda por fila,
        # coloreada por su peor veredicto). pasa == conformes por construcción.
        "conformidad": {"dwh": conf_dwh, "pdf": conf_pdf},
        "reticula": {
            "pasa": conf_dwh["pasa"] + conf_pdf["pasa"],
            "observado": conf_dwh["observado"] + conf_pdf["observado"],
            "rechazado": conf_dwh["rechazado"] + conf_pdf["rechazado"],
            "total": total_filas,
        },
    }
    if con_particion:
        # la partición VALIDACIÓN del universo DWH (para SINAPSIS): cada
        # fila en UNA celda — contra_norma manda sobre otra_violacion
        contra_norma = ids_por_regla.get("val-dwh-jn-norma", set())
        otra = malas_dwh - contra_norma
        todos = {r["id"] for r in dwh}
        salida["particion_dwh"] = {
            "contra_norma": sorted(contra_norma),
            "otra_violacion": sorted(otra),
            "conformes": sorted(todos - malas_dwh),
        }
    return salida


# ── ola 2: el expediente certificado por sesión ──────────────────────

TOPE_CERTIFICADO = 2000


def dockear_certificado(conn: sqlite3.Connection,
                        session_id: int) -> dict[str, Any]:
    """Dockea el estado de conformidad COMPLETO como Producto{informe,
    unidad validacion} — el expediente certificado: todas las reglas con
    todas sus filas violadoras (sin tope), listo para glosa externa. El
    motor se re-ejecuta aquí: certifica el estado vivo. Cita filas
    aduanales, no fragmentos: evidencia vacía, jamás fabricada."""
    from autogenes.sustrato import Sustrato

    from autogenes.sello import sellar

    r = validar(conn, session_id, tope=TOPE_CERTIFICADO)
    if not r["filas"]["dwh"] and not r["filas"]["pdf"]:
        return {"error": "La sesión no tiene filas que certificar"}

    pct = r["conformidad_pct"]
    r["sello"] = sellar(r)               # integridad re-derivable (C1-lite)
    producto = Sustrato(conn, session_id).dockear_producto(
        clase="informe",
        titulo=f"Certificado de conformidad — {pct}%",
        unidad="validacion",
        cuerpo=r,
        entidades=[],
        evidencia=[],
    )
    return {"session_id": session_id, "producto": producto.model_dump()}
