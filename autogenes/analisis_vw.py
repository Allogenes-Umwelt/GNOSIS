"""Análisis de red orientado al negocio (I1) — la red de flujo derivada
país → aduana → marca y las lentes que SOLO ahí significan algo.

Por qué una red DERIVADA y no la proyección de procedencia: esa proyección
(proyeccion.construir_grafo) es un casi-árbol núcleo→pedimento→vehículo, donde
cualquier centralidad global la domina la jerarquía por construcción. El
insight de negocio vive en el flujo país→aduana→marca, donde las aduanas son
los únicos puentes país↔marca — ahí la intermediación es "quién broker-iza el
flujo", el corte mínimo es "qué rutas, si caen, cortan el suministro", y la
concentración (HHI) es "cuánta dependencia de un solo origen/aduana".

LEYES de este módulo (como el resto del sustrato):
- Lectura pura: nunca escribe.
- Determinista: mismas filas → mismas cifras (orden estable en todo).
- Cero snake oil: los pesos son unidades y valor Σ MEDIDOS (COUNT y SUM de
  filas reales). Ninguna métrica inventa monto ni confianza. El min-cort e
  describen el flujo MEDIDO de esta sesión, no una predicción.
- No es procedencia: es una vista estructural sobre datos citables, no
  evidencia primaria. Las cifras se derivan; no sustituyen a los motores.
"""
import sqlite3
from typing import Any, Optional

from autogenes import topologia

# Marca protagonista por defecto del ángulo de negocio (VW). Si no está en la
# sesión, el análisis cae a la marca de mayor volumen (se declara el sujeto).
MARCA_DEFECTO = "VOLKSWAGEN"

ORIGEN = "__origen__"   # super-fuente para el corte país→marca (no es un nodo real)


def _filas_flujo(conn: sqlite3.Connection, session_id: int) -> list[dict]:
    """Materia prima MEDIDA: por (país, aduana, marca), unidades y valor Σ.
    Una fila = un triple con su volumen real. Orden estable (determinista)."""
    filas = conn.execute(
        """SELECT i.pais_code AS pais, p.aduana AS aduana, m.nombre AS marca,
                  COUNT(*) AS unidades, COALESCE(SUM(i.precio), 0) AS valor
             FROM importaciones i
             JOIN pedimentos p ON i.pedimento_id = p.id
             JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
             JOIN marcas m ON c.marca_id = m.id
            WHERE i.session_id = ?
              AND p.aduana IS NOT NULL AND p.aduana != ''
              AND i.pais_code IS NOT NULL AND i.pais_code != ''
            GROUP BY i.pais_code, p.aduana, m.nombre
            ORDER BY i.pais_code, p.aduana, m.nombre""",
        (session_id,),
    ).fetchall()
    return [{"pais": r["pais"], "aduana": r["aduana"], "marca": r["marca"],
             "unidades": r["unidades"], "valor": r["valor"]} for r in filas]


def _pais_id(c: str) -> str: return f"pais:{c}"
def _aduana_id(a: str) -> str: return f"aduana:{a}"
def _marca_id(m: str) -> str: return f"marca:{m}"


def red_flujo(filas: list[dict]) -> topologia.Red:
    """La red de flujo completa país→aduana→marca (todas las marcas). Peso de
    arista = unidades MEDIDAS; el valor Σ viaja como campo extra (topología lo
    ignora). Nodos con su volumen agregado. Determinista: orden por id."""
    nodos: dict[str, dict] = {}
    pa: dict[tuple, dict] = {}   # (pais_id, aduana_id) -> {u, v}
    am: dict[tuple, dict] = {}   # (aduana_id, marca_id) -> {u, v}

    def _nodo(nid: str, etiqueta: str, kind: str, u: int, v: float) -> None:
        n = nodos.get(nid)
        if n is None:
            nodos[nid] = {"id": nid, "etiqueta": etiqueta, "kind": kind,
                          "unidades": u, "valor": v}
        else:
            n["unidades"] += u
            n["valor"] += v

    for f in filas:
        pid, aid, mid = _pais_id(f["pais"]), _aduana_id(f["aduana"]), _marca_id(f["marca"])
        u, v = f["unidades"], f["valor"]
        _nodo(pid, f["pais"], "pais", u, v)
        _nodo(aid, f["aduana"], "aduana", u, v)
        _nodo(mid, f["marca"], "marca", u, v)
        k1 = (pid, aid)
        pa[k1] = pa.get(k1) or {"u": 0, "v": 0.0}
        pa[k1]["u"] += u
        pa[k1]["v"] += v
        k2 = (aid, mid)
        am[k2] = am.get(k2) or {"u": 0, "v": 0.0}
        am[k2]["u"] += u
        am[k2]["v"] += v

    enlaces: list[dict] = []
    for (a, b), d in sorted(pa.items()):
        enlaces.append({"origen": a, "destino": b, "peso": d["u"], "valor": d["v"]})
    for (a, b), d in sorted(am.items()):
        enlaces.append({"origen": a, "destino": b, "peso": d["u"], "valor": d["v"]})
    return {"nodos": [nodos[k] for k in sorted(nodos)], "enlaces": enlaces}


def _subred_marca(filas: list[dict], marca: str) -> topologia.Red:
    """La subred de flujo de UNA marca: sus países → aduanas → la marca, con
    el volumen de ESA marca (no el total). Es donde el corte mínimo y la
    redundancia de rutas son limpios (sin contaminación de otras marcas)."""
    sub = [f for f in filas if f["marca"] == marca]
    return red_flujo(sub)


def hhi(pesos: list[float]) -> dict[str, Any]:
    """Herfindahl–Hirschman: Σ share². Mide concentración/ dependencia. 1 =
    todo en uno; ~1/n = repartido parejo. Las bandas son la CONVENCIÓN
    antimonopolio (declarada como convención, no norma propia)."""
    total = sum(pesos)
    if total <= 0:
        return {"hhi": 0.0, "banda": "sin datos", "n": len(pesos)}
    h = sum((p / total) ** 2 for p in pesos)
    banda = ("alta (convención >0.25)" if h > 0.25
             else "moderada (convención 0.15–0.25)" if h >= 0.15
             else "baja (convención <0.15)")
    return {"hhi": round(h, 4), "banda": banda, "n": len(pesos)}


def _elegir_marca(filas: list[dict], marca: Optional[str]) -> Optional[str]:
    presentes = {f["marca"] for f in filas}
    if marca and marca in presentes:
        return marca
    if MARCA_DEFECTO in presentes:
        return MARCA_DEFECTO
    # la de mayor volumen (desempate por nombre = determinista)
    vol: dict[str, int] = {}
    for f in filas:
        vol[f["marca"]] = vol.get(f["marca"], 0) + f["unidades"]
    return max(sorted(vol), key=lambda m: vol[m]) if vol else None


def analisis(conn: sqlite3.Connection, session_id: int,
             marca: Optional[str] = None) -> dict[str, Any]:
    """El análisis de red completo, listo para el panel VW (I2). Todo
    derivable y citable: unidades y valor son COUNT/SUM de filas reales.

    - brokers: aduanas por intermediación sobre la red completa — quién
      concentra el flujo entre orígenes y marcas.
    - marca foco: corte crítico (qué rutas cortan su suministro), redundancia
      (cuántas rutas independientes), y HHI de sus orígenes y aduanas.
    """
    filas = _filas_flujo(conn, session_id)
    red = red_flujo(filas)
    n_nodos = len(red["nodos"])

    if n_nodos < 2:
        return {"suficiente": False,
                "motivo": "estructura insuficiente: se necesitan al menos un país, "
                          "una aduana y una marca con flujo medido",
                "n_nodos": n_nodos, "marca": None}

    interm = topologia.intermediacion(red)
    comunidad = topologia.detectar_comunidades(red)
    etq = {n["id"]: n["etiqueta"] for n in red["nodos"]}
    kind = {n["id"]: n["kind"] for n in red["nodos"]}
    vol_nodo = {n["id"]: n["unidades"] for n in red["nodos"]}

    brokers = sorted(
        ({"id": nid, "etiqueta": etq[nid], "kind": kind[nid],
          "intermediacion": round(interm[nid], 4), "unidades": vol_nodo[nid]}
         for nid in interm if kind[nid] == "aduana"),
        key=lambda b: (-b["intermediacion"], -b["unidades"], b["etiqueta"]),
    )

    foco = _elegir_marca(filas, marca)
    marca_foco: dict[str, Any] = {"nombre": foco, "es_defecto": foco == MARCA_DEFECTO}
    if foco:
        fm = [f for f in filas if f["marca"] == foco]
        vol_total = sum(f["unidades"] for f in fm)
        val_total = sum(f["valor"] for f in fm)
        # HHI por origen (país) y por aduana, sobre unidades de la marca
        por_pais: dict[str, int] = {}
        por_aduana: dict[str, int] = {}
        for f in fm:
            por_pais[f["pais"]] = por_pais.get(f["pais"], 0) + f["unidades"]
            por_aduana[f["aduana"]] = por_aduana.get(f["aduana"], 0) + f["unidades"]

        # corte crítico y redundancia sobre la subred de la marca, con una
        # super-fuente ORIGEN conectada a cada país (capacidad = su aporte).
        sub = _subred_marca(filas, foco)
        sub_nodos = list(sub["nodos"])
        sub_enlaces = list(sub["enlaces"])
        sub_nodos.append({"id": ORIGEN, "etiqueta": "orígenes", "kind": "origen"})
        for pais, u in sorted(por_pais.items()):
            sub_enlaces.append({"origen": ORIGEN, "destino": _pais_id(pais), "peso": u})
        red_sub = {"nodos": sub_nodos, "enlaces": sub_enlaces}
        destino = _marca_id(foco)
        corte = topologia.min_corte(red_sub, ORIGEN, destino)
        redun = topologia.min_corte(red_sub, ORIGEN, destino, capacidad_unitaria=True)
        vol_corte = sum(c["peso"] for c in corte["corte"])

        def _desglose(d: dict[str, int]) -> list[dict]:
            return [{"nombre": k, "unidades": u,
                     "pct": round(u / vol_total, 4) if vol_total else 0.0}
                    for k, u in sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))]

        marca_foco.update({
            "volumen": vol_total,
            "valor_sigma": round(val_total, 2),
            "n_origenes": len(por_pais),
            "n_aduanas": len(por_aduana),
            "origenes": _desglose(por_pais),
            "aduanas": _desglose(por_aduana),
            "hhi_origenes": hhi(list(por_pais.values())),
            "hhi_aduanas": hhi(list(por_aduana.values())),
            "redundancia_rutas": int(redun["valor"]),
            "corte_critico": {
                "n_rutas": len(corte["corte"]),
                "volumen": vol_corte,
                "pct_suministro": round(vol_corte / vol_total, 4) if vol_total else 0.0,
                "rutas": [
                    {"de": c["etiqueta_origen"], "a": c["etiqueta_destino"],
                     "unidades": c["peso"]}
                    for c in corte["corte"]
                ],
            },
        })

    return {
        "suficiente": True,
        "n_nodos": n_nodos,
        "n_paises": sum(1 for n in red["nodos"] if n["kind"] == "pais"),
        "n_aduanas": sum(1 for n in red["nodos"] if n["kind"] == "aduana"),
        "n_marcas": sum(1 for n in red["nodos"] if n["kind"] == "marca"),
        "n_comunidades": len(set(comunidad.values())),
        "brokers": brokers,
        "marca": marca_foco,
    }
