"""AUTOGENES domain types — Python port of ref_karelen/types/autogenes.ts.

Pydantic schemas are the single source of truth at every boundary
(API in, LLM proposals in, DB rows out). Field names are snake_case;
the DB layer maps 1:1. Proposal types stay lenient on evidence — the
sanitizer in sustrato.integrar_propuesta enforces non-empty REAL
evidence, mirroring KARELEN's server-side saneadores.
"""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from autogenes.predicados import PREDICADOS

KindArtefacto = Literal["pdf", "imagen", "nota", "estructurado"]

TipoEntidad = Literal[
    "concepto",
    "persona",
    "organizacion",
    "lugar",
    "evento",
    "termino",
    "servicio",
    "documento",
    "otro",
]

Origen = Literal["operador", "synesis"]

PrecisionFecha = Literal["dia", "mes", "anio"]

ClaseProducto = Literal["informe", "camino", "investigacion"]

#: El vocabulario cerrado de relaciones (G2). La lista vive en
#: `autogenes/predicados.py` porque es del dominio, no del tipo: quien
#: conoce la aduana la edita ahí sin tocar los contratos.
Predicado = Literal[PREDICADOS]

FECHA_ISO = r"^\d{4}-\d{2}-\d{2}$"


class Cita(BaseModel):
    """Una cita a un TROZO del fragmento, no a la página entera (G4).

    Antes `evidencia` era una lista de ids y una cita señalaba una página de
    hasta 12 000 caracteres: cierto, pero inútil para resaltar y demasiado
    ancho para verificar. Con `inicio`/`fin` la cita se puede comprobar
    contra el texto real —el saneador lo hace— y resaltar en pantalla.
    """
    fragmento_id: str = Field(min_length=1)
    inicio: int = Field(ge=0)
    fin: int = Field(gt=0)
    texto: str = Field(default="", max_length=400)


class GeoPunto(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class Artefacto(BaseModel):
    id: str = Field(min_length=1)
    kind: KindArtefacto
    nombre: str = Field(min_length=1)
    paginas: Optional[int] = Field(default=None, ge=0)
    blob_ref: Optional[str] = None
    hash: Optional[str] = None
    created_at: str


class Fragmento(BaseModel):
    id: str = Field(min_length=1)
    artefacto_id: str = Field(min_length=1)
    pagina: Optional[int] = Field(default=None, ge=1)
    texto: str
    created_at: str


class Entidad(BaseModel):
    id: str = Field(min_length=1)
    nombre: str = Field(min_length=1)
    tipo: TipoEntidad
    resumen: Optional[str] = None
    campo: Optional[str] = None
    alias: list[str] = Field(default_factory=list)
    geo: Optional[GeoPunto] = None
    subtipo: Optional[str] = None
    propiedades: Optional[dict[str, str]] = None
    origen: Origen
    evidencia: list[str] = Field(default_factory=list)
    created_at: str


class Relacion(BaseModel):
    id: str = Field(min_length=1)
    desde_id: str = Field(min_length=1)
    hasta_id: str = Field(min_length=1)
    #: Predicado canónico del vocabulario (G2). Lo que dijo el modelo, cuando
    #: no casó con ninguno, sobrevive en `tipo_crudo`.
    tipo: Predicado = "otro"
    tipo_crudo: Optional[str] = None
    #: Lo que el modelo AFIRMÓ, no lo que se puede sostener (G5). La confianza
    #: se DERIVA en tiempo de lectura en `autogenes/confianza.py`, contando
    #: artefactos distintos que citan la relación; este número no es esa
    #: confianza y por eso ya no se llama `peso`.
    peso_declarado: float = Field(default=0.5, ge=0, le=1)
    evidencia: list[str] = Field(default_factory=list)
    origen: str = "synesis"
    created_at: str


class Evento(BaseModel):
    id: str = Field(min_length=1)
    titulo: str = Field(min_length=1)
    fecha: str = Field(pattern=FECHA_ISO)
    precision: PrecisionFecha
    entidades: list[str] = Field(default_factory=list)
    evidencia: list[str] = Field(default_factory=list)
    origen: Origen
    created_at: str


class Producto(BaseModel):
    id: str = Field(min_length=1)
    clase: ClaseProducto
    titulo: str = Field(min_length=1)
    unidad: str = Field(min_length=1)
    cuerpo: Any = None
    entidades: list[str] = Field(default_factory=list)
    evidencia: list[str] = Field(default_factory=list)
    created_at: str


# ── Extraction proposals: what the model proposes, before sanitizing ──


class PropuestaEntidad(BaseModel):
    nombre: str = Field(min_length=1)
    tipo: TipoEntidad = "otro"
    resumen: Optional[str] = None
    #: Ids de fragmento. El id suelto sigue valiendo (G4: el cambio es
    #: compatible); las citas con span viajan aparte, en `citas`.
    evidencia: list[str] = Field(default_factory=list)
    citas: list[Cita] = Field(default_factory=list)

    @field_validator("nombre", mode="before")
    @classmethod
    def _recortar_nombre(cls, v):
        # strip ANTES de validar min_length: "  " no puede colarse como
        # entidad sin nombre
        return v.strip()[:80] if isinstance(v, str) else v

    @field_validator("resumen")
    @classmethod
    def _recortar_resumen(cls, v: Optional[str]) -> Optional[str]:
        return v[:200] if v is not None else None


class PropuestaRelacion(BaseModel):
    desde: str = Field(min_length=1)
    hasta: str = Field(min_length=1)
    #: Lo que el modelo escriba, tal cual. La normalización al vocabulario
    #: ocurre en la PUERTA (`Sustrato.agregar_relacion`), no aquí: rechazar
    #: la propuesta por una redacción tiraría la relación entera.
    tipo: str = Field(min_length=1)
    peso: float = 0.5
    evidencia: list[str] = Field(default_factory=list)
    citas: list[Cita] = Field(default_factory=list)

    @field_validator("tipo")
    @classmethod
    def _recortar_tipo(cls, v: str) -> str:
        return v[:60]

    @field_validator("peso")
    @classmethod
    def _acotar_peso(cls, v: float) -> float:
        # NaN atraviesa min/max (toda comparación con NaN es falsa) y sqlite lo
        # liga como NULL → 500 opaco en una propuesta por lo demás válida. Un
        # peso no numérico no es dato: cae al default honesto de "sin confianza".
        if v != v:
            return 0.5
        return min(max(v, 0.0), 1.0)


class PropuestaEvento(BaseModel):
    titulo: str = Field(min_length=1)
    fecha: str = Field(min_length=4)
    entidades: list[str] = Field(default_factory=list)
    evidencia: list[str] = Field(default_factory=list)

    @field_validator("titulo", mode="before")
    @classmethod
    def _recortar_titulo(cls, v):
        # strip ANTES de validar min_length (mismo cierre que PropuestaEntidad)
        return v.strip()[:160] if isinstance(v, str) else v

    @field_validator("entidades")
    @classmethod
    def _recortar_entidades(cls, v: list[str]) -> list[str]:
        return [s.strip()[:80] for s in v]


class PropuestaGrafo(BaseModel):
    entidades: list[PropuestaEntidad] = Field(default_factory=list)
    relaciones: list[PropuestaRelacion] = Field(default_factory=list)
