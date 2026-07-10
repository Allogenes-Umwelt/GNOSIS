"""SÍNTESIS (F6) — el informe ejecutivo citado. Port de
ref_karelen/capacidades/informe.ts sobre SQLite.

Dos piezas puras y una orquestación:

- `construir_digesto`: proyección compacta y acotada del grafo que se
  envía al modelo. El muestreo de fragmentos es round-robin por fuente
  para que ningún documento acapare el digesto.
- `sanear_informe`: la ley de procedencia para informes. Una afirmación
  sobrevive solo si cita fragmentos reales o entidades reales del grafo;
  lo demás se poda. Un punto sin nada que citar muere, y una sección sin
  puntos también. Nunca se inventa una cita.
- `redactar_informe`: lee el grafo, arma el digesto, llama al proveedor
  LLM activo (DeepSeek por default), parsea y SANEA en servidor antes de
  devolver — el modelo no puede fabricar procedencia. Dockear el informe
  como Producto{clase:"informe"} es un segundo paso (HITL), en
  `dockear_informe`, que vuelve a sanear (cinturón y tirantes).

El quórum (dos modelos) se reserva para extracción y hallazgos, donde el
acuerdo se mide por entidad; un informe es una narrativa unitaria, así
que se redacta con el proveedor activo.
"""
import sqlite3
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from autogenes.extraccion import extraer_json

MAX_ENTIDADES = 60
MAX_RELACIONES = 80
MAX_EVENTOS = 30
MAX_FRAGMENTOS = 18
MAX_TEXTO_FRAGMENTO = 600

MES_CORTO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
             "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]


def formatear_fecha_es(fecha: str, precision: str) -> str:
    """Fecha ISO -> forma legible en español según la precisión (port de
    formatearFechaEs). Determinista, sin locale."""
    partes = fecha.split("-")
    anio = partes[0]
    mes = partes[1] if len(partes) > 1 else ""
    dia = partes[2] if len(partes) > 2 else ""
    try:
        nombre_mes = MES_CORTO[int(mes) - 1]
    except (ValueError, IndexError):
        nombre_mes = mes
    if precision == "anio":
        return anio
    if precision == "mes":
        return f"{nombre_mes} {anio}"
    return f"{dia} {nombre_mes} {anio}"


# ── digesto: grafo -> modelo ──────────────────────────────────────────


def construir_digesto(
    artefactos: list[dict],
    fragmentos: list[dict],
    entidades: list[dict],
    relaciones: list[dict],
    eventos: list[dict],
) -> dict[str, Any]:
    """Proyección compacta y acotada del grafo completo. El muestreo de
    fragmentos es round-robin por fuente: ningún documento acapara el
    digesto y los fragmentos vacíos se saltan."""
    nombre_de = {e["id"]: e["nombre"] for e in entidades}
    artefacto_por_id = {a["id"]: a for a in artefactos}

    por_fuente: dict[str, list[dict]] = {}
    for f in fragmentos:
        if not (f.get("texto") or "").strip():
            continue
        por_fuente.setdefault(f["artefacto_id"], []).append(f)

    muestra: list[dict] = []
    rondas = list(por_fuente.values())
    i = 0
    while len(muestra) < MAX_FRAGMENTOS:
        agrego = False
        for lista in rondas:
            if i < len(lista) and len(muestra) < MAX_FRAGMENTOS:
                muestra.append(lista[i])
                agrego = True
        if not agrego:
            break
        i += 1

    relaciones_txt: list[str] = []
    for r in relaciones[:MAX_RELACIONES]:
        desde = nombre_de.get(r["desde_id"])
        hasta = nombre_de.get(r["hasta_id"])
        if desde and hasta:
            relaciones_txt.append(f"{desde} —{r['tipo']}→ {hasta}")

    return {
        "entidades": [
            {"nombre": e["nombre"], "tipo": e["tipo"],
             "resumen": e.get("resumen"), "campo": e.get("campo")}
            for e in entidades[:MAX_ENTIDADES]
        ],
        "relaciones": relaciones_txt,
        "eventos": [
            {"titulo": ev["titulo"],
             "fecha": formatear_fecha_es(ev["fecha"], ev["precision"])}
            for ev in eventos[:MAX_EVENTOS]
        ],
        "fragmentos": [
            {"id": f["id"],
             "fuente": (artefacto_por_id.get(f["artefacto_id"]) or {}).get("nombre", "fuente"),
             "pagina": f.get("pagina"),
             "texto": (f.get("texto") or "").strip()[:MAX_TEXTO_FRAGMENTO]}
            for f in muestra
        ],
    }


# ── informe: modelo -> operador ───────────────────────────────────────


class PuntoInforme(BaseModel):
    texto: str = Field(min_length=1)
    evidencia: list[str] = Field(default_factory=list)
    entidades: list[str] = Field(default_factory=list)

    @field_validator("texto")
    @classmethod
    def _recortar_texto(cls, v: str) -> str:
        return v.strip()[:320]


class SeccionInforme(BaseModel):
    encabezado: str = Field(min_length=1)
    puntos: list[PuntoInforme] = Field(default_factory=list)

    @field_validator("encabezado")
    @classmethod
    def _recortar_encabezado(cls, v: str) -> str:
        return v.strip()[:80]

    @field_validator("puntos")
    @classmethod
    def _acotar_puntos(cls, v: list[PuntoInforme]) -> list[PuntoInforme]:
        return v[:8]


class Informe(BaseModel):
    titulo: str = Field(min_length=1)
    secciones: list[SeccionInforme] = Field(default_factory=list)

    @field_validator("titulo")
    @classmethod
    def _recortar_titulo(cls, v: str) -> str:
        return v.strip()[:120]

    @field_validator("secciones")
    @classmethod
    def _acotar_secciones(cls, v: list[SeccionInforme]) -> list[SeccionInforme]:
        return v[:6]


def sanear_informe(informe: Informe, fragmento_ids: set[str],
                   nombres_entidad: set[str]) -> Informe:
    """Aplica la ley de procedencia: poda ids de fragmento y nombres de
    entidad fabricados; un punto sin nada que citar muere, y una sección
    sin puntos también. Nunca inventa una cita."""
    secciones = []
    for s in informe.secciones:
        puntos = []
        for p in s.puntos:
            evidencia = [x for x in p.evidencia if x in fragmento_ids]
            entidades = [n for n in p.entidades if n in nombres_entidad]
            if evidencia or entidades:
                puntos.append(PuntoInforme(texto=p.texto, evidencia=evidencia,
                                           entidades=entidades))
        if puntos:
            secciones.append(SeccionInforme(encabezado=s.encabezado, puntos=puntos))
    return Informe(titulo=informe.titulo, secciones=secciones)


# ── orquestación: redactar y dockear ──────────────────────────────────

PROMPT_SISTEMA = (
    "Eres el redactor de informes ejecutivos de GNOSIS (comercio exterior "
    "automotriz, México). Recibes un DIGESTO del grafo del caso: entidades, "
    "relaciones, eventos fechados y fragmentos numerados de las fuentes. "
    "Redacta un informe ejecutivo breve y accionable para el operador. "
    "REGLAS ABSOLUTAS: 1) Responde ÚNICAMENTE un objeto JSON válido, sin "
    "prosa ni markdown. 2) Cada punto DEBE citar en 'evidencia' los ids "
    "EXACTOS de los fragmentos que lo sustentan y/o en 'entidades' los "
    "nombres EXACTOS de las entidades del digesto — un punto sin ninguna "
    "cita real se descarta. 3) No inventes hechos, cifras ni nombres que no "
    "estén en el digesto. Formato: {\"titulo\": str, \"secciones\": "
    "[{\"encabezado\": str, \"puntos\": [{\"texto\": str, \"evidencia\": "
    "[ids de fragmento], \"entidades\": [nombres exactos]}]}]}"
)


def _digesto_a_prompt(digesto: dict[str, Any]) -> str:
    import json
    return "DIGESTO DEL CASO:\n\n" + json.dumps(digesto, ensure_ascii=False, indent=2)


def redactar_informe(conn: sqlite3.Connection, session_id: int,
                     config: Optional[dict] = None) -> dict[str, Any]:
    """Genera el informe ejecutivo citado del caso (NO dockea). Lee el
    grafo, arma el digesto, llama al proveedor activo y SANEA en servidor
    contra los ids/nombres reales antes de devolver."""
    from autogenes.sustrato import Sustrato
    from jarvis.llm_interface import seleccionar_proveedor

    grafo = Sustrato(conn, session_id).leer_grafo()
    if not grafo["fragmentos"] and not grafo["entidades"]:
        return {"error": "El caso no tiene fragmentos ni entidades que sintetizar"}

    digesto = construir_digesto(grafo["artefactos"], grafo["fragmentos"],
                                grafo["entidades"], grafo["relaciones"],
                                grafo["eventos"])
    config = config or {}
    _, proveedor = seleccionar_proveedor(config)
    respuesta = proveedor.chat(
        [{"role": "user", "content": _digesto_a_prompt(digesto)}],
        system=PROMPT_SISTEMA,
    )
    cruda = extraer_json(respuesta.get("content") or "")
    if not cruda:
        return {"error": "El modelo no devolvió un informe válido"}

    try:
        informe = Informe.model_validate(cruda)
    except Exception:
        return {"error": "El informe propuesto está malformado"}

    frag_reales = {f["id"] for f in grafo["fragmentos"]}
    nombres_reales = {e["nombre"] for e in grafo["entidades"]}
    saneado = sanear_informe(informe, frag_reales, nombres_reales)

    return {
        "session_id": session_id,
        "informe": saneado.model_dump(),
        "digesto": digesto,
        "fuentes": len(grafo["artefactos"]),
        "fragmentos": len(grafo["fragmentos"]),
        "entidades": len(grafo["entidades"]),
    }


def dockear_informe(conn: sqlite3.Connection, session_id: int,
                    informe_crudo: dict) -> dict[str, Any]:
    """Dockea el informe revisado como Producto{clase:"informe"}. Vuelve a
    sanear contra el grafo real y ancla la evidencia (fragmentos) y las
    entidades citadas por id, para que la cascada de procedencia opere."""
    from autogenes.sustrato import Sustrato

    s = Sustrato(conn, session_id)
    grafo = s.leer_grafo()
    frag_reales = {f["id"] for f in grafo["fragmentos"]}
    id_por_nombre = {e["nombre"]: e["id"] for e in grafo["entidades"]}

    try:
        informe = Informe.model_validate(informe_crudo)
    except Exception:
        return {"error": "El informe está malformado"}
    saneado = sanear_informe(informe, frag_reales, set(id_por_nombre))
    if not saneado.secciones:
        return {"error": "El informe no tiene un solo punto citado — nada que dockear"}

    frag_citados: list[str] = []
    nombres_citados: list[str] = []
    for sec in saneado.secciones:
        for p in sec.puntos:
            frag_citados.extend(p.evidencia)
            nombres_citados.extend(p.entidades)
    ent_ids = list(dict.fromkeys(
        id_por_nombre[n] for n in nombres_citados if n in id_por_nombre))
    evidencia = list(dict.fromkeys(frag_citados))

    producto = s.dockear_producto(
        clase="informe",
        titulo=saneado.titulo,
        unidad="autogenes",
        cuerpo=saneado.model_dump(),
        entidades=ent_ids,
        evidencia=evidencia,
    )
    return {"session_id": session_id, "producto": producto.model_dump()}
