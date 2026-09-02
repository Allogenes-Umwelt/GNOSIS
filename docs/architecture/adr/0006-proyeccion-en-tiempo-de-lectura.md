# ADR-0006 — El dato aduanal se proyecta al leer, no se duplica

- **Estado:** aceptada (retro-documentada)
- **Vistas afectadas:** [componentes AUTOGENES](../components/autogenes.md), [modelo de datos](../data-model.md)

## Contexto

El grafo necesita ver vehículos, facturas y pedimentos. Copiarlos a `ag_*`
crearía dos verdades que divergen en el primer reproceso.

## Decisión

`autogenes/proyeccion.py` proyecta el mundo aduanal al grafo **en tiempo de
lectura**. Nada se dual-escribe.

## Consecuencias

- Imposible que el grafo contradiga a la base: no hay copia que envejezca.
- La proyección se paga en cada lectura; por eso es pura y determinista, con
  desempates ordenados (`sorted()`, no `set`), sin depender de PYTHONHASHSEED.
- Un reproceso parcial se refleja solo; no hay que reconciliar nada.
