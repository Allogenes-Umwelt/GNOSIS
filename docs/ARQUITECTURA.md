# Arquitectura de GNOSIS

> **Este documento se dividió.** La arquitectura vive ahora en
> **[`docs/architecture/`](architecture/README.md)** — una vista por archivo,
> como pide `docs/estandares/architecture-standards.md` §2. Este archivo se
> conserva como puerta de entrada porque otros documentos lo enlazan.

Documentación de arquitectura del software siguiendo el **modelo C4**
(Context → Container → Component → Code) de Simon Brown, con vistas de
**proceso (BPMN-style)**, **modelo de datos (ER)**, **secuencia**,
**despliegue** y — porque el frontend es la mitad del sistema — un **mapa
completo de superficies visuales**. Los diagramas están en Mermaid (se
renderizan en GitHub y en cualquier visor Mermaid). Estructura del documento
según arc42.

GNOSIS es un sistema de analítica de importaciones aduanales para el Grupo
Volkswagen México: extrae facturas y pedimentos (PDF), reconcilia contra el
DWH, y construye sobre ese dato un **sustrato de ontología unificada
(AUTOGENES)** — un grafo de evidencia con procedencia — más un **flujo de
investigación** completo (detectar → disponer → documentar → defender →
vigilar), una capa de inteligencia (LLM con ofuscación de identificadores) y
tableros de negocio.

Principios rectores (ver también `CLAUDE.md`): **ZERO SNAKE OIL** (todo
número es salida de motor; nada se estima ni se inventa), **ley de
procedencia** (toda entidad extraída cita su fragmento fuente), **sustrato
como único escritor** de las tablas `ag_*`, **bitácora WORM**,
**determinismo del render** (el mismo grafo abre idéntico), y **ofuscación
de identificadores** (chasis/factura) antes de exponerlos a un LLM.

## Por dónde entrar

| Si buscas | Ve a |
|---|---|
| El sistema en su entorno | [Contexto (C4 L1)](architecture/context.md) |
| Las piezas y cómo hablan | [Contenedores (C4 L2)](architecture/containers.md) |
| El interior de Flask | [Componentes · Flask](architecture/components/flask-app.md) |
| El interior del sustrato | [Componentes · AUTOGENES](architecture/components/autogenes.md) |
| Las superficies visuales | [Superficies frontend](architecture/frontend-surfaces.md) |
| Cómo se procesa un pedimento | [Proceso · ingesta](architecture/process/ingesta-pedimento.md) |
| Cómo se investiga un descuadre | [Proceso · investigación](architecture/process/investigacion.md) |
| Cómo se consulta a la IA sin filtrar | [Proceso · consulta IA](architecture/process/consulta-ia.md) |
| Las tablas | [Modelo de datos (ER)](architecture/data-model.md) |
| Dónde corre todo | [Despliegue](architecture/deployment.md) |
| Qué compuertas hay | [Calidad](architecture/quality.md) |
| Por qué se decidió así | [ADR](architecture/adr/) · [decisiones históricas](architecture/decisiones-historicas.md) |

## Stack tecnológico

Stack deliberadamente corto — cada pieza está ahí por una decisión
registrada (§Decisiones), no por inercia.

| Capa | Tecnología | Papel | Dónde |
|------|-----------|-------|-------|
| Runtime | Python 3.11 | Todo el backend | — |
| Web | Flask (factory + blueprints) | 123 rutas: 82 AUTOGENES + 11 tableros + 30 shell/pipeline | `app.py`, `rutas/` |
| Datos | SQLite (WAL) — **única verdad** | 14 tablas aduanales + 12 tablas `ag_*` del sustrato | `database/` |
| Tipos | pydantic | Contratos del sustrato (Entidad, Producto, …) | `autogenes/tipos.py` |
| Grafo | NetworkX — **confinado** | Solo lentes de sesión (camino/vecindario/hubs); JAMÁS cifras de panel ni layout | `autogenes/red.py`, `caminos.py` |
| Ingesta | pandas / PyPDF2 / tabula | Bordes de ingesta y pipeline legado | `PDFs_*.py`, `concentrado*.py` |
| LLM | DeepSeek (def.) / Anthropic / Ollama | Gnosis·IA — chat con 26 tools sobre el grafo | `jarvis/` |
| Frontend | **JS vanilla** + Jinja2 — sin build step, sin framework, sin bundler | 34 superficies JS; canvas 2D para campos densos, SVG para diagramas | `static/`, `templates/` |
| Design system | GESTELL/PANOPTES — tokens CSS puros | AAA en ambos temas, magenta disciplinado, motion tokenizado | `static/styles.css` |
| Calidad | pytest (539) + ruff + eslint + CI GitHub Actions | Doble corrida para métricas; gate en cada push/PR | `tests/`, `.github/workflows/ci.yml` |

---

Referencias: modelo C4 (c4model.com), BPMN 2.0 (OMG), arc42. Planes rectores:
`docs/PROPUESTA_GRAFO.md`, `docs/BENCHMARK_PALANTIR.md`,
`docs/PLAN_CONCILIA_VALIDACION.md`, `docs/QUALIA_ARQUITECTURA.md`.
