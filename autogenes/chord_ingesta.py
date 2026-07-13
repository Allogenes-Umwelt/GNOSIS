"""The ingestion map as a bipartite chord — read-time projection (F4).

The ingesta page asks ONE question the full ontology tree buried under 40
aduanal VIN leaves: *what did I bring in, what is still cold, and what did
each source produce?* This projects exactly that and nothing else — no
vehiculo/marca/pais nodes — as a chord:

    left hemisphere  = artefactos (documentary sources), grouped by kind
    right hemisphere = entidades (produced knowledge), grouped by tipo
    ribbons          = artefacto -> entidad, weight = that artefacto's
                       fragments cited by that entidad
    cold source      = an artefacto no entity cites (ribbonless arc)

The law of `proyeccion.py` holds here: NEVER writes; every number derives
from ag_artefactos/ag_fragmentos/ag_entidades and is citable. Deterministic:
the same substrate yields the same arcs, angles and ribbons (stable sort
everywhere). Rollup keeps the SIGNAL visible — cold sources and the most
cited entities always survive; the overflow collapses into a declared
"+N más" aggregate, never hidden in silence (same law as arbol_ontologia).
"""
import json
import sqlite3
from typing import Any

# Above these arc counts per hemisphere the overflow rolls up, per group,
# into one declared aggregate so the ring stays legible. Chosen so the seed
# (5 sources / 8 entities) never rolls up and the "grande" variant does.
MAX_ARCOS_ARTEFACTO = 48
MAX_ARCOS_ENTIDAD = 48


def chord_ingesta(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    artefactos = conn.execute(
        "SELECT id, kind, nombre, paginas, created_at FROM ag_artefactos"
        " WHERE session_id = ? ORDER BY created_at, id", (session_id,)
    ).fetchall()
    fragmentos = conn.execute(
        "SELECT id, artefacto_id FROM ag_fragmentos WHERE session_id = ?",
        (session_id,)
    ).fetchall()
    entidades = conn.execute(
        "SELECT id, nombre, tipo, created_at FROM ag_entidades"
        " WHERE session_id = ? ORDER BY created_at, id", (session_id,)
    ).fetchall()

    frag_a_art = {f["id"]: f["artefacto_id"] for f in fragmentos}
    ids_art = {a["id"] for a in artefactos}
    frags_de_art: dict[str, int] = {}
    for f in fragmentos:
        frags_de_art[f["artefacto_id"]] = frags_de_art.get(f["artefacto_id"], 0) + 1

    # ribbons: (artefacto, entidad) -> number of that artefacto's fragments
    # this entity cites. One entity citing 2 fragments of a PDF weighs 2.
    peso_cinta: dict[tuple[str, str], int] = {}
    citas_de_ent: dict[str, int] = {}      # total real fragments an entity cites
    arts_de_ent: dict[str, set[str]] = {}
    evidencia = {
        r["id"]: json.loads(r["evidencia"] or "[]")
        for r in conn.execute(
            "SELECT id, evidencia FROM ag_entidades WHERE session_id = ?",
            (session_id,))
    }
    for e in entidades:
        arts_de_ent[e["id"]] = set()
        for frag_id in evidencia.get(e["id"], []):
            art_id = frag_a_art.get(frag_id)
            if art_id and art_id in ids_art:
                key = (art_id, e["id"])
                peso_cinta[key] = peso_cinta.get(key, 0) + 1
                citas_de_ent[e["id"]] = citas_de_ent.get(e["id"], 0) + 1
                arts_de_ent[e["id"]].add(art_id)

    citantes_de_art: dict[str, set[str]] = {}
    for (art_id, ent_id) in peso_cinta:
        citantes_de_art.setdefault(art_id, set()).add(ent_id)

    # ── artefacto arcs (left) — cold ones flagged; cold sources are the
    # actionable signal, so they are pinned to survive rollup ──
    arcos_art_full = [{
        "id": a["id"],
        "nombre": a["nombre"],
        "grupo": a["kind"],
        "fragmentos": frags_de_art.get(a["id"], 0),
        "entidades": len(citantes_de_art.get(a["id"], ())),
        "fria": not citantes_de_art.get(a["id"]),
    } for a in artefactos]
    arcos_art = _rollup(
        arcos_art_full, MAX_ARCOS_ARTEFACTO, "art",
        # cold first (signal), then most fragments, then name — deterministic
        clave_orden=lambda x: (not x["fria"], -x["fragmentos"], x["nombre"], x["id"]),
        peso=lambda x: max(1, x["fragmentos"]))

    # ── entidad arcs (right) — most cited survive rollup ──
    arcos_ent_full = [{
        "id": e["id"],
        "nombre": e["nombre"],
        "grupo": e["tipo"],
        "citas": citas_de_ent.get(e["id"], 0),
        "fuentes": len(arts_de_ent.get(e["id"], ())),
    } for e in entidades]
    arcos_ent = _rollup(
        arcos_ent_full, MAX_ARCOS_ENTIDAD, "ent",
        clave_orden=lambda x: (-x["citas"], x["nombre"], x["id"]),
        peso=lambda x: max(1, x["citas"]))

    # remap collapsed endpoints so ribbons point at the aggregate arc
    remap = {**_remap_de(arcos_art, "art"), **_remap_de(arcos_ent, "ent")}
    cintas_acc: dict[tuple[str, str], int] = {}
    for (art_id, ent_id), w in peso_cinta.items():
        a2 = remap.get(art_id, art_id)
        e2 = remap.get(ent_id, ent_id)
        cintas_acc[(a2, e2)] = cintas_acc.get((a2, e2), 0) + w
    cintas = [{"artefacto_id": a, "entidad_id": e, "peso": w}
              for (a, e), w in sorted(cintas_acc.items())]

    n_frag = len(fragmentos)
    n_citados = len({fid for ev in evidencia.values() for fid in ev
                     if fid in frag_a_art})
    n_frias = sum(1 for a in arcos_art_full if a["fria"])

    ses = conn.execute(
        "SELECT month_processed, year_processed FROM processing_sessions WHERE id = ?",
        (session_id,)).fetchone()
    etiqueta = (f"Sesión {ses['month_processed']:02d}/{ses['year_processed']}"
                if ses else "Sesión")

    return {
        "session_id": session_id,
        "etiqueta": etiqueta,
        "artefactos": arcos_art,
        "entidades": arcos_ent,
        "cintas": cintas,
        "resumen": {
            "fuentes": len(artefactos),
            "frias": n_frias,
            "entidades": len(entidades),
            "fragmentos": n_frag,
            "citados": n_citados,
            # cobertura: how much of what was brought in became knowledge
            "cobertura": round(100 * n_citados / n_frag) if n_frag else 0,
        },
    }


def detalle_ingesta(conn: sqlite3.Connection, session_id: int,
                    node_id: str) -> dict[str, Any]:
    """The dossier behind one chord arc — read-only. For an artefacto: its
    fragments (citable text) and the entities that cite it. For an entidad:
    its source artefactos. For an aggregate arc: the members it rolled up."""
    art = conn.execute(
        "SELECT id, kind, nombre, paginas FROM ag_artefactos"
        " WHERE id = ? AND session_id = ?", (node_id, session_id)).fetchone()
    if art:
        fragmentos = [
            {"id": f["id"], "pagina": f["pagina"], "texto": f["texto"]}
            for f in conn.execute(
                "SELECT id, pagina, texto FROM ag_fragmentos"
                " WHERE artefacto_id = ? AND session_id = ? ORDER BY pagina, created_at",
                (node_id, session_id))
        ]
        frag_ids = {f["id"] for f in fragmentos}
        citantes = []
        for e in conn.execute(
                "SELECT id, nombre, tipo, evidencia FROM ag_entidades"
                " WHERE session_id = ? ORDER BY created_at", (session_id,)):
            if frag_ids & set(json.loads(e["evidencia"] or "[]")):
                citantes.append({"id": e["id"], "nombre": e["nombre"], "tipo": e["tipo"]})
        return {"tipo": "artefacto", "id": node_id, "nombre": art["nombre"],
                "kind": art["kind"], "paginas": art["paginas"],
                "fragmentos": fragmentos, "citantes": citantes,
                "fria": not citantes}

    ent = conn.execute(
        "SELECT id, nombre, tipo, resumen, evidencia FROM ag_entidades"
        " WHERE id = ? AND session_id = ?", (node_id, session_id)).fetchone()
    if ent:
        frag_ids = set(json.loads(ent["evidencia"] or "[]"))
        frag_a_art = {
            r["id"]: r["artefacto_id"]
            for r in conn.execute(
                "SELECT id, artefacto_id FROM ag_fragmentos WHERE session_id = ?",
                (session_id,))
        }
        art_ids = {frag_a_art.get(fid) for fid in frag_ids} - {None}
        fuentes = [
            {"id": a["id"], "nombre": a["nombre"], "kind": a["kind"]}
            for a in conn.execute(
                "SELECT id, nombre, kind FROM ag_artefactos WHERE session_id = ?",
                (session_id,)) if a["id"] in art_ids
        ]
        return {"tipo": "entidad", "id": node_id, "nombre": ent["nombre"],
                "tipo_ent": ent["tipo"], "resumen": ent["resumen"],
                "fuentes": fuentes}

    return {"error": "Nodo no encontrado en el sustrato de la sesión"}


def _rollup(arcos: list[dict], maximo: int, prefijo: str,
            clave_orden, peso) -> list[dict]:
    """Keep the top `maximo` arcs by signal; collapse the overflow, PER
    group, into one declared aggregate arc each. Nothing is hidden: the
    aggregate carries the real count and total weight."""
    ordenados = sorted(arcos, key=clave_orden)
    if len(ordenados) <= maximo:
        return ordenados
    visibles = ordenados[:maximo]
    resto = ordenados[maximo:]
    por_grupo: dict[str, list[dict]] = {}
    for x in resto:
        por_grupo.setdefault(x["grupo"], []).append(x)
    for grupo, miembros in sorted(por_grupo.items()):
        visibles.append({
            "id": f"agg:{prefijo}:{grupo}",
            "nombre": f"+{len(miembros)} más",
            "grupo": grupo,
            "agregado": True,
            "n": len(miembros),
            "_peso": sum(peso(m) for m in miembros),
            "_miembros": [m["id"] for m in miembros],
        })
    return visibles


def _remap_de(arcos: list[dict], prefijo: str) -> dict[str, str]:
    """Map each collapsed member id to its aggregate arc id."""
    out: dict[str, str] = {}
    for a in arcos:
        if a.get("agregado"):
            for mid in a.get("_miembros", []):
                out[mid] = a["id"]
    return out
