# ADR-0002 — Monolito Flask con blueprints, no microservicios

- **Estado:** aceptada (retro-documentada)
- **Vistas afectadas:** [contexto](../context.md), [contenedores](../containers.md), [componentes Flask](../components/flask-app.md), [despliegue](../deployment.md)

## Contexto

GNOSIS tiene **un** operador y corre local-first en su máquina. La tentación
de partir en servicios (ingesta, sustrato, IA, tableros) existe porque los
dominios están limpiamente separados.

## Decisión

Un proceso Flask con factory y blueprints (`app.py` + `rutas/`). La separación
se consigue por módulos y blueprints, no por red.

## Consecuencias

- Sin latencia de red, sin serialización, sin orquestación, sin fallos
  parciales entre dominios: los motores se invocan in-process.
- El límite se vuelve social, no físico: nada impide a una ruta llamar a un
  motor que no le toca. Lo sujeta la revisión y la ley de puerta única
  ([ADR-0004](0004-sustrato-unico-escritor-de-ag.md)).
- Escalar horizontalmente exigiría rediseño. No es un requisito: un operador.
- El pipeline legado se importa de forma perezosa para que la app y sus rutas
  arranquen sin el stack de data-science (y CI corra con dependencias mínimas).
