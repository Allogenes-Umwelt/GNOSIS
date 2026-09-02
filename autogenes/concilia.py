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

# clasificación FIJA de severidad por clase de hallazgo — nunca un monto
# estimado (cero snake oil). danger = ruptura estructural o afirmación en
# competencia que determina arancel; warn = necesita arbitraje pero no rompe.
# Fuente única: la proyección del grafo la importa de aquí.
SEVERIDAD = {
    "vendido_sin_llegada": "danger",
    "sin_pedimento": "danger",
    "jn_en_disputa": "danger",
    "pais_en_disputa": "danger",
    "llegado_sin_venta": "warn",
    "vin_duplicado_dwh": "warn",
    "vin_duplicado_llegadas": "warn",
    "extraccion_fallida": "warn",
    # ola 2
    "pedimento_sin_unidades": "warn",
    "vin_inter_sesion": "warn",
}

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
              unidades: list[str], refs: list[dict],
              tope: int = MAX_UNIDADES) -> dict[str, Any]:
    return {
        "clave": clave,
        "clase": clase,
        "titulo": titulo,
        "detalle": detalle,
        "monto": round(monto, 2) if monto is not None else None,
        "moneda": moneda if monto is not None else None,
        "n_unidades": len(unidades),
        "unidades": unidades[:tope],
        "refs": refs[:tope],
    }


def _mxn(filas: list[sqlite3.Row]) -> tuple[Optional[float], int]:
    """Suma de precios DWH (MXN) presentes + cuántas unidades no lo tienen.
    Un precio 0 NO es un precio real: es un slice de precio VACÍO del DWH
    (concentrado1 arma '.000' de un campo en blanco). Contarlo como $0 sería
    afirmar que la unidad vale cero — se declara sin precio, no se estima."""
    con_precio = [r["precio"] for r in filas if r["precio"]]
    sin = len(filas) - len(con_precio)
    return (sum(con_precio) if con_precio else None), sin


def _nota_sin_precio(n: int) -> str:
    if n == 0:
        return ""
    plural = "unidad sin precio" if n == 1 else "unidades sin precio"
    return f" {n} {plural} en el DWH: su valor no se estima."


def _n(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def conciliar(conn: sqlite3.Connection, session_id: int,
              tope: int = MAX_UNIDADES) -> dict[str, Any]:
    """El estado de conciliación de la sesión: flujo tri-fuente +
    hallazgos ordenados por valor en riesgo (monto desc, None al final).
    `tope` acota unidades/refs por hallazgo (el dossier pide más); el
    conteo y el monto siempre cubren el total."""

    def _h(*args: Any) -> dict[str, Any]:
        return _hallazgo(*args, tope=tope)

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
            if r["precio"]:                 # 0 = slice vacío, no un precio real
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
        hallazgos.append(_h(
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
            sin_moneda = moneda == "sin moneda"
            montos = [parse_monto(r["amount"]) for r in grupo]
            # un importe 0 es fabricación de la extracción ('0,00' cuando el
            # regex de precio no casa, PDFs_v2) — no un importe real de $0
            legibles = [m for m in montos if m]
            ilegibles = len(grupo) - len(legibles)
            detalle = ("Facturas físicamente llegadas que ninguna venta del "
                       "DWH cita — inventario en tránsito o venta sin registrar.")
            if sin_moneda:
                # sin unidad declarada los importes no son sumables (podrían ser
                # divisas distintas): se reporta el conteo, no un total sin unidad
                detalle += " Sin moneda declarada: los importes no se suman."
                monto: Optional[float] = None
            else:
                if ilegibles:
                    plural = ("importe ilegible o en cero" if ilegibles == 1
                              else "importes ilegibles o en cero")
                    detalle += f" {ilegibles} {plural}: no se suman."
                monto = sum(legibles) if legibles else None
            hallazgos.append(_h(
                f"conc-llegado-sin-venta-{moneda}", "llegado_sin_venta",
                _n(len(grupo), "llegada sin venta", "llegadas sin venta")
                + f" ({moneda})",
                detalle,
                monto,
                None if sin_moneda else moneda,
                [r["chasis"] or r["factura"] or f"fila {r['id']}" for r in grupo],
                [{"factura": r["factura"], "chasis": r["chasis"],
                  "filename": r["filename"]} for r in grupo],
            ))

    # ── afirmaciones en competencia sobre pares conciliados ──────────
    # Una importación puede casar con varias facturas: la disputa manda si
    # CUALQUIERA de ellas contradice el DWH (misma semántica que
    # veredicto_por_fila — los dos motores nunca se contradicen). Mirar solo
    # pares[0] subcontaba disputas y omitía su valor del riesgo agregado.
    def _disputa(campo_i: str, campo_ef: str, clave: str, clase: str,
                 singular: str, plural: str, detalle: str) -> None:
        en_disputa: list[sqlite3.Row] = []
        for pares in por_importacion.values():
            if pares[0]["ef_id"] is None:
                continue                        # sin factura: no es un par
            conflicto = next(
                (p for p in pares
                 if (p[campo_i] or "").strip() and (p[campo_ef] or "").strip()
                 and (p[campo_i] or "").strip().upper()
                 != (p[campo_ef] or "").strip().upper()),
                None)
            if conflicto is not None:
                en_disputa.append(conflicto)    # el par que sostiene la disputa
        if not en_disputa:
            return
        monto, sin_precio = _mxn(en_disputa)
        _al_riesgo(en_disputa)
        hallazgos.append(_h(
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
        hallazgos.append(_h(
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
        hallazgos.append(_h(
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
        hallazgos.append(_h(
            "conc-extraccion-fallida", "extraccion_fallida",
            _n(len(errores), "PDF ilegible", "PDFs ilegibles"),
            "Facturas cuyo PDF no pudo extraerse: las llegadas pueden estar "
            "subcontadas y todo hallazgo de este tablero es un piso, no un "
            "techo.",
            None, None,
            [r["filename"] for r in errores],
            [{"filename": r["filename"]} for r in errores],
        ))

    # ── pedimento sin unidades: declarado sin vendido (F9 · ola 2) ────
    ped_huerfanos = conn.execute(
        "SELECT p.numero_pedimento, p.aduana FROM pedimentos p"
        " WHERE p.session_id = ? AND NOT EXISTS ("
        "   SELECT 1 FROM importaciones i WHERE i.pedimento_id = p.id)"
        " ORDER BY p.numero_pedimento", (session_id,)).fetchall()
    if ped_huerfanos:
        hallazgos.append(_h(
            "conc-pedimento-sin-unidades", "pedimento_sin_unidades",
            _n(len(ped_huerfanos), "pedimento sin unidades vinculadas",
               "pedimentos sin unidades vinculadas"),
            "Declaraciones aduanales de la sesión que ninguna fila del DWH "
            "cita — papel sin vendido que lo respalde. El monto no se adivina.",
            None, None,
            [r["numero_pedimento"] or "s/n" for r in ped_huerfanos],
            [{"numero_pedimento": r["numero_pedimento"], "aduana": r["aduana"]}
             for r in ped_huerfanos],
        ))

    # ── VIN en más de una sesión: reimportación o doble conteo ────────
    # Lectura transversal read-only (mismo precedente que nomos.backtest):
    # el mismo chasis vendido en sesiones distintas. Determinista.
    inter = conn.execute(
        "SELECT chasis, COUNT(DISTINCT session_id) AS n,"
        "       GROUP_CONCAT(DISTINCT session_id) AS sesiones"
        " FROM importaciones"
        " WHERE chasis IS NOT NULL AND chasis != ''"
        "   AND chasis IN (SELECT chasis FROM importaciones WHERE session_id = ?)"
        " GROUP BY chasis HAVING COUNT(DISTINCT session_id) > 1"
        " ORDER BY n DESC, chasis", (session_id,)).fetchall()
    if inter:
        hallazgos.append(_h(
            "conc-vin-inter-sesion", "vin_inter_sesion",
            _n(len(inter), "chasis vendido en más de una sesión",
               "chasis vendidos en más de una sesión"),
            "El mismo VIN aparece vendido en distintas sesiones procesadas — "
            "reimportación o doble conteo histórico. Cuál corresponde a esta "
            "sesión es decisión del operador; el monto no se adivina.",
            None, None,
            [r["chasis"] for r in inter],
            # GROUP_CONCAT no garantiza orden: se reordena por id de sesión para
            # que la cita sea idéntica entre corridas (doble-corrida determinista)
            [{"chasis": r["chasis"],
              "sesiones": ",".join(map(str, sorted(
                  int(s) for s in r["sesiones"].split(","))))}
             for r in inter],
        ))

    hallazgos.sort(key=lambda h: (h["monto"] is None, -(h["monto"] or 0),
                                  -h["n_unidades"], h["clave"]))

    # ── flujo tri-fuente ─────────────────────────────────────────────
    vendidos = len(por_importacion)
    # solo precios legibles (> 0): un slice vacío del DWH suma 0, y un total 0
    # cuando NADA tiene precio sería un $0 fabricado — se declara None (ausente),
    # distinguible de un cero real, igual que _mxn y los montos de hallazgo
    valor_vendido = conn.execute(
        "SELECT SUM(precio) FROM importaciones WHERE session_id = ? AND precio > 0",
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
        "valor_vendido_mxn": round(valor_vendido, 2) if valor_vendido is not None else None,
        "valor_conciliado_mxn": round(valor_conciliado, 2) if valor_conciliado is not None else None,
    }

    valor_en_riesgo = sum(riesgo_por_unidad.values())
    return {
        "session_id": session_id,
        "flujo": flujo,
        "hallazgos": hallazgos,
        "total": len(hallazgos),
        "valor_en_riesgo_mxn": round(valor_en_riesgo, 2),
    }


# ── ola 2: what-if de cupos ──────────────────────────────────────────

MESES_MINIMOS_HISTORIA = 2


def cupos_what_if(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """Proyección determinista del agotamiento de cupos: el run-rate es
    el promedio de consumo mensual MEDIDO en seguimiento_mensual (meses
    con consumo > 0). Con menos de MESES_MINIMOS_HISTORIA meses de
    historia no se proyecta y se dice por qué — nada de placebo."""
    consumos = {
        "PRODUCCION": [], "INVERSION": [],
    }
    ultimo_mes = 0
    for r in conn.execute(
        "SELECT mes, consumo_produccion, consumo_inversion FROM"
        " seguimiento_mensual WHERE session_id = ? ORDER BY mes",
        (session_id,),
    ):
        ultimo_mes = max(ultimo_mes, r["mes"])
        if (r["consumo_produccion"] or 0) > 0:
            consumos["PRODUCCION"].append(r["consumo_produccion"])
        if (r["consumo_inversion"] or 0) > 0:
            consumos["INVERSION"].append(r["consumo_inversion"])

    cupos = []
    for r in conn.execute(
        "SELECT tipo, numero_autorizacion, cantidad_inicial,"
        "       cantidad_consumida, cantidad_saldo, mes_agotado"
        " FROM cupos WHERE session_id = ? ORDER BY tipo, numero_autorizacion",
        (session_id,),
    ):
        serie = consumos.get((r["tipo"] or "").strip().upper(), [])
        cupo: dict[str, Any] = {
            "tipo": r["tipo"],
            "numero": r["numero_autorizacion"],
            "inicial": r["cantidad_inicial"],
            "consumido": r["cantidad_consumida"],
            "saldo": r["cantidad_saldo"],
            "mes_agotado": r["mes_agotado"],
            "run_rate": None,
            "meses_restantes": None,
            "mes_estimado_agote": None,
            "motivo": None,
        }
        if r["mes_agotado"]:
            cupo["motivo"] = "Ya agotado — hecho, no proyección."
        elif len(serie) < MESES_MINIMOS_HISTORIA:
            cupo["motivo"] = (f"Historia insuficiente ({len(serie)} "
                              f"{'mes' if len(serie) == 1 else 'meses'} con "
                              "consumo): no se proyecta.")
        elif not r["cantidad_saldo"]:
            cupo["motivo"] = "Sin saldo restante."
        else:
            rate = sum(serie) / len(serie)
            meses = r["cantidad_saldo"] / rate
            cupo["run_rate"] = round(rate, 1)
            cupo["meses_restantes"] = round(meses, 1)
            # mes calendario estimado a partir del último mes con registro
            est = ultimo_mes + meses
            cupo["mes_estimado_agote"] = (int(est) + (0 if est == int(est) else 1)
                                          if est <= 12 else None)
        cupos.append(cupo)

    return {
        "session_id": session_id,
        "cupos": cupos,
        "meses_historia": ultimo_mes,
        "nota": ("El run-rate es el promedio de consumo mensual medido; "
                 "la proyección es lineal y se rompe con estacionalidad — "
                 "es un instrumento, no una promesa."),
    }


# ── ola 3: índice de cobertura documental (A4) ───────────────────────


def cobertura(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """Índice de cobertura documental: qué fracción del valor vendido
    MEDIBLE está respaldada por factura física, y el complemento declarado.
    Una unidad está respaldada si tiene precio legible en el DWH Y una
    factura física que la ampara (misma regla de casamiento). Declarar la
    propia fragilidad ES la credibilidad — el complemento se dice, no se
    esconde. Lectura pura y determinista."""
    filas = conn.execute(
        f"SELECT i.id, i.precio, ef.id AS ef_id"
        f" FROM importaciones i"
        f" LEFT JOIN extraccion_facturas ef ON{_JOIN_PAR}"
        f" WHERE i.session_id = ? ORDER BY i.id", (session_id,),
    ).fetchall()
    por_imp: dict[int, list[sqlite3.Row]] = {}
    for r in filas:
        por_imp.setdefault(r["id"], []).append(r)

    con_precio = sin_precio = sin_factura = 0
    valor_medible = valor_respaldado = 0.0
    for pares in por_imp.values():
        precio = pares[0]["precio"]
        casada = any(p["ef_id"] is not None for p in pares)
        if precio:
            con_precio += 1
            valor_medible += precio
            if casada:
                valor_respaldado += precio
        else:
            sin_precio += 1
        if not casada:
            sin_factura += 1

    pdfs_ilegibles = conn.execute(
        "SELECT COUNT(*) FROM facturas_errores WHERE session_id = ?",
        (session_id,)).fetchone()[0]
    pct = (round(100 * valor_respaldado / valor_medible)
           if valor_medible else None)
    return {
        "session_id": session_id,
        "unidades": len(por_imp),
        "con_precio": con_precio,
        "sin_precio": sin_precio,
        "unidades_sin_factura": sin_factura,
        "valor_medible_mxn": round(valor_medible, 2),
        "valor_respaldado_mxn": round(valor_respaldado, 2),
        "pct_respaldado": pct,
        "pdfs_ilegibles": pdfs_ilegibles,
        "nota": ("El respaldo es el valor de las unidades con precio en el "
                 "DWH Y factura física que las ampara; el complemento "
                 "descansa en unidades sin factura, sin precio o con PDF "
                 "ilegible — declarado, no escondido."),
    }


# ── ola 2: dossier de defensa ────────────────────────────────────────

TOPE_DOSSIER = 2000


def dockear_dossier(conn: sqlite3.Connection, session_id: int,
                    clave: str) -> dict[str, Any]:
    """Dockea UN hallazgo como Producto{clase:"informe", unidad:"concilia"}
    — el dossier de defensa: snapshot completo (unidades y referencias SIN
    tope) + el flujo tri-fuente del momento, listo para auditoría externa.
    El motor se re-ejecuta aquí: el dossier documenta el estado VIVO, no
    lo que el navegador recuerda. Como el parte QUALIA, cita filas
    aduanales y no fragmentos: evidencia vacía en vez de procedencia
    fabricada."""
    from autogenes.sustrato import Sustrato

    r = conciliar(conn, session_id, tope=TOPE_DOSSIER)
    hallazgo = next((h for h in r["hallazgos"] if h["clave"] == clave), None)
    if hallazgo is None:
        return {"error": f"El hallazgo «{clave}» ya no existe — el estado "
                         "vivo cambió; recarga el tablero."}

    from autogenes.sello import sellar

    cuerpo = {
        "hallazgo": hallazgo,
        "flujo": r["flujo"],
        "valor_en_riesgo_mxn": r["valor_en_riesgo_mxn"],
        "cobertura": cobertura(conn, session_id),
    }
    cuerpo["sello"] = sellar(cuerpo)     # integridad re-derivable (C1-lite)
    producto = Sustrato(conn, session_id).dockear_producto(
        clase="informe",
        titulo=f"Dossier CONCILIA — {hallazgo['titulo']}",
        unidad="concilia",
        cuerpo=cuerpo,
        entidades=[],
        evidencia=[],
    )
    return {"session_id": session_id, "producto": producto.model_dump()}


# ── ola 2: lookup directo — estado vivo por VIN ──────────────────────


def estado_vin(conn: sqlite3.Connection, session_id: int,
               chasis: str) -> dict[str, Any]:
    """El estado vivo tri-fuente de UN chasis: qué dice el DWH, qué
    facturas físicas lo amparan, bajo qué pedimento entró, si concilió
    y qué afirmaciones están en disputa. Parcial permitido (LIKE); si
    varios VIN casan se devuelven candidatos, no se adivina."""
    buscado = (chasis or "").strip()
    if not buscado:
        return {"error": "Chasis vacío"}

    exactos = [r["chasis"] for r in conn.execute(
        "SELECT DISTINCT chasis FROM ("
        " SELECT chasis FROM importaciones WHERE session_id = :s"
        " UNION SELECT chasis FROM extraccion_facturas WHERE session_id = :s)"
        " WHERE chasis LIKE :q ORDER BY chasis LIMIT 9",
        {"s": session_id, "q": f"%{buscado}%"})]
    if not exactos:
        return {"error": f"Ningún chasis casa con «{buscado}» en la sesión"}
    if len(exactos) > 1 and buscado not in exactos:
        return {"ambiguo": True, "candidatos": exactos}
    vin = buscado if buscado in exactos else exactos[0]

    dwh = [dict(r) for r in conn.execute(
        "SELECT i.factura, i.precio, i.j_y_n, i.pais_code,"
        "       p.numero_pedimento, p.aduana"
        " FROM importaciones i LEFT JOIN pedimentos p ON i.pedimento_id = p.id"
        " WHERE i.session_id = ? AND i.chasis = ? ORDER BY i.id",
        (session_id, vin))]
    llegadas = [dict(r) for r in conn.execute(
        "SELECT factura, amount, moneda, j_y_n, pais_code, filename"
        " FROM extraccion_facturas WHERE session_id = ? AND chasis = ?"
        " ORDER BY id", (session_id, vin))]

    pares = conn.execute(
        f"SELECT i.j_y_n, ef.j_y_n AS ef_jn, i.pais_code, ef.pais_code AS ef_pais"
        f" FROM importaciones i JOIN extraccion_facturas ef ON{_JOIN_PAR}"
        f" WHERE i.session_id = ? AND i.chasis = ?",
        (session_id, vin)).fetchall()
    disputas = []
    for r in pares:
        if ((r["j_y_n"] or "").strip() and (r["ef_jn"] or "").strip()
                and r["j_y_n"].strip().upper() != r["ef_jn"].strip().upper()):
            disputas.append({"campo": "j_y_n", "dwh": r["j_y_n"],
                             "pdf": r["ef_jn"]})
        if ((r["pais_code"] or "").strip() and (r["ef_pais"] or "").strip()
                and r["pais_code"].strip().upper()
                != r["ef_pais"].strip().upper()):
            disputas.append({"campo": "pais", "dwh": r["pais_code"],
                             "pdf": r["ef_pais"]})

    return {
        "chasis": vin,
        "dwh": dwh,
        "llegadas": llegadas,
        "conciliado": bool(pares),
        "disputas": disputas,
        "duplicado_dwh": len(dwh) > 1,
        "duplicado_llegadas": len(llegadas) > 1,
    }


def veredicto_por_fila(conn: sqlite3.Connection,
                       session_id: int) -> dict[str, list[int]]:
    """La partición CONCILIA del universo DWH: cada fila vendida cae en
    exactamente UNA celda — en_paz (concilió sin disputas), en_disputa
    (concilió pero las fuentes afirman J/N o país distintos) o
    sin_llegada. Misma regla de casamiento de siempre; ids de fila."""
    filas = conn.execute(
        f"SELECT i.id, i.j_y_n, i.pais_code,"
        f"       ef.id AS ef_id, ef.j_y_n AS ef_jn, ef.pais_code AS ef_pais"
        f" FROM importaciones i"
        f" LEFT JOIN extraccion_facturas ef ON{_JOIN_PAR}"
        f" WHERE i.session_id = ? ORDER BY i.id",
        (session_id,),
    ).fetchall()
    celdas: dict[str, list[int]] = {"en_paz": [], "en_disputa": [],
                                    "sin_llegada": []}
    vistos: dict[int, str] = {}
    for r in filas:
        if r["ef_id"] is None:
            vistos.setdefault(r["id"], "sin_llegada")
            continue
        disputa = (
            ((r["j_y_n"] or "").strip() and (r["ef_jn"] or "").strip()
             and r["j_y_n"].strip().upper() != r["ef_jn"].strip().upper())
            or ((r["pais_code"] or "").strip() and (r["ef_pais"] or "").strip()
                and r["pais_code"].strip().upper()
                != r["ef_pais"].strip().upper())
        )
        # una fila casada con varias llegadas: disputa en cualquiera manda
        if disputa:
            vistos[r["id"]] = "en_disputa"
        else:
            vistos.setdefault(r["id"], "en_paz")
    for fid, celda in vistos.items():
        celdas[celda].append(fid)
    for c in celdas.values():
        c.sort()
    return celdas
