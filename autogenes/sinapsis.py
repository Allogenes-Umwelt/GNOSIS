"""SINAPSIS (F11) — insights por recombinación verificada.

Un insight NO es un dato nuevo: es la conjunción de hechos que dos
motores ya calcularon y que ninguno ve solo. La ley del módulo:

1. `componer_insights` es PURA: recibe las salidas de los motores
   (QUALIA resumen + monolitos, CONCILIA, cupos, VALIDACIÓN) y solo
   compone — jamás recalcula ni inventa. Un insight existe únicamente
   si sus dos hechos componentes existen en las salidas: verificado por
   construcción.
2. Cada insight carga sus `hechos` con el motor de origen — la cadena
   de composición es auditable pieza por pieza.
3. `gravedad` deriva de medidas de los componentes (masa del monolito,
   grado del puente normalizado, proporción unidades/saldo), nunca de
   un número inventado.
4. Sin conjunción no hay insight y el tablero lo dice — cero placebo.

Detectores (ola 1):
- puente_en_riesgo (QUALIA × CONCILIA): un puente de articulación del
  grafo es también protagonista de un hallazgo de conciliación — la
  pieza que sostiene la estructura es la pieza en duda.
- monolito_no_conciliado (QUALIA × CONCILIA): un top-3 por centralidad
  aparece en las unidades/refs de un hallazgo.
- cupo_comprometido (CONCILIA × CONCILIA cupos): las vendidas sin
  llegada equivalen a una fracción del saldo del cupo — su arribo
  pendiente compromete la proyección.
- error_confirmado (CONCILIA × VALIDACIÓN): un chasis en disputa J/N
  que además viola la norma J/N por país — dos motores independientes
  sobre la misma fila ya no es discrepancia: es error confirmado.

El volante insight→regla (NOMOS) y el dockeo re-anclador llegan en la
ola 2. Todo es lectura pura; no hay modelo ni escritura.
"""
import sqlite3
from typing import Any, Optional

MAX_REFS = 10


def _insight(clave: str, titulo: str, lectura: str, motores: list[str],
             hechos: list[dict], gravedad: float, accion: str,
             refs: Optional[list] = None) -> dict[str, Any]:
    return {
        "clave": clave,
        "titulo": titulo,
        "lectura": lectura,
        "motores": motores,
        "hechos": hechos,
        "gravedad": round(max(0.0, min(1.0, gravedad)), 2),
        "accion": accion,
        "refs": (refs or [])[:MAX_REFS],
    }


def _protagonistas_concilia(conc: dict[str, Any]) -> dict[str, list[str]]:
    """etiqueta -> claves de hallazgo donde aparece (chasis, factura o
    PDF citado). La membresía ES la verificación."""
    donde: dict[str, list[str]] = {}
    for h in conc.get("hallazgos", []):
        nombres: set[str] = set(h.get("unidades", []))
        for r in h.get("refs", []):
            for campo in ("chasis", "factura", "filename"):
                v = r.get(campo)
                if v:
                    nombres.add(v)
        for n in nombres:
            donde.setdefault(n, []).append(h["clave"])
    return donde


def componer_insights(resumen: dict[str, Any], monolitos: list[dict],
                      conc: dict[str, Any], cupos: dict[str, Any],
                      val: dict[str, Any]) -> list[dict[str, Any]]:
    """La recombinación pura: conjunciones entre salidas de motores.
    Ordena por gravedad descendente; sin conjunción, lista vacía."""
    insights: list[dict[str, Any]] = []
    protagonistas = _protagonistas_concilia(conc)
    titulo_hallazgo = {h["clave"]: h["titulo"] for h in conc.get("hallazgos", [])}
    grado_max = max((h["grado"] for h in resumen.get("hubs", [])), default=0)

    # ── puente_en_riesgo: QUALIA topología × CONCILIA ────────────────
    for p in resumen.get("puentes", []):
        claves = protagonistas.get(p["etiqueta"])
        if not claves:
            continue
        insights.append(_insight(
            f"sin-puente-{p['id']}", f"El puente «{p['etiqueta']}» está en duda",
            f"«{p['etiqueta']}» es puente de articulación — si cae, la red se "
            f"parte — y a la vez protagoniza {len(claves)} "
            f"{'hallazgo' if len(claves) == 1 else 'hallazgos'} de "
            "conciliación. La pieza que sostiene la estructura es la pieza "
            "en duda.",
            ["qualia.topologia", "concilia"],
            [{"motor": "qualia.topologia",
              "hecho": f"«{p['etiqueta']}» es puente de articulación "
                       f"(grado {p['grado']:g})"},
             {"motor": "concilia",
              "hecho": "aparece en: " + ", ".join(
                  titulo_hallazgo.get(c, c) for c in claves)}],
            (p["grado"] / grado_max) if grado_max else 0.5,
            "/autogenes/qualia/cascada",
            refs=[{"etiqueta": p["etiqueta"], "hallazgos": claves}],
        ))

    # ── monolito_no_conciliado: QUALIA centralidad × CONCILIA ────────
    for m in monolitos:
        claves = protagonistas.get(m["etiqueta"])
        if not claves:
            continue
        insights.append(_insight(
            f"sin-monolito-{m['etiqueta']}",
            f"El monolito «{m['etiqueta']}» no está en paz",
            f"«{m['etiqueta']}» concentra la centralidad del caso (masa "
            f"{m['masa']:.2f}) y a la vez aparece en "
            f"{len(claves)} {'hallazgo' if len(claves) == 1 else 'hallazgos'} "
            "de conciliación: el centro de gravedad descansa sobre filas en "
            "duda.",
            ["qualia.centralidad", "concilia"],
            [{"motor": "qualia.centralidad",
              "hecho": f"masa {m['masa']:.2f} — top de centralidad"},
             {"motor": "concilia",
              "hecho": "aparece en: " + ", ".join(
                  titulo_hallazgo.get(c, c) for c in claves)}],
            m["masa"],
            "/autogenes/qualia/orbe",
            refs=[{"etiqueta": m["etiqueta"], "hallazgos": claves}],
        ))

    # ── cupo_comprometido: CONCILIA flujo × cupos ────────────────────
    sin_llegada = conc.get("flujo", {}).get("sin_llegada", 0)
    if sin_llegada:
        for q in cupos.get("cupos", []):
            if not q.get("saldo"):
                continue
            fraccion = sin_llegada / q["saldo"]
            insights.append(_insight(
                f"sin-cupo-{q['tipo']}-{q['numero']}",
                f"Cupo {q['tipo']} comprometido por llegadas pendientes",
                f"{sin_llegada} vendidas sin factura física equivalen al "
                f"{round(100 * fraccion)}% del saldo del cupo {q['tipo']} "
                f"({q['numero']}): su arribo pendiente compromete la "
                "proyección de agotamiento.",
                ["concilia", "concilia.cupos"],
                [{"motor": "concilia",
                  "hecho": f"{sin_llegada} vendidas sin llegada"},
                 {"motor": "concilia.cupos",
                  "hecho": f"saldo {q['saldo']} de {q['inicial']}"
                           + (f" · se agota en ~{q['meses_restantes']} meses"
                              if q.get("meses_restantes") else "")}],
                fraccion,
                "/autogenes/concilia",
                refs=[{"cupo": q["numero"], "tipo": q["tipo"],
                       "saldo": q["saldo"], "pendientes": sin_llegada}],
            ))

    # ── error_confirmado: CONCILIA disputa × VALIDACIÓN norma ────────
    disputados = {
        r.get("chasis")
        for h in conc.get("hallazgos", []) if h["clase"] == "jn_en_disputa"
        for r in h.get("refs", []) if r.get("chasis")
    }
    contra_norma = {
        r.get("chasis")
        for rg in val.get("reglas", []) if rg["clave"].endswith("jn-norma")
        for r in rg.get("refs", []) if r.get("chasis")
    }
    confirmados = sorted(disputados & contra_norma)
    if confirmados:
        insights.append(_insight(
            "sin-error-confirmado",
            f"{len(confirmados)} "
            + ("error de preferencia confirmado" if len(confirmados) == 1
               else "errores de preferencia confirmados"),
            "Chasis cuya preferencia J/N está en disputa entre fuentes Y "
            "además viola la norma por país: dos motores independientes "
            "sobre la misma fila ya no es discrepancia — es error "
            "confirmado, glosa segura.",
            ["concilia", "validacion"],
            [{"motor": "concilia",
              "hecho": f"{len(disputados)} chasis con J/N en disputa"},
             {"motor": "validacion",
              "hecho": f"{len(contra_norma)} chasis contra la norma J/N"}],
            len(confirmados) / max(1, len(disputados)),
            "/autogenes/validacion",
            refs=[{"chasis": c} for c in confirmados],
        ))

    insights.sort(key=lambda i: (-i["gravedad"], i["clave"]))
    return insights


def insights_de_sesion(conn: sqlite3.Connection,
                       session_id: int) -> dict[str, Any]:
    """Orquestador: recolecta las salidas VIVAS de los motores y las
    pasa al compositor puro. Nunca escribe."""
    from autogenes import topologia
    from autogenes.concilia import conciliar, cupos_what_if, veredicto_por_fila
    from autogenes.qualia import red_de_sesion
    from autogenes.validacion import validar

    red = red_de_sesion(conn, session_id)
    resumen = topologia.resumen_red(red)
    etiqueta_de = {n["id"]: n["etiqueta"] for n in red["nodos"]}
    masas = topologia.centralidad_vector_propio(red)
    monolitos = [
        {"id": nid, "etiqueta": etiqueta_de.get(nid, nid),
         "masa": round(m, 2)}
        for nid, m in sorted(masas.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
    ]
    conc = conciliar(conn, session_id)
    cupos = cupos_what_if(conn, session_id)
    val = validar(conn, session_id, con_particion=True)

    insights = componer_insights(resumen, monolitos, conc, cupos, val)
    reticula = componer_reticula(veredicto_por_fila(conn, session_id),
                                 val["particion_dwh"], insights)
    return {
        "session_id": session_id,
        "insights": insights,
        "total": len(insights),
        "reticula": reticula,
        "motores": ["qualia.topologia", "qualia.centralidad", "concilia",
                    "concilia.cupos", "validacion"],
    }


# ── el lattice de refinamiento de particiones ────────────────────────

ETIQUETA_BLOQUE = {
    "en_paz": "En paz", "en_disputa": "En disputa",
    "sin_llegada": "Sin llegada",
    "conformes": "Conforme", "contra_norma": "Contra la norma",
    "otra_violacion": "Otra violación",
}
BLOQUES_EN_PAZ = {"en_paz", "conformes"}


def componer_reticula(veredictos: dict[str, list[int]],
                      particion_val: dict[str, list[int]],
                      insights: list[dict]) -> dict[str, Any]:
    """El lattice de refinamiento del universo DWH — puro y verificado
    por construcción: ⊤ (partición trivial) se refina en P·CONCILIA y
    P·VALIDACIÓN (cada motor parte el MISMO conjunto de filas), y su
    ínfimo P·C ∧ P·V es el refinamiento común — las celdas intersección
    donde viven los insights compuestos. Todo bloque es |celda| real;
    una celda vacía no se dibuja; una celda solo se marca como insight
    si el insight compuesto EXISTE en la lista."""
    claves_insight = {i["clave"] for i in insights}

    def bloques(part: dict[str, list[int]]) -> list[dict[str, Any]]:
        return [
            {"clave": c, "etiqueta": ETIQUETA_BLOQUE.get(c, c),
             "n": len(ids), "en_paz": c in BLOQUES_EN_PAZ}
            for c, ids in part.items() if ids
        ]

    universo = {i for ids in veredictos.values() for i in ids}
    universo_val = {i for ids in particion_val.values() for i in ids}
    # ambos motores DEBEN partir el mismo conjunto; si difieren se dice
    coincide = universo == universo_val

    celdas = []
    for c_conc, ids_c in veredictos.items():
        for c_val, ids_v in particion_val.items():
            n = len(set(ids_c) & set(ids_v))
            if not n:
                continue
            insight = None
            if (c_conc, c_val) == ("en_disputa", "contra_norma") \
                    and "sin-error-confirmado" in claves_insight:
                insight = "sin-error-confirmado"
            if c_conc == "sin_llegada":
                cupo = next((k for k in claves_insight
                             if k.startswith("sin-cupo-")), None)
                insight = insight or cupo
            celdas.append({
                "concilia": c_conc, "validacion": c_val,
                "etiqueta": f"{ETIQUETA_BLOQUE[c_conc]} ∧ "
                            f"{ETIQUETA_BLOQUE[c_val]}",
                "n": n,
                "en_paz": (c_conc in BLOQUES_EN_PAZ
                           and c_val in BLOQUES_EN_PAZ),
                "insight": insight,
            })
    celdas.sort(key=lambda c: (c["en_paz"], -c["n"], c["etiqueta"]))

    return {
        "universo": {"n": len(universo), "coincide": coincide},
        "particiones": [
            {"clave": "concilia", "nombre": "P · CONCILIA",
             "bloques": bloques(veredictos)},
            {"clave": "validacion", "nombre": "P · VALIDACIÓN",
             "bloques": bloques(particion_val)},
        ],
        "refinamiento": {"nombre": "P·CONCILIA ∧ P·VALIDACIÓN",
                         "celdas": celdas},
    }
