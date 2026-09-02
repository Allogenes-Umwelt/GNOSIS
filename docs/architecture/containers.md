# C4 L2 · Contenedores

> **Nivel:** C4 L2 · Contenedores — **Notación:** C4 (Mermaid `C4Container`)
> **Pregunta que responde:** ¿Cuáles son las piezas ejecutables de GNOSIS y cómo se comunican entre sí?
> **Leyenda:** `Person` actor humano · `System`/`Container`/`Component` caja del sistema · `System_Ext` sistema externo (fuera de nuestro control) · `ContainerDb` almacén · `Rel` arista dirigida y etiquetada con protocolo.
> **ADR:** [ADR-0002](adr/0002-monolito-flask-con-blueprints.md) · [ADR-0003](adr/0003-sqlite-como-unica-verdad.md) · [ADR-0008](adr/0008-sin-build-step-en-el-frontend.md)
> **Índice de vistas:** [docs/architecture/README.md](README.md)

**Nota de la vista.** Caja blanca de `System(gnosis)` del L1. Las aristas que cruzan la frontera coinciden con las del L1 (ley de caja blanca, §4 de la doctrina).

Las piezas ejecutables/desplegables y cómo se comunican. GNOSIS corre como
un proceso Flask monolítico con módulos internos bien separados.

```mermaid
C4Container
    title GNOSIS · Diagrama de Contenedores

    Person(operador, "Operador", "Navegador")

    System_Boundary(gnosis, "GNOSIS") {
        Container(spa, "Frontend (Jinja + JS vanilla)", "HTML/Jinja2 + Canvas 2D + SVG", "34 superficies: tableros deep-tech, studio QUALIA, flujo de descuadre, chat. Nocturne/Daylight.")
        Container(flask, "Aplicación Flask", "Python 3.11 / Flask", "Factory + blueprints. 121 rutas, orquestación del pipeline, contrato de errores, candado de operador.")
        Container(motores, "Motores del sustrato", "Python puro", "31 módulos AUTOGENES (grafo de evidencia + flujo de investigación) + 6 tableros de negocio. Deterministas, testeados, sin IO.")
        Container(jarvis, "Gnosis·IA", "Python", "Chat sobre el grafo: selección de proveedor LLM, 26 tools, ofuscación de identificadores, quorum.")
        Container(pipeline, "Pipeline legado (INTOCABLE)", "Python + pandas/tabula/PyPDF2", "Extracción de PDFs → concentrados → estadístico de cupos. Import perezoso; excluido de ruff a propósito.")
        ContainerDb(db, "SQLite", "Base local (WAL)", "Única fuente de verdad: 14 tablas aduanales + 12 tablas ag_* del sustrato.")
    }

    System_Ext(llm, "Proveedores LLM", "DeepSeek / Anthropic / Ollama")
    System_Ext(osm, "OpenStreetMap", "Teselas (solo TBV-03)")

    Rel(operador, spa, "Usa", "HTTPS")
    Rel(spa, flask, "Llama API JSON / carga páginas", "HTTPS")
    Rel(spa, osm, "Teselas del mapa", "HTTPS")
    Rel(flask, motores, "Invoca (read-time)", "in-process")
    Rel(flask, jarvis, "Delega el chat", "in-process")
    Rel(flask, pipeline, "Orquesta fases 1-4", "in-process")
    Rel(motores, db, "Lee; escribe SOLO vía Sustrato", "sqlite3")
    Rel(pipeline, db, "Persiste extracción/concentrados", "sqlite3")
    Rel(flask, db, "Sesiones, stats", "sqlite3")
    Rel(jarvis, motores, "Consulta el grafo vía tools", "in-process")
    Rel(jarvis, llm, "Chat (identificadores ofuscados)", "HTTPS")
```

### Mapa de código → contenedor

| Contenedor | Código |
|------------|--------|
| Frontend | `templates/*.html` (Jinja), `static/*.js` (renderers canvas/SVG), `static/*.css` (tokens GESTELL) |
| Aplicación Flask | `app.py` (factory, pipeline legado, sessions/admin/chat/errores), `rutas/` (blueprints `tableros`, `autogenes`, helpers `comun`) |
| Motores | `autogenes/` (sustrato + 30 capacidades), `tableros/` (dominio, maduración, rechazos, cupo, rutas, fechas) |
| Gnosis·IA | `jarvis/` (llm_interface, tool_executor, tools ×18, tools_grafo ×8, ofuscation, prompts, quorum, chat_handler) |
| Pipeline legado | `PDFs_Final_v3.py`, `PDFs_v2.py`, `concentrado1.py`, `concentrado2.py`, `Estadistico.py` — **no se tocan**; todo ajuste va en el borde |
| SQLite | `database/` (models, models_autogenes, persistence, migrations, backup) |
