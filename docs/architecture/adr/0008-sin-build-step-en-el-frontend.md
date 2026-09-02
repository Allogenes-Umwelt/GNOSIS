# ADR-0008 — Frontend sin build step: JS vanilla + Jinja

- **Estado:** aceptada (retro-documentada)
- **Vistas afectadas:** [contenedores](../containers.md), [superficies frontend](../frontend-surfaces.md)
- **Evaluación completa:** `docs/EVALUACION_ESTANDAR_A.md`

## Contexto

El resto del ecosistema (UMWELT/KARELEN) corre React + TypeScript + Vite. La
pregunta de si GNOSIS debía migrar se evaluó formalmente contra el árbol real.

## Decisión

GNOSIS se queda en JS vanilla + canvas 2D + Jinja, sin bundler. La doctrina
frontend de React (`~/frontend-standards.md`) **no aplica** a este repo; sí
aplican sus principios universales (compuertas, seguridad, accesibilidad).

## Consecuencias

- Cero cadena de suministro de build: nada que auditar, actualizar ni romper.
- El canvas 2D da control total del render determinista, que es requisito
  ([ADR-0005](0005-networkx-confinado-a-lentes.md)).
- Sin tipos en el frontend: lo compensan ESLint y las pruebas del backend.
- Los triggers que reabrirían la decisión están en §6 de
  `docs/EVALUACION_ESTANDAR_A.md`.
