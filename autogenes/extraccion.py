"""Extracción de grafo citada — port del modo `extraccion` de
ref_karelen/app/api/autogenes + lib/extraccion.ts (saneadores).

Ley de procedencia aplicada en servidor: el modelo SOLO puede citar los
ids de fragmento que se le enviaron; toda evidencia ajena se filtra y
una entidad propuesta sin cita real no entra jamás. La integración al
grafo es un segundo paso (HITL): aquí se PROPONE, Sustrato.integrar_
propuesta escribe (y vuelve a sanear — cinturón y tirantes).

Quórum (regla del operador): con dos proveedores disponibles la
extracción corre en ambos y cada entidad marca si ambos coincidieron;
con uno solo, versión simple con quorum=False — nunca se bloquea.
"""
import json
import re
import sqlite3
from typing import Any, Optional

from pydantic import ValidationError

from autogenes.tipos import PropuestaGrafo

MAX_FRAGMENTOS = 24
MAX_CHARS_FRAGMENTO = 1800

PROMPT_SISTEMA = (
    "Eres el extractor ontológico de GNOSIS (comercio exterior automotriz, "
    "México). Recibes fragmentos numerados de un documento aduanal o de "
    "negocio. Extrae las entidades sustantivas (organizaciones, personas, "
    "lugares, documentos, servicios, conceptos) y las relaciones tipadas "
    "entre ellas, con verbos en minúsculas ('garantiza a', 'opera en'). "
    "REGLAS ABSOLUTAS: 1) Responde ÚNICAMENTE un objeto JSON válido, sin "
    "prosa ni markdown. 2) Cada entidad y relación DEBE citar en "
    "'evidencia' los ids EXACTOS de los fragmentos que la sustentan — un "
    "id no listado invalida la propuesta. 3) No inventes nada que no esté "
    "en los fragmentos. Formato: {\"entidades\": [{\"nombre\", \"tipo\" "
    "(concepto|persona|organizacion|lugar|evento|termino|servicio|"
    "documento|otro), \"resumen\", \"evidencia\": [ids]}], \"relaciones\": "
    "[{\"desde\", \"hasta\", \"tipo\", \"peso\" (0-1), \"evidencia\": [ids]}]}"
)


def extraer_json(texto: str) -> Optional[dict]:
    """El primer objeto JSON balanceado del texto (los modelos a veces
    envuelven en prosa o en un bloque de código pese a todo)."""
    texto = re.sub(r"```(?:json)?", "", texto)
    inicio = texto.find("{")
    while inicio != -1:
        nivel = 0
        for i in range(inicio, len(texto)):
            if texto[i] == "{":
                nivel += 1
            elif texto[i] == "}":
                nivel -= 1
                if nivel == 0:
                    try:
                        return json.loads(texto[inicio:i + 1])
                    except json.JSONDecodeError:
                        break
        inicio = texto.find("{", inicio + 1)
    return None


def sanear_propuesta(cruda: dict, ids_reales: set[str]) -> PropuestaGrafo:
    """El saneador (port de sanearPropuesta): valida el esquema, filtra
    evidencia contra los ids reales enviados y descarta lo que queda sin
    cita. Un modelo no puede fabricar procedencia."""
    try:
        propuesta = PropuestaGrafo.model_validate({
            "entidades": (cruda or {}).get("entidades", [])[:60],
            "relaciones": (cruda or {}).get("relaciones", [])[:80],
        })
    except ValidationError:
        return PropuestaGrafo()
    entidades = []
    for e in propuesta.entidades:
        e.evidencia = [x for x in e.evidencia if x in ids_reales]
        if e.evidencia:
            entidades.append(e)
    nombres = {e.nombre.strip().lower() for e in entidades}
    relaciones = []
    for r in propuesta.relaciones:
        r.evidencia = [x for x in r.evidencia if x in ids_reales]
        if (r.evidencia and r.desde.strip().lower() in nombres
                and r.hasta.strip().lower() in nombres
                and r.desde.strip().lower() != r.hasta.strip().lower()):
            relaciones.append(r)
    return PropuestaGrafo(entidades=entidades, relaciones=relaciones)


def _bloque_fragmentos(fragmentos: list[sqlite3.Row]) -> tuple[str, set[str]]:
    lineas, ids = [], set()
    for f in fragmentos[:MAX_FRAGMENTOS]:
        ids.add(f["id"])
        pagina = f" (p. {f['pagina']})" if f["pagina"] else ""
        lineas.append(f"[{f['id']}]{pagina}\n{f['texto'][:MAX_CHARS_FRAGMENTO]}")
    return "\n\n".join(lineas), ids


def _una_pasada(proveedor, bloque: str, ids_reales: set[str]) -> PropuestaGrafo:
    respuesta = proveedor.chat(
        [{"role": "user", "content": "FRAGMENTOS DEL DOCUMENTO:\n\n" + bloque}],
        system=PROMPT_SISTEMA,
    )
    return sanear_propuesta(extraer_json(respuesta.get("content") or "") or {}, ids_reales)


def extraer_de_artefacto(conn: sqlite3.Connection, session_id: int,
                         artefacto_id: str, config: Optional[dict] = None,
                         con_quorum: bool = False) -> dict[str, Any]:
    """Propuesta de grafo para un artefacto (NO escribe). Con quórum, las
    entidades que ambos modelos vieron se marcan acuerdo=True; las de un
    solo modelo, acuerdo=False (llegan igual — decide el operador)."""
    from jarvis.llm_interface import proveedores_para_quorum, seleccionar_proveedor
    from jarvis.quorum import ejecutar_en_quorum

    fragmentos = conn.execute(
        "SELECT id, pagina, texto FROM ag_fragmentos"
        " WHERE session_id = ? AND artefacto_id = ? ORDER BY pagina, created_at",
        (session_id, artefacto_id),
    ).fetchall()
    if not fragmentos:
        return {"error": "El artefacto no tiene fragmentos que leer"}
    bloque, ids_reales = _bloque_fragmentos(fragmentos)
    config = config or {}

    if con_quorum:
        pares = proveedores_para_quorum(config)
        resultado = ejecutar_en_quorum(
            lambda prov: _una_pasada(prov, bloque, ids_reales), pares)
        propuestas = list(resultado["respuestas"].values())
        base = propuestas[0]
        if resultado["quorum"] and len(propuestas) > 1:
            otras = {e.nombre.strip().lower() for e in propuestas[1].entidades}
            acuerdo = {e.nombre.strip().lower(): (e.nombre.strip().lower() in otras)
                       for e in base.entidades}
            # las que solo vio el segundo modelo entran marcadas en desacuerdo
            vistas = set(acuerdo)
            for e in propuestas[1].entidades:
                clave = e.nombre.strip().lower()
                if clave not in vistas:
                    base.entidades.append(e)
                    acuerdo[clave] = False
        else:
            acuerdo = {e.nombre.strip().lower(): None for e in base.entidades}
        propuesta, quorum = base, resultado["quorum"]
    else:
        nombre_prov, proveedor = seleccionar_proveedor(config)
        propuesta = _una_pasada(proveedor, bloque, ids_reales)
        acuerdo = {e.nombre.strip().lower(): None for e in propuesta.entidades}
        quorum = False

    return {
        "artefacto_id": artefacto_id,
        "quorum": quorum,
        "entidades": [
            {**e.model_dump(), "acuerdo": acuerdo.get(e.nombre.strip().lower())}
            for e in propuesta.entidades
        ],
        "relaciones": [r.model_dump() for r in propuesta.relaciones],
        "fragmentos_leidos": len(ids_reales),
    }
