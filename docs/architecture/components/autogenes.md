# C4 L3 · Componentes del sustrato AUTOGENES

> **Nivel:** C4 L3 · Componentes — **Notación:** C4 (Mermaid `C4Component`)
> **Pregunta que responde:** ¿Qué hay dentro del sustrato: qué motores lo componen y cómo se encadenan en el flujo de investigación?
> **Leyenda:** `Person` actor humano · `System`/`Container`/`Component` caja del sistema · `System_Ext` sistema externo (fuera de nuestro control) · `ContainerDb` almacén · `Rel` arista dirigida y etiquetada con protocolo.
> **ADR:** [ADR-0004](../adr/0004-sustrato-unico-escritor-de-ag.md) · [ADR-0005](../adr/0005-networkx-confinado-a-lentes.md) · [ADR-0006](../adr/0006-proyeccion-en-tiempo-de-lectura.md) · [ADR-0013](../adr/0013-sello-bajo-candado.md) · [ADR-0015](../adr/0015-proyeccion-acotada-y-cacheada.md) · [ADR-0016](../adr/0016-busqueda-de-texto-con-fts5.md) · [ADR-0017](../adr/0017-vocabulario-span-y-confianza-derivada.md)
> **Índice de vistas:** [docs/architecture/README.md](../README.md)

**Nota de la vista.** Caja blanca de `Container(motores)` del L2. Excede las ~6 cajas que pide la doctrina: el sustrato ES el diferenciador del sistema y partirlo escondería el encadenamiento. Desviación declarada, no descuido.

El diferenciador: un grafo de evidencia con procedencia **más el flujo de
investigación**. `sustrato.py` es el **único escritor** de las tablas
`ag_*`; todo lo demás lee o propone. Los 35 módulos se organizan en seis
familias:

```mermaid
C4Component
    title AUTOGENES · Componentes del sustrato (por familia)

    Container_Boundary(ley, "Puerta y ley") {
        Component(sustrato, "Sustrato", "sustrato.py", "ÚNICO escritor de ag_*. Artefacto→Fragmento→Entidad→Relación, Evento, Producto, Regla, Disposición. Ley aditiva, bitácora WORM.")
        Component(tipos, "Tipos", "tipos.py", "Contratos pydantic del dominio.")
        Component(dispo, "Disposiciones", "disposiciones.py", "Ciclo de vida O1: anota lo declarado y lo CONTRASTA contra lo medido (contradice / resoluciones_verificadas).")
        Component(sello, "Sello", "sello.py", "Integridad C1-lite: sha256 re-derivable del producto; verificar() = guardado vs re-derivado.")
    }
    Container_Boundary(ing, "Ingesta") {
        Component(ingesta, "Ingesta", "ingesta.py, lotes.py, extraccion.py, citas.py, predicados.py", "PDF/JPG → fragmentos → entidades citadas con span VERIFICADO y predicados del vocabulario cerrado; ZIP por goteo con manifiesto.")
    }
    Container_Boundary(grafo, "Proyección y grafo") {
        Component(proyeccion, "Proyección", "proyeccion.py, red.py", "Proyecta el dato aduanal al grafo en tiempo de lectura (sin dual-write). NetworkX solo como lente.")
        Component(topo, "Topología", "topologia.py, caminos.py, consultas.py, busqueda.py, confianza.py", "Métricas puras y deterministas; expediente/camino/vecindario con citas; búsqueda FTS5; confianza DERIVADA de fuentes, con su derivación.")
        Component(atencion, "Atención", "estado.py, senales.py, metabolismo.py", "Figuras vivas del landing, señales del caso, Radar de urgencias.")
    }
    Container_Boundary(qua, "QUALIA (OODA)") {
        Component(qualia, "QUALIA", "qualia.py, anomalias.py, cascada.py, horizonte.py, qualia_narrativa.py", "OBSERVAR (anomalías vs base) → ORIENTAR → DECIDIR (cascada simulada) → ACTUAR (horizonte).")
    }
    Container_Boundary(desc, "Descuadre (flujo de investigación)") {
        Component(concilia, "CONCILIA F9", "concilia.py", "10 clases de hallazgo tri-fuente monetizados por moneda real; cobertura; dossier sellado.")
        Component(valida, "VALIDACIÓN F10", "validacion.py", "22 tamices deterministas + veredicto en capas (rechazado/observado/pasa) + retícula + certificado sellado.")
        Component(nomos, "NOMOS F12", "nomos.py", "Reglas McCulloch-Pitts del operador (AND, θ=n) + P&L + backtest histórico.")
        Component(sinapsis, "SINAPSIS F11", "sinapsis.py", "Insights por recombinación verificada + lattice de particiones + volante insight→regla.")
        Component(control, "CONTROL A3", "control.py", "SPC transversal: cada métrica citada vs su historia (mediana ± 3·MAD), señal de régimen.")
    }
    Container_Boundary(sint, "Síntesis y tiempo") {
        Component(informe, "Síntesis F6", "informe.py, hechos.py, analisis_vw.py", "Informe ejecutivo citado sobre hechos MEDIDOS; red de flujo de negocio.")
        Component(cronos, "CRONOS F13", "cronos.py", "Time-travel aditivo por created_at sobre la bitácora.")
    }

    ContainerDb(agdb, "Tablas ag_*", "SQLite")

    Rel(ingesta, sustrato, "propone escrituras")
    Rel(dispo, sustrato, "escribe vía")
    Rel(sustrato, agdb, "escribe (único)")
    Rel(proyeccion, agdb, "lee dato proyectado")
    Rel(concilia, agdb, "lee")
    Rel(valida, agdb, "lee")
    Rel(sinapsis, concilia, "recombina salidas")
    Rel(sinapsis, valida, "recombina salidas")
    Rel(nomos, agdb, "evalúa ag_reglas")
    Rel(control, agdb, "lee historia")
    Rel(cronos, agdb, "reconstruye por tiempo")
```

### El acople del descuadre — un ciclo que aprende

Las piezas del flujo de investigación no son islas: forman un ciclo
cerrado donde el patrón detectado se vuelve norma y la norma se vuelve
veredicto.

```mermaid
flowchart LR
    SIN["SINAPSIS<br/>detecta la conjunción<br/>(error confirmado)"] -- "volante insight→regla<br/>(pre-llenada, HITL)" --> NOM["NOMOS<br/>la formaliza como regla M-P<br/>con P&L + backtest"]
    NOM -- "convergencia O5.1<br/>(estrato de su veredicto)" --> VAL["VALIDACIÓN<br/>lattice de conformidad<br/>⊤=U … ⊥=⋂ V̄ᵣ"]
    VAL -- "partición del universo" --> SIN
    CON["CONCILIA<br/>descuadres tri-fuente<br/>monetizados"] -- "protagonistas" --> SIN
    VAL & CON & NOM -- "disposición O1<br/>(ag_disposiciones, WORM)" --> O1{"¿cerrado pero<br/>sigue midiéndose?"}
    O1 -- "sí → ≠ contradicho" --> RADAR["Radar / CONTROL SPC"]
    O1 -- "ya no se mide → verificado" --> RADAR
```
