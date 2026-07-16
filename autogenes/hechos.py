"""HECHOS MEDIDOS — la columna vertebral del informe de Síntesis (S1).

El informe ejecutivo antes solo veía entidades/fragmentos: era más débil que
los dashboards del propio sistema. Aquí se agregan las salidas VIVAS de los
motores (CONCILIA, VALIDACIÓN, NOMOS, QUALIA, análisis de red) como hechos
DETERMINISTAS ya citados a su procedencia. El informe teje estos hechos; el
modelo no puede alterarlos ni desanclarlos — `sanear_informe` resuelve
`hecho:<id>` contra los ids reales producidos aquí.

Leyes que este módulo respeta:
- Puro y determinista: mismas entradas -> mismos hechos, mismo orden (test de
  doble corrida). No usa NetworkX propio; solo llama a los motores existentes.
- Zero snake oil: cada hecho carga su cifra+unidad y su fuente; los montos ($)
  provienen SOLO de CONCILIA/NOMOS, como manda la ley. Un motor sin datos no
  aporta hechos — jamás rellena ni inventa.
- Best-effort por motor: si un motor no tiene su tabla en el despliegue o
  falla, no aporta hechos y los demás siguen (como el snapshot de telemetría).
"""
import sqlite3
from typing import Any

# Tope de hechos que entran al digesto del modelo (los demás quedan para el
# panel "lo no cubierto", S5). Priorizados: monetizados primero, luego por
# severidad medida.
MAX_HECHOS_DIGESTO = 20


def _fmt(x: float) -> str:
    """Cifra legible: entero con separador de miles, decimales solo si los hay."""
    if x == int(x):
        return f"{int(x):,}"
    return f"{x:,.2f}"


def _hecho(motor: str, clave: str, texto: str, *, cifra: Any = None,
           unidad: str | None = None, fuente: str, severidad: float = 0.0,
           monetizado: bool = False, evidencia: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": f"hecho:{motor.lower()}:{clave}",
        "motor": motor,
        "texto": texto.strip(),
        "cifra": cifra,
        "unidad": unidad,
        "fuente": fuente,
        "severidad": max(0.0, min(1.0, severidad)),
        "monetizado": monetizado,
        "evidencia": evidencia or [],
    }


# ── un extractor por motor (cada uno best-effort en el agregador) ─────

def _de_concilia(conn: sqlite3.Connection, session_id: int) -> list[dict]:
    from autogenes.concilia import conciliar
    r = conciliar(conn, session_id)
    total_riesgo = r.get("valor_en_riesgo_mxn") or 0
    out = []
    for h in r.get("hallazgos", []):
        monto = h.get("monto")
        if monto is not None:
            out.append(_hecho(
                "CONCILIA", h["clave"], h["titulo"],
                cifra=_fmt(monto), unidad=h.get("moneda") or "MXN",
                fuente=f"CONCILIA · {h['n_unidades']} unidades · {h['clave']}",
                severidad=(monto / total_riesgo) if total_riesgo else 0.0,
                monetizado=True))
        else:
            out.append(_hecho(
                "CONCILIA", h["clave"], h["titulo"],
                cifra=h["n_unidades"], unidad="unidades",
                fuente=f"CONCILIA · {h['clave']}",
                severidad=0.3))
    return out


def _de_validacion(conn: sqlite3.Connection, session_id: int) -> list[dict]:
    from autogenes.validacion import validar
    r = validar(conn, session_id)
    out = []
    for rg in r.get("reglas", []):
        n = rg.get("n") or 0
        if n <= 0:
            continue
        base = rg.get("base") or 0
        out.append(_hecho(
            "VALIDACION", rg["clave"],
            f"{rg['titulo']}: {n} filas incumplen",
            cifra=n, unidad="filas",
            fuente=f"VALIDACIÓN · {rg.get('norma', 'norma')} · {rg.get('fuente', '')}".strip(" ·"),
            severidad=(n / base) if base else 0.5))
    return out


def _de_nomos(conn: sqlite3.Connection, session_id: int) -> list[dict]:
    from autogenes.nomos import evaluar_reglas
    r = evaluar_reglas(conn, session_id)
    base = r.get("base") or 0
    out = []
    for rg in r.get("reglas", []):
        if not rg.get("activa") or (rg.get("n_violaciones") or 0) <= 0:
            continue
        pnl = rg.get("pnl_mxn")
        n = rg["n_violaciones"]
        if pnl is not None:
            out.append(_hecho(
                "NOMOS", str(rg["id"]),
                f"Regla «{rg['nombre']}»: {n} incumplimientos",
                cifra=_fmt(pnl), unidad="MXN",
                fuente=f"NOMOS · regla activa · {n} filas",
                severidad=(n / base) if base else 0.5, monetizado=True))
        else:
            out.append(_hecho(
                "NOMOS", str(rg["id"]),
                f"Regla «{rg['nombre']}»: {n} incumplimientos",
                cifra=n, unidad="filas",
                fuente="NOMOS · regla activa",
                severidad=(n / base) if base else 0.5))
    return out


def _de_qualia(conn: sqlite3.Connection, session_id: int) -> list[dict]:
    from autogenes.qualia import anomalias_de_sesion
    r = anomalias_de_sesion(conn, session_id)
    # Sin base fijada por el operador no hay desviación medible: no se inventa
    # una referencia (la propia QUALIA lo declara con 'motivo').
    if r.get("base") is None:
        return []
    out = []
    for i, h in enumerate(r.get("hallazgos", [])):
        clave = h.get("clave") or h.get("detector") or f"anom-{i}"
        out.append(_hecho(
            "QUALIA", clave, h.get("titulo", "Desviación estructural"),
            cifra=None, unidad=None,
            fuente="QUALIA · desviación vs la base del operador",
            severidad=float(h.get("severidad", 0.0))))
    return out


def _de_analisis(conn: sqlite3.Connection, session_id: int) -> list[dict]:
    from autogenes import analisis_vw
    a = analisis_vw.analisis(conn, session_id)
    if not a.get("suficiente") or not a.get("marca"):
        return []
    m = a["marca"]
    marca = m.get("nombre", "la marca")
    out = []
    cc = m.get("corte_critico")
    if cc and cc.get("pct_suministro") is not None:
        pct = cc["pct_suministro"]
        out.append(_hecho(
            "ANALISIS", "corte-critico",
            f"Un corte de {cc.get('n_rutas', 0)} ruta(s) interrumpe el "
            f"{round(pct * 100)}% del suministro de {marca}",
            cifra=round(pct * 100), unidad="% del suministro",
            fuente="análisis de red · max-flow/min-cut sobre volumen medido",
            severidad=pct))
    if m.get("redundancia_rutas") is not None and m["redundancia_rutas"] <= 1:
        out.append(_hecho(
            "ANALISIS", "punto-unico-falla",
            f"{marca} tiene una sola vía de suministro independiente",
            cifra=m["redundancia_rutas"], unidad="ruta independiente",
            fuente="análisis de red · corte mínimo unitario",
            severidad=0.8))
    ho = m.get("hhi_origenes") or {}
    if isinstance(ho.get("banda"), str) and ho["banda"].startswith("alta"):
        out.append(_hecho(
            "ANALISIS", "hhi-origen-alta",
            f"Concentración de origen alta para {marca} (HHI {ho.get('hhi')})",
            cifra=ho.get("hhi"), unidad="HHI",
            fuente=f"análisis de red · HHI sobre {m.get('n_origenes', '?')} orígenes medidos",
            severidad=0.6))
    br = m.get("brecha_jn") or []
    if br:
        g = br[0]
        out.append(_hecho(
            "ANALISIS", "brecha-jn",
            f"{marca} usa la preferencia J un {round(g['brecha'] * 100)}% menos "
            f"que sus pares en {g['pais']}×{g['aduana']}",
            cifra=round(g["brecha"] * 100), unidad="% de brecha",
            fuente="análisis de red · share medido en unidades · sin montos",
            severidad=float(g["brecha"])))
    aus = m.get("rutas_ausentes") or []
    if aus:
        out.append(_hecho(
            "ANALISIS", "rutas-ausentes",
            f"{len(aus)} ruta(s) que los pares usan y {marca} no",
            cifra=len(aus), unidad="rutas",
            fuente="análisis de red · ausencia medida vs pares · no es pronóstico",
            severidad=0.4))
    return out


_EXTRACTORES = (_de_concilia, _de_validacion, _de_nomos, _de_qualia, _de_analisis)


def hechos_medidos(conn: sqlite3.Connection, session_id: int) -> list[dict[str, Any]]:
    """Todos los hechos medidos del caso, ordenados de forma DETERMINISTA:
    monetizados primero (por monto desc), luego por severidad desc; el id
    (estable) desempata para que dos corridas den el mismo orden exacto."""
    hechos: list[dict] = []
    for extractor in _EXTRACTORES:
        try:
            hechos.extend(extractor(conn, session_id))
        except Exception:   # noqa: BLE001 — un motor sin tabla/datos no tumba el resto
            continue

    def _monto(h: dict) -> float:
        try:
            return float(str(h["cifra"]).replace(",", "")) if h["monetizado"] else 0.0
        except (TypeError, ValueError):
            return 0.0

    hechos.sort(key=lambda h: (0 if h["monetizado"] else 1,
                               -_monto(h), -h["severidad"], h["id"]))
    return hechos
