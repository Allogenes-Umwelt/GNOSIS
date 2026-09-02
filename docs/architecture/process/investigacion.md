# Proceso · El flujo de investigación

> **Nivel:** Proceso (BPMN-style) — **Notación:** Mermaid `flowchart TB`
> **Pregunta que responde:** ¿Cómo pasa un descuadre de detectado a defendido, y cómo realimenta al sistema?
> **Leyenda:** **Magenta = compuerta de decisión** (hallazgo / contradicción) · rectángulo = actividad · el ciclo cierra sobre sí mismo: lo dispuesto vuelve como contraste.
> **ADR:** [ADR-0004](../adr/0004-sustrato-unico-escritor-de-ag.md) · [ADR-0019](../adr/0019-tiempo-event-log-y-reglas-de-grafo.md)
> **Índice de vistas:** [docs/architecture/README.md](../README.md)

El hueco que `docs/BENCHMARK_PALANTIR.md` declaraba como el valor central de
Palantir, cerrado: **detectar → disponer → documentar → defender →
vigilar**. El diferenciador honesto está en la compuerta final: GNOSIS no
solo registra lo que el operador dice — **contrasta lo declarado contra lo
medido** en cada corrida.

```mermaid
flowchart TB
    subgraph MOT["Carril · Motores (lectura pura — re-derivan en cada corrida)"]
        M1["CONCILIA · 10 clases<br/>de hallazgo tri-fuente"] --> H{¿hallazgos<br/>vivos?}
        M2["VALIDACIÓN · 22 tamices<br/>veredicto en capas"] --> H
        M3["NOMOS · reglas M-P sobre filas<br/>+ patrones sobre el GRAFO"] --> H
        M4["SINAPSIS · conjunciones<br/>entre motores"] --> H
    end
    subgraph OP["Carril · Operador (HITL)"]
        H -- sí --> T["Triaje: ledger, filtros,<br/>severidad como texto"]
        T --> D["DISPONER: nuevo → en_gestión →<br/>resuelto / descartado + nota"]
        D --> DOC["DOCUMENTAR: dockear<br/>dossier · certificado · insight"]
        DOC --> DEF["DEFENDER: expediente<br/>imprimible con cobertura"]
    end
    subgraph SUS["Carril · Sustrato (única puerta de escritura)"]
        D --> W[("ag_disposiciones<br/>+ bitácora WORM")]
        DOC --> PR[("ag_productos<br/>con sello sha256")]
    end
    subgraph VIG["Carril · Vigilancia"]
        W --> C1{"¿cerrado pero el motor<br/>lo SIGUE midiendo?"}
        C1 -- sí --> CONTRA["≠ CONTRADICHO<br/>(magenta legítimo)"]
        C1 -- "ya no se mide" --> VER["resolución VERIFICADA<br/>por el motor"]
        PR --> SPC["CONTROL · SPC:<br/>mediana ± 3·MAD vs historia"]
        SPC --> R["Radar: urgencias<br/>(régimen, norma, negocio)"]
        CONTRA --> R
    end

    classDef gate fill:#3d2a2f,stroke:#ff2e88,color:#fff
    class H,C1 gate
```
