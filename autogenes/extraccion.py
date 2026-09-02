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

from autogenes.citas import verificar_todas
from autogenes.predicados import PREDICADOS
from autogenes.tipos import PropuestaEntidad, PropuestaGrafo

MAX_FRAGMENTOS = 24
MAX_CHARS_FRAGMENTO = 1800

PROMPT_SISTEMA = (
    "Eres el extractor ontológico de GNOSIS (comercio exterior automotriz, "
    "México). Recibes fragmentos numerados de un documento aduanal o de "
    "negocio. Extrae las entidades sustantivas (organizaciones, personas, "
    "lugares, documentos, servicios, conceptos) y las relaciones entre "
    "ellas usando SOLO estos predicados: " + "|".join(PREDICADOS) + ". "
    "Si ninguno encaja, usa 'otro' y describe el verbo en 'tipo_crudo'. "
    "REGLAS ABSOLUTAS: 1) Responde ÚNICAMENTE un objeto JSON válido, sin "
    "prosa ni markdown. 2) Cada entidad y relación DEBE citar en "
    "'evidencia' los ids EXACTOS de los fragmentos que la sustentan — un "
    "id no listado invalida la propuesta. 3) En 'citas' copia la frase "
    "LITERAL del fragmento que sostiene cada afirmación; se comprueba "
    "contra el texto real y una frase que no exista invalida la cita. "
    "4) No inventes nada que no esté en los fragmentos. "
    "Formato: {\"entidades\": [{\"nombre\", \"tipo\" "
    "(concepto|persona|organizacion|lugar|evento|termino|servicio|"
    "documento|otro), \"resumen\", \"evidencia\": [ids], \"citas\": "
    "[{\"fragmento_id\", \"inicio\", \"fin\", \"texto\"}]}], "
    "\"relaciones\": [{\"desde\", \"hasta\", \"tipo\", \"peso\" (0-1), "
    "\"evidencia\": [ids], \"citas\": [...]}]}"
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


def sanear_propuesta(cruda: dict, ids_reales: set[str],
                     textos: Optional[dict[str, str]] = None) -> PropuestaGrafo:
    """El saneador (port de sanearPropuesta): valida el esquema, filtra
    evidencia contra los ids reales enviados y descarta lo que queda sin
    cita. Un modelo no puede fabricar procedencia.

    Con `textos` (id → texto del fragmento) también se comprueban las citas
    con span: la frase citada tiene que EXISTIR en el fragmento (ADR-0017).
    Citar el id correcto y atribuirle una frase que no está es la forma de
    fabricación que el id suelto no podía detectar. Sin `textos` los spans
    no se pueden verificar, así que se descartan — la evidencia por id, que
    es la ley vieja, sigue intacta."""
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
        e.citas = verificar_todas(e.citas, textos or {})
        if e.evidencia:
            entidades.append(e)
    nombres = {e.nombre.strip().lower() for e in entidades}
    relaciones = []
    for r in propuesta.relaciones:
        r.evidencia = [x for x in r.evidencia if x in ids_reales]
        r.citas = verificar_todas(r.citas, textos or {})
        if (r.evidencia and r.desde.strip().lower() in nombres
                and r.hasta.strip().lower() in nombres
                and r.desde.strip().lower() != r.hasta.strip().lower()):
            relaciones.append(r)
    return PropuestaGrafo(entidades=entidades, relaciones=relaciones)


def _parece_tabular(muestra: str) -> bool:
    """Heurística determinista: ¿la muestra es una tabla/dump de datos y no
    prosa? Un dataset (filas de VIN, cifras, códigos, celdas separadas por
    tabulador) no tiene entidades narrativas que citar — el extractor
    documental no debe forzarlas. Alta densidad de dígitos o muchas
    tabulaciones por línea delatan la tabla."""
    if not muestra:
        return False
    no_espacio = sum(1 for c in muestra if not c.isspace()) or 1
    densidad_digitos = sum(c.isdigit() for c in muestra) / no_espacio
    lineas = muestra.count("\n") + 1
    return densidad_digitos > 0.30 or muestra.count("\t") > lineas


def _diagnostico_sin_entidades(kind: str, n_fragmentos: int,
                               muestra: str) -> dict[str, Any]:
    """Por qué una fuente no propuso entidades — honesto, sin fabricar nada.
    Distingue el dataset tabular (esperado: no es un documento) del documento
    que simplemente no rindió citas en lo leído."""
    tabular = kind == "estructurado" or _parece_tabular(muestra)
    if tabular:
        return {"tabular": True, "motivo": (
            "Fuente tabular: filas de datos (códigos, cifras) sin entidades "
            "narrativas que citar. El extractor busca organizaciones, personas, "
            "lugares y documentos en prosa; un dataset es insumo del pipeline, "
            "no del extractor de documentos.")}
    return {"tabular": False, "motivo": (
        f"El modelo no encontró entidades citables en los {n_fragmentos} "
        "fragmentos leídos.")}


#: Fragmentos que dos ventanas consecutivas comparten. Una entidad nombrada a
#: caballo entre el final de una ventana y el principio de la siguiente se
#: perdería sin solape; la fusión por nombre deduplica lo que aparezca dos veces.
SOLAPE_VENTANA = 3


def _bloque_fragmentos(fragmentos: list[sqlite3.Row],
                       maximo: int = MAX_FRAGMENTOS) -> tuple[str, set[str]]:
    lineas, ids = [], set()
    for f in fragmentos[:maximo]:
        ids.add(f["id"])
        pagina = f" (p. {f['pagina']})" if f["pagina"] else ""
        lineas.append(f"[{f['id']}]{pagina}\n{f['texto'][:MAX_CHARS_FRAGMENTO]}")
    return "\n\n".join(lineas), ids


def _ventanas(fragmentos: list[sqlite3.Row]) -> list[list[sqlite3.Row]]:
    """Parte el documento en ventanas de MAX_FRAGMENTOS con solape."""
    if len(fragmentos) <= MAX_FRAGMENTOS:
        return [fragmentos]
    paso = MAX_FRAGMENTOS - SOLAPE_VENTANA
    return [fragmentos[i:i + MAX_FRAGMENTOS]
            for i in range(0, len(fragmentos), paso)
            if fragmentos[i:i + MAX_FRAGMENTOS]]


def _fusionar(propuestas: list[PropuestaGrafo]) -> PropuestaGrafo:
    """Une las propuestas de varias ventanas: una entidad vista en dos
    ventanas es UNA entidad con la evidencia de ambas. Orden estable."""
    entidades: dict[str, PropuestaEntidad] = {}
    for p in propuestas:
        for e in p.entidades:
            clave = e.nombre.strip().lower()
            previa = entidades.get(clave)
            if previa is None:
                entidades[clave] = e.model_copy(deep=True)
            else:
                previa.evidencia = list(dict.fromkeys([*previa.evidencia, *e.evidencia]))
                previa.resumen = previa.resumen or e.resumen
    relaciones: dict[tuple, Any] = {}
    for p in propuestas:
        for r in p.relaciones:
            triple = (r.desde.strip().lower(), r.hasta.strip().lower(),
                      r.tipo.strip().lower())
            previa = relaciones.get(triple)
            if previa is None:
                relaciones[triple] = r.model_copy(deep=True)
            else:
                previa.evidencia = list(dict.fromkeys([*previa.evidencia, *r.evidencia]))
                vistas = {(c.fragmento_id, c.inicio, c.fin) for c in previa.citas}
                previa.citas += [c for c in r.citas
                                 if (c.fragmento_id, c.inicio, c.fin) not in vistas]
    return PropuestaGrafo(entidades=list(entidades.values()),
                          relaciones=list(relaciones.values()))


def _una_pasada(proveedor, bloque: str, ids_reales: set[str],
                textos: Optional[dict[str, str]] = None) -> PropuestaGrafo:
    respuesta = proveedor.chat(
        [{"role": "user", "content": "FRAGMENTOS DEL DOCUMENTO:\n\n" + bloque}],
        system=PROMPT_SISTEMA,
    )
    return sanear_propuesta(extraer_json(respuesta.get("content") or "") or {},
                            ids_reales, textos)


def extraer_de_artefacto(conn: sqlite3.Connection, session_id: int,
                         artefacto_id: str, config: Optional[dict] = None,
                         con_quorum: bool = False,
                         ventanas: bool = False) -> dict[str, Any]:
    """Propuesta de grafo para un artefacto (NO escribe). Con quórum, las
    entidades que ambos modelos vieron se marcan acuerdo=True; las de un
    solo modelo, acuerdo=False (llegan igual — decide el operador).

    El resultado SIEMPRE declara su `cobertura`. Antes se leían los primeros
    `MAX_FRAGMENTOS` y nada lo decía: un contrato de 60 páginas se extraía de
    sus 24 primeras y la propuesta llegaba como si cubriera el documento
    (`docs/DIAGNOSTICO_FABLE_v02.md` §1, S6).

    `ventanas=True` lee el documento ENTERO en ventanas solapadas y fusiona
    las propuestas. Cuesta una llamada al proveedor por ventana, así que es
    decisión del operador y no el default."""
    from jarvis.llm_interface import proveedores_para_quorum, seleccionar_proveedor
    from jarvis.quorum import ejecutar_en_quorum

    fragmentos = conn.execute(
        "SELECT id, pagina, texto FROM ag_fragmentos"
        " WHERE session_id = ? AND artefacto_id = ? ORDER BY pagina, created_at",
        (session_id, artefacto_id),
    ).fetchall()
    if not fragmentos:
        return {"error": "El artefacto no tiene fragmentos que leer"}
    art = conn.execute(
        "SELECT kind FROM ag_artefactos WHERE session_id = ? AND id = ?",
        (session_id, artefacto_id)).fetchone()
    kind = art["kind"] if art else ""
    trozos = _ventanas(fragmentos) if ventanas else [fragmentos[:MAX_FRAGMENTOS]]
    bloque, ids_reales = _bloque_fragmentos(trozos[0])
    # los TEXTOS del artefacto: sin ellos el saneador no puede comprobar que
    # una cita con span diga lo que dice que dice (ADR-0017)
    textos = {f["id"]: f["texto"] for f in fragmentos}
    config = config or {}

    if con_quorum:
        pares = proveedores_para_quorum(config)
        resultado = ejecutar_en_quorum(
            lambda prov: _una_pasada(prov, bloque, ids_reales, textos), pares)
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
            # sus relaciones también se fusionan (si no, sus entidades
            # llegarían siempre huérfanas): entran solo las que anclan en
            # el conjunto fusionado y no duplican un triple de base
            nombres_fusion = {e.nombre.strip().lower() for e in base.entidades}
            triples_base = {
                (r.desde.strip().lower(), r.hasta.strip().lower(), r.tipo.strip().lower())
                for r in base.relaciones
            }
            for r in propuestas[1].relaciones:
                triple = (r.desde.strip().lower(), r.hasta.strip().lower(),
                          r.tipo.strip().lower())
                if triple in triples_base:
                    continue
                if triple[0] in nombres_fusion and triple[1] in nombres_fusion:
                    base.relaciones.append(r)
                    triples_base.add(triple)
        else:
            acuerdo = {e.nombre.strip().lower(): None for e in base.entidades}
        propuesta, quorum = base, resultado["quorum"]
    else:
        nombre_prov, proveedor = seleccionar_proveedor(config)
        parciales = [_una_pasada(proveedor, bloque, ids_reales, textos)]
        for trozo in trozos[1:]:
            b, ids_t = _bloque_fragmentos(trozo)
            ids_reales |= ids_t
            parciales.append(_una_pasada(proveedor, b, ids_t, textos))
        propuesta = _fusionar(parciales) if len(parciales) > 1 else parciales[0]
        acuerdo = {e.nombre.strip().lower(): None for e in propuesta.entidades}
        quorum = False

    # Merge-preview (entity resolution honesto): una entidad propuesta que ya
    # existe (por nombre normalizado O alias) se marca YA EXISTE — integrarla
    # NO crea nodo, solo suma evidencia. Usa el MISMO _norm que la integración
    # para que el preview jamás la contradiga. Sin scores: coincide o no.
    # Se consulta el ÍNDICE de resolución (ADR-0014), no todas las entidades:
    # cargarlas para construir un set costaba O(E) por extracción, y el índice
    # responde con una lectura indexada por nombre propuesto.
    from autogenes.sustrato import _norm
    propuestos = {_norm(e.nombre) for e in propuesta.entidades}
    existentes: set[str] = set()
    if propuestos:
        marcadores = ",".join("?" * len(propuestos))
        # `marcadores` solo interpola '?': los valores van ligados abajo.
        consulta = f"SELECT alias_norm FROM ag_entidad_alias WHERE session_id = ? AND alias_norm IN ({marcadores})"  # noqa: S608,E501
        existentes = {r[0] for r in conn.execute(consulta, (session_id, *propuestos))}

    resultado = {
        "artefacto_id": artefacto_id,
        "quorum": quorum,
        "entidades": [
            {**e.model_dump(), "acuerdo": acuerdo.get(e.nombre.strip().lower()),
             "nueva": _norm(e.nombre) not in existentes}
            for e in propuesta.entidades
        ],
        "relaciones": [r.model_dump() for r in propuesta.relaciones],
        "fragmentos_leidos": len(ids_reales),
        # Cobertura declarada SIEMPRE: qué parte del documento sostiene esta
        # propuesta. Sin esto, una lectura parcial se presenta como completa.
        "cobertura": {"fragmentos_leidos": len(ids_reales),
                      "fragmentos_total": len(fragmentos)},
    }
    sin_leer = len(fragmentos) - len(ids_reales)
    if sin_leer > 0:
        resultado["aviso"] = (
            f"Lectura parcial: {len(ids_reales)} de {len(fragmentos)} fragmentos; "
            f"{sin_leer} sin leer. Repite con lectura completa para cubrir el "
            "documento entero (cuesta una llamada por ventana).")
    # Cero entidades no es un fallo silencioso: se declara POR QUÉ. Una fuente
    # tabular (dataset) no tiene entidades narrativas — decirlo evita que el
    # operador lo lea como «roto».
    if not resultado["entidades"]:
        resultado["diagnostico"] = _diagnostico_sin_entidades(
            kind, len(ids_reales), bloque)
    return resultado
