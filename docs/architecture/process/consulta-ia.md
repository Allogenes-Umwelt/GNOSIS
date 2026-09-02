# Proceso · Consulta al caso vía Gnosis·IA

> **Nivel:** Interacción ordenada en el tiempo — **Notación:** Mermaid `sequenceDiagram`
> **Pregunta que responde:** ¿Cómo atraviesa una pregunta del operador la capa LLM sin que un identificador salga en claro?
> **Leyenda:** Participantes en columnas; el tiempo baja. Cada flecha es un mensaje etiquetado; **todo lo que cruza hacia `LLM` va enmascarado** — la entrada del operador, los resultados de tool y lo que se persiste.
> **ADR:** [ADR-0007](../adr/0007-ofuscacion-antes-del-llm.md) · [ADR-0011](../adr/0011-ofuscacion-por-conjunto-y-sandbox.md)
> **Índice de vistas:** [docs/architecture/README.md](../README.md)

Cómo una pregunta del operador atraviesa el LLM sin filtrar identificadores.

```mermaid
sequenceDiagram
    actor OP as Operador
    participant UI as chat.js
    participant CH as chat_handler
    participant TE as tool_executor
    participant AM as ambito
    participant SB as sandbox
    participant OB as ofuscation
    participant ID as identidades
    participant GR as tools_grafo / motores
    participant LLM as Proveedor LLM

    OP->>UI: pregunta (puede pegar un VIN real)
    UI->>CH: POST /api/v1/chat
    CH->>OB: enmascarar la ENTRADA del operador
    CH->>AM: abrir ámbito = sesión activa
    CH->>LLM: system prompt + historia (tool_result = DATO, no instrucción)
    LLM-->>CH: tool_call (p.ej. vecindario, consulta_sql)
    CH->>TE: ejecutar tool (26 disponibles)
    TE->>AM: ¿la sesión pedida está en ámbito?
    AM-->>TE: sí / error declarado
    TE->>SB: consulta_sql -> sandbox (ro + authorizer + vistas de sesión)
    SB-->>TE: filas de ESTA sesión, sin tablas prohibidas
    TE->>GR: resto de tools sobre el grafo
    GR-->>TE: resultado con chasis/factura REALES
    TE->>OB: capa 1 — ofuscar por nombre de campo
    TE->>ID: capa 2 — enmascarar por CONJUNTO sobre el texto serializado
    ID-->>TE: alias, expresiones y anidados cubiertos
    TE-->>CH: resultado ofuscado
    CH->>LLM: tool_result (ofuscado)
    LLM-->>CH: respuesta citada con tokens
    CH->>OB: mask_known -> persistir ENMASCARADO en chat_conversations
    CH->>OB: unmask_text (solo para la pantalla)
    OB-->>CH: respuesta con valores reales
    CH-->>UI: respuesta final
    UI-->>OP: render (escapado contra XSS)
```
