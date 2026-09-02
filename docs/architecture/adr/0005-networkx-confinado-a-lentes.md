# ADR-0005 — NetworkX confinado a lentes de sesión

- **Estado:** aceptada (retro-documentada)
- **Vistas afectadas:** [componentes AUTOGENES](../components/autogenes.md), [contenedores](../containers.md)

## Contexto

NetworkX resuelve caminos, vecindarios y centralidad en una línea. También
itera sobre estructuras cuyo orden no está garantizado entre versiones ni
entre corridas, lo que basta para que una cifra de panel cambie sin que
cambie el dato.

## Decisión

NetworkX vive **solo** en `autogenes/caminos.py` y `autogenes/red.py`, y solo
responde preguntas de lente: camino, vecindario, hubs. Ninguna cifra de panel
citada y ningún layout del render salen de NetworkX. La topología que alimenta
el lienzo se implementa a mano y determinista en `topologia.py`,
`proyeccion.py` y `fuerzas.js`.

Verificable: `grep -rl 'import networkx'` devuelve exactamente esos dos
archivos.

## Consecuencias

- El mismo grafo abre idéntico; toda métrica citada tiene test de doble
  corrida.
- Se reimplementa a mano lo que la librería daría gratis. Aceptado: el
  determinismo es requisito, no preferencia.
