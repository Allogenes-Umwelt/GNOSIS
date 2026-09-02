# Decisiones históricas — registro previo al corpus de ADR

Tabla-resumen que vivía al final de `docs/ARQUITECTURA.md` antes de que
existiera `docs/architecture/adr/`. Se conserva **verbatim**: cada fila es
cierta y útil, y retro-inventarle un contexto que nadie escribió sería
fabricar historia ([ADR-0001](adr/0001-registrar-decisiones-de-arquitectura.md)).

Las decisiones **portantes** — aquellas cuya reversión cambia la forma del
sistema — sí se elevaron a ADR completo:
[0002](adr/0002-monolito-flask-con-blueprints.md),
[0003](adr/0003-sqlite-como-unica-verdad.md),
[0004](adr/0004-sustrato-unico-escritor-de-ag.md),
[0005](adr/0005-networkx-confinado-a-lentes.md),
[0006](adr/0006-proyeccion-en-tiempo-de-lectura.md),
[0007](adr/0007-ofuscacion-antes-del-llm.md),
[0008](adr/0008-sin-build-step-en-el-frontend.md).

Toda decisión estructural **nueva** nace como ADR, no como fila aquí.

|----------|----------|
| Monolito Flask con blueprints | Un solo operador, local-first; la separación se logra por módulos y blueprints (`rutas/`), no por servicios. |
| SQLite como única fuente de verdad (WAL) | Local-first, exportable, transaccional; el backup hace checkpoint del WAL antes de copiar. |
| Sustrato como único escritor de `ag_*` | Integridad de la procedencia y la bitácora WORM; los motores solo *proponen* o leen. |
| Proyección en tiempo de lectura | El dato aduanal no se duplica en el grafo; se proyecta al leer (una sola fuente). |
| Motores puros y deterministas | Testeables sin IO; ordenamientos estables (sin dependencia de PYTHONHASHSEED). |
| NetworkX confinado a lentes | Cifras de panel y layout del render salen de código propio determinista; NetworkX solo responde camino/vecindario/hubs. |
| Ciclo de vida como CONTRASTE (O1) | No se registra solo lo que el operador dice: cada corrida contrasta lo declarado contra lo medido (≠ contradicho / verificado). Palantir registra; GNOSIS responde. |
| Sello sha256 re-derivable en productos | Un expediente de defensa es a prueba de manipulación: `verificar()` re-deriva y compara. |
| SPC con mediana ± 3·MAD | Banda robusta a outliers sobre historia real; jamás una confianza inventada. |
| Monetización honesta | `0` y `'0,00'` son campos vacíos/fabricados, no dinero; se declaran como «sin precio», nunca se estiman. |
| SVG para diagramas, canvas para campos | En SVG el texto truncado es estructuralmente imposible (escalera P&ID, lattice); canvas para campos densos (grafo, terreno, orbe). |
| Volante insight→regla con HITL | La regla llega derivada de filas reales y PRE-llenada, pero el operador la crea; solo se ofrece donde el insight es campo=valor. |
| Ofuscación antes del LLM | Los identificadores (VIN/factura) nunca salen en claro; tokens reversibles solo en dispositivo. |
| Import perezoso del pipeline legado | La app y sus rutas importan sin el stack de data-science; CI corre la red HTTP con deps mínimas. |
| Contrato de errores honesto | HTTPException conserva su código; `/api` responde JSON; estado vacío = 404 declarado, no 500. |
| Sin build step en el frontend | JS vanilla + Jinja (decisión registrada en `docs/EVALUACION_ESTANDAR_A.md`); cero dependencia de bundlers. |

Referencias: modelo C4 (c4model.com), BPMN 2.0 (OMG), arc42 para la
estructura del documento. Planes rectores: `docs/PROPUESTA_GRAFO.md`,
`docs/BENCHMARK_PALANTIR.md`, `docs/PLAN_CONCILIA_VALIDACION.md` (bitácora
del flujo de investigación), `docs/QUALIA_ARQUITECTURA.md` (detalle del
subsistema QUALIA).
