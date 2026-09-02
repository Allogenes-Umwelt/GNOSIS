# Modelo de datos (ER)

> **Nivel:** Suplementario · datos — **Notación:** Mermaid `erDiagram`
> **Pregunta que responde:** ¿Qué tablas existen, cuáles son aduanales y cuáles del sustrato, y cómo se relacionan?
> **Leyenda:** `||--o{` = uno a muchos · `}o--o{` = muchos a muchos · prefijo `ag_` = tabla del sustrato AUTOGENES; el resto es aduanal. `ag_entidad_alias` y `ag_fragmentos_fts` son ÍNDICES, no evidencia: se derivan de `ag_entidades` y `ag_fragmentos` y se reconstruyen desde ellas. `ag_citas` SÍ es evidencia: el trozo verificado que sostiene una afirmación.
> **ADR:** [ADR-0003](adr/0003-sqlite-como-unica-verdad.md) · [ADR-0004](adr/0004-sustrato-unico-escritor-de-ag.md) · [ADR-0006](adr/0006-proyeccion-en-tiempo-de-lectura.md) · [ADR-0014](adr/0014-resolucion-de-entidad-por-indice.md) · [ADR-0016](adr/0016-busqueda-de-texto-con-fts5.md) · [ADR-0017](adr/0017-vocabulario-span-y-confianza-derivada.md)
> **Índice de vistas:** [docs/architecture/README.md](README.md)

**Nota de la vista.** 28 entidades: muy por encima de las ~6 de una vista C4. Un modelo ER no es una vista C4 y su valor está en la completitud; desviación declarada.

Dos mundos en la misma base: el **aduanal** (alimentado por el pipeline) y
el **sustrato AUTOGENES** (`ag_*`, el grafo de evidencia + el flujo de
investigación). El dato aduanal se *proyecta* al grafo en tiempo de lectura
— no se duplica.

```mermaid
erDiagram
    processing_sessions ||--o{ importaciones : tiene
    processing_sessions ||--o{ pedimentos : tiene
    processing_sessions ||--o{ extraccion_facturas : tiene
    processing_sessions ||--o{ facturas_errores : tiene
    processing_sessions ||--o{ facturas_faltantes : tiene
    processing_sessions ||--o{ cupos : tiene
    processing_sessions ||--o{ seguimiento_mensual : tiene
    pedimentos ||--o{ importaciones : ampara
    catalogo_vehiculos ||--o{ importaciones : clasifica
    marcas ||--o{ catalogo_vehiculos : marca
    paises ||--o{ importaciones : origen

    ag_artefactos ||--o{ ag_fragmentos : contiene
    ag_fragmentos ||--|| ag_fragmentos_fts : "se busca por (FTS5, contenido externo)"
    ag_fragmentos ||--o{ ag_citas : "cita al TROZO (span verificado)"
    ag_fragmentos ||--o{ ag_entidades : "cita (procedencia)"
    ag_entidades ||--o{ ag_entidad_alias : "se resuelve por (nombre+alias)"
    ag_entidades ||--o{ ag_relaciones : conecta
    ag_relaciones ||--o{ ag_citas : "sostiene (sujeto_kind=relacion)"
    ag_entidades ||--o{ ag_eventos : "participa (por nombre)"
    ag_entidades ||--o{ ag_productos : "ancla (por id)"
    ag_bitacora }o--|| processing_sessions : "WORM append-only"
    ag_disposiciones }o--|| processing_sessions : "ciclo de vida O1"
    ag_reglas }o--|| processing_sessions : "normas NOMOS"
    ag_qualia_base ||--o{ ag_qualia_anomalias : "base medida"
    ag_qualia_snapshots }o--|| processing_sessions : "OODA"

    importaciones {
        int session_id
        string chasis "VIN (ofuscado ante LLM)"
        string factura
        float precio "0 = vacío, no $0 real"
        string j_y_n "preferencia"
        string pais_code
    }
    ag_disposiciones {
        int session_id
        string motor "concilia|validacion|nomos"
        string clave "UNIQUE(session,motor,clave)"
        string estado "nuevo|en_gestion|resuelto|descartado"
        string nota "SIN columna de monto"
    }
    ag_relaciones {
        string tipo "PREDICADO del vocabulario cerrado"
        string tipo_crudo "lo que dijo el modelo, si cayó a 'otro'"
        float peso_declarado "lo AFIRMADO — NO es la confianza"
        string evidencia "ids de fragmento (la cita por página)"
    }
    ag_citas {
        string sujeto_kind "entidad|relacion"
        string sujeto_id
        string fragmento_id
        int inicio "el span EXISTE en el fragmento: se comprueba"
        int fin
    }
    ag_reglas {
        string id
        string nombre
        string condiciones "JSON campo=valor (AND)"
        string entonces "JSON esperado"
        string origen "operador|insight"
        bool activa
    }
    ag_productos {
        string id
        string clase "informe|camino|investigacion"
        string unidad "concilia|validacion|sinapsis|..."
        string cuerpo "JSON con sello sha256"
        string evidencia "JAMÁS fabricada"
    }
```

**Los dos índices derivados.** `ag_entidad_alias` (una fila por nombre y
por alias, `PRIMARY KEY (session_id, alias_norm)`) resuelve la identidad sin
escanear; `ag_fragmentos_fts` (FTS5 de **contenido externo**, mantenido por
tres triggers) busca texto sin duplicarlo. Ninguno es evidencia: los dos se
reconstruyen desde su tabla real, así que quedan fuera de la ley de
procedencia y su relleno corre en migración, sin bitácora.

**Ley de la confianza:** `ag_relaciones` no guarda ninguna confianza. Guarda
`peso_declarado` —lo que afirmó quien propuso la arista— y la confianza se
DERIVA al leer (`autogenes/confianza.py`) contando artefactos distintos que
la citan, con su derivación al lado. Misma doctrina que la proyección
(ADR-0006): lo derivable no se almacena.

**Ley de procedencia:** una `ag_entidad` extraída de un documento **debe**
citar fragmentos (`evidencia`); las entidades de operador/conversación
llevan su `origen`. Un producto que cita filas aduanales lleva
`evidencia=[]` — jamás fabrica evidencia documental. **Ley del ciclo de
vida:** `ag_disposiciones` registra la decisión, nunca un monto — el monto
vive en el hallazgo del motor, derivado y citable a fila.
