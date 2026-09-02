# Proceso · Ingesta y procesamiento del pedimento

> **Nivel:** Proceso (BPMN-style) — **Notación:** Mermaid `flowchart TB` con carriles por actor
> **Pregunta que responde:** ¿Cómo viaja un pedimento desde el PDF que sube el operador hasta las tablas aduanales?
> **Leyenda:** Cian = inicio/fin · **magenta = compuerta de decisión** · rectángulo = actividad · `/…/` = artefacto de datos.
> **ADR:** [ADR-0003](../adr/0003-sqlite-como-unica-verdad.md)
> **Índice de vistas:** [docs/architecture/README.md](../README.md)

El pipeline de negocio en 4 fases, con carriles por actor. Notación
BPMN-style: `([inicio/fin])`, `[tarea]`, `{compuerta}`.

```mermaid
flowchart TB
    subgraph OP["Carril · Operador"]
        A([Sube ZIP de facturas]) --> B([Sube DWH + incrementales])
        B --> C([Sube PDFs de cupo prod/inversión])
    end
    subgraph APP["Carril · Aplicación Flask (/procesar)"]
        A --> F1["Fase 1 · extraer facturas<br/>PDFs_to_excel + validación ZIP"]
        F1 --> G1{¿PDF extraíble?}
        G1 -- no --> ERR[/Registrar en facturas_errores/]
        G1 -- sí --> EXT[/Guardar en extraccion_facturas/]
        C --> F2["Fase 2 · Concentrado 1<br/>Concentrado(dwh, incrementales)"]
        F2 --> F3["Fase 3 · Concentrado 2"]
        F3 --> F4["Fase 4 · Estadístico<br/>estadistico_v4(cupos)"]
        F4 --> G2{¿Factura sin<br/>documento físico?}
        G2 -- sí --> FALT[/facturas_faltantes/]
        G2 -- no --> OK[/importaciones + seguimiento_mensual/]
    end
    subgraph DB["Carril · SQLite"]
        EXT --> P[(Persistir)]
        ERR --> P
        FALT --> P
        OK --> P
    end
    P --> Z([Sesión lista para análisis])

    classDef start fill:#0b3d4d,stroke:#00d4ff,color:#fff
    classDef gate fill:#3d2a2f,stroke:#ff2e88,color:#fff
    class A,B,C,Z start
    class G1,G2 gate
```
