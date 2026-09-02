# Arquitectura de GNOSIS — índice de vistas

Documentación C4 + arc42 según `docs/estandares/architecture-standards.md`.
Una vista por archivo (§2 de la doctrina); cada vista declara en su cabecera
**nivel, notación, pregunta que responde, leyenda y los ADR que la sostienen**.
Los diagramas son Mermaid: se renderizan en GitHub y los valida CI.

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

---

## Vistas

| Vista | Nivel | Pregunta que responde |
|---|---|---|
| [Contexto](context.md) | C4 L1 | ¿Qué es GNOSIS en su entorno: quién lo usa y con qué habla? |
| [Contenedores](containers.md) | C4 L2 | ¿Cuáles son las piezas ejecutables y cómo se comunican? |
| [Componentes · Flask](components/flask-app.md) | C4 L3 | ¿Qué hay dentro del contenedor Flask? |
| [Componentes · AUTOGENES](components/autogenes.md) | C4 L3 | ¿Qué hay dentro del sustrato y cómo se encadena? |
| [Superficies frontend](frontend-surfaces.md) | Suplementaria | ¿Qué superficies visuales hay y con qué ley se dibujan? |
| [Proceso · ingesta](process/ingesta-pedimento.md) | BPMN-style | ¿Cómo viaja un pedimento del PDF a las tablas? |
| [Proceso · investigación](process/investigacion.md) | BPMN-style | ¿Cómo pasa un descuadre de detectado a defendido? |
| [Proceso · consulta IA](process/consulta-ia.md) | Secuencia | ¿Cómo cruza una pregunta el LLM sin filtrar identificadores? |
| [Modelo de datos](data-model.md) | ER | ¿Qué tablas hay y cómo se relacionan? |
| [Despliegue](deployment.md) | Despliegue | ¿Dónde corre cada pieza y qué cruza la frontera? |
| [Calidad](quality.md) | arc42 §10 | ¿Qué impide que un cambio malo llegue a `main`? |
| [Auditoría backend](auditoria-backend.md) | arc42 §10 | ¿Dónde está el repo respecto a los benchmarks §13, medido? |

Cada nivel es la **caja blanca** del anterior: L1 es la única caja negra;
L2 abre `System(gnosis)`; los L3 abren un contenedor cada uno. Las aristas que
cruzan una frontera coinciden con las de la vista padre (§4).

## Decisiones

- **[ADR](adr/)** — corpus de decisiones (19 y subiendo). Toda decisión estructural nueva nace
  aquí, en el MISMO commit que el código ([ADR-0001](adr/0001-registrar-decisiones-de-arquitectura.md)).
- **[Decisiones históricas](decisiones-historicas.md)** — la tabla-resumen
  previa al corpus, conservada verbatim.

## Compuertas

```
node scripts/validate-mermaid.mjs docs/architecture     # HARD: cabeceras + parseo
node scripts/check-diagram-staleness.mjs --base HEAD~1  # HARD: staleness; SOFT: ADR
```

Ambas corren en `.github/workflows/ci.yml`. El parseo real de Mermaid necesita
`mermaid` + `jsdom`; sin ellos el validador degrada a pre-vuelo estructural y
**lo dice en su salida** — una compuerta que degrada en silencio es teatro.

## Desviaciones declaradas de la doctrina

La doctrina pide ~6 elementos por vista. Dos vistas la exceden a propósito, y
cada una lo declara en su cabecera:

- **[Componentes · AUTOGENES](components/autogenes.md)** — el sustrato es el
  diferenciador del sistema; partirlo escondería el encadenamiento que es
  justamente lo que la vista existe para mostrar.
- **[Modelo de datos](data-model.md)** — un ER no es una vista C4; su valor
  está en la completitud.

La doctrina también pide color semántico vía `classDef` y GNOSIS prohíbe hex
crudo en componentes. Un `classDef` de Mermaid no puede leer tokens CSS, así
que los diagramas llevan el hex literal: cian de acento, **magenta solo para
compuerta de decisión**, gris para lo externo. Un diagrama no es un componente
de la UI; la excepción es acotada y consciente.
