"""QUALIA reading + SYNESIS narrative (F7c).

Ports ref_karelen/microapps/signature/lectura.ts and narrativa.ts;
specs are tests/test_qualia_narrativa.py (1:1 with lectura.test.ts and
narrativa.test.ts).

Two layers, one law:

- `construir_lectura`: the deterministic reading — every line is a fact
  the engine computed and can defend. The honest S1 floor: no model.
- The narrative: the model INTERPRETS the verified structure, never
  computes it. The engine hands over a digest of metrics and citable
  conceptos (each with an exact `clave`); `sanear_narrativa` — run in
  SERVER before anything reaches the operator — drops any reading that
  cites a clave we did not send. A fabricated concept or figure cannot
  survive. Same law as the informe's saneador.
"""
import sqlite3
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

Digesto = dict[str, list[dict[str, Any]]]


# ── the deterministic reading — S1, no model ─────────────────────────


def _densidad_texto(d: float) -> str:
    if d < 0.08:
        return "dispersa"
    if d < 0.25:
        return "moderada"
    return "densa"


def construir_lectura(resumen: dict[str, Any], n_registros: int) -> list[str]:
    """Deterministic reading of the network — Spanish lines the operator
    can trust because each one is engine output, not prose invention."""
    lineas: list[str] = []
    if resumen["n_nodos"] == 0:
        return lineas

    com = resumen["n_comunidades"]
    lineas.append(
        f"{resumen['n_nodos']} conceptos y {resumen['n_enlaces']} vínculos, "
        f"en {com} {'comunidad' if com == 1 else 'comunidades'}."
    )

    if resumen["hubs"]:
        hub = resumen["hubs"][0]
        lineas.append(
            f"El concentrador principal es «{hub['etiqueta']}» (grado "
            f"{hub['grado']:g}): el concepto que más ata al resto."
        )

    lineas.append(
        f"Estructura {_densidad_texto(resumen['densidad'])} "
        f"(densidad {resumen['densidad'] * 100:.0f} por ciento)."
    )

    if resumen["exponente"] is not None and resumen["n_nodos"] >= 12:
        s = resumen["exponente"]
        lineas.append(
            (f"La conectividad sigue ley de potencias (exponente {s:.2f}): "
             "pocos conceptos concentran la estructura.")
            if s >= 0.8 else
            (f"Conectividad repartida (exponente {s:.2f}): ningún concepto "
             "domina la red.")
        )

    if resumen["puentes"]:
        nombres = ", ".join(f"«{p['etiqueta']}»" for p in resumen["puentes"])
        uno = len(resumen["puentes"]) == 1
        lineas.append(
            f"{'Puente crítico' if uno else 'Puentes críticos'}: {nombres} — "
            f"si {'cae' if uno else 'caen'}, la red se parte."
        )

    if resumen["n_componentes"] > 1:
        lineas.append(
            f"{resumen['n_componentes']} islas sin puente entre sí: "
            "material que aún no conversa."
        )

    lineas.append(
        f"Derivado de {n_registros} "
        f"{'registro' if n_registros == 1 else 'registros'} de tus fuentes."
    )
    return lineas


# ── digest: what the model is ALLOWED to cite ────────────────────────


def construir_digesto_red(resumen: dict[str, Any]) -> Digesto:
    """Build the digest from the deterministic summary. Structure only."""
    metricas = [
        {"clave": "nodos", "etiqueta": "Conceptos", "valor": str(resumen["n_nodos"])},
        {"clave": "vinculos", "etiqueta": "Vínculos", "valor": str(resumen["n_enlaces"])},
        {"clave": "comunidades", "etiqueta": "Comunidades",
         "valor": str(resumen["n_comunidades"])},
        {"clave": "componentes", "etiqueta": "Islas sin puente",
         "valor": str(resumen["n_componentes"])},
        {"clave": "densidad", "etiqueta": "Densidad",
         "valor": f"{resumen['densidad'] * 100:.0f} por ciento"},
        {"clave": "comunidad_mayor", "etiqueta": "Comunidad mayor",
         "valor": str(resumen["comunidad_mayor"])},
    ]
    if resumen["exponente"] is not None:
        metricas.append({"clave": "exponente",
                         "etiqueta": "Exponente de la ley de grado",
                         "valor": f"{resumen['exponente']:.2f}"})
    if resumen["puentes"]:
        metricas.append({"clave": "puentes", "etiqueta": "Puentes críticos",
                         "valor": ", ".join(p["etiqueta"] for p in resumen["puentes"])})
    vistos: set[str] = set()
    conceptos: list[dict[str, Any]] = []
    for h in [*resumen["hubs"], *resumen["puentes"]]:
        if h["id"] in vistos:
            continue
        vistos.add(h["id"])
        conceptos.append({"clave": h["id"], "etiqueta": h["etiqueta"],
                          "grado": h["grado"]})
    return {"metricas": metricas, "conceptos": conceptos}


def construir_digesto_maquina(resumen: dict[str, Any],
                              anomalias: list[dict[str, Any]],
                              monolitos: list[dict[str, Any]],
                              n_referencias: int,
                              delta: Optional[dict[str, int]]) -> Digesto:
    """The unified digest: the OODA windows condensed into the SAME
    contract the saneador guards — anomalies and monoliths become
    citable conceptos (grado carries their 0–100 intensity), telemetry
    becomes a metric. Nothing outside it can be cited."""
    base = construir_digesto_red(resumen)
    metricas = list(base["metricas"])
    metricas.append({"clave": "anomalias",
                     "etiqueta": "Anomalías contra la línea base",
                     "valor": str(len(anomalias))})
    if monolitos:
        metricas.append({"clave": "monolito",
                         "etiqueta": "Monolito principal (centralidad)",
                         "valor": monolitos[0]["etiqueta"][:60]})

    def signo(n: int) -> str:
        return f"+{n}" if n > 0 else str(n)

    valor_tele = (f"{n_referencias} · delta {signo(delta['nodos'])} conceptos, "
                  f"{signo(delta['enlaces'])} vínculos"[:60]
                  if delta else str(n_referencias))
    metricas.append({"clave": "telemetria",
                     "etiqueta": "Referencias de telemetría", "valor": valor_tele})

    conceptos = list(base["conceptos"])
    vistos = {c["clave"] for c in conceptos}
    for m in monolitos[:3]:
        if m["id"] in vistos:
            continue
        vistos.add(m["id"])
        conceptos.append({"clave": m["id"], "etiqueta": m["etiqueta"],
                          "grado": round(m["masa"] * 100)})
    for a in anomalias[:6]:
        if a["clave"] in vistos:
            continue
        vistos.add(a["clave"])
        conceptos.append({"clave": a["clave"], "etiqueta": a["titulo"][:80],
                          "grado": round(a["severidad"] * 100)})
    return {"metricas": metricas[:12], "conceptos": conceptos[:20]}


def claves_digesto(digesto: Digesto) -> set[str]:
    """All claves the model is allowed to cite."""
    return ({m["clave"] for m in digesto["metricas"]}
            | {c["clave"] for c in digesto["conceptos"]})


# ── the narrative contract + provenance law ──────────────────────────


class LecturaNarrativa(BaseModel):
    concepto: str = Field(min_length=1)
    lectura: str = Field(min_length=1)

    @field_validator("lectura")
    @classmethod
    def _recortar(cls, v: str) -> str:
        return v.strip()[:280]


class Narrativa(BaseModel):
    panorama: str = Field(min_length=1)
    lecturas: list[LecturaNarrativa] = Field(default_factory=list)
    observaciones: list[str] = Field(default_factory=list)

    @field_validator("panorama")
    @classmethod
    def _recortar_panorama(cls, v: str) -> str:
        return v.strip()[:600]

    @field_validator("lecturas")
    @classmethod
    def _acotar_lecturas(cls, v: list[LecturaNarrativa]) -> list[LecturaNarrativa]:
        return v[:8]

    @field_validator("observaciones")
    @classmethod
    def _acotar_observaciones(cls, v: list[str]) -> list[str]:
        return [o.strip()[:220] for o in v if o.strip()][:4]


def sanear_narrativa(narrativa: Narrativa, claves_validas: set[str]) -> Narrativa:
    """Provenance law: drop any reading citing a clave we did not send."""
    return Narrativa(
        panorama=narrativa.panorama,
        lecturas=[lec for lec in narrativa.lecturas
                  if lec.concepto in claves_validas],
        observaciones=narrativa.observaciones,
    )


# ── orchestration: the model interprets, the server sanitizes ────────

PROMPT_NARRATIVA = (
    "Eres el intérprete de QUALIA en GNOSIS (comercio exterior automotriz, "
    "México): el sustrato teje el caso aduanal en una RED y la lee con "
    "topología. Recibes un digesto YA CALCULADO: métricas de la red (clave, "
    "etiqueta, valor) y los conceptos citables (clave, etiqueta, grado). Esa "
    "es tu única fuente: NO calcules nada nuevo, NO inventes conceptos ni "
    "cifras, NO uses conocimiento externo. Tu trabajo es INTERPRETAR qué "
    "revela la ESTRUCTURA: los concentradores, las comunidades, la densidad, "
    "las islas, las anomalías.\n"
    "Devuelve SOLO un objeto JSON válido, sin markdown ni comentarios: "
    '{"panorama":"...","lecturas":[{"concepto":"clave_exacta","lectura":"..."}],'
    '"observaciones":["..."]}\n'
    "REGLAS: 'panorama' resume la forma de la red y qué significa (máximo 600 "
    "caracteres, español claro). 'lecturas': entre 2 y 6, cada una interpreta "
    "UN concepto o UNA métrica; 'concepto' DEBE ser una clave EXACTA del "
    "digesto, jamás inventada; puedes citar el valor tal cual, jamás inventes "
    "ni recalcules números. 'observaciones': hasta 4 notas accionables, verbo "
    "primero. Un concentrador de grado alto ata muchos conceptos; muchas "
    "comunidades es fragmentación; islas sin puente es material que no "
    "conversa. Di 'operador', nunca 'usuario'. Sin emojis ni signos de "
    "exclamación."
)


def digesto_de_sesion(conn: sqlite3.Connection,
                      session_id: int) -> Optional[Digesto]:
    """The machine digest computed NOW from the live graph — the single
    source for redactar_narrativa and for dockear_parte's re-sanitize.
    None when the case has no network."""
    from autogenes import topologia
    from autogenes.qualia import anomalias_de_sesion, leer_snapshots, red_de_sesion

    red = red_de_sesion(conn, session_id)
    if not red["nodos"]:
        return None
    estado = anomalias_de_sesion(conn, session_id)
    resumen = estado["resumen"]
    masas = topologia.centralidad_vector_propio(red)
    etiqueta_de = {n["id"]: n["etiqueta"] for n in red["nodos"]}
    monolitos = [
        {"id": nid, "etiqueta": etiqueta_de.get(nid, nid), "masa": m}
        for nid, m in sorted(masas.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
    ]
    snaps = leer_snapshots(conn, session_id)
    delta = None
    if len(snaps) >= 2:
        delta = {"nodos": snaps[-1]["n_nodos"] - snaps[0]["n_nodos"],
                 "enlaces": snaps[-1]["n_enlaces"] - snaps[0]["n_enlaces"]}
    return construir_digesto_maquina(resumen, estado["hallazgos"],
                                     monolitos, len(snaps), delta)


def redactar_narrativa(conn: sqlite3.Connection, session_id: int,
                       config: Optional[dict] = None) -> dict[str, Any]:
    """One shot, no tools, never writes. The digest goes in; a qualitative
    reading comes out; the provenance law runs HERE, in server."""
    import json

    from autogenes.extraccion import extraer_json
    from jarvis.llm_interface import seleccionar_proveedor

    digesto = digesto_de_sesion(conn, session_id)
    if digesto is None:
        return {"error": "El caso no tiene red que interpretar"}

    config = config or {}
    _, proveedor = seleccionar_proveedor(config)
    respuesta = proveedor.chat(
        [{"role": "user",
          "content": "DIGESTO DE LA RED DEL CASO:\n\n"
                     + json.dumps(digesto, ensure_ascii=False, indent=2)}],
        system=PROMPT_NARRATIVA,
    )
    cruda = extraer_json(respuesta.get("content") or "")
    if not cruda:
        return {"error": "El modelo no devolvió una lectura legible"}
    try:
        narrativa = Narrativa.model_validate(cruda)
    except Exception:
        return {"error": "La narrativa no cumple el contrato"}
    saneada = sanear_narrativa(narrativa, claves_digesto(digesto))
    return {"session_id": session_id, "narrativa": saneada.model_dump(),
            "digesto": digesto}


def dockear_parte(conn: sqlite3.Connection, session_id: int,
                  narrativa_cruda: dict) -> dict[str, Any]:
    """Dockea el parte del sistema como Producto{clase:"informe",
    unidad:"qualia"} — el segundo paso HITL, como dockear_informe.

    Cinturón y tirantes: el digesto se RECALCULA aquí desde el grafo vivo
    y la narrativa se vuelve a sanear contra él — una lectura que cite
    una clave ya no vigente muere antes de dockear. Se anclan por id las
    claves citadas que son entidades reales del sustrato; el parte lee
    ESTRUCTURA, no documentos, así que su evidencia queda vacía en vez de
    fabricar citas a fragmentos."""
    from autogenes.sustrato import Sustrato

    try:
        narrativa = Narrativa.model_validate(narrativa_cruda)
    except Exception:
        return {"error": "El parte está malformado"}

    digesto = digesto_de_sesion(conn, session_id)
    if digesto is None:
        return {"error": "El caso ya no tiene red — nada que dockear"}
    saneada = sanear_narrativa(narrativa, claves_digesto(digesto))
    if not saneada.lecturas:
        return {"error": "El parte no cita una sola clave vigente del "
                         "digesto — nada que dockear"}

    etiqueta_de = {c["clave"]: c["etiqueta"] for c in digesto["conceptos"]}
    etiqueta_de.update({m["clave"]: m["etiqueta"] for m in digesto["metricas"]})
    claves_citadas = list(dict.fromkeys(
        lec.concepto for lec in saneada.lecturas))
    marcadores = ",".join("?" * len(claves_citadas))
    ent_ids = [r["id"] for r in conn.execute(
        f"SELECT id FROM ag_entidades WHERE session_id = ? AND id IN"  # noqa: S608 — solo interpola '?' — los valores van ligados
        f" ({marcadores}) ORDER BY created_at",  # noqa: S608
        (session_id, *claves_citadas),
    )]

    cuerpo = {
        "panorama": saneada.panorama,
        "lecturas": [
            {"clave": lec.concepto,
             "etiqueta": etiqueta_de.get(lec.concepto, lec.concepto),
             "lectura": lec.lectura}
            for lec in saneada.lecturas
        ],
        "observaciones": saneada.observaciones,
        "metricas": digesto["metricas"],
    }
    producto = Sustrato(conn, session_id).dockear_producto(
        clase="informe",
        titulo="Parte del sistema QUALIA",
        unidad="qualia",
        cuerpo=cuerpo,
        entidades=ent_ids,
        evidencia=[],
    )
    return {"session_id": session_id, "producto": producto.model_dump()}
