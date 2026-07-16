"""CONSULTAS (F8) — el grafo como preguntas respondibles para Gnosis AI.

Seis primitivas puras de LECTURA que el chat expone como tools. La ley
de este módulo: cada respuesta que afirma algo del caso llega con su
procedencia resuelta fragmento → página → PDF (`_citas`), y cuando no
hay nada que citar se dice — nunca se inventa una referencia.

- expediente_entidad: el dossier de una entidad — datos, citas,
  relaciones tipadas, eventos y productos que la anclan.
- camino_entre / vecindario_de: las primitivas de caminos.py resueltas
  por NOMBRE (el modelo no conoce ids) y con la evidencia citada.
- resumen_grafo: los hechos estructurales de topologia.resumen_red
  más los monolitos por centralidad, todo etiquetado.
- senales_caso: el Radar condensado (vencimientos, fuentes frías,
  huérfanas, pendientes de negocio).
- hallazgos_pendientes: las anomalías QUALIA medidas contra la base del
  operador + el detalle de faltantes/errores del pipeline aduanal.

Nada aquí escribe; ni siquiera bitácora. Las funciones aceptan
(conn, session_id) como todo motor del sustrato.
"""
import json
import sqlite3
from typing import Any, Optional

MAX_CITAS = 8
MAX_EXTRACTO = 240
MAX_CANDIDATOS = 8
MAX_POR_ANILLO = 20

# orden de preferencia al resolver un nombre ambiguo entre kinds
_PRIORIDAD_KIND = {"entidad": 0, "marca": 1, "pais": 2, "pedimento": 3,
                   "artefacto": 4, "producto": 5, "vehiculo": 6,
                   "fragmento": 7, "nucleo": 8}


def _citas(conn: sqlite3.Connection, session_id: int, frag_ids: list[str],
           maximo: int = MAX_CITAS) -> list[dict[str, Any]]:
    """Resuelve ids de fragmento a citas legibles: fuente (PDF/nota),
    página y un extracto corto. Ids inexistentes simplemente no citan."""
    unicos = list(dict.fromkeys(frag_ids))[:maximo]
    if not unicos:
        return []
    marcadores = ",".join("?" * len(unicos))
    filas = {
        r["id"]: r
        for r in conn.execute(
            f"SELECT f.id, f.pagina, f.texto, a.nombre AS fuente, a.kind"
            f" FROM ag_fragmentos f JOIN ag_artefactos a ON f.artefacto_id = a.id"
            f" WHERE f.id IN ({marcadores}) AND f.session_id = ?",  # noqa: S608
            (*unicos, session_id),
        )
    }
    return [
        {
            "fragmento": fid,
            "fuente": filas[fid]["fuente"],
            "tipo_fuente": filas[fid]["kind"],
            "pagina": filas[fid]["pagina"],
            "extracto": (filas[fid]["texto"] or "").strip()[:MAX_EXTRACTO],
        }
        for fid in unicos
        if fid in filas
    ]


def _candidato(n: dict[str, Any]) -> dict[str, Any]:
    return {"id": n["id"], "etiqueta": n["etiqueta"], "kind": n["kind"],
            "tipo": n.get("tipo")}


def resolver_nodo(conn: sqlite3.Connection, session_id: int,
                  nombre: str) -> dict[str, Any]:
    """Resuelve un nombre humano a UN nodo del grafo de la sesión.
    Exacto (sin mayúsculas) gana a contiene; entidad gana a los demás
    kinds. Ambigüedad honesta: si varios empatan se devuelven candidatos
    en lugar de adivinar."""
    from autogenes.red import red_de_sesion

    buscado = (nombre or "").strip().lower()
    if not buscado:
        return {"error": "Nombre vacío"}
    red = red_de_sesion(conn, session_id)

    exactos: list[dict] = []
    parciales: list[dict] = []
    for nid, attrs in red.nodes(data=True):
        etiqueta = (attrs.get("etiqueta") or "").strip()
        n = {"id": nid, "etiqueta": etiqueta, "kind": attrs.get("kind"),
             "tipo": attrs.get("tipo")}
        bajo = etiqueta.lower()
        if bajo == buscado:
            exactos.append(n)
        elif buscado in bajo:
            parciales.append(n)

    # alias de entidades (JSON) cuentan como coincidencia exacta
    if not exactos:
        for r in conn.execute(
            "SELECT id, nombre, tipo, alias FROM ag_entidades WHERE session_id = ?",
            (session_id,),
        ):
            alias = [a.strip().lower() for a in json.loads(r["alias"] or "[]")]
            if buscado in alias and r["id"] in red:
                exactos.append({"id": r["id"], "etiqueta": r["nombre"],
                                "kind": "entidad", "tipo": r["tipo"]})

    def ordenar(lista: list[dict]) -> list[dict]:
        return sorted(lista, key=lambda n: (
            _PRIORIDAD_KIND.get(n["kind"], 9), n["etiqueta"], n["id"]))

    grupo = ordenar(exactos) or ordenar(parciales)
    if not grupo:
        return {"error": f"«{nombre}» no está en el grafo de la sesión"}
    mejor_kind = grupo[0]["kind"]
    empate = [n for n in grupo if n["kind"] == mejor_kind]
    if len(empate) > 1:
        return {"ambiguo": True,
                "candidatos": [_candidato(n) for n in grupo[:MAX_CANDIDATOS]]}
    return _candidato(empate[0])


# ── 1 · expediente_entidad ───────────────────────────────────────────


def expediente_entidad(conn: sqlite3.Connection, session_id: int,
                       nombre: str) -> dict[str, Any]:
    """El dossier citado de una entidad del sustrato: qué es, qué
    fragmentos la sostienen (fuente + página), con quién se relaciona y
    con qué evidencia, en qué eventos aparece y qué productos la anclan."""
    buscado = (nombre or "").strip()
    if not buscado:
        return {"error": "Nombre vacío"}

    filas = conn.execute(
        "SELECT * FROM ag_entidades WHERE session_id = ? AND LOWER(nombre) = LOWER(?)",
        (session_id, buscado),
    ).fetchall()
    if not filas:
        filas = [
            r for r in conn.execute(
                "SELECT * FROM ag_entidades WHERE session_id = ?", (session_id,))
            if buscado.lower() in [a.strip().lower()
                                   for a in json.loads(r["alias"] or "[]")]
        ]
    if not filas:
        filas = conn.execute(
            "SELECT * FROM ag_entidades WHERE session_id = ? AND nombre LIKE ?"
            " ORDER BY nombre",
            (session_id, f"%{buscado}%"),
        ).fetchall()
    if not filas:
        return {"error": f"No hay entidad «{nombre}» en el caso"}
    if len(filas) > 1:
        return {"ambiguo": True,
                "candidatos": [{"nombre": r["nombre"], "tipo": r["tipo"]}
                               for r in filas[:MAX_CANDIDATOS]]}

    e = filas[0]
    evidencia = json.loads(e["evidencia"] or "[]")

    relaciones = []
    for r in conn.execute(
        "SELECT r.tipo, r.peso, r.evidencia, r.desde_id, r.hasta_id,"
        "       ed.nombre AS desde_nombre, eh.nombre AS hasta_nombre"
        " FROM ag_relaciones r"
        " JOIN ag_entidades ed ON r.desde_id = ed.id"
        " JOIN ag_entidades eh ON r.hasta_id = eh.id"
        " WHERE r.session_id = ? AND (r.desde_id = ? OR r.hasta_id = ?)"
        " ORDER BY r.peso DESC, r.id",
        (session_id, e["id"], e["id"]),
    ):
        sale = r["desde_id"] == e["id"]
        relaciones.append({
            "con": r["hasta_nombre"] if sale else r["desde_nombre"],
            "tipo": r["tipo"],
            "direccion": "sale" if sale else "entra",
            "peso": r["peso"],
            "citas": _citas(conn, session_id,
                            json.loads(r["evidencia"] or "[]"), maximo=3),
        })

    # ag_eventos.entidades guarda NOMBRES (así los poda sustrato.quitar_entidad
    # y los cita la extracción), no ids: emparejar por id dejaba la sección de
    # eventos SIEMPRE vacía en producción. Se busca por nombre + alias.
    nombres_ent = [e["nombre"], *json.loads(e["alias"] or "[]")]
    cond_ev = " OR ".join("entidades LIKE ?" for _ in nombres_ent)
    params_ev = [f'%"{n}"%' for n in nombres_ent]
    eventos = [
        {"titulo": r["titulo"], "fecha": r["fecha"], "precision": r["precision"]}
        for r in conn.execute(
            "SELECT titulo, fecha, precision FROM ag_eventos"
            f" WHERE session_id = ? AND ({cond_ev}) ORDER BY fecha",
            (session_id, *params_ev),
        )
    ]
    # ag_productos.entidades guarda IDS (así los poda quitar_entidad): id correcto.
    productos = [
        {"titulo": r["titulo"], "clase": r["clase"], "unidad": r["unidad"]}
        for r in conn.execute(
            "SELECT titulo, clase, unidad FROM ag_productos"
            " WHERE session_id = ? AND entidades LIKE ? ORDER BY created_at",
            (session_id, f'%"{e["id"]}"%'),
        )
    ]

    return {
        "entidad": {
            "nombre": e["nombre"],
            "tipo": e["tipo"],
            "resumen": e["resumen"],
            "origen": e["origen"],
            "alias": json.loads(e["alias"] or "[]"),
        },
        "citas": _citas(conn, session_id, evidencia),
        "total_citas": len(evidencia),
        "relaciones": relaciones,
        "eventos": eventos,
        "productos": productos,
    }


# ── 2 · camino_entre ─────────────────────────────────────────────────


def camino_entre(conn: sqlite3.Connection, session_id: int,
                 desde: str, hasta: str) -> dict[str, Any]:
    """El camino más corto entre dos nombres del caso, cada salto con su
    arista tipada y las citas que la sostienen. Sin camino se dice."""
    from autogenes.caminos import camino_mas_corto

    extremos = {}
    for rol, nombre in (("desde", desde), ("hasta", hasta)):
        r = resolver_nodo(conn, session_id, nombre)
        if "id" not in r:
            return {**r, "para": nombre}
        extremos[rol] = r

    camino = camino_mas_corto(conn, session_id,
                              extremos["desde"]["id"], extremos["hasta"]["id"])
    if camino is None:
        return {"error": f"No existe camino entre «{desde}» y «{hasta}» — "
                         "viven en islas distintas del grafo"}

    def _punta(n: dict) -> dict:
        return {"etiqueta": n["etiqueta"], "kind": n["kind"]}

    saltos = [
        {
            "de": _punta(s["de"]),
            "a": _punta(s["a"]),
            "tipo": s["arista"].get("tipo") or s["arista"].get("kind"),
            "citas": _citas(conn, session_id, s["evidencia"], maximo=3),
        }
        for s in camino["saltos"]
    ]
    return {
        "desde": _punta(camino["desde"]),
        "hasta": _punta(camino["hasta"]),
        "largo": camino["largo"],
        "saltos": saltos,
        "citas": _citas(conn, session_id, camino["evidencia"]),
    }


# ── 3 · vecindario_de ────────────────────────────────────────────────


def vecindario_de(conn: sqlite3.Connection, session_id: int,
                  nombre: str, grados: int = 2) -> dict[str, Any]:
    """Los vecinos a <= N grados de un nombre, por anillo de distancia.
    Cada anillo se acota a MAX_POR_ANILLO y declara cuántos omite."""
    from autogenes.caminos import vecindario

    r = resolver_nodo(conn, session_id, nombre)
    if "id" not in r:
        return r
    grados = max(1, min(int(grados), 4))
    v = vecindario(conn, session_id, r["id"], grados=grados)
    if v is None:
        return {"error": f"«{nombre}» no está en el grafo de la sesión"}
    anillos = []
    for anillo in v["anillos"]:
        nodos = anillo["nodos"]
        anillos.append({
            "distancia": anillo["distancia"],
            "nodos": [{"etiqueta": n["etiqueta"], "kind": n["kind"],
                       "tipo": n.get("tipo")} for n in nodos[:MAX_POR_ANILLO]],
            "omitidos": max(0, len(nodos) - MAX_POR_ANILLO),
        })
    return {"centro": v["centro"]["etiqueta"], "grados": grados,
            "total": v["total"], "anillos": anillos}


# ── 4 · resumen_grafo ────────────────────────────────────────────────


def resumen_grafo(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """Los hechos estructurales del caso: tamaño, densidad, comunidades,
    islas, concentradores, puentes de articulación, ley de grado y los
    tres monolitos por centralidad. Todo salida del motor F7."""
    from autogenes import topologia
    from autogenes.qualia import red_de_sesion

    red = red_de_sesion(conn, session_id)
    resumen = topologia.resumen_red(red)
    etiqueta_de = {n["id"]: n["etiqueta"] for n in red["nodos"]}
    masas = topologia.centralidad_vector_propio(red)
    monolitos = [
        {"etiqueta": etiqueta_de.get(nid, nid), "masa": round(m, 2)}
        for nid, m in sorted(masas.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
    ]
    return {
        "n_nodos": resumen["n_nodos"],
        "n_enlaces": resumen["n_enlaces"],
        "densidad": round(resumen["densidad"], 4),
        "n_comunidades": resumen["n_comunidades"],
        "n_componentes": resumen["n_componentes"],
        "comunidad_mayor": resumen["comunidad_mayor"],
        "exponente": (round(resumen["exponente"], 2)
                      if resumen["exponente"] is not None else None),
        "hubs": [{"etiqueta": h["etiqueta"], "grado": round(h["grado"], 1)}
                 for h in resumen["hubs"]],
        "puentes": [p["etiqueta"] for p in resumen["puentes"]],
        "monolitos": monolitos,
    }


# ── 5 · senales_caso ─────────────────────────────────────────────────


def senales_caso(conn: sqlite3.Connection, session_id: int,
                 hoy: Optional[str] = None) -> dict[str, Any]:
    """El Radar condensado para el chat: totales + los primeros items de
    cada señal. El detalle de anomalías vive en hallazgos_pendientes."""
    from autogenes.senales import senales_de_sesion

    s = senales_de_sesion(conn, session_id, hoy=hoy)
    return {
        "total": s["total"],
        "ventana_dias": s["ventana_dias"],
        "vencimientos": s["vencimientos"][:10],
        "fuentes_frias": [{"nombre": f["nombre"], "kind": f["kind"]}
                          for f in s["fuentes_frias"][:10]],
        "total_fuentes_frias": len(s["fuentes_frias"]),
        "huerfanas": [{"nombre": h["nombre"], "tipo": h["tipo"]}
                      for h in s["huerfanas"][:15]],
        "total_huerfanas": len(s["huerfanas"]),
        "negocio": s["negocio"],
        "n_anomalias": len(s["anomalias"]),
    }


# ── 6 · hallazgos_pendientes ─────────────────────────────────────────


def hallazgos_pendientes(conn: sqlite3.Connection,
                         session_id: int) -> dict[str, Any]:
    """Lo que exige atención del operador: anomalías QUALIA medidas
    contra la línea base (o el motivo honesto de por qué no las hay) y
    el detalle de faltantes/errores del pipeline aduanal."""
    from autogenes.qualia import anomalias_de_sesion

    a = anomalias_de_sesion(conn, session_id)
    faltantes = [r["factura"] for r in conn.execute(
        "SELECT factura FROM facturas_faltantes WHERE session_id = ? LIMIT 10",
        (session_id,))]
    errores = [r["filename"] for r in conn.execute(
        "SELECT filename FROM facturas_errores WHERE session_id = ? LIMIT 10",
        (session_id,))]
    total_faltantes = conn.execute(
        "SELECT COUNT(*) FROM facturas_faltantes WHERE session_id = ?",
        (session_id,)).fetchone()[0]
    total_errores = conn.execute(
        "SELECT COUNT(*) FROM facturas_errores WHERE session_id = ?",
        (session_id,)).fetchone()[0]

    salida: dict[str, Any] = {
        "tiene_base": a["base"] is not None,
        "anomalias": [
            {"titulo": h["titulo"], "detalle": h["detalle"],
             "severidad": round(h["severidad"], 2), "clave": h["clave"]}
            for h in a["hallazgos"]
        ],
        "negocio": {
            "facturas_faltantes": faltantes,
            "total_faltantes": total_faltantes,
            "facturas_con_error": errores,
            "total_errores": total_errores,
        },
    }
    if a["base"] is None:
        salida["motivo"] = a["motivo"]
    return salida
