# ADR-0004 — `Sustrato` es el único escritor de las tablas de evidencia

- **Estado:** aceptada (retro-documentada)
- **Vistas afectadas:** [componentes AUTOGENES](../components/autogenes.md), [modelo de datos](../data-model.md), [proceso de investigación](../process/investigacion.md)

## Contexto

Un expediente de defensa vale lo que vale su procedencia. Si cualquier módulo
pudiera insertar una entidad, nada garantizaría que esa entidad cita un
fragmento real, y la bitácora WORM tendría huecos.

## Decisión

Toda mutación de la **evidencia** pasa por `autogenes/sustrato.py`: artefactos,
fragmentos, entidades, relaciones, eventos, productos y la bitácora. El
sustrato exige procedencia al escribir y sella cada fila de bitácora con un
sha256 encadenado al sello anterior (`_sello_bitacora`, columna `prev_hash`),
de modo que reescribir una fila antigua rompe la cadena y se nota.

## Frontera declarada

La ley cubre las tablas de **evidencia**. `autogenes/qualia.py` escribe
directo en `ag_qualia_snapshots` y `ag_qualia_base`, y eso NO la viola: son
telemetría derivada — mediciones del grafo, sin pretensión de procedencia y
sin entrada en bitácora. `database/migrations.py` escribe esquema, no
evidencia. Cualquier otra escritura directa a `ag_*` es un defecto.

## Consecuencias

- La procedencia es estructuralmente cierta, no una convención.
- Los motores solo **proponen**; el operador dispone.
- Coste: todo camino de escritura es más largo. Es el precio del expediente.
