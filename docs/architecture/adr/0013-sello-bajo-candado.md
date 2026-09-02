# ADR-0013 — El sello de la bitácora se lee bajo el candado, y un hueco se declara hueco

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [componentes AUTOGENES](../components/autogenes.md), [calidad](../quality.md)
- **Refina:** [ADR-0004](0004-sustrato-unico-escritor-de-ag.md)

## Contexto

`_registrar` sellaba cada fila leyendo el sello anterior, insertando, y
actualizando el hash. Si dos escritores leen el **mismo** `prev_hash` antes de
que ninguno inserte, la cadena se **bifurca** y `verificar_bitacora` responde
`{valido: False, motivo: "cadena"}` — una acusación de manipulación provocada
por uso normal. Una alarma forense que miente una vez deja de creerse, y
entonces no defiende nada.

**Medición, porque la sospecha no basta.** El mecanismo se reprodujo a mano y
bifurca. Pero **no era alcanzable con este código**: todos los métodos que
registran escriben antes, así que la transacción implícita de `sqlite3` ya
sostenía el candado de escritura cuando se leía el sello, y el segundo
escritor se bloqueaba (`database is locked`) en lugar de bifurcar. Cero
métodos de `Sustrato` registran sin escribir primero.

La garantía era real, pero **prestada**: dependía de un detalle del driver
(`isolation_level` legado) y de que todo método futuro recordara escribir
antes de registrar. `autocommit=True` —el default que Python 3.12 empuja— o
un método que solo registrase la retiraban en silencio, sin que ninguna prueba
se pusiera roja.

## Decisión

1. **El candado se toma explícitamente.** `_registrar` abre `BEGIN IMMEDIATE`
   si no hay transacción en vuelo. La invariante deja de depender de quién
   llame, de en qué orden, o de la versión de Python. Hay una prueba que fija
   la invariante en sí (`_registrar` sin escritura previa deja la conexión en
   transacción, y un segundo escritor queda fuera).
2. **Un hueco se declara hueco.** Morir entre el `INSERT` y el `UPDATE` deja
   una fila con `prev_hash` y sin `hash`. El verificador la saltaba y
   declaraba la cadena rota **desde ahí para siempre**, con el mismo veredicto
   que una manipulación. Ahora distingue: `hueco` (defecto de escritura,
   declarable), `hash` (contenido reescrito), `cadena` (filas reordenadas o
   insertadas), y `sin_sellar` cuenta la historia anterior al sello sin
   acusarla de nada. Decir "cadena rota" ante un corte de luz es acusar de
   fraude a la electricidad.
3. **La verificación tiene superficie.** `GET /api/v1/autogenes/bitacora/verificar`.
   Antes `verificar_bitacora` existía y nadie podía pedirlo: un sello que nadie
   puede comprobar no es evidencia, es decoración.

## Consecuencias

- La propiedad write-once pasa de disciplina a invariante comprobable.
- Un veredicto negativo ahora dice **qué clase** de daño hay, que es lo que
  decide si el expediente se puede seguir defendiendo o no.
- `BEGIN IMMEDIATE` serializa antes: dos escritores concurrentes esperan (hay
  `busy_timeout` de 30 s) en vez de competir. Con un operador, no se nota.
