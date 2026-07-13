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
import math
import sqlite3
from typing import Any, Optional

from autogenes import topologia

# Marca protagonista por defecto del ángulo de negocio (VW). Si no está en la
# sesión, el análisis cae a la marca de mayor volumen (se declara el sujeto).
MARCA_DEFECTO = "VOLKSWAGEN"

ORIGEN = "__origen__"   # super-fuente para el corte país→marca (no es un nodo real)


def _filas_flujo(conn: sqlite3.Connection, session_id: int) -> list[dict]:
    """Materia prima MEDIDA: por (país, aduana, marca), unidades, valor Σ y el
    split de preferencia arancelaria J/N. Una fila = un triple con su volumen
    real. Orden estable (determinista)."""
    filas = conn.execute(
        """SELECT i.pais_code AS pais, p.aduana AS aduana, m.nombre AS marca,
                  COUNT(*) AS unidades, COALESCE(SUM(i.precio), 0) AS valor,
                  SUM(CASE WHEN UPPER(COALESCE(i.j_y_n, '')) = 'J' THEN 1 ELSE 0 END) AS j,
                  SUM(CASE WHEN UPPER(COALESCE(i.j_y_n, '')) = 'N' THEN 1 ELSE 0 END) AS n
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
             "unidades": r["unidades"], "valor": r["valor"],
             "j": r["j"], "n": r["n"]} for r in filas]


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


def _vector_marca(filas: list[dict], marca: str) -> tuple[dict[str, float], int]:
    """Feature-vector conductual de una marca: share de unidades por origen,
    por aduana, y share de preferencia J. Normalizado a proporciones (para que
    marcas de distinto volumen sean comparables)."""
    fm = [f for f in filas if f["marca"] == marca]
    total = sum(f["unidades"] for f in fm)
    if total == 0:
        return {}, 0
    vec: dict[str, float] = {}
    j_total = 0
    for f in fm:
        vec[f"pais:{f['pais']}"] = vec.get(f"pais:{f['pais']}", 0.0) + f["unidades"]
        vec[f"aduana:{f['aduana']}"] = vec.get(f"aduana:{f['aduana']}", 0.0) + f["unidades"]
        j_total += f["j"]
    v = {k: u / total for k, u in vec.items()}
    v["pref:J"] = j_total / total
    return v, total


def _coseno(a: dict[str, float], b: dict[str, float]) -> float:
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in set(a) | set(b))
    na = math.sqrt(sum(x * x for x in a.values()))
    nb = math.sqrt(sum(x * x for x in b.values()))
    return dot / (na * nb) if na > 0 and nb > 0 else 0.0


def similitud_conductual(filas: list[dict], marca_foco: str,
                         top: int = 3, minimo: int = 3) -> list[dict]:
    """Qué marcas se comportan como la foco: distancia coseno entre sus
    feature-vectors conductuales, con el porqué (features compartidos). No usa
    la red; es aritmética sobre proporciones medidas. Marcas por debajo de
    `minimo` unidades se declaran muestra insuficiente y se omiten del ranking."""
    vfoco, nfoco = _vector_marca(filas, marca_foco)
    if not vfoco:
        return []
    out = []
    for m in sorted({f["marca"] for f in filas if f["marca"] != marca_foco}):
        vm, nm = _vector_marca(filas, m)
        if not vm or nm < minimo:
            continue
        comp = sorted(((k, min(vfoco.get(k, 0.0), vm.get(k, 0.0)))
                       for k in set(vfoco) & set(vm)), key=lambda kv: -kv[1])
        out.append({"marca": m, "similitud": round(_coseno(vfoco, vm), 4), "n": nm,
                    "comparten": [k for k, v in comp if v > 0.1][:2]})
    out.sort(key=lambda o: (-o["similitud"], -o["n"], o["marca"]))
    return out[:top]


def brecha_jn(filas: list[dict], marca_foco: str, umbral: float = 0.05) -> list[dict]:
    """¿La marca foco usa la preferencia arancelaria J MENOS que sus pares en
    rutas país-aduana idénticas? Comparación MEDIDA en share/unidades, jamás en
    pesos (no hay tasas arancelarias como dato). Solo rutas donde los pares
    usan J por encima del umbral más que la foco (la oportunidad medible)."""
    rutas: dict[tuple, dict] = {}
    for f in filas:
        if f["marca"] == marca_foco:
            d = rutas.setdefault((f["pais"], f["aduana"]), {"j": 0, "total": 0})
            d["j"] += f["j"]
            d["total"] += f["unidades"]
    out = []
    for (pais, aduana), df in sorted(rutas.items()):
        pj, pt = 0, 0
        for f in filas:
            if f["marca"] != marca_foco and f["pais"] == pais and f["aduana"] == aduana:
                pj += f["j"]
                pt += f["unidades"]
        if pt == 0 or df["total"] == 0:
            continue
        share_foco = df["j"] / df["total"]
        share_pares = pj / pt
        if share_pares - share_foco > umbral:
            out.append({"pais": pais, "aduana": aduana,
                        "share_foco": round(share_foco, 4),
                        "share_pares": round(share_pares, 4),
                        "unidades_foco": df["total"],
                        "brecha": round(share_pares - share_foco, 4)})
    out.sort(key=lambda b: (-b["brecha"], b["pais"], b["aduana"]))
    return out


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
            "similitud_conductual": similitud_conductual(filas, foco),
            "brecha_jn": brecha_jn(filas, foco),
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
