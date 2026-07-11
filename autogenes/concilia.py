"""CONCILIA (F9) — el motor de hallazgos de la conciliación tri-fuente.

La conciliación MISMA no se recalcula aquí: el pipeline legado
(concentrado2) ya casó DWH ↔ facturas PDF y sus verdictos viven en
SQLite (importaciones, extraccion_facturas, facturas_faltantes,
facturas_errores). Este motor lee esas discrepancias materializadas y
las convierte en HALLAZGOS tipados, monetizados y referenciados:

- vendido_sin_llegada: filas DWH sin factura física que las ampare.
- llegado_sin_venta: facturas físicas que nada vendido cita (por moneda;
  los montos NUNCA se convierten entre monedas — se reportan por divisa).
- jn_en_disputa / pais_en_disputa: pares conciliados donde las dos
  fuentes afirman preferencia arancelaria o país distintos.
- vin_duplicado_dwh / vin_duplicado_llegadas: el mismo chasis más de
  una vez en una fuente.
- sin_pedimento: vendido sin declaración aduanal vinculada.
- extraccion_fallida: PDFs ilegibles — las llegadas pueden estar
  subcontadas, y eso se dice.

Regla de casamiento: chasis igual + prefijo de factura (8) igual — la
MISMA regla que usa la proyección del grafo (proyeccion.construir_grafo),
para que CONCILIA y el grafo nunca se contradigan.

Monetización honesta: `monto` es la suma de precios/importes REALES de
las unidades afectadas (valor en riesgo), en su moneda; las unidades sin
precio legible se cuentan y se declaran, jamás se estiman. El agregado
`valor_en_riesgo_mxn` cuenta cada unidad DWH una sola vez aunque
aparezca en varios hallazgos (J/N y país en disputa a la vez no duplican
su valor). Todo es lectura pura y determinista; no hay modelo ni
escritura.
"""
import sqlite3
from typing import Any, Optional

MAX_UNIDADES = 12
MAX_REFS = 12

# la regla de casamiento compartida con proyeccion.construir_grafo
_JOIN_PAR = (
    " ef.session_id = i.session_id"
    " AND ef.chasis = i.chasis"
    " AND i.chasis IS NOT NULL AND i.chasis != ''"
    " AND SUBSTR(ef.factura, 1, 8) = SUBSTR(i.factura, 1, 8)"
)


def parse_monto(texto: Optional[str]) -> Optional[float]:
    """Importe de factura (TEXT) -> float. Tolera separador de miles con
    coma y espacios; lo ilegible es None — nunca se adivina."""
    if texto is None:
        return None
    limpio = str(texto).strip().replace(",", "").replace(" ", "")
    if not limpio:
        return None
    try:
        return float(limpio)
    except ValueError:
        return None


def _hallazgo(clave: str, clase: str, titulo: str, detalle: str,
              monto: Optional[float], moneda: Optional[str],
              unidades: list[str], refs: list[dict]) -> dict[str, Any]:
    return {
        "clave": clave,
        "clase": clase,
        "titulo": titulo,
        "detalle": detalle,
        "monto": round(monto, 2) if monto is not None else None,
        "moneda": moneda if monto is not None else None,
        "n_unidades": len(unidades),
        "unidades": unidades[:MAX_UNIDADES],
        "refs": refs[:MAX_REFS],
    }


def _mxn(filas: list[sqlite3.Row]) -> tuple[Optional[float], int]:
    """Suma de precios DWH (MXN) presentes + cuántas unidades no lo tienen."""
    con_precio = [r["precio"] for r in filas if r["precio"] is not None]
    sin = len(filas) - len(con_precio)
    return (sum(con_precio) if con_precio else None), sin


def _nota_sin_precio(n: int) -> str:
    if n == 0:
        return ""
    plural = "unidad sin precio" if n == 1 else "unidades sin precio"
    return f" {n} {plural} en el DWH: su valor no se estima."


def _n(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def conciliar(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """El estado de conciliación de la sesión: flujo tri-fuente +
    hallazgos ordenados por valor en riesgo (monto desc, None al final)."""
    filas = conn.execute(
        f"SELECT i.id, i.chasis, i.factura, i.precio, i.j_y_n, i.pais_code,"
        f"       i.pedimento_id,"
        f"       ef.id AS ef_id, ef.j_y_n AS ef_jn, ef.pais_code AS ef_pais,"
        f"       ef.filename, ef.factura AS ef_factura"
        f" FROM importaciones i"
        f" LEFT JOIN extraccion_facturas ef ON{_JOIN_PAR}"
        f" WHERE i.session_id = ? ORDER BY i.id",
        (session_id,),
    ).fetchall()

    # una fila DWH puede casar con varias llegadas (duplicados): para los
    # detectores por unidad se cuenta cada importación UNA vez
    por_importacion: dict[int, list[sqlite3.Row]] = {}
    for r in filas:
        por_importacion.setdefault(r["id"], []).append(r)

    no_casadas = [pares[0] for pares in por_importacion.values()
                  if pares[0]["ef_id"] is None]
    casadas = [pares[0] for pares in por_importacion.values()
               if pares[0]["ef_id"] is not None]

    ef_casadas = {r["ef_id"] for r in filas if r["ef_id"] is not None}
    llegadas = conn.execute(
        "SELECT id, chasis, factura, amount, moneda, filename"
        " FROM extraccion_facturas WHERE session_id = ? ORDER BY id",
        (session_id,),
    ).fetchall()
    llegadas_sueltas = [r for r in llegadas if r["id"] not in ef_casadas]

    hallazgos: list[dict[str, Any]] = []
    # valor en riesgo MXN por unidad DISTINTA: una unidad en dos hallazgos
    # (p. ej. J/N y país en disputa) cuenta UNA vez en el agregado
    riesgo_por_unidad: dict[int, float] = {}

    def _al_riesgo(filas_dwh: list[sqlite3.Row]) -> None:
        for r in filas_dwh:
            if r["precio"] is not None:
                riesgo_por_unidad[r["id"]] = r["precio"]

    # ── vendido sin llegada ──────────────────────────────────────────
    if no_casadas:
        monto, sin_precio = _mxn(no_casadas)
        _al_riesgo(no_casadas)
        sin_chasis = sum(1 for r in no_casadas if not (r["chasis"] or "").strip())
        nota = _nota_sin_precio(sin_precio)
        if sin_chasis:
            nota += (f" {sin_chasis} sin chasis en el DWH: "
                     "no pueden conciliarse por VIN.")
        hallazgos.append(_hallazgo(
            "conc-vendido-sin-llegada", "vendido_sin_llegada",
            _n(len(no_casadas), "vendida sin factura física",
               "vendidas sin factura física"),
            "Filas del DWH sin factura PDF que las ampare — valor vendido "
            "cuya llegada nadie comprueba." + nota,
            monto, "MXN",
            [r["chasis"] or f"fila {r['id']}" for r in no_casadas],
            [{"factura": r["factura"], "chasis": r["chasis"]}
             for r in no_casadas],
        ))

    # ── llegado sin venta (por moneda; sin conversiones) ─────────────
    if llegadas_sueltas:
        por_moneda: dict[str, list[sqlite3.Row]] = {}
        for r in llegadas_sueltas:
            por_moneda.setdefault((r["moneda"] or "").strip() or "sin moneda",
                                  []).append(r)
        for moneda in sorted(por_moneda):
            grupo = por_moneda[moneda]
            montos = [parse_monto(r["amount"]) for r in grupo]
            legibles = [m for m in montos if m is not None]
            ilegibles = len(grupo) - len(legibles)
            detalle = ("Facturas físicamente llegadas que ninguna venta del "
                       "DWH cita — inventario en tránsito o venta sin registrar.")
            if ilegibles:
                plural = "importe ilegible" if ilegibles == 1 else "importes ilegibles"
                detalle += f" {ilegibles} {plural}: no se suman."
            hallazgos.append(_hallazgo(
                f"conc-llegado-sin-venta-{moneda}", "llegado_sin_venta",
                _n(len(grupo), "llegada sin venta", "llegadas sin venta")
                + f" ({moneda})",
                detalle,
                sum(legibles) if legibles else None,
                moneda if moneda != "sin moneda" else None,
                [r["chasis"] or r["factura"] or f"fila {r['id']}" for r in grupo],
                [{"factura": r["factura"], "chasis": r["chasis"],
                  "filename": r["filename"]} for r in grupo],
            ))

    # ── afirmaciones en competencia sobre pares conciliados ──────────
    def _disputa(campo_i: str, campo_ef: str, clave: str, clase: str,
                 singular: str, plural: str, detalle: str) -> None:
        en_disputa = [
            r for r in casadas
            if (r[campo_i] or "").strip() and (r[campo_ef] or "").strip()
            and (r[campo_i] or "").strip().upper()
            != (r[campo_ef] or "").strip().upper()
        ]
        if not en_disputa:
            return
        monto, sin_precio = _mxn(en_disputa)
        _al_riesgo(en_disputa)
        hallazgos.append(_hallazgo(
            clave, clase,
            _n(len(en_disputa), singular, plural),
            detalle + _nota_sin_precio(sin_precio),
            monto, "MXN",
            [r["chasis"] for r in en_disputa],
            [{"chasis": r["chasis"], "dwh": r[campo_i], "pdf": r[campo_ef],
              "filename": r["filename"]} for r in en_disputa],
        ))

    _disputa("j_y_n", "ef_jn", "conc-jn-disputa", "jn_en_disputa",
             "unidad con preferencia arancelaria en disputa",
             "unidades con preferencia arancelaria en disputa",
             "El DWH y la factura afirman J/N distintos para la misma "
             "unidad — la preferencia aplicada no está sostenida por ambas "
             "fuentes. El monto es el valor de las unidades en disputa.")
    _disputa("pais_code", "ef_pais", "conc-pais-disputa", "pais_en_disputa",
             "unidad con país de origen en disputa",
             "unidades con país de origen en disputa",
             "El DWH y la factura afirman países de origen distintos — el "
             "origen determina la preferencia y el arancel. El monto es el "
             "valor de las unidades en disputa.")

    # ── VIN duplicado en cada fuente ─────────────────────────────────
    def _duplicados(tabla: str, clave: str, clase: str, fuente: str) -> None:
        grupos = conn.execute(
            f"SELECT chasis, COUNT(*) AS n FROM {tabla}"  # noqa: S608 — tabla de literal fijo
            f" WHERE session_id = ? AND chasis IS NOT NULL AND chasis != ''"
            f" GROUP BY chasis HAVING n > 1 ORDER BY n DESC, chasis",
            (session_id,),
        ).fetchall()
        if not grupos:
            return
        extra = sum(g["n"] - 1 for g in grupos)
        hallazgos.append(_hallazgo(
            clave, clase,
            _n(len(grupos), "VIN repetido", "VIN repetidos") + f" en {fuente}",
            f"El mismo chasis aparece más de una vez en {fuente} "
            f"({_n(extra, 'fila excedente', 'filas excedentes')}). Cuál fila "
            "es la real es decisión del operador — el monto no se adivina.",
            None, None,
            [g["chasis"] for g in grupos],
            [{"chasis": g["chasis"], "veces": g["n"]} for g in grupos],
        ))

    _duplicados("importaciones", "conc-vin-dup-dwh", "vin_duplicado_dwh",
                "el DWH")
    _duplicados("extraccion_facturas", "conc-vin-dup-llegadas",
                "vin_duplicado_llegadas", "las llegadas")

    # ── vendido sin pedimento ────────────────────────────────────────
    sin_ped = [pares[0] for pares in por_importacion.values()
               if pares[0]["pedimento_id"] is None]
    if sin_ped:
        monto, sin_precio = _mxn(sin_ped)
        _al_riesgo(sin_ped)
        hallazgos.append(_hallazgo(
            "conc-sin-pedimento", "sin_pedimento",
            _n(len(sin_ped), "vendida sin pedimento vinculado",
               "vendidas sin pedimento vinculado"),
            "Unidades del DWH sin declaración aduanal que las ampare en la "
            "sesión." + _nota_sin_precio(sin_precio),
            monto, "MXN",
            [r["chasis"] or f"fila {r['id']}" for r in sin_ped],
            [{"factura": r["factura"], "chasis": r["chasis"]} for r in sin_ped],
        ))

    # ── PDFs ilegibles: llegadas subcontadas ─────────────────────────
    errores = conn.execute(
        "SELECT filename FROM facturas_errores WHERE session_id = ?"
        " ORDER BY filename", (session_id,),
    ).fetchall()
    if errores:
        hallazgos.append(_hallazgo(
            "conc-extraccion-fallida", "extraccion_fallida",
            _n(len(errores), "PDF ilegible", "PDFs ilegibles"),
            "Facturas cuyo PDF no pudo extraerse: las llegadas pueden estar "
            "subcontadas y todo hallazgo de este tablero es un piso, no un "
            "techo.",
            None, None,
            [r["filename"] for r in errores],
            [{"filename": r["filename"]} for r in errores],
        ))

    hallazgos.sort(key=lambda h: (h["monto"] is None, -(h["monto"] or 0),
                                  -h["n_unidades"], h["clave"]))

    # ── flujo tri-fuente ─────────────────────────────────────────────
    vendidos = len(por_importacion)
    valor_vendido = conn.execute(
        "SELECT COALESCE(SUM(precio), 0) FROM importaciones WHERE session_id = ?",
        (session_id,)).fetchone()[0]
    valor_conciliado, _ = _mxn(casadas)
    flujo = {
        "vendidos": vendidos,
        "llegados": len(llegadas),
        "conciliados": len(casadas),
        "sin_llegada": len(no_casadas),
        "sin_venta": len(llegadas_sueltas),
        "pct_conciliado": (max(0, min(100, round(100 * len(casadas) / vendidos)))
                           if vendidos else None),
        "valor_vendido_mxn": round(valor_vendido, 2),
        "valor_conciliado_mxn": round(valor_conciliado or 0, 2),
    }

    valor_en_riesgo = sum(riesgo_por_unidad.values())
    return {
        "session_id": session_id,
        "flujo": flujo,
        "hallazgos": hallazgos,
        "total": len(hallazgos),
        "valor_en_riesgo_mxn": round(valor_en_riesgo, 2),
    }
