# Modelo de datos (ER)

> **Nivel:** Suplementario · datos — **Notación:** Mermaid `erDiagram`
> **Pregunta que responde:** ¿Qué tablas existen, cuáles son aduanales y cuáles del sustrato, y cómo se relacionan?
> **Leyenda:** `||--o{` = uno a muchos · `}o--o{` = muchos a muchos · prefijo `ag_` = tabla del sustrato AUTOGENES; el resto es aduanal. `ag_entidad_alias` es índice, no evidencia: se deriva de `ag_entidades` y se reconstruye desde ella.
> **ADR:** [ADR-0003](adr/0003-sqlite-como-unica-verdad.md) · [ADR-0004](adr/0004-sustrato-unico-escritor-de-ag.md) · [ADR-0006](adr/0006-proyeccion-en-tiempo-de-lectura.md) · [ADR-0014](adr/0014-resolucion-de-entidad-por-indice.md)
> **Índice de vistas:** [docs/architecture/README.md](README.md)

**Nota de la vista.** 26 entidades: muy por encima de las ~6 de una vista C4. Un modelo ER no es una vista C4 y su valor está en la completitud; desviación declarada.

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
    ag_fragmentos ||--o{ ag_entidades : "cita (procedencia)"
    ag_entidades ||--o{ ag_entidad_alias : "se resuelve por (nombre+alias)"
    ag_entidades ||--o{ ag_relaciones : conecta
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

**Ley de procedencia:** una `ag_entidad` extraída de un documento **debe**
citar fragmentos (`evidencia`); las entidades de operador/conversación
llevan su `origen`. Un producto que cita filas aduanales lleva
`evidencia=[]` — jamás fabrica evidencia documental. **Ley del ciclo de
vida:** `ag_disposiciones` registra la decisión, nunca un monto — el monto
vive en el hallazgo del motor, derivado y citable a fila.
