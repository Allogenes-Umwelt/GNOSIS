# ADR-0016 — La búsqueda de texto vive en FTS5, acotada y con procedencia

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [modelo de datos](../data-model.md), [componentes AUTOGENES](../components/autogenes.md), [consulta IA](../process/consulta-ia.md)
- **Refina:** [ADR-0003](0003-sqlite-como-unica-verdad.md) · [ADR-0011](0011-ofuscacion-por-conjunto-y-sandbox.md)

## Contexto

El sustrato guardaba el texto de cada fragmento y **no había forma de
buscarlo**: `grep 'MATCH\|fts'` sobre `autogenes/` no devolvía nada (hallazgo
G6 de `docs/DIAGNOSTICO_FABLE_v02.md`). El operador que había dockeado mil
documentos no podía preguntar «cuáles mencionan Emden», y el modelo tampoco:
sus tools llegaban al grafo por entidades, nunca al texto que las sostiene.

Lo más cercano era el `LIKE '%…%'` de `expediente_entidad`
(`consultas.py:148`, hallazgo D2): comodín inicial, así que el índice
`(session_id, nombre)` no servía y era un escaneo — y solo sobre nombres de
entidad, no sobre el texto.

## Decisión

**FTS5 sobre `ag_fragmentos.texto`, como índice de contenido externo.**

FTS5 viene DENTRO de SQLite: cero dependencias nuevas, local, sin red — las
tres cosas que la ley de este repo exige. `content='ag_fragmentos'` significa
que el índice **no duplica el texto**: lo lee de la tabla real. A cambio, el
índice no se entera solo de un `INSERT`/`DELETE`, así que tres triggers lo
mantienen (`_ai`, `_ad`, `_au`), y el `DELETE` manda primero la fila vieja.

Cuatro decisiones que acompañan a la tabla:

**1. La relevancia no rompe el determinismo.** `bm25()` con parámetros fijos
ordena igual en dos corridas; el desempate es por `f.id`. La ley de doble
corrida se cumple y hay prueba.

**2. Un acierto SIN procedencia no se devuelve.** Cada resultado cita su
fragmento, su página y su documento — la misma cadena que sostiene un
expediente. Un buscador que devuelve texto suelto no serviría aquí.

**3. El total se acota, y la cota se declara.** Contar TODOS los aciertos
resultó costar **más que la búsqueda que anotaba**: medido a 24 000
fragmentos en una sesión, 400-1 050 ms de conteo contra 17-24 ms de
búsqueda, porque el conteo exacto obliga a recorrer la lista entera mientras
que el top-25 se corta al llegar. Se cuenta hasta 500; por encima se devuelve
`total_minimo` («más de 500»), nunca un `total` que no se contó. Una cota
declarada es honesta; un número redondeado sería exactamente lo que ZERO
SNAKE OIL prohíbe.

**4. El índice NO se expone al sandbox SQL.** `buscar_fragmentos` es una tool
propia que va por `autogenes/busqueda.py`, no una tabla más en
`TABLAS_VISIBLES` (ADR-0011). El allowlist del sandbox sigue siendo el
allowlist aduanal, y las tablas sombra de FTS5 (`_data`, `_idx`, `_docsize`)
no son alcanzables: la salida de la tool ya llega acotada a la sesión, con su
procedencia, y enmascarada como cualquier otra (está en `DETAIL_TOOLS`).

**D2, de paso.** `expediente_entidad` resuelve ahora por `ag_entidad_alias`
(ADR-0014) en vez de cargar todas las entidades para abrir su JSON de alias;
el `LIKE` queda como último recurso, acotado a 50.

## El orden de anidamiento es parte de la decisión

Las dos consultas usan `CROSS JOIN`, no `JOIN`. No es adorno: con un `JOIN`
normal el planificador elegía `ag_fragmentos` como bucle externo —barrer
`idx_ag_fragmentos_session` y sondear el índice FTS fila a fila— y **una
palabra poco frecuente pasaba de 0,2 ms a 324 ms**, el peor plan justo en el
caso que un índice debería resolver mejor. `CROSS JOIN` obliga a partir del
índice. La prueba se afirma sobre el **plan** (`EXPLAIN QUERY PLAN`), no
sobre el reloj.

## Resultado medido

Corpus sintético de 8 000 documentos / 24 000 fragmentos en **una** sesión
(el peor caso: doce sesiones reparten la lista de aciertos):

| | Antes | Después |
|---|---|---|
| Buscar texto en los documentos | no existía | 0,4-24 ms |
| Anotar cuántos aciertos hay | — | 0,1-10 ms (acotado) contra 400-1 050 ms (exacto) |
| Conteo con un `JOIN` llano, término raro | — | 324 ms → **0,2 ms** con `CROSS JOIN` |
| Coste del índice en la ingesta | — | +0,22 s por cada 4 000 documentos |
| Tamaño del índice | — | +1,1 MB sobre 5,9 MB (≈ +19 %) |

## Consecuencias

- El operador y el modelo ganan «qué documentos dicen X» con procedencia.
  Es el uplift de mejor relación valor/coste del diagnóstico v02.
- Una base anterior recibe el índice por la migración 5, que lo **puebla**
  desde los fragmentos ya dockeados (`'rebuild'`, idempotente) y tolera un
  esquema parcial sin tumbar el arranque: una base legada puede no tener
  siquiera `ag_fragmentos`.
- El índice **no es evidencia**: se deriva de `ag_fragmentos` y se reconstruye
  desde ella, igual que `ag_entidad_alias`. Vive fuera de la ley de
  procedencia de ADR-0004 y su relleno corre sin bitácora.
- Coste: tres triggers y un índice más que mantener, y +19 % de base. A
  cambio, el texto que el sustrato ya guardaba deja de ser inalcanzable.
- **Límite conocido:** la lista de aciertos de FTS5 no está partida por
  sesión, así que una búsqueda recorre los aciertos de las doce sesiones
  antes de filtrar. Medido: irrelevante a esta escala (3,3 ms con 12 000
  aciertos repartidos). Si la identidad entre sesiones (G1) llega a fundir
  el corpus, hay que volver a medirlo.
