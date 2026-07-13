"""The AUTOGENES substrate service — Python port of the mutation law in
ref_karelen/store/autogenes.ts, over SQLite instead of a browser store.

Non-negotiable laws enforced here (and only here — no other module
writes ag_* tables):

- Provenance: extracted ("synesis") entities/events must cite fragment
  ids; operator items carry their origen as provenance.
- Provenance cascade (quitar_artefacto): dead fragments are pruned from
  every evidence list; a synesis item whose evidence hits zero dies; a
  relation that cited evidence and lost all of it dies; operator items
  survive.
- Additive law (upsert_entidad): a synesis write may enrich an
  operator-curated entity (union evidence) but never overwrites its
  tipo/resumen/campo.
- Append-only bitácora on every mutation.
- Sanitized integration (integrar_propuesta): incoming evidence is
  filtered against REAL fragment ids; synesis proposals citing nothing
  are dropped — no caller can fabricate provenance.
"""
import json
import re
import sqlite3
import uuid
from typing import Any, Optional, Sequence

from autogenes.tipos import (
    Artefacto,
    ClaseProducto,
    Entidad,
    Evento,
    Fragmento,
    GeoPunto,
    KindArtefacto,
    Origen,
    Producto,
    PropuestaGrafo,
    Relacion,
    TipoEntidad,
)


def _uuid() -> str:
    return str(uuid.uuid4())


def _js(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _jl(raw: Optional[str]) -> list:
    return json.loads(raw) if raw else []


def _norm(nombre: str) -> str:
    return nombre.strip().lower()


class Sustrato:
    """All mutations of one session's evidence graph."""

    def __init__(self, conn: sqlite3.Connection, session_id: int):
        self.conn = conn
        self.session_id = session_id
        self._lote = False   # True mientras una operación compuesta está en vuelo

    def _commit(self) -> None:
        """Commit unitario; dentro de un lote (integrar_propuesta) se
        difiere al commit único del lote para que una propuesta jamás
        quede aplicada a medias."""
        if not self._lote:
            self.conn.commit()

    # ── bitácora (append-only; never rewritten) ──────────────────────

    def _registrar(self, accion: str, detalle: str) -> None:
        self.conn.execute(
            "INSERT INTO ag_bitacora (session_id, accion, detalle) VALUES (?, ?, ?)",
            (self.session_id, accion, detalle),
        )

    def bitacora(self, limite: int = 100) -> list[dict]:
        rows = self.conn.execute(
            "SELECT id, ts, accion, detalle FROM ag_bitacora"
            " WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (self.session_id, limite),
        )
        return [dict(r) for r in rows]

    # ── row mapping ──────────────────────────────────────────────────

    @staticmethod
    def _entidad(r: sqlite3.Row) -> Entidad:
        geo = None
        if r["geo_lat"] is not None and r["geo_lon"] is not None:
            geo = GeoPunto(lat=r["geo_lat"], lon=r["geo_lon"])
        return Entidad(
            id=r["id"],
            nombre=r["nombre"],
            tipo=r["tipo"],
            resumen=r["resumen"],
            campo=r["campo"],
            alias=_jl(r["alias"]),
            geo=geo,
            subtipo=r["subtipo"],
            propiedades=json.loads(r["propiedades"]) if r["propiedades"] else None,
            origen=r["origen"],
            evidencia=_jl(r["evidencia"]),
            created_at=r["created_at"],
        )

    def _entidades(self) -> list[Entidad]:
        rows = self.conn.execute(
            "SELECT * FROM ag_entidades WHERE session_id = ?", (self.session_id,)
        )
        return [self._entidad(r) for r in rows]

    def entidad_por_id(self, entidad_id: str) -> Optional[Entidad]:
        r = self.conn.execute(
            "SELECT * FROM ag_entidades WHERE session_id = ? AND id = ?",
            (self.session_id, entidad_id),
        ).fetchone()
        return self._entidad(r) if r else None

    def fragmento_ids(self) -> set[str]:
        rows = self.conn.execute(
            "SELECT id FROM ag_fragmentos WHERE session_id = ?", (self.session_id,)
        )
        return {r["id"] for r in rows}

    # ── sources ──────────────────────────────────────────────────────

    def crear_artefacto(
        self,
        kind: KindArtefacto,
        nombre: str,
        paginas: Optional[int] = None,
        blob_ref: Optional[str] = None,
        hash: Optional[str] = None,
    ) -> Artefacto:
        aid = _uuid()
        self.conn.execute(
            "INSERT INTO ag_artefactos (id, session_id, kind, nombre, paginas,"
            " blob_ref, hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (aid, self.session_id, kind, nombre, paginas, blob_ref, hash),
        )
        self._registrar("dockear-fuente", f"Fuente dockeada: {nombre}")
        self._commit()
        r = self.conn.execute("SELECT * FROM ag_artefactos WHERE id = ?", (aid,)).fetchone()
        return Artefacto(**dict(r))

    def agregar_fragmentos(
        self, artefacto_id: str, textos: Sequence[tuple[Optional[int], str]]
    ) -> list[Fragmento]:
        nuevos: list[Fragmento] = []
        for pagina, texto in textos:
            fid = _uuid()
            self.conn.execute(
                "INSERT INTO ag_fragmentos (id, session_id, artefacto_id, pagina, texto)"
                " VALUES (?, ?, ?, ?, ?)",
                (fid, self.session_id, artefacto_id, pagina, texto),
            )
            r = self.conn.execute(
                "SELECT * FROM ag_fragmentos WHERE id = ?", (fid,)
            ).fetchone()
            nuevos.append(Fragmento(**dict(r)))
        self._registrar("fragmentos", f"{len(nuevos)} fragmentos anclados")
        self._commit()
        return nuevos

    # ── entities ─────────────────────────────────────────────────────

    def upsert_entidad(
        self,
        nombre: str,
        tipo: TipoEntidad,
        origen: Origen,
        resumen: Optional[str] = None,
        campo: Optional[str] = None,
        evidencia: Optional[list[str]] = None,
    ) -> Entidad:
        """Resolve by lowercased name OR alias; merge under the additive law."""
        evidencia = evidencia or []
        clave = _norm(nombre)
        existente = next(
            (
                e
                for e in self._entidades()
                if _norm(e.nombre) == clave
                or any(_norm(a) == clave for a in e.alias)
            ),
            None,
        )
        if existente:
            # Additive law: a synesis write may ENRICH an operator-curated
            # entity but must not OVERWRITE the operator's curation.
            protegido = existente.origen == "operador" and origen == "synesis"
            tipo_final = existente.tipo if protegido else tipo
            resumen_final = (
                existente.resumen if protegido else (resumen or existente.resumen)
            )
            campo_final = existente.campo if protegido else (campo or existente.campo)
            evidencia_final = list(dict.fromkeys([*existente.evidencia, *evidencia]))
            self.conn.execute(
                "UPDATE ag_entidades SET tipo = ?, resumen = ?, campo = ?, evidencia = ?"
                " WHERE id = ?",
                (tipo_final, resumen_final, campo_final, _js(evidencia_final), existente.id),
            )
            self._registrar("entidad", f"Entidad actualizada: {existente.nombre}")
            self._commit()
            return self.entidad_por_id(existente.id)  # type: ignore[return-value]

        eid = _uuid()
        self.conn.execute(
            "INSERT INTO ag_entidades (id, session_id, nombre, tipo, resumen, campo,"
            " origen, evidencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (eid, self.session_id, nombre.strip(), tipo, resumen, campo, origen, _js(evidencia)),
        )
        self._registrar("entidad", f"Entidad {nombre.strip()} ({origen})")
        self._commit()
        return self.entidad_por_id(eid)  # type: ignore[return-value]

    def editar_entidad(self, entidad_id: str, cambios: dict[str, Any]) -> None:
        """Operator edit of nombre/tipo/resumen/campo/alias/subtipo/propiedades."""
        permitidos = {"nombre", "tipo", "resumen", "campo", "alias", "subtipo", "propiedades"}
        campos = {k: v for k, v in cambios.items() if k in permitidos}
        if not campos:
            return
        entidad = self.entidad_por_id(entidad_id)
        if entidad is None:
            return
        sets, valores = [], []
        for k, v in campos.items():
            sets.append(f"{k} = ?")
            valores.append(_js(v) if k in ("alias", "propiedades") else v)
        valores.append(entidad_id)
        self.conn.execute(f"UPDATE ag_entidades SET {', '.join(sets)} WHERE id = ?", valores)
        self._registrar(
            "editar-entidad",
            f"Entidad editada por el operador: {campos.get('nombre', entidad.nombre)}",
        )
        self._commit()

    def set_geo_entidad(self, entidad_id: str, geo: Optional[GeoPunto]) -> None:
        self.conn.execute(
            "UPDATE ag_entidades SET geo_lat = ?, geo_lon = ?"
            " WHERE id = ? AND session_id = ?",
            (geo.lat if geo else None, geo.lon if geo else None,
             entidad_id, self.session_id),
        )
        self._registrar("geo", "Coordenadas fijadas" if geo else "Coordenadas retiradas")
        self._commit()

    def quitar_entidad(self, entidad_id: str) -> None:
        """Drop the entity, its relations, and prune its name from events
        and its id from product anchors."""
        entidad = self.entidad_por_id(entidad_id)
        if entidad is None:
            return
        nombres = {entidad.nombre, *entidad.alias}
        self.conn.execute(
            "DELETE FROM ag_relaciones WHERE desde_id = ? OR hasta_id = ?",
            (entidad_id, entidad_id),
        )
        for r in self.conn.execute(
            "SELECT id, entidades FROM ag_eventos WHERE session_id = ?", (self.session_id,)
        ).fetchall():
            depurados = [n for n in _jl(r["entidades"]) if n not in nombres]
            self.conn.execute(
                "UPDATE ag_eventos SET entidades = ? WHERE id = ?", (_js(depurados), r["id"])
            )
        for r in self.conn.execute(
            "SELECT id, entidades FROM ag_productos WHERE session_id = ?", (self.session_id,)
        ).fetchall():
            depurados = [x for x in _jl(r["entidades"]) if x != entidad_id]
            self.conn.execute(
                "UPDATE ag_productos SET entidades = ? WHERE id = ?", (_js(depurados), r["id"])
            )
        self.conn.execute("DELETE FROM ag_entidades WHERE id = ?", (entidad_id,))
        self._registrar("quitar-entidad", f"Entidad eliminada: {entidad.nombre}")
        self._commit()

    # ── relations ────────────────────────────────────────────────────

    def agregar_relacion(
        self,
        desde_id: str,
        hasta_id: str,
        tipo: str,
        peso: float = 0.5,
        evidencia: Optional[list[str]] = None,
        origen: str = "synesis",
    ) -> Relacion:
        rid = _uuid()
        self.conn.execute(
            "INSERT INTO ag_relaciones (id, session_id, desde_id, hasta_id, tipo, peso,"
            " evidencia, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (rid, self.session_id, desde_id, hasta_id, tipo, peso,
             _js(evidencia or []), origen),
        )
        self._registrar("relacion", f"Relación: {tipo}")
        self._commit()
        r = self.conn.execute("SELECT * FROM ag_relaciones WHERE id = ?", (rid,)).fetchone()
        return Relacion(**{**dict(r), "evidencia": _jl(r["evidencia"])})

    def cortar_relacion(self, relacion_id: str) -> None:
        r = self.conn.execute(
            "SELECT tipo FROM ag_relaciones WHERE id = ? AND session_id = ?",
            (relacion_id, self.session_id),
        ).fetchone()
        if r is None:
            return  # jamás cortar a través de la frontera de sesión
        self.conn.execute(
            "DELETE FROM ag_relaciones WHERE id = ? AND session_id = ?",
            (relacion_id, self.session_id),
        )
        self._registrar("cortar-relacion", f"Relación cortada: {r['tipo']}")
        self._commit()

    # ── events ───────────────────────────────────────────────────────

    def agregar_eventos(self, items: Sequence[dict]) -> list[Evento]:
        from datetime import date as _date

        from autogenes.tipos import FECHA_ISO

        for it in items:
            if not re.match(FECHA_ISO, it.get("fecha", "")):
                raise ValueError(f"Fecha no normalizada: {it.get('fecha')!r}")
            try:
                # forma correcta no basta: 2026-07-32 pasa el regex y
                # envenenaría toda lectura por fecha de la sesión
                _date.fromisoformat(it["fecha"])
            except ValueError:
                raise ValueError(f"Fecha imposible: {it['fecha']!r}") from None
            if it.get("precision") not in ("dia", "mes", "anio"):
                raise ValueError(f"Precisión inválida: {it.get('precision')!r}")
        nuevos: list[Evento] = []
        for it in items:
            eid = _uuid()
            self.conn.execute(
                "INSERT INTO ag_eventos (id, session_id, titulo, fecha, precision,"
                " entidades, evidencia, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    eid,
                    self.session_id,
                    it["titulo"],
                    it["fecha"],
                    it["precision"],
                    _js(it.get("entidades", [])),
                    _js(it.get("evidencia", [])),
                    it["origen"],
                ),
            )
            r = self.conn.execute("SELECT * FROM ag_eventos WHERE id = ?", (eid,)).fetchone()
            nuevos.append(
                Evento(
                    **{
                        **dict(r),
                        "entidades": _jl(r["entidades"]),
                        "evidencia": _jl(r["evidencia"]),
                    }
                )
            )
        plural = "evento fechado" if len(nuevos) == 1 else "eventos fechados"
        self._registrar("eventos", f"{len(nuevos)} {plural}")
        self._commit()
        return nuevos

    def quitar_evento(self, evento_id: str) -> None:
        borrado = self.conn.execute(
            "DELETE FROM ag_eventos WHERE id = ? AND session_id = ?",
            (evento_id, self.session_id),
        ).rowcount
        if not borrado:
            return
        self._registrar("quitar-evento", "Evento eliminado")
        self._commit()

    # ── products (E3) ────────────────────────────────────────────────

    def dockear_producto(
        self,
        clase: ClaseProducto,
        titulo: str,
        unidad: str,
        cuerpo: Any,
        entidades: Optional[list[str]] = None,
        evidencia: Optional[list[str]] = None,
    ) -> Producto:
        pid = _uuid()
        self.conn.execute(
            "INSERT INTO ag_productos (id, session_id, clase, titulo, unidad, cuerpo,"
            " entidades, evidencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                pid,
                self.session_id,
                clase,
                titulo,
                unidad,
                _js(cuerpo),
                _js(entidades or []),
                _js(evidencia or []),
            ),
        )
        self._registrar("producto", f"Producto {clase} dockeado: {titulo}")
        self._commit()
        r = self.conn.execute("SELECT * FROM ag_productos WHERE id = ?", (pid,)).fetchone()
        return Producto(
            **{
                **dict(r),
                "cuerpo": json.loads(r["cuerpo"]) if r["cuerpo"] else None,
                "entidades": _jl(r["entidades"]),
                "evidencia": _jl(r["evidencia"]),
            }
        )

    def quitar_producto(self, producto_id: str) -> None:
        borrado = self.conn.execute(
            "DELETE FROM ag_productos WHERE id = ? AND session_id = ?",
            (producto_id, self.session_id),
        ).rowcount
        if not borrado:
            return
        self._registrar("quitar-producto", "Producto eliminado")
        self._commit()

    # ── NOMOS rules (F12): additive law — create + toggle, never delete ──

    def crear_regla(self, nombre: str, condiciones: list[dict],
                    entonces: dict, origen: str = "operador") -> dict:
        """A rule is a McCulloch-Pitts AND unit: `condiciones` are its
        inputs (campo=valor literals over importaciones), threshold =
        len(condiciones); `entonces` is the expected campo=valor when it
        fires. Fields are validated against a fixed allowlist — a rule
        cannot reference a column that does not exist."""
        permitidos = {"pais_code", "j_y_n", "auto_code", "factura", "chasis"}
        for c in [*condiciones, entonces]:
            if not isinstance(c, dict) or c.get("campo") not in permitidos \
                    or not str(c.get("valor", "")).strip():
                raise ValueError(f"Condición inválida: {c!r} — campos: "
                                 f"{sorted(permitidos)}")
        if not condiciones:
            raise ValueError("Una regla necesita al menos una condición")
        if origen not in ("operador", "insight"):
            raise ValueError(f"Origen inválido: {origen!r}")
        rid = _uuid()
        self.conn.execute(
            "INSERT INTO ag_reglas (id, session_id, nombre, condiciones,"
            " entonces, origen) VALUES (?, ?, ?, ?, ?, ?)",
            (rid, self.session_id, nombre.strip(), _js(condiciones),
             _js(entonces), origen),
        )
        self._registrar("regla", f"Regla creada: {nombre.strip()} ({origen})")
        self._commit()
        return self.regla_por_id(rid)  # type: ignore[return-value]

    def alternar_regla(self, regla_id: str, activa: bool) -> None:
        cambiado = self.conn.execute(
            "UPDATE ag_reglas SET activa = ? WHERE id = ? AND session_id = ?",
            (1 if activa else 0, regla_id, self.session_id),
        ).rowcount
        if not cambiado:
            return
        self._registrar("regla",
                        f"Regla {'activada' if activa else 'desactivada'}")
        self._commit()

    def regla_por_id(self, regla_id: str) -> Optional[dict]:
        r = self.conn.execute(
            "SELECT * FROM ag_reglas WHERE id = ? AND session_id = ?",
            (regla_id, self.session_id),
        ).fetchone()
        if r is None:
            return None
        return {**dict(r), "condiciones": json.loads(r["condiciones"]),
                "entonces": json.loads(r["entonces"]),
                "activa": bool(r["activa"])}

    def leer_reglas(self) -> list[dict]:
        return [
            {**dict(r), "condiciones": json.loads(r["condiciones"]),
             "entonces": json.loads(r["entonces"]), "activa": bool(r["activa"])}
            for r in self.conn.execute(
                "SELECT * FROM ag_reglas WHERE session_id = ?"
                " ORDER BY created_at, id", (self.session_id,))
        ]

    # ── the provenance cascade ───────────────────────────────────────

    def quitar_artefacto(self, artefacto_id: str) -> None:
        """Delete a source with full provenance cascade (see module doc)."""
        r = self.conn.execute(
            "SELECT nombre FROM ag_artefactos WHERE id = ? AND session_id = ?",
            (artefacto_id, self.session_id),
        ).fetchone()
        if r is None:
            return  # la cascada jamás cruza la frontera de sesión
        nombre = r["nombre"]

        muertos = {
            row["id"]
            for row in self.conn.execute(
                "SELECT id FROM ag_fragmentos WHERE artefacto_id = ?", (artefacto_id,)
            )
        }

        def podar(ev: list[str]) -> list[str]:
            return [x for x in ev if x not in muertos]

        # Entities: prune evidence; synesis entities that lose it all die.
        eliminadas: set[str] = set()
        for row in self.conn.execute(
            "SELECT id, origen, evidencia FROM ag_entidades WHERE session_id = ?",
            (self.session_id,),
        ).fetchall():
            ev = podar(_jl(row["evidencia"]))
            if row["origen"] == "synesis" and len(ev) == 0:
                eliminadas.add(row["id"])
            else:
                self.conn.execute(
                    "UPDATE ag_entidades SET evidencia = ? WHERE id = ?", (_js(ev), row["id"])
                )

        # Relations: prune evidence; one that cited and lost everything
        # dies, one that never cited (operator-declared) survives; any
        # relation touching an eliminated entity is dangling and dies.
        for row in self.conn.execute(
            "SELECT id, desde_id, hasta_id, evidencia FROM ag_relaciones WHERE session_id = ?",
            (self.session_id,),
        ).fetchall():
            original = _jl(row["evidencia"])
            ev = podar(original)
            citaba = len(original) > 0
            toca_muerta = row["desde_id"] in eliminadas or row["hasta_id"] in eliminadas
            if toca_muerta or (citaba and len(ev) == 0):
                self.conn.execute("DELETE FROM ag_relaciones WHERE id = ?", (row["id"],))
            else:
                self.conn.execute(
                    "UPDATE ag_relaciones SET evidencia = ? WHERE id = ?", (_js(ev), row["id"])
                )

        for eid in eliminadas:
            self.conn.execute("DELETE FROM ag_entidades WHERE id = ?", (eid,))

        # Events: the provenance law applies to time too.
        for row in self.conn.execute(
            "SELECT id, origen, evidencia FROM ag_eventos WHERE session_id = ?",
            (self.session_id,),
        ).fetchall():
            ev = podar(_jl(row["evidencia"]))
            if row["origen"] == "synesis" and len(ev) == 0:
                self.conn.execute("DELETE FROM ag_eventos WHERE id = ?", (row["id"],))
            else:
                self.conn.execute(
                    "UPDATE ag_eventos SET evidencia = ? WHERE id = ?", (_js(ev), row["id"])
                )

        # Products are operator deliverables (snapshots): evidence prunes
        # and dead entity anchors drop, but the product survives.
        for row in self.conn.execute(
            "SELECT id, entidades, evidencia FROM ag_productos WHERE session_id = ?",
            (self.session_id,),
        ).fetchall():
            self.conn.execute(
                "UPDATE ag_productos SET evidencia = ?, entidades = ? WHERE id = ?",
                (
                    _js(podar(_jl(row["evidencia"]))),
                    _js([x for x in _jl(row["entidades"]) if x not in eliminadas]),
                    row["id"],
                ),
            )

        self.conn.execute("DELETE FROM ag_fragmentos WHERE artefacto_id = ?", (artefacto_id,))
        self.conn.execute("DELETE FROM ag_artefactos WHERE id = ?", (artefacto_id,))
        self._registrar("quitar-fuente", f"Fuente eliminada con cascada: {nombre}")
        self._commit()

    # ── fusion ───────────────────────────────────────────────────────

    def fusionar_entidades(self, ganador_id: str, perdedor_id: str) -> Optional[Entidad]:
        """Winner absorbs loser: union evidence/alias, repoint relations,
        drop self-loops, collapse duplicate triples, repoint product anchors."""
        ganador = self.entidad_por_id(ganador_id)
        perdedor = self.entidad_por_id(perdedor_id)
        if not ganador or not perdedor or ganador_id == perdedor_id:
            return None

        evidencia = list(dict.fromkeys([*ganador.evidencia, *perdedor.evidencia]))
        alias = [
            a
            for a in dict.fromkeys([*ganador.alias, *perdedor.alias, perdedor.nombre])
            if _norm(a) != _norm(ganador.nombre)
        ]
        self.conn.execute(
            "UPDATE ag_entidades SET resumen = ?, campo = ?, geo_lat = ?, geo_lon = ?,"
            " evidencia = ?, alias = ? WHERE id = ?",
            (
                ganador.resumen or perdedor.resumen,
                ganador.campo or perdedor.campo,
                ganador.geo.lat if ganador.geo else (perdedor.geo.lat if perdedor.geo else None),
                ganador.geo.lon if ganador.geo else (perdedor.geo.lon if perdedor.geo else None),
                _js(evidencia),
                _js(alias),
                ganador_id,
            ),
        )

        vistas: dict[str, str] = {}
        for row in self.conn.execute(
            "SELECT * FROM ag_relaciones WHERE session_id = ? ORDER BY created_at, id",
            (self.session_id,),
        ).fetchall():
            desde = ganador_id if row["desde_id"] == perdedor_id else row["desde_id"]
            hasta = ganador_id if row["hasta_id"] == perdedor_id else row["hasta_id"]
            triple = f"{desde}|{hasta}|{row['tipo'].lower()}"
            if desde == hasta:
                self.conn.execute("DELETE FROM ag_relaciones WHERE id = ?", (row["id"],))
                continue
            duplicada = vistas.get(triple)
            if duplicada:
                # el triple colapsa pero su evidencia sobrevive en el kept
                kept = self.conn.execute(
                    "SELECT evidencia FROM ag_relaciones WHERE id = ?", (duplicada,)
                ).fetchone()
                union = list(dict.fromkeys([*_jl(kept["evidencia"]), *_jl(row["evidencia"])]))
                self.conn.execute(
                    "UPDATE ag_relaciones SET evidencia = ? WHERE id = ?",
                    (_js(union), duplicada),
                )
                self.conn.execute("DELETE FROM ag_relaciones WHERE id = ?", (row["id"],))
                continue
            vistas[triple] = row["id"]
            self.conn.execute(
                "UPDATE ag_relaciones SET desde_id = ?, hasta_id = ? WHERE id = ?",
                (desde, hasta, row["id"]),
            )

        for row in self.conn.execute(
            "SELECT id, entidades FROM ag_productos WHERE session_id = ?", (self.session_id,)
        ).fetchall():
            repuntadas = list(
                dict.fromkeys(
                    ganador_id if x == perdedor_id else x for x in _jl(row["entidades"])
                )
            )
            self.conn.execute(
                "UPDATE ag_productos SET entidades = ? WHERE id = ?",
                (_js(repuntadas), row["id"]),
            )

        self.conn.execute("DELETE FROM ag_entidades WHERE id = ?", (perdedor_id,))
        self._registrar("fusion", f"Fusión: {ganador.nombre} absorbe a {perdedor.nombre}")
        self._commit()
        return self.entidad_por_id(ganador_id)

    # ── sanitized integration: the one door for model proposals ─────

    def integrar_propuesta(self, propuesta: PropuestaGrafo) -> dict[str, int]:
        """Integrate an extraction proposal. Evidence is sanitized against
        the session's REAL fragment ids; a proposal citing nothing real is
        dropped. Relation endpoints resolve by (upserted) name. Atomic:
        o entra toda la propuesta aprobada o no entra nada."""
        reales = self.fragmento_ids()

        def sanear(ev: list[str]) -> list[str]:
            return [x for x in ev if x in reales]

        # una transacción para toda la propuesta (y BEGIN IMMEDIATE toma
        # el candado de escritura: dos integraciones concurrentes no
        # pueden duplicar una entidad por el mismo nombre)
        if not self.conn.in_transaction:
            self.conn.execute("BEGIN IMMEDIATE")
        self._lote = True
        try:
            resultado = self._integrar_lote(propuesta, sanear)
            self.conn.commit()
            return resultado
        except Exception:
            self.conn.rollback()
            raise
        finally:
            self._lote = False

    def _integrar_lote(self, propuesta: PropuestaGrafo, sanear) -> dict[str, int]:
        integradas = 0
        por_nombre: dict[str, str] = {}
        for pe in propuesta.entidades:
            ev = sanear(pe.evidencia)
            if not ev:
                continue  # a synesis proposal citing nothing real cannot enter
            entidad = self.upsert_entidad(
                nombre=pe.nombre,
                tipo=pe.tipo,
                origen="synesis",
                resumen=pe.resumen,
                evidencia=ev,
            )
            por_nombre[_norm(entidad.nombre)] = entidad.id
            for a in entidad.alias:
                por_nombre[_norm(a)] = entidad.id
            integradas += 1

        # Existing entities also resolve endpoints (proposals may relate
        # to entities already in the graph).
        for e in self._entidades():
            por_nombre.setdefault(_norm(e.nombre), e.id)
            for a in e.alias:
                por_nombre.setdefault(_norm(a), e.id)

        # triples existentes: re-integrar una propuesta ENRIQUECE la
        # evidencia de la relación, jamás duplica la arista
        existentes: dict[str, str] = {}
        for row in self.conn.execute(
            "SELECT id, desde_id, hasta_id, tipo FROM ag_relaciones"
            " WHERE session_id = ?", (self.session_id,),
        ).fetchall():
            existentes[f"{row['desde_id']}|{row['hasta_id']}|{row['tipo'].lower()}"] = row["id"]

        relaciones = 0
        for pr in propuesta.relaciones:
            ev = sanear(pr.evidencia)
            desde = por_nombre.get(_norm(pr.desde))
            hasta = por_nombre.get(_norm(pr.hasta))
            if not ev or not desde or not hasta or desde == hasta:
                continue
            triple = f"{desde}|{hasta}|{pr.tipo.lower()}"
            previa = existentes.get(triple)
            if previa:
                r = self.conn.execute(
                    "SELECT evidencia FROM ag_relaciones WHERE id = ?", (previa,)
                ).fetchone()
                union = list(dict.fromkeys([*_jl(r["evidencia"]), *ev]))
                self.conn.execute(
                    "UPDATE ag_relaciones SET evidencia = ? WHERE id = ?",
                    (_js(union), previa),
                )
                continue
            nueva = self.agregar_relacion(desde, hasta, pr.tipo, pr.peso, ev)
            existentes[triple] = nueva.id
            relaciones += 1

        self._registrar(
            "integrar",
            f"Propuesta integrada: {integradas} entidades, {relaciones} relaciones",
        )
        return {"entidades": integradas, "relaciones": relaciones}

    # ── full graph read (export / projections / tests) ──────────────

    def leer_grafo(self) -> dict[str, list]:
        q = lambda sql: self.conn.execute(sql, (self.session_id,)).fetchall()  # noqa: E731
        return {
            "artefactos": [
                Artefacto(**dict(r)).model_dump()
                for r in q("SELECT * FROM ag_artefactos WHERE session_id = ?")
            ],
            "fragmentos": [
                Fragmento(**dict(r)).model_dump()
                for r in q("SELECT * FROM ag_fragmentos WHERE session_id = ?")
            ],
            "entidades": [self._entidad(r).model_dump() for r in q(
                "SELECT * FROM ag_entidades WHERE session_id = ?"
            )],
            "relaciones": [
                Relacion(**{**dict(r), "evidencia": _jl(r["evidencia"])}).model_dump()
                for r in q("SELECT * FROM ag_relaciones WHERE session_id = ?")
            ],
            "eventos": [
                Evento(
                    **{
                        **dict(r),
                        "entidades": _jl(r["entidades"]),
                        "evidencia": _jl(r["evidencia"]),
                    }
                ).model_dump()
                for r in q("SELECT * FROM ag_eventos WHERE session_id = ?")
            ],
            "productos": [
                Producto(
                    **{
                        **dict(r),
                        "cuerpo": json.loads(r["cuerpo"]) if r["cuerpo"] else None,
                        "entidades": _jl(r["entidades"]),
                        "evidencia": _jl(r["evidencia"]),
                    }
                ).model_dump()
                for r in q("SELECT * FROM ag_productos WHERE session_id = ?")
            ],
        }
