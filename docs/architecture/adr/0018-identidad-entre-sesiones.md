# ADR-0018 — La identidad vive por encima de la sesión, y el parecido lo decide una persona

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [modelo de datos](../data-model.md), [componentes AUTOGENES](../components/autogenes.md)
- **Refina:** [ADR-0004](0004-sustrato-unico-escritor-de-ag.md) · [ADR-0014](0014-resolucion-de-entidad-por-indice.md)

## Contexto

`ag_entidades` lleva `session_id`, así que **cada mes era un espacio de
nombres propio**, y `upsert_entidad` resolvía por `strip().lower()` más alias
exactos (ADR-0014). De ahí las dos consecuencias del hallazgo G1 del
diagnóstico v02:

- «Volkswagen de México S.A. de C.V.», «VW MEXICO» y «Volkswagen Mexico»
  eran tres nodos.
- El mismo proveedor en doce meses eran doce nodos **sin arista entre
  ellos**. `analisis_vw.py` compara entre sesiones marcas, países y aduanas
  del dato aduanal — nunca entidades extraídas.

Un grafo que no sabe que dos cosas son la misma no es de conocimiento: es un
índice.

Y G9, que resulta ser la misma historia: `/exportar` prometía un bundle
«re-importable y auditable fuera de GNOSIS», y no había con qué
re-importarlo. Sin importación, la identidad entre sesiones no tiene nada
que unir cuando el caso viene de otra máquina.

## Decisión

**La línea que organiza todo esto es la que separa NORMALIZAR de INVENTAR.**

### 1 · La igualdad se resuelve sola, porque no hay nada que decidir

`autogenes/canon.py` produce un `nombre_canon` determinista: plegado Unicode
(NFKD sin marcas), retirada de sufijos legales **por la cola** desde un
catálogo (`S.A. de C.V.`, `GmbH`, `S. de R.L.`…), descarte de conectores y
tokens **ordenados**. Dos escrituras del mismo nombre acaban en la misma
cadena, y eso es una identidad que se puede defender ante un auditor.

`ag_identidades(nombre_canon UNIQUE)` + `ag_entidades.identidad_id`, resuelto
en la puerta al crear la entidad. La fila **sigue siendo de su sesión**:
compartir identidad no es compartir expediente, y la evidencia no cruza
meses. Lo que cruza es saber quién es quién.

Un detalle que costó una corrección: el punto se **borra** al tokenizar en
vez de separar. Separando, «S.A. de C.V.» daba `s a de c v` —cinco tokens
que no son nada— y ningún catálogo razonable podía reconocerlos.

### 2 · El parecido se propone, con su número y su umbral

«VW MEXICO» y «Volkswagen de México» son casi con seguridad la misma
empresa, pero «casi con seguridad» no es una identidad: es una hipótesis.
`autogenes/similitud.py` la formula y la deja sobre la mesa. Tres leyes:

- **Nunca funde.** Devuelve candidatas; la fusión la ejecuta `Sustrato` con
  bitácora y la ordena una persona.
- **Nunca propone tocar lo que afirmó el operador.** Una entidad
  `origen='operador'` es una afirmación humana; proponer fundirla sería que
  la máquina corrija al operador (ley aditiva, ADR-0004).
- **Nada de cuadrático.** Se compara dentro de bloques.

El umbral (0,6 de Jaccard sobre tokens) es **declarado**, sale en cada
propuesta y se puede rehacer con papel. Cuando un nombre contiene al otro
entero —la forma normal de escribir una filial— se propone igual y se dice
que fue por eso: subir el número para que pasara habría sido disfrazar la
razón.

**El bloqueo es por TOKENS, no por una clave única.** Una sola clave (el
token más largo, digamos) parece más barata y es inestable: «Agencia Aduanal
Perez» y «Agencia Aduanal Perez y Asociados» tienen tokens más largos
distintos —`agencia` y `asociados`—, así que el par que el bloqueo existe
para encontrar era justo el que se le escapaba. Se indexa por cada token y se
saltan los bloques de más de 60, que son tokens demasiado comunes para
distinguir a nadie.

### 3 · El bundle vuelve a entrar, y su procedencia se reconstruye

`autogenes/importacion.py` + `POST /api/v1/autogenes/importar`. Dos reglas
que no se negocian porque un importador es una puerta nueva por la que llega
evidencia de fuera:

- **Todo entra por `Sustrato`.** Un importador con sus propios `INSERT`
  sería exactamente el agujero que la puerta única existe para cerrar.
- **Los ids del bundle NO se reutilizan.** Se crean artefactos y fragmentos
  nuevos y se **remapea** cada cita al id nuevo. Reutilizando ids, un bundle
  podría colgar una afirmación de un fragmento de ESTA base que dice otra
  cosa. Se importa el contenido; la procedencia se reconstruye sobre lo que
  de verdad entró, y lo que se queda sin cita real no entra.

Lo que el bundle afirme sobre sí mismo —conteos, `session_id`— es dato del
bundle, no una orden: se informa de lo que entró, contado aquí.

## Consecuencias

- «Todo lo que sabemos de este proveedor» cruza los meses: es la pregunta que
  G1 declaraba imposible. `GET /api/v1/autogenes/identidades` la responde y
  además publica las candidatas pendientes de decisión.
- Un caso se puede restaurar o mover de máquina sin perder la ley de
  procedencia.
- Migración 7 ata las entidades ya existentes a su identidad por el mismo
  canon, sin decidir nada que no sea igualdad. Verificado de punta a punta
  sobre una base legada: tres escrituras en tres meses caen en una identidad,
  y una segunda corrida no cambia nada.
- **Pendiente del operador** (§6 del diagnóstico): el umbral de fusión. 0,6
  es una semilla defendible, no una verdad; quien revisa las propuestas sabrá
  si propone de más o de menos.
- Coste: una tabla, una columna y un catálogo de formas legales que envejece
  con el dominio. El catálogo es trabajo de dominio, como el vocabulario de
  predicados (ADR-0017), y por la misma razón vive en un módulo de una sola
  pieza.
