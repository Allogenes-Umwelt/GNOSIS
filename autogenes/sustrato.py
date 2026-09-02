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
import hashlib
import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
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


def _sello_bitacora(prev_hash: str, rid: int, session_id: int, ts: str,
                    accion: str, detalle: str) -> str:
    """sha256 encadenado de una fila de bitácora: incluye el sello previo y el
    id (posición), de modo que reescribir o reordenar una fila invalida el
    resto de la cadena. Puro y determinista (mismo contenido ⇒ mismo sello)."""
    base = json.dumps([prev_hash, rid, session_id, ts, accion, detalle],
                      ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


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

    @contextmanager
    def atomico(self):
        """Agrupa varias mutaciones en UN commit — o entran todas o ninguna.
        Reusa el diferido de `_lote` (mismo mecanismo que integrar_propuesta)
        para que, p.ej., un artefacto y sus fragmentos jamás queden a medias:
        sin esto, morir entre ambos commits deja un artefacto con hash pero
        sin fragmentos que el dedupe saltaría para siempre (evidencia muda)."""
        if self._lote:
            # ya dentro de un lote: no anidar transacciones ni commitear aquí
            yield
            return
        if not self.conn.in_transaction:
            self.conn.execute("BEGIN IMMEDIATE")
        self._lote = True
        try:
            yield
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise
        finally:
            self._lote = False

    # ── bitácora (append-only; never rewritten) ──────────────────────

    def _registrar(self, accion: str, detalle: str) -> None:
        # bitácora WORM con sello encadenado: cada fila hashea el sello previo
        # (cadena global, no por sesión) + su propio contenido. Una edición o un
        # borrado fuera de esta puerta rompe la cadena y verificar_bitacora lo
        # detecta — la propiedad write-once deja de ser solo disciplina.
        #
        # El candado de escritura se toma ANTES de leer el sello previo. Hoy
        # eso ya ocurría de rebote —todo método que registra escribe primero,
        # así que la transacción implícita de sqlite3 ya tenía el candado—,
        # pero era una garantía prestada: bastaba `isolation_level=None`, el
        # `autocommit` de Python 3.12, o un método futuro que solo registrase,
        # para que dos escritores leyeran el MISMO prev_hash y la cadena se
        # bifurcara. Una bifurcación se ve igual que una manipulación, y una
        # alarma forense que miente una vez deja de creerse. Aquí es explícito.
        if not self.conn.in_transaction:
            self.conn.execute("BEGIN IMMEDIATE")
        prev = self.conn.execute(
            "SELECT hash FROM ag_bitacora ORDER BY id DESC LIMIT 1").fetchone()
        prev_hash = (prev[0] if prev else None) or ""
        cur = self.conn.execute(
            "INSERT INTO ag_bitacora (session_id, accion, detalle, prev_hash)"
            " VALUES (?, ?, ?, ?)",
            (self.session_id, accion, detalle, prev_hash or None),
        )
        rid = cur.lastrowid
        ts = self.conn.execute(
            "SELECT ts FROM ag_bitacora WHERE id = ?", (rid,)).fetchone()[0]
        sello = _sello_bitacora(prev_hash, rid, self.session_id, ts, accion, detalle)
        self.conn.execute(
            "UPDATE ag_bitacora SET hash = ? WHERE id = ?", (sello, rid))

    def verificar_bitacora(self) -> dict[str, Any]:
        """Re-deriva la cadena de sellos de TODA la bitácora (global) y la
        compara fila por fila. Devuelve {valido, filas, roto_en, motivo}. Solo
        se sellan las filas escritas por _registrar; una historia previa al
        sello (prev_hash/hash NULL) se declara `sin_sellar`, no rota."""
        filas = self.conn.execute(
            "SELECT id, session_id, ts, accion, detalle, prev_hash, hash"
            " FROM ag_bitacora ORDER BY id").fetchall()
        prev = ""
        sellados = 0
        sin_sellar = 0
        for r in filas:
            if r["hash"] is None:
                if r["prev_hash"] is None:
                    # historia anterior al sello: no se puede verificar, pero
                    # tampoco está rota. Se declara y se sigue.
                    sin_sellar += 1
                    continue
                # HUECO: la fila entró pero su sello no llegó a escribirse
                # (muerte entre el INSERT y el UPDATE). Es un defecto de
                # escritura declarable, no una manipulación — decir "cadena
                # rota" sería acusar de fraude a un corte de luz.
                return {"valido": False, "filas": len(filas),
                        "sellados": sellados, "sin_sellar": sin_sellar,
                        "roto_en": r["id"], "motivo": "hueco"}
            esperado = _sello_bitacora(prev, r["id"], r["session_id"], r["ts"],
                                       r["accion"], r["detalle"])
            if (r["prev_hash"] or "") != prev or r["hash"] != esperado:
                return {"valido": False, "filas": len(filas),
                        "sellados": sellados, "sin_sellar": sin_sellar,
                        "roto_en": r["id"],
                        "motivo": "cadena" if (r["prev_hash"] or "") != prev
                        else "hash"}
            prev = r["hash"]
            sellados += 1
        return {"valido": True, "filas": len(filas), "sellados": sellados,
                "sin_sellar": sin_sellar, "roto_en": None, "motivo": None}

    def bitacora(self, limite: int = 100) -> list[dict]:
        rows = self.conn.execute(
            "SELECT id, ts, accion, detalle FROM ag_bitacora"
            " WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (self.session_id, limite),
        )
        return [dict(r) for r in rows]

    # ── disposición de anomalías QUALIA (F7/Q5) ──────────────────────
    ESTADOS_ANOMALIA = ("nuevo", "en_gestion", "resuelto", "descartado")

    def disponer_anomalia(self, clave: str, estado: str,
                          nota: Optional[str] = None) -> dict:
        """Fija la disposición del operador sobre una anomalía (por clave):
        nuevo → en_gestion → resuelto/descartado, con nota opcional. Puerta
        única + bitácora WORM. La anomalía JAMÁS se monetiza (lo veta el
        esquema con CHECK monetizado = 0); esto sólo registra la decisión, no
        fabrica monto ni evidencia."""
        clave = (clave or "").strip()
        if not clave:
            raise ValueError("Anomalía sin clave")
        if estado not in self.ESTADOS_ANOMALIA:
            raise ValueError(f"Estado inválido: {estado}")
        nota_limpia = (nota or "").strip() or None
        self.conn.execute(
            "INSERT INTO ag_qualia_anomalias (session_id, clave, estado, nota)"
            " VALUES (?, ?, ?, ?)"
            " ON CONFLICT(session_id, clave) DO UPDATE SET"
            " estado = excluded.estado, nota = excluded.nota, ts = datetime('now')",
            (self.session_id, clave, estado, nota_limpia),
        )
        self._registrar(
            "anomalia",
            f"{clave} → {estado}" + (f": {nota_limpia}" if nota_limpia else ""))
        self._commit()
        return {"clave": clave, "estado": estado, "nota": nota_limpia}

    def disposiciones_anomalias(self) -> dict[str, dict]:
        """Mapa clave → {estado, nota} de las anomalías dispuestas."""
        return {
            r["clave"]: {"estado": r["estado"], "nota": r["nota"]}
            for r in self.conn.execute(
                "SELECT clave, estado, nota FROM ag_qualia_anomalias"
                " WHERE session_id = ?", (self.session_id,),
            )
        }

    # ── disposición de hallazgos de descuadre (F9/F10/F12) ───────────
    MOTORES_HALLAZGO = ("concilia", "validacion", "nomos")

    def disponer_hallazgo(self, motor: str, clave: str, estado: str,
                          nota: Optional[str] = None) -> dict:
        """Fija la disposición del operador sobre un hallazgo de un motor de
        descuadre (CONCILIA/VALIDACIÓN/NOMOS), por (motor, clave):
        nuevo → en_gestion → resuelto/descartado, con nota opcional. Puerta
        única + bitácora WORM. La disposición JAMÁS monetiza (no hay columna
        de monto en el esquema); sólo registra la decisión — el monto vive en
        el hallazgo del motor, derivado y citable a fila."""
        motor = (motor or "").strip()
        clave = (clave or "").strip()
        if motor not in self.MOTORES_HALLAZGO:
            raise ValueError(f"Motor inválido: {motor}")
        if not clave:
            raise ValueError("Hallazgo sin clave")
        if estado not in self.ESTADOS_ANOMALIA:
            raise ValueError(f"Estado inválido: {estado}")
        nota_limpia = (nota or "").strip() or None
        self.conn.execute(
            "INSERT INTO ag_disposiciones (session_id, motor, clave, estado, nota)"
            " VALUES (?, ?, ?, ?, ?)"
            " ON CONFLICT(session_id, motor, clave) DO UPDATE SET"
            " estado = excluded.estado, nota = excluded.nota, ts = datetime('now')",
            (self.session_id, motor, clave, estado, nota_limpia),
        )
        self._registrar(
            "hallazgo",
            f"{motor}/{clave} → {estado}"
            + (f": {nota_limpia}" if nota_limpia else ""))
        self._commit()
        return {"motor": motor, "clave": clave, "estado": estado,
                "nota": nota_limpia}

    def disposiciones_hallazgos(self, motor: str) -> dict[str, dict]:
        """Mapa clave → {estado, nota, ts} de los hallazgos dispuestos de un
        motor."""
        return {
            r["clave"]: {"estado": r["estado"], "nota": r["nota"], "ts": r["ts"]}
            for r in self.conn.execute(
                "SELECT clave, estado, nota, ts FROM ag_disposiciones"
                " WHERE session_id = ? AND motor = ?", (self.session_id, motor),
            )
        }

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

    def _por_clave(self, clave: str) -> Optional[Entidad]:
        """La entidad cuyo nombre o alias normaliza a `clave`, o None."""
        if not clave:
            return None
        fila = self.conn.execute(
            "SELECT entidad_id FROM ag_entidad_alias"
            " WHERE session_id = ? AND alias_norm = ?",
            (self.session_id, clave),
        ).fetchone()
        return self.entidad_por_id(fila[0]) if fila else None

    def _indexar_claves(self, entidad_id: str, nombre: str,
                        alias: Optional[Sequence[str]] = None) -> None:
        """Mantiene el índice de resolución al día.

        `INSERT OR IGNORE`: si otra entidad ya reclamó ese alias, gana la
        primera y la segunda no lo roba — el conflicto se resuelve por
        construcción, no por orden de filas."""
        self.conn.execute(
            "INSERT OR IGNORE INTO ag_entidad_alias"
            " (session_id, alias_norm, entidad_id, es_nombre) VALUES (?, ?, ?, 1)",
            (self.session_id, _norm(nombre), entidad_id),
        )
        for a in alias or []:
            clave = _norm(a)
            if clave:
                self.conn.execute(
                    "INSERT OR IGNORE INTO ag_entidad_alias"
                    " (session_id, alias_norm, entidad_id, es_nombre)"
                    " VALUES (?, ?, ?, 0)",
                    (self.session_id, clave, entidad_id),
                )

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
        """Resolve by lowercased name OR alias; merge under the additive law.

        La resolución va por `ag_entidad_alias` (índice único sobre
        `(session_id, alias_norm)`), no por escaneo en Python. Antes esto
        cargaba TODAS las entidades de la sesión por pydantic y comparaba una
        a una: O(E) por llamada y O(E²) por ingesta — medido, reencontrar una
        entidad costaba 13,7× más con 2 100 dentro que con 100
        (`docs/DIAGNOSTICO_FABLE_v02.md` §1). El UNIQUE del índice hace
        además imposible el empate que el escaneo resolvía según el orden
        físico de filas."""
        evidencia = evidencia or []
        clave = _norm(nombre)
        existente = self._por_clave(clave)
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
        # dedupe la evidencia también en la creación (la fusión ya lo hacía): un
        # frag_id repetido inflaría el peso de la cinta en el chord de ingesta
        self.conn.execute(
            "INSERT INTO ag_entidades (id, session_id, nombre, tipo, resumen, campo,"
            " origen, evidencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (eid, self.session_id, nombre.strip(), tipo, resumen, campo, origen,
             _js(list(dict.fromkeys(evidencia)))),
        )
        self._indexar_claves(eid, nombre)
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
        self.conn.execute(f"UPDATE ag_entidades SET {', '.join(sets)} WHERE id = ?", valores)  # noqa: S608 — SQL estático: la f-string no interpola entrada
        # El índice de resolución tiene que seguir al nombre y a los alias: si
        # no, renombrar una entidad la deja inencontrable por su nombre nuevo y
        # encontrable por el viejo. Se reconstruyen SUS claves (no las de otras
        # entidades, que no han cambiado).
        if "nombre" in campos or "alias" in campos:
            self.conn.execute(
                "DELETE FROM ag_entidad_alias WHERE session_id = ? AND entidad_id = ?",
                (self.session_id, entidad_id),
            )
            self._indexar_claves(
                entidad_id,
                campos.get("nombre", entidad.nombre),
                campos.get("alias", entidad.alias),
            )
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

        # Borrar al perdedor arrastra SUS claves de resolución (ON DELETE
        # CASCADE), así que el nombre fusionado dejaría de encontrar a nadie y
        # la siguiente mención crearía un duplicado — justo lo contrario de
        # fusionar. Se reindexa al ganador con la lista de alias ya unida, que
        # incluye el nombre del perdedor.
        self.conn.execute("DELETE FROM ag_entidades WHERE id = ?", (perdedor_id,))
        self._indexar_claves(ganador_id, ganador.nombre, alias)
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
            # filtra a ids reales Y dedupe (orden estable): un frag repetido no
            # debe contarse dos veces en el peso de la cinta del chord de ingesta
            return [x for x in dict.fromkeys(ev) if x in reales]

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
