# ADR-0007 — Los identificadores se ofuscan antes de cruzar al LLM

- **Estado:** aceptada (retro-documentada)
- **Vistas afectadas:** [contexto](../context.md), [consulta IA](../process/consulta-ia.md)

## Contexto

Gnosis·IA responde sobre el caso real. El caso real contiene VIN/chasis,
número de factura, pedimento y patente: datos del cliente que no deben salir
del dispositivo en claro, ni siquiera hacia un proveedor de confianza.

## Decisión

`jarvis/ofuscation.py` sustituye los identificadores por tokens reversibles
**solo en el dispositivo**, antes de construir el mensaje. La reversión ocurre
al presentar la respuesta al operador. La capa se aplica recursivamente al
resultado de las tools (`GRAFO_DETAIL_TOOLS`), no solo al prompt.

Defensa en profundidad: `mask_row` enmascara además **por forma de valor**
(patrón VIN ISO 3779), no solo por nombre de columna — un `SELECT chasis AS x`
no filtra el VIN.

## Consecuencias

- El proveedor LLM ve estructura y relación, nunca identidad.
- Toda tool nueva que devuelva detalle debe entrar en el set de ofuscación.
  Olvidarlo es una fuga: ya ocurrió una vez (hallazgo B1 de `docs/AUDITORIA.md`)
  y por eso el set se testea.
- El contenido de documentos se declara al modelo como DATO, nunca como
  instrucción (`jarvis/prompts.py`), contra inyección indirecta.
