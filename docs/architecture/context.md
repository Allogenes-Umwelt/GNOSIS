# C4 L1 · Contexto del sistema

> **Nivel:** C4 L1 · Contexto — **Notación:** C4 (Mermaid `C4Context`)
> **Pregunta que responde:** ¿Qué es GNOSIS en su entorno: quién lo usa y con qué sistemas externos habla?
> **Leyenda:** `Person` actor humano · `System`/`Container`/`Component` caja del sistema · `System_Ext` sistema externo (fuera de nuestro control) · `ContainerDb` almacén · `Rel` arista dirigida y etiquetada con protocolo.
> **ADR:** [ADR-0002](adr/0002-monolito-flask-con-blueprints.md) · [ADR-0007](adr/0007-ofuscacion-antes-del-llm.md)
> **Índice de vistas:** [docs/architecture/README.md](README.md)

**Nota de la vista.** Único diagrama de caja negra: GNOSIS aparece sin interior. Los niveles siguientes lo abren de una caja a la vez.

Quién usa GNOSIS y con qué sistemas externos habla.

```mermaid
C4Context
    title GNOSIS · Diagrama de Contexto

    Person(operador, "Operador (Jesús)", "Analista aduanal VW. Sube facturas/pedimentos, investiga descuadres, defiende ante glosa, consulta el caso.")

    System(gnosis, "GNOSIS", "Analítica de importaciones + sustrato de evidencia AUTOGENES + flujo de investigación + tableros de negocio. Local-first.")

    System_Ext(deepseek, "DeepSeek API", "LLM por defecto para Gnosis·IA (chat sobre el grafo).")
    System_Ext(anthropic, "Anthropic API", "LLM de respaldo, activable en admin.")
    System_Ext(ollama, "Ollama", "LLM local de respaldo offline.")
    System_Ext(osm, "OpenStreetMap", "Teselas de mapa SOLO para el tablero de Rutas (TBV-03).")

    Rel(operador, gnosis, "Sube documentos, investiga, dispone hallazgos, dockea productos", "HTTPS")
    Rel(gnosis, deepseek, "Consulta con tools; identificadores OFUSCADOS", "HTTPS")
    Rel(gnosis, anthropic, "Fallback LLM", "HTTPS")
    Rel(gnosis, ollama, "Fallback offline", "HTTP local")
    Rel(gnosis, osm, "Pide teselas (única excepción de assets externos)", "HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

**Nota de privacidad:** los identificadores sensibles (chasis/VIN, número de
factura, pedimento, patente) **nunca** viajan en claro a un LLM. La capa de
ofuscación (`jarvis/ofuscation.py`) los reemplaza por tokens reversibles
solo en el dispositivo.
