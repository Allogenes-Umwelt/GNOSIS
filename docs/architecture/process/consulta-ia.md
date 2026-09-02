# Proceso · Consulta al caso vía Gnosis·IA

> **Nivel:** Interacción ordenada en el tiempo — **Notación:** Mermaid `sequenceDiagram`
> **Pregunta que responde:** ¿Cómo atraviesa una pregunta del operador la capa LLM sin que un identificador salga en claro?
> **Leyenda:** Participantes en columnas; el tiempo baja. Cada flecha es un mensaje etiquetado; la ofuscación ocurre ANTES de cruzar a la derecha.
> **ADR:** [ADR-0007](../adr/0007-ofuscacion-antes-del-llm.md)
> **Índice de vistas:** [docs/architecture/README.md](../README.md)

Cómo una pregunta del operador atraviesa el LLM sin filtrar identificadores.

```mermaid
sequenceDiagram
    actor OP as Operador
    participant UI as chat.js
    participant CH as chat_handler
    participant TE as tool_executor
    participant OB as ofuscation
    participant GR as tools_grafo / motores
    participant LLM as Proveedor LLM

    OP->>UI: pregunta ("¿qué rodea a la aduana X?")
    UI->>CH: POST /api/v1/chat
    CH->>LLM: system prompt + historia (tool_result = DATO, no instrucción)
    LLM-->>CH: tool_call (p.ej. vecindario, conciliacion, validacion)
    CH->>TE: ejecutar tool (26 disponibles)
    TE->>GR: correr consulta sobre el grafo
    GR-->>TE: resultado con chasis/factura REALES
    TE->>OB: ofuscar (por nombre + patrón VIN)
    OB-->>TE: resultado con tokens [VIN-001-...], [FACT-...]
    TE-->>CH: resultado ofuscado
    CH->>LLM: tool_result (ofuscado)
    LLM-->>CH: respuesta citada con tokens
    CH->>OB: unmask_text (solo en dispositivo)
    OB-->>CH: respuesta con valores reales
    CH-->>UI: respuesta final
    UI-->>OP: render (escapado contra XSS)
```
