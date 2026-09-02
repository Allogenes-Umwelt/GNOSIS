"""Read-time ontology projections — Python port of ref_karelen/lib/grafo.ts
and lib/ontologia.ts, over the aduanal tables + the ag_* substrate.

THE law of this module: it never writes. Customs data (sessions,
pedimentos, importaciones, extraccion_facturas) is PROJECTED into the
ontology at read time — no dual writes, no sync. Invoice PDFs that the
legacy pipeline already extracted appear as VIRTUAL artefactos (stable
ids derived from filename) until F4 ingests them as real ag_artefactos.

Node kinds — Frame (grey, documental): nucleo, pedimento, vehiculo,
marca, pais, artefacto, fragmento, producto. Coral (live intelligence):
entidad. Edge kinds: "cita" (structural/provenance) and "relacion"
(typed entity edge), same contract as KARELEN's canvas.
"""
import math
import sqlite3
from typing import Any, Optional

from autogenes import concilia, nomos, topologia, validacion

NUCLEO_PREFIX = "nucleo-sesion-"

# Greek-glyph taxonomy (PANOPTES §1): every node kind is a class of object
# with a canonical glyph, adapted from the TELOS compliance system to the
# aduanal-automotive case. The glyph is NOT ornamental — it names the class.
# Cover band: α Π ν μ ⊕ Δ Σ Φ.
GLIFO_POR_KIND = {
    "nucleo": "α",       # the session — ego of the analysis
    "pedimento": "Π",    # the ruling customs declaration
    "vehiculo": "ν",     # the atomic unit: one chassis/VIN
    "marca": "μ",        # brand aggregator hub
    "pais": "⊕",         # geographic origin
    "artefacto": "Σ",    # documentary source (invoice/note/structured)
    "fragmento": "σ",    # sub-evidence (unit of provenance)
    "producto": "Φ",     # docked deliverable
    "anomalia": "Δ",     # materialized deterministic finding
}
# Entidad subtypes by canonical tipo (tipos.TipoEntidad): person / org / rest.
GLIFO_ENTIDAD = {"persona": "Ψ", "organizacion": "Ω"}
GLIFO_ENTIDAD_DEFECTO = "ε"


def _glifo(kind: str, tipo: Optional[str]) -> str:
    if kind == "entidad":
        return GLIFO_ENTIDAD.get((tipo or "").lower(), GLIFO_ENTIDAD_DEFECTO)
    return GLIFO_POR_KIND.get(kind, "·")


def seed_de(node_id: str) -> float:
    """Stable small hash -> [0, 2*pi) used for shard orientation (port of seedDe)."""
    h = 0
    for ch in node_id:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return (h % 360) * (math.pi / 180)


def _nodo(node_id: str, kind: str, etiqueta: str, tipo: Optional[str] = None,
          extra: Optional[dict] = None) -> dict[str, Any]:
    n: dict[str, Any] = {
        "id": node_id,
        "kind": kind,
        "glifo": _glifo(kind, tipo),
        "etiqueta": etiqueta,
        "grado": 0,
        "seed": seed_de(node_id),
    }
    if tipo:
        n["tipo"] = tipo
    if extra:
        n["extra"] = extra
    return n


def _enlace(enlace_id: str, source: str, target: str, kind: str,
            peso: float, tipo: Optional[str] = None) -> dict[str, Any]:
    e: dict[str, Any] = {
        "id": enlace_id,
        "source": source,
        "target": target,
        "kind": kind,
        "peso": peso,
    }
    if tipo:
        e["tipo"] = tipo
    return e


def _q(conn: sqlite3.Connection, sql: str, params: tuple) -> list[sqlite3.Row]:
    return conn.execute(sql, params).fetchall()


# Anomaly severity by CONCILIA finding class (PANOPTES §1.3). A fixed,
# documented classification of the descuadre TYPE — never an estimated
# amount or probability (ZERO SNAKE OIL): danger = the case does not hold
# (missing amparo, conflicting tariff-determining claim); warn = needs
# adjudication but is not a structural break.
# fuente única de la clasificación de severidad: vive en los motores
SEVERIDAD_CONCILIA = concilia.SEVERIDAD
_severidad_validacion = validacion.severidad_regla


def _proyectar_anomalias(conn: sqlite3.Connection, session_id: int,
                         nodos: list[dict], enlaces: list[dict]) -> int:
    """Project the deterministic findings of the three anomaly engines as Δ
    nodes (PANOPTES §3): CONCILIA (tri-source reconciliation descuadres),
    VALIDACION (per-row non-conformance vs the norm) and NOMOS (operator
    rules that fire). Read-only — the engines read materialized verdicts and
    ag_reglas; sustrato.py stays the only writer of ag_* and no Δ is ever a
    row. Each Δ cites the nodes it implicates (by chassis or filename) and
    tethers to the nucleus. Severity is a fixed classification of the finding
    TYPE, never an estimated amount (ZERO SNAKE OIL). Mutates nodos/enlaces
    in place; returns the anomaly count."""
    nucleo_id = f"{NUCLEO_PREFIX}{session_id}"
    # etiqueta → TODOS los nodos con esa etiqueta: un chasis duplicado tiene
    # varios nodos vehículo, y el hallazgo de VIN-duplicado debe citarlos a
    # todos (last-wins dejaba fuera al co-protagonista de la duplicación)
    chasis_a_nodo: dict[str, list[str]] = {}
    archivo_a_nodo: dict[str, list[str]] = {}
    for n in nodos:
        if n["kind"] == "vehiculo":
            chasis_a_nodo.setdefault(n["etiqueta"], []).append(n["id"])
        elif n["kind"] == "artefacto":
            archivo_a_nodo.setdefault(n["etiqueta"], []).append(n["id"])

    def _objetivos(refs: list[dict], unidades: Optional[list] = None) -> list[str]:
        cadenas = list(unidades or [])
        for ref in refs:
            for clave in ("chasis", "filename"):
                if ref.get(clave):
                    cadenas.append(ref[clave])
        resueltos: list[str] = []
        vistos: set[str] = set()
        for c in cadenas:
            for nid in chasis_a_nodo.get(c) or archivo_a_nodo.get(c) or []:
                if nid not in vistos:
                    vistos.add(nid)
                    resueltos.append(nid)
        return resueltos

    # disposición del operador por motor (O1): el Δ carga su estado del ciclo
    # de vida para que el lienzo pueda apagar lo ya gestionado (tinta
    # fantasma) y no gritar por lo resuelto. Lectura pura; sustrato.py sigue
    # siendo el único escritor.
    from autogenes.disposiciones import leer_disposiciones
    disp_conc = leer_disposiciones(conn, session_id, "concilia")
    disp_val = leer_disposiciones(conn, session_id, "validacion")
    disp_nomos = leer_disposiciones(conn, session_id, "nomos")
    total = 0

    def _delta(clave: str, titulo: str, tipo: str, motor: str, severidad: str,
               detalle: str, n: int, objetivos: list[str],
               estado: str = "nuevo") -> None:
        nonlocal total
        aid = f"anom:{clave}"
        nodo = _nodo(aid, "anomalia", titulo, tipo=tipo,
                     extra={"motor": motor, "regla_id": clave,
                            "detalle": detalle, "n_unidades": n,
                            "estado": estado})
        nodo["severidad"] = severidad
        nodos.append(nodo)
        enlaces.append(_enlace(f"cita-{nucleo_id}-{aid}", nucleo_id, aid, "cita", 0.3))
        for nid in objetivos:
            enlaces.append(_enlace(f"cita-{aid}-{nid}", aid, nid, "cita", 0.6))
        total += 1

    # ── CONCILIA: descuadres de la conciliación tri-fuente ────────────
    for h in concilia.conciliar(conn, session_id)["hallazgos"]:
        _delta(h["clave"], h["titulo"], h["clase"], "concilia",
               SEVERIDAD_CONCILIA.get(h["clase"], "warn"), h["detalle"],
               h["n_unidades"], _objetivos(h.get("refs", []), h.get("unidades")),
               disp_conc.get(h["clave"], {}).get("estado", "nuevo"))

    # ── VALIDACION: reglas de conformidad violadas (n>0) ──────────────
    for r in validacion.validar(conn, session_id)["reglas"]:
        if r["n"] <= 0:
            continue
        _delta(r["clave"], r["titulo"], "validacion", "validacion",
               _severidad_validacion(r["clave"]), r["norma"], r["n"],
               _objetivos(r.get("refs", [])),
               disp_val.get(r["clave"], {}).get("estado", "nuevo"))

    # ── NOMOS: reglas del operador activas que disparan violaciones ───
    for e in nomos.evaluar_reglas(conn, session_id)["reglas"]:
        if not e["activa"] or e["n_violaciones"] <= 0:
            continue
        _delta(f"nomos:{e['id']}", f"{e['nombre']} incumplida", "nomos", "nomos",
               "warn", f"Regla del operador con {e['n_violaciones']} violaciones",
               e["n_violaciones"], _objetivos(e.get("refs", [])),
               disp_nomos.get(e["id"], {}).get("estado", "nuevo"))

    return total


def _anotar_analitica(nodos: list[dict], enlaces: list[dict]) -> int:
    """Annotate each node with its community, articulation-bridge flag and
    normalized eigenvector centrality (PANOPTES §3). Uses the deterministic
    topologia engine, NEVER the NetworkX lens: cross-platform, cross-run
    reproducibility is law (the same graph must open identically). Returns
    the community count. Mutates nodos in place; adds nothing to the graph."""
    red = {
        "nodos": [{"id": n["id"], "etiqueta": n["etiqueta"]} for n in nodos],
        "enlaces": [{"origen": e["source"], "destino": e["target"],
                     "peso": e["peso"]} for e in enlaces],
    }
    comunidad = topologia.detectar_comunidades(red)
    puentes = set(topologia.puentes_articulacion(red))
    centralidad = topologia.centralidad_vector_propio(red)
    for n in nodos:
        n["comunidad"] = comunidad.get(n["id"], 0)
        n["puente"] = n["id"] in puentes
        n["centralidad"] = round(centralidad.get(n["id"], 0.0), 4)
    return len(set(comunidad.values()))


#: Tope de artefactos proyectados cuando el llamador pide uno. El resto se
#: declara en UN nodo agregado — el mismo contrato honesto que
#: `arbol_ontologia` usa con `MAX_HOJAS_POR_RAMA`.
MAX_ARTEFACTOS_LIENZO = 200

#: Caché de la proyección por (session_id, version_de_sesion). La proyección
#: es pura y determinista, así que mientras la versión no se mueva el
#: resultado es el mismo — y lo piden varias superficies en la misma pantalla
#: (lente, snapshot, tools del chat, metabolismo). Mismo patrón que
#: `autogenes/red.py`, que ya cacheaba la lente NetworkX.
_cache: dict[tuple, dict[str, Any]] = {}
_MAX_CACHE = 8


def invalidar_cache(session_id: Optional[int] = None) -> None:
    """Tira la caché de proyección (toda, o la de una sesión)."""
    if session_id is None:
        _cache.clear()
        return
    for clave in [k for k in _cache if k[0] == session_id]:
        del _cache[clave]


def construir_grafo(
    conn: sqlite3.Connection,
    session_id: int,
    limite_vehiculos: Optional[int] = None,
    con_analitica: bool = True,
    con_anomalias: bool = True,
    incluir_documental: bool = True,
    limite_documentos: Optional[int] = None,
) -> dict[str, Any]:
    """One session's whole ontology as {nodos, enlaces}.

    Structure: nucleo (the session) -> pedimentos -> vehiculos; each
    vehiculo cites its marca, pais and (when the tri-source match holds)
    the invoice PDF it arrived under, as a virtual artefacto. Unmatched
    invoice PDFs tether to the nucleus (they exist, nothing sold cites
    them — CONCILIA's raw material). The ag_* substrate rides on top
    exactly like KARELEN's construirGrafo: real artefactos/fragmentos,
    entidades with evidence-derived cita edges, typed relaciones, and
    productos anchored to what they cite.

    `incluir_documental=False` NO construye la capa de artefactos y
    fragmentos. La lente de negocio la construía entera para tirarla después:
    a 8 000 documentos son 16 000 nodos materializados y descartados, y lo
    paga cada lente, snapshot y tool que toque el grafo
    (`docs/DIAGNOSTICO_FABLE_v02.md` §1, S2).

    `limite_documentos` acota los artefactos proyectados y **declara** el
    resto en un nodo agregado: 5 000 PDFs son 20 000 nodos en el JSON y en la
    simulación de fuerzas del navegador (S3).

    El resultado se cachea por `version_de_sesion`; una mutación lo invalida.
    """
    from autogenes.red import version_de_sesion

    # Solo se cachean bases en ARCHIVO. `version_de_sesion` incluye la ruta,
    # y todas las bases en memoria dicen ':memory:': dos bases distintas con
    # los mismos conteos compartirían clave y una serviría el grafo de la
    # otra. En producción la base siempre es un archivo, así que la caché
    # aplica donde importa y no puede mentir donde no aplica.
    version = version_de_sesion(conn, session_id)
    cacheable = version and version[0] not in ("", ":memory:")
    clave_cache = (session_id, limite_vehiculos, con_analitica, con_anomalias,
                   incluir_documental, limite_documentos, version)
    if cacheable:
        en_cache = _cache.get(clave_cache)
        if en_cache is not None:
            return en_cache

    nodos: list[dict] = []
    enlaces: list[dict] = []
    nucleo_id = f"{NUCLEO_PREFIX}{session_id}"

    ses = conn.execute(
        "SELECT month_processed, year_processed FROM processing_sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    etiqueta_ses = (
        f"Sesión {ses['month_processed']:02d}/{ses['year_processed']}" if ses else "Sesión"
    )
    nodos.append(_nodo(nucleo_id, "nucleo", etiqueta_ses))

    # Agregados por pedimento (para el dossier de la tarjeta · aditivo,
    # read-only): nº de vehículos y valor Σ de la fila que cuelga del pedimento.
    ped_agg: dict[Any, dict] = {}
    for r in _q(conn, """SELECT pedimento_id AS pid, COUNT(*) AS n,
                   COALESCE(SUM(precio), 0) AS valor FROM importaciones
                   WHERE session_id = ? AND pedimento_id IS NOT NULL
                   GROUP BY pedimento_id""", (session_id,)):
        ped_agg[r["pid"]] = {"n_vehiculos": r["n"], "valor": r["valor"]}

    # ── pedimentos ────────────────────────────────────────────────────
    ped_proyectados: set[str] = set()
    for r in _q(conn, "SELECT * FROM pedimentos WHERE session_id = ?", (session_id,)):
        pid = f"ped:{r['id']}"
        ped_proyectados.add(pid)
        extra = {"patente": r["patente"], "aduana": r["aduana"],
                 "fecha": r["fecha_pedimento"]}
        extra.update(ped_agg.get(r["id"], {}))
        nodos.append(_nodo(pid, "pedimento", r["numero_pedimento"] or "pedimento",
                           extra=extra))
        enlaces.append(_enlace(f"cita-{nucleo_id}-{pid}", nucleo_id, pid, "cita", 0.6))

    # ── marcas y paises presentes en la sesión (hubs agregadores) ────
    # Agregados por marca/país para la tarjeta dossier (aditivo · read-only):
    # volumen, valor Σ, split de preferencia J/N, modelos y orígenes distintos.
    marca_agg: dict[Any, dict] = {}
    for r in _q(conn, """
            SELECT m.id AS mid, COUNT(*) AS vol, COALESCE(SUM(i.precio), 0) AS valor,
                   SUM(CASE WHEN UPPER(COALESCE(i.j_y_n, '')) = 'J' THEN 1 ELSE 0 END) AS j,
                   SUM(CASE WHEN UPPER(COALESCE(i.j_y_n, '')) = 'N' THEN 1 ELSE 0 END) AS n,
                   COUNT(DISTINCT c.tipo) AS modelos,
                   COUNT(DISTINCT i.pais_code) AS paises
            FROM importaciones i JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
            JOIN marcas m ON c.marca_id = m.id WHERE i.session_id = ?
            GROUP BY m.id""", (session_id,)):
        marca_agg[r["mid"]] = {"volumen": r["vol"], "valor_sigma": r["valor"],
                               "pref_j": r["j"], "pref_n": r["n"],
                               "modelos": r["modelos"], "origenes": r["paises"]}
    # modelo líder por marca: el tipo con más unidades (orden global desc ⇒ la
    # primera fila por marca es su máximo; desempate por nombre = determinista).
    for r in _q(conn, """
            SELECT m.id AS mid, c.tipo AS tipo, COUNT(*) AS n
            FROM importaciones i JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
            JOIN marcas m ON c.marca_id = m.id
            WHERE i.session_id = ? AND c.tipo IS NOT NULL
            GROUP BY m.id, c.tipo ORDER BY n DESC, c.tipo""", (session_id,)):
        d = marca_agg.get(r["mid"])
        if d is not None and "modelo_lider" not in d:
            d["modelo_lider"] = r["tipo"]
            d["lider_n"] = r["n"]
    for r in _q(conn, """
            SELECT DISTINCT m.id AS mid, m.nombre AS nombre
            FROM importaciones i JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
            JOIN marcas m ON c.marca_id = m.id WHERE i.session_id = ?""", (session_id,)):
        nodos.append(_nodo(f"marca:{r['mid']}", "marca", r["nombre"],
                           extra=marca_agg.get(r["mid"])))

    pais_agg: dict[Any, dict] = {}
    for r in _q(conn, """
            SELECT i.pais_code AS pc, COUNT(*) AS vol, COALESCE(SUM(i.precio), 0) AS valor,
                   SUM(CASE WHEN UPPER(COALESCE(i.j_y_n, '')) = 'J' THEN 1 ELSE 0 END) AS j,
                   SUM(CASE WHEN UPPER(COALESCE(i.j_y_n, '')) = 'N' THEN 1 ELSE 0 END) AS n,
                   COUNT(DISTINCT c.marca_id) AS marcas
            FROM importaciones i LEFT JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
            WHERE i.session_id = ? AND i.pais_code IS NOT NULL
            GROUP BY i.pais_code""", (session_id,)):
        pais_agg[r["pc"]] = {"volumen": r["vol"], "valor_sigma": r["valor"],
                             "pref_j": r["j"], "pref_n": r["n"], "marcas": r["marcas"]}
    for r in _q(conn, """
            SELECT DISTINCT pais_code FROM importaciones
            WHERE session_id = ? AND pais_code IS NOT NULL""", (session_id,)):
        nodos.append(_nodo(f"pais:{r['pais_code']}", "pais", r["pais_code"],
                           extra=pais_agg.get(r["pais_code"])))

    # ── vehiculos (la fila del JOIN tri-fuente, con el PDF que lo ampara) ──
    # ORDER BY id antes del cap: qué filas sobreviven al recorte es determinista
    # (mismo grafo se abre idéntico), no orden físico no especificado de SQLite.
    limit_clause = f" LIMIT {int(limite_vehiculos)}" if limite_vehiculos else ""
    vehiculos = _q(conn, f"""
            SELECT i.id, i.chasis, i.auto_code, i.precio, i.pedimento_id,
                   c.marca_id, i.pais_code,
                   (SELECT MIN(ef.filename) FROM extraccion_facturas ef
                     WHERE ef.chasis = i.chasis
                       AND SUBSTR(ef.factura, 1, 8) = SUBSTR(i.factura, 1, 8)
                       AND ef.session_id = i.session_id) AS pdf
            FROM importaciones i
            LEFT JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
            WHERE i.session_id = ? ORDER BY i.id{limit_clause}""", (session_id,))  # noqa: S608 — el LIMIT se fuerza a int(); el resto va ligado

    # artefactos reales ya ingeridos (F4): un PDF que existe como ag_artefacto
    # NO debe duplicarse como artefacto virtual (dos nodos para un documento,
    # evidencia partida). Se remapea la cita al nodo real por nombre.
    art_real_por_nombre = {
        r["nombre"]: r["id"] for r in _q(conn,
            "SELECT id, nombre FROM ag_artefactos"
            " WHERE session_id = ? AND kind = 'pdf'", (session_id,))}

    def _artefacto_pdf(filename: str) -> str:
        """Id del nodo del PDF: el ag_artefacto real si ya fue ingerido, si no
        el virtual (registrado en pdf_ids para materializarse una sola vez)."""
        real = art_real_por_nombre.get(filename)
        if real:
            return real
        return pdf_ids.setdefault(filename, f"art:pdf:{filename}")

    pdf_ids: dict[str, str] = {}
    for v in vehiculos:
        vid = f"veh:{v['id']}"
        nodos.append(_nodo(vid, "vehiculo", v["chasis"] or f"vehículo {v['id']}",
                           tipo=v["auto_code"], extra={"precio": v["precio"]}))
        ped_nodo = f"ped:{v['pedimento_id']}" if v["pedimento_id"] else None
        if ped_nodo and ped_nodo in ped_proyectados:
            enlaces.append(_enlace(f"cita-ped{v['pedimento_id']}-{vid}",
                                   ped_nodo, vid, "cita", 0.5))
        else:
            # pedimento_id nulo O colgante (deriva referencial / cross-sesión):
            # se ancla al núcleo en vez de emitir una arista a un nodo ausente
            enlaces.append(_enlace(f"cita-{nucleo_id}-{vid}", nucleo_id, vid, "cita", 0.3))
        if v["marca_id"]:
            enlaces.append(_enlace(f"cita-{vid}-marca{v['marca_id']}",
                                   vid, f"marca:{v['marca_id']}", "cita", 0.4))
        if v["pais_code"]:
            enlaces.append(_enlace(f"cita-{vid}-pais{v['pais_code']}",
                                   vid, f"pais:{v['pais_code']}", "cita", 0.4))
        if v["pdf"]:
            art_id = _artefacto_pdf(v["pdf"])
            enlaces.append(_enlace(f"cita-{vid}-{art_id}", vid, art_id, "cita", 0.7))

    # Unmatched invoice PDFs: physically arrived, nothing sold cites them.
    for r in _q(conn, """
            SELECT DISTINCT filename FROM extraccion_facturas
            WHERE session_id = ? AND filename IS NOT NULL""", (session_id,)):
        # un PDF ya real (ingerido) cuelga del núcleo como ag_artefacto más
        # abajo; aquí solo se tethera el virtual que aún no existe como real
        if r["filename"] not in pdf_ids and r["filename"] not in art_real_por_nombre:
            art_id = f"art:pdf:{r['filename']}"
            pdf_ids[r["filename"]] = art_id
            enlaces.append(_enlace(f"cita-{nucleo_id}-{art_id}", nucleo_id, art_id,
                                   "cita", 0.3))
    for filename, art_id in pdf_ids.items():
        nodos.append(_nodo(art_id, "artefacto", filename, tipo="pdf",
                           extra={"virtual": True}))

    # ── Facturas extraídas SIN conciliar aún (solo Fase 1, sin DWH):
    # proyecta su contenido — país + vehículo por chasis citando su PDF —
    # para que el grafo tenga cuerpo antes de la conciliación completa.
    # Se saltan los chasis ya proyectados desde importaciones (sin doble).
    # chasis ya vendidos (DWH), UNCAPPED: derivarlo de la lista capada haría que
    # un conciliado fuera del cap reapareciera aquí como 'vehfac' (sin conciliar)
    # — la misma unidad proyectada dos veces con tipos contradictorios
    chasis_conciliados = {
        r["chasis"] for r in _q(conn,
            "SELECT chasis FROM importaciones WHERE session_id = ?"
            " AND chasis IS NOT NULL AND chasis != ''", (session_id,))}
    paises_vistos = {n["id"] for n in nodos if n["kind"] == "pais"}
    vehfac_vistos: set[str] = set()
    lim_fac = int(limite_vehiculos) if limite_vehiculos else 100000
    for r in _q(conn, f"""
            SELECT chasis, auto, pais_code, j_y_n, amount, moneda, filename
            FROM extraccion_facturas
            WHERE session_id = ? AND chasis IS NOT NULL AND chasis != ''
            ORDER BY chasis LIMIT {lim_fac}""", (session_id,)):  # noqa: S608 — el LIMIT se fuerza a int(); el resto va ligado
        if r["chasis"] in chasis_conciliados or r["chasis"] in vehfac_vistos:
            continue
        vehfac_vistos.add(r["chasis"])
        vid = f"vehfac:{r['chasis']}"
        nodos.append(_nodo(vid, "vehiculo", r["chasis"], tipo=r["auto"],
                           extra={"j_y_n": r["j_y_n"], "moneda": r["moneda"]}))
        art_id = pdf_ids.get(r["filename"]) or art_real_por_nombre.get(r["filename"])
        if art_id:
            enlaces.append(_enlace(f"cita-{vid}-{art_id}", vid, art_id, "cita", 0.6))
        if r["pais_code"]:
            pid = f"pais:{r['pais_code']}"
            if pid not in paises_vistos:
                nodos.append(_nodo(pid, "pais", r["pais_code"]))
                paises_vistos.add(pid)
            enlaces.append(_enlace(f"cita-{vid}-{pid}", vid, pid, "cita", 0.4))

    # ── ag_* substrate (port of construirGrafo) ──────────────────────
    artefactos = _q(conn, "SELECT * FROM ag_artefactos WHERE session_id = ?", (session_id,))
    fragmentos = _q(conn, "SELECT * FROM ag_fragmentos WHERE session_id = ?", (session_id,))
    entidades = _q(conn, "SELECT * FROM ag_entidades WHERE session_id = ?", (session_id,))
    relaciones = _q(conn, "SELECT * FROM ag_relaciones WHERE session_id = ?", (session_id,))
    productos = _q(conn, "SELECT * FROM ag_productos WHERE session_id = ?", (session_id,))
    if not incluir_documental:
        # la lente de negocio no ve la fontanería documental: no se consulta,
        # no se materializa y no se descarta después
        artefactos, fragmentos = [], []

    import json as _json

    frag_a_artefacto = {f["id"]: f["artefacto_id"] for f in fragmentos}
    ids_artefacto = {a["id"] for a in artefactos}
    ids_entidad = {e["id"] for e in entidades}

    if limite_documentos and len(artefactos) > limite_documentos:
        # se recorta por ORDEN ESTABLE (el que trae la consulta) y el resto se
        # DECLARA: un lienzo que muestra 200 de 5 000 sin decirlo miente
        recortados = len(artefactos) - limite_documentos
        artefactos = artefactos[:limite_documentos]
        visibles = {a["id"] for a in artefactos}
        fragmentos = [f for f in fragmentos if f["artefacto_id"] in visibles]
        agregado_id = f"{nucleo_id}:documentos-resto"
        nodos.append(_nodo(agregado_id, "agregado", f"+{recortados} documentos",
                           extra={"total_recortado": recortados}))
        enlaces.append(_enlace(f"cita-{nucleo_id}-{agregado_id}", nucleo_id,
                               agregado_id, "cita", 0.2))
    for a in artefactos:
        nodos.append(_nodo(a["id"], "artefacto", a["nombre"], tipo=a["kind"]))
        enlaces.append(_enlace(f"cita-{nucleo_id}-{a['id']}", nucleo_id, a["id"], "cita", 0.4))
    for f in fragmentos:
        etiqueta = f"p. {f['pagina']}" if f["pagina"] else "fragmento"
        nodos.append(_nodo(f["id"], "fragmento", etiqueta))
        enlaces.append(_enlace(f"cita-{f['id']}-{f['artefacto_id']}",
                               f["id"], f["artefacto_id"], "cita", 0.5))

    # Cita edges: entidad -> artefacto, deduped, weighted by evidence count.
    for e in entidades:
        conteo: dict[str, int] = {}
        for frag_id in _json.loads(e["evidencia"] or "[]"):
            art_id = frag_a_artefacto.get(frag_id)
            if art_id and art_id in ids_artefacto:
                conteo[art_id] = conteo.get(art_id, 0) + 1
        for art_id, n in conteo.items():
            enlaces.append(_enlace(f"cita-{e['id']}-{art_id}", e["id"], art_id,
                                   "cita", min(1.0, 0.3 + n * 0.2)))
        nodos.append(_nodo(e["id"], "entidad", e["nombre"], tipo=e["tipo"],
                           extra={"origen": e["origen"]}))

    # Relacion edges: only when both endpoints exist.
    for r in relaciones:
        if r["desde_id"] in ids_entidad and r["hasta_id"] in ids_entidad:
            # `peso` del enlace es el peso ESTRUCTURAL del lienzo (muelle,
            # grosor, centralidad), y sigue saliendo de lo que declaró quien
            # afirmó la arista. NO es la confianza: esa se deriva aparte, en
            # `autogenes/confianza.py`, contando fuentes independientes.
            enlaces.append(_enlace(r["id"], r["desde_id"], r["hasta_id"],
                                   "relacion", r["peso_declarado"],
                                   tipo=r["tipo"]))

    # Productos: docked deliverables cite their anchors. Las investigaciones
    # (P1) son META — un snapshot de navegación sobre el propio grafo, no un
    # hallazgo del caso: no se proyectan como nodo (ensuciarían el lienzo).
    for p in productos:
        if p["clase"] == "investigacion":
            continue
        nodos.append(_nodo(p["id"], "producto", p["titulo"], tipo=p["clase"]))
        for eid in _json.loads(p["entidades"] or "[]"):
            if eid in ids_entidad:
                enlaces.append(_enlace(f"cita-{p['id']}-{eid}", p["id"], eid, "cita", 0.6))
        citados = {frag_a_artefacto.get(fid) for fid in _json.loads(p["evidencia"] or "[]")}
        for art_id in citados:
            if art_id and art_id in ids_artefacto:
                enlaces.append(_enlace(f"cita-{p['id']}-{art_id}", p["id"], art_id,
                                       "cita", 0.4))

    # ── anomalías (Δ) desde CONCILIA ─────────────────────────────────
    n_anomalias = 0
    if con_anomalias:
        n_anomalias = _proyectar_anomalias(conn, session_id, nodos, enlaces)

    # ── grados ────────────────────────────────────────────────────────
    grados: dict[str, int] = {}
    for enl in enlaces:
        grados[enl["source"]] = grados.get(enl["source"], 0) + 1
        grados[enl["target"]] = grados.get(enl["target"], 0) + 1
    for n in nodos:
        n["grado"] = grados.get(n["id"], 0)

    meta: dict[str, Any] = {"comunidades": 0, "anomalias": n_anomalias}
    if con_analitica:
        meta["comunidades"] = _anotar_analitica(nodos, enlaces)

    grafo = {"nodos": nodos, "enlaces": enlaces, "meta": meta}
    if cacheable:
        if len(_cache) >= _MAX_CACHE:
            _cache.pop(next(iter(_cache)))
        _cache[clave_cache] = grafo
    return grafo


# ── The ingestion map: single-parent hierarchy for the dendrogram ────

MAX_HOJAS_POR_RAMA = 40


def arbol_ontologia(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """The session as a single-parent tree (port of arbolOntologia):
    nucleo -> marcas -> pedimentos -> vehiculo leaves, plus a fuentes
    branch with the ag_* artefactos -> fragment rollups -> entidades.
    A pedimento hangs from the marca of the majority of its vehicles.
    Branches beyond MAX_HOJAS_POR_RAMA leaves roll up into one
    "agregado" node so the canvas stays legible; tamano always counts
    the REAL total."""

    def rama(rama_id: str, etiqueta: str, kind: str, hijos: list[dict],
             tamano: Optional[int] = None) -> dict[str, Any]:
        return {
            "id": rama_id,
            "etiqueta": etiqueta,
            "kind": kind,
            "hijos": hijos,
            "tamano": tamano if tamano is not None else
            (sum(h["tamano"] for h in hijos) if hijos else 1),
        }

    def poda(hojas: list[dict], rama_id: str) -> list[dict]:
        if len(hojas) <= MAX_HOJAS_POR_RAMA:
            return hojas
        visibles = hojas[:MAX_HOJAS_POR_RAMA]
        resto = len(hojas) - MAX_HOJAS_POR_RAMA
        visibles.append(rama(f"{rama_id}:resto", f"+{resto} más", "agregado", [],
                             tamano=resto))
        return visibles

    filas = _q(conn, """
            SELECT i.id, i.chasis, i.pedimento_id, c.marca_id, m.nombre AS marca,
                   p.numero_pedimento
            FROM importaciones i
            LEFT JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
            LEFT JOIN marcas m ON c.marca_id = m.id
            LEFT JOIN pedimentos p ON i.pedimento_id = p.id
            WHERE i.session_id = ?""", (session_id,))

    # pedimento -> vehicles; pedimento -> majority marca
    por_pedimento: dict[Any, list[sqlite3.Row]] = {}
    for f in filas:
        por_pedimento.setdefault(f["pedimento_id"], []).append(f)

    ramas_por_marca: dict[str, list[dict]] = {}
    for ped_id, veh in por_pedimento.items():
        marcas = [v["marca"] for v in veh if v["marca"]]
        # sorted() antes de max estabiliza el desempate: iterar un set de
        # strings varía con PYTHONHASHSEED y hacía que el árbol colgara el
        # pedimento de una u otra marca entre reinicios (no reproducible).
        marca = (max(sorted(set(marcas)), key=marcas.count)
                 if marcas else "Sin marca")
        numero = veh[0]["numero_pedimento"] or "sin pedimento"
        hojas = [rama(f"veh:{v['id']}", v["chasis"] or str(v["id"]), "dato", [])
                 for v in veh]
        ramas_por_marca.setdefault(marca, []).append(
            rama(f"ped:{ped_id}", numero, "campo", poda(hojas, f"ped:{ped_id}"),
                 tamano=len(hojas)))

    hijos_nucleo = [
        rama(f"marca:{nombre}", nombre, "campo", ramas,
             tamano=sum(r["tamano"] for r in ramas))
        for nombre, ramas in sorted(ramas_por_marca.items())
    ]

    # fuentes branch: the ag_* substrate
    artefactos = _q(conn, "SELECT * FROM ag_artefactos WHERE session_id = ?", (session_id,))
    fragmentos = _q(conn, "SELECT artefacto_id, COUNT(*) AS n FROM ag_fragmentos"
                          " WHERE session_id = ? GROUP BY artefacto_id", (session_id,))
    entidades = _q(conn, "SELECT id, nombre FROM ag_entidades WHERE session_id = ?",
                   (session_id,))
    frags_de = {f["artefacto_id"]: f["n"] for f in fragmentos}
    if artefactos or entidades:
        ramas_art = []
        for a in artefactos:
            hijos_a = []
            n_frags = frags_de.get(a["id"], 0)
            if n_frags:
                hijos_a.append(rama(f"{a['id']}:frags", f"{n_frags} fragmentos",
                                    "agregado", [], tamano=n_frags))
            ramas_art.append(rama(a["id"], a["nombre"], "artefacto", hijos_a,
                                  tamano=max(1, n_frags)))
        hojas_ent = poda([rama(e["id"], e["nombre"], "entidad", []) for e in entidades],
                         "entidades")
        if hojas_ent:
            ramas_art.append(rama("entidades", "entidades", "campo", hojas_ent,
                                  tamano=len(entidades)))
        hijos_nucleo.append(rama("fuentes", "fuentes", "campo", ramas_art,
                                 tamano=sum(r["tamano"] for r in ramas_art)))

    ses = conn.execute(
        "SELECT month_processed, year_processed FROM processing_sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    etiqueta = (f"Sesión {ses['month_processed']:02d}/{ses['year_processed']}"
                if ses else "Sesión")
    return rama(f"{NUCLEO_PREFIX}{session_id}", etiqueta, "nucleo", hijos_nucleo,
                tamano=sum(h["tamano"] for h in hijos_nucleo) or 1)
