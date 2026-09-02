# C4 L3 · Componentes de la Aplicación Flask

> **Nivel:** C4 L3 · Componentes — **Notación:** C4 (Mermaid `C4Component`)
> **Pregunta que responde:** ¿Qué hay dentro del contenedor Flask: qué familias de rutas existen y qué cortes transversales las atraviesan?
> **Leyenda:** `Person` actor humano · `System`/`Container`/`Component` caja del sistema · `System_Ext` sistema externo (fuera de nuestro control) · `ContainerDb` almacén · `Rel` arista dirigida y etiquetada con protocolo.
> **ADR:** [ADR-0002](../adr/0002-monolito-flask-con-blueprints.md) · [ADR-0012](../adr/0012-estado-conversacional-en-sqlite.md)
> **Índice de vistas:** [docs/architecture/README.md](../README.md)

**Nota de la vista.** Caja blanca de `Container(flask)` del L2; todo lo demás queda como referencia externa nombrada.

Interior del contenedor Flask: las familias de rutas (blueprints) y los
cortes transversales.

```mermaid
C4Component
    title GNOSIS · Componentes de la Aplicación Flask

    Container_Boundary(flask, "Aplicación Flask") {
        Component(factory, "Factory + before_request", "app.py", "Crea la app, registra blueprints, candado de operador (X-Gnosis-Token en métodos mutantes), contrato de errores (HTTPException conserva su código; /api responde JSON).")
        Component(bp_tab, "Blueprint tableros", "rutas/tableros.py", "11 rutas: 5 páginas + APIs de negocio (TBV-01..05).")
        Component(bp_auto, "Blueprint autogenes", "rutas/autogenes.py", "81 rutas: landing, grafo, ingesta, QUALIA, CONCILIA, VALIDACIÓN, SINAPSIS, NOMOS, CRONOS, CONTROL, disposiciones, expediente, síntesis, export.")
        Component(comun, "Helpers de sesión", "rutas/comun.py", "_con_sesion (estado vacío honesto = 404 declarado), _etiqueta_sesion, _sesion_activa.")
        Component(legacy, "Rutas /procesar", "app.py", "Fases 1-4 del pipeline; carga de ZIP con extracción acotada.")
        Component(shell, "Sessions/Admin/Chat/Errores", "app.py", "29 rutas: gestión de sesiones, config LLM, proxy de chat, panel de errores.")
    }

    ContainerDb(db, "SQLite", "WAL")
    Container(motores, "Motores", "Python puro")
    Container(jarvis, "Gnosis·IA", "Python")

    Rel(factory, bp_tab, "registra")
    Rel(factory, bp_auto, "registra")
    Rel(bp_tab, comun, "usa")
    Rel(bp_auto, comun, "usa")
    Rel(bp_tab, motores, "invoca (tableros)")
    Rel(bp_auto, motores, "invoca (AUTOGENES)")
    Rel(shell, jarvis, "delega chat")
    Rel(comun, db, "verifica sesión")
    Rel(legacy, db, "persiste")
```
