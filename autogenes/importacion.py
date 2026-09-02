"""Importar un bundle exportado — hallazgo G9 del diagnóstico v02.

`/exportar` promete un bundle «re-importable y auditable fuera de GNOSIS» y
no había con qué re-importarlo. Es la pieza que faltaba para restaurar un
caso, para mover un expediente entre máquinas y para que la identidad entre
sesiones (G1) tenga algo que unir.

**Todo entra por `Sustrato`.** No se escribe `ag_*` desde aquí: un
importador que hiciera sus propios INSERT sería exactamente el agujero que
la puerta única (ADR-0004) existe para cerrar — un camino por el que la
evidencia entra sin bitácora.

**Nada entra con la procedencia que trae escrita.** Los ids del bundle NO se
reutilizan: se crean artefactos y fragmentos nuevos y se REMAPEA cada cita al
id nuevo. Un bundle que dijera «esta entidad cita el fragmento f7» podría,
reutilizando ids, apuntar a un f7 de ESTA base que dice otra cosa. Se importa
el contenido; la procedencia se reconstruye sobre lo que de verdad entró.

Lo que el bundle afirme sobre sí mismo —conteos, sellos, `session_id`— es
dato del bundle, no una orden: se informa de lo que entró, contado aquí.
"""
import sqlite3
from typing import Any, Optional

#: Topes de cordura. Un bundle no es una carga por lotes (para eso está
#: `autogenes/lotes.py`): es la restauración de un caso.
MAX_ARTEFACTOS = 5_000
MAX_FRAGMENTOS = 50_000
MAX_ENTIDADES = 20_000
MAX_RELACIONES = 40_000


class BundleInvalido(ValueError):
    """El bundle no tiene la forma de un bundle."""


def _lista(bundle: dict, clave: str, tope: int) -> list[dict]:
    valor = (bundle or {}).get(clave) or []
    if not isinstance(valor, list):
        raise BundleInvalido(f"'{clave}' tiene que ser una lista.")
    if len(valor) > tope:
        raise BundleInvalido(
            f"'{clave}' trae {len(valor)} elementos y el tope es {tope}.")
    return [v for v in valor if isinstance(v, dict)]


def importar_bundle(conn: sqlite3.Connection, session_id: int,
                    bundle: dict[str, Any]) -> dict[str, Any]:
    """Mete un bundle de `/exportar` en `session_id`. Devuelve lo que ENTRÓ.

    Es aditivo: no borra nada de la sesión destino. Si el bundle repite un
    documento que ya está, la ley de la puerta decide —las entidades se
    funden por nombre, la evidencia se une— igual que en cualquier ingesta.
    """
    from autogenes.sustrato import Sustrato

    grafo = (bundle or {}).get("grafo")
    if not isinstance(grafo, dict):
        raise BundleInvalido("El bundle no trae 'grafo'.")

    artefactos = _lista(grafo, "artefactos", MAX_ARTEFACTOS)
    fragmentos = _lista(grafo, "fragmentos", MAX_FRAGMENTOS)
    entidades = _lista(grafo, "entidades", MAX_ENTIDADES)
    relaciones = _lista(grafo, "relaciones", MAX_RELACIONES)

    s = Sustrato(conn, session_id)
    contadores = {"artefactos": 0, "fragmentos": 0, "entidades": 0,
                  "relaciones": 0, "eventos": 0}
    #: id del bundle → id real en esta base. La procedencia se REMAPEA.
    frag_nuevo: dict[str, str] = {}
    ent_nueva: dict[str, str] = {}

    with s.atomico():
        por_artefacto: dict[str, list] = {}
        for f in fragmentos:
            por_artefacto.setdefault(str(f.get("artefacto_id") or ""), []).append(f)

        for a in artefactos:
            kind = a.get("kind")
            if kind not in ("pdf", "imagen", "nota", "estructurado"):
                continue              # un kind que el sustrato no conoce no entra
            nuevo = s.crear_artefacto(kind, str(a.get("nombre") or "sin-nombre"),
                                      paginas=a.get("paginas"))
            contadores["artefactos"] += 1
            suyos = sorted(por_artefacto.get(str(a.get("id") or ""), []),
                           key=lambda f: (f.get("pagina") or 0, str(f.get("id"))))
            creados = s.agregar_fragmentos(
                nuevo.id, [(f.get("pagina"), str(f.get("texto") or ""))
                           for f in suyos if f.get("texto")])
            for viejo, real in zip(suyos, creados):
                frag_nuevo[str(viejo.get("id"))] = real.id
            contadores["fragmentos"] += len(creados)

        for e in entidades:
            nombre = str(e.get("nombre") or "").strip()
            if not nombre:
                continue
            # la evidencia se remapea; la que no encontró fragmento se cae
            evidencia = [frag_nuevo[x] for x in (e.get("evidencia") or [])
                         if x in frag_nuevo]
            origen = e.get("origen") if e.get("origen") in ("operador", "synesis") else "synesis"
            if origen == "synesis" and not evidencia:
                continue              # ley de procedencia: sin cita real no entra
            creada = s.upsert_entidad(
                nombre=nombre, tipo=e.get("tipo") or "otro", origen=origen,
                resumen=e.get("resumen"), campo=e.get("campo"),
                evidencia=evidencia)
            ent_nueva[str(e.get("id"))] = creada.id
            contadores["entidades"] += 1

        for r in relaciones:
            desde = ent_nueva.get(str(r.get("desde_id")))
            hasta = ent_nueva.get(str(r.get("hasta_id")))
            evidencia = [frag_nuevo[x] for x in (r.get("evidencia") or [])
                         if x in frag_nuevo]
            if not desde or not hasta or desde == hasta or not evidencia:
                continue
            s.agregar_relacion(
                desde, hasta, str(r.get("tipo") or r.get("tipo_crudo") or "otro"),
                _peso(r), evidencia,
                origen=r.get("origen") if r.get("origen") in ("operador", "synesis")
                else "synesis")
            contadores["relaciones"] += 1

        eventos = _lista(grafo, "eventos", MAX_ENTIDADES)
        limpios = []
        for ev in eventos:
            evidencia = [frag_nuevo[x] for x in (ev.get("evidencia") or [])
                         if x in frag_nuevo]
            if not evidencia or not ev.get("titulo") or not ev.get("fecha"):
                continue
            limpios.append({"titulo": ev["titulo"], "fecha": ev["fecha"],
                            "entidades": ev.get("entidades") or [],
                            "evidencia": evidencia})
        if limpios:
            contadores["eventos"] = len(s.agregar_eventos(limpios))

    descartes = {
        "fragmentos_sin_artefacto": max(0, len(fragmentos) - contadores["fragmentos"]),
        "entidades_sin_evidencia_real": len(entidades) - contadores["entidades"],
        "relaciones_sin_extremos": len(relaciones) - contadores["relaciones"],
    }
    return {
        "session_id": session_id,
        "importado": contadores,
        "descartado": descartes,
        "nota": ("Los ids del bundle no se reutilizan: la procedencia se "
                 "reconstruyó sobre los fragmentos que de verdad entraron."),
    }


def _peso(r: dict) -> float:
    """El peso declarado del bundle, acotado. Un bundle es dato de fuera."""
    crudo = r.get("peso_declarado", r.get("peso", 0.5))
    try:
        valor = float(crudo)
    except (TypeError, ValueError):
        return 0.5
    if valor != valor:                 # NaN atraviesa min/max
        return 0.5
    return min(max(valor, 0.0), 1.0)


def resumen_bundle(bundle: dict[str, Any]) -> Optional[dict[str, int]]:
    """Lo que el bundle DICE traer, para enseñarlo antes de importar. Es una
    afirmación del bundle, no una verdad: lo que entre se cuenta al entrar."""
    grafo = (bundle or {}).get("grafo")
    if not isinstance(grafo, dict):
        return None
    return {k: len(v) for k, v in grafo.items() if isinstance(v, list)}
