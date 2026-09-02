# ADR-0017 — Predicados cerrados, citas al trozo y confianza derivada

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [modelo de datos](../data-model.md), [componentes AUTOGENES](../components/autogenes.md)
- **Refina:** [ADR-0004](0004-sustrato-unico-escritor-de-ag.md) · [ADR-0006](0006-proyeccion-en-tiempo-de-lectura.md) · [ADR-0010](0010-metricas-citadas-evaluables-por-fecha.md)

## Contexto

Tres defectos del grafo que el diagnóstico v02 (§G2, §G4, §G5) encontró
juntos, y que se arreglan juntos porque los tres viven en el mismo contrato:

**G2 · Las relaciones no tenían vocabulario.** `Relacion.tipo` era `str`
libre y el prompt pedía «relaciones tipadas» sin lista. «importa por»,
«importa vía» e «importa a través de» eran tres predicados distintos: no se
podía preguntar «todos los proveedores de X», ni escribir una regla sobre el
grafo. Las entidades sí tenían su `CHECK (tipo IN (…))` desde el principio.

**G4 · La procedencia era de página, no de trozo.** `evidencia` es una lista
de ids de fragmento, y un fragmento llega a 12 000 caracteres. La cita era
cierta y a la vez inútil: señalaba dónde buscar, no qué se dijo.

**G5 · La confianza la afirmaba el modelo.** `peso` era 0,5 por defecto o lo
que dijera el LLM, y se leía como confianza. No lo es: es una afirmación
sobre una afirmación, y ZERO SNAKE OIL pide de un número que sea citable a
algo.

## Decisión

### 1 · El vocabulario es cerrado, y la puerta lo aplica

`autogenes/predicados.py` tiene los predicados canónicos y una tabla de
sinónimos que mapea SENTIDO, no ortografía («Importa Vía», «importa_via» e
«importa a través de» son la misma clave). `Sustrato.agregar_relacion`
normaliza: se hace en el único escritor porque una regla aplicada en tres
sitios no está aplicada en ninguno.

**Normalizar no puede significar perder.** Lo que no casa con ningún
predicado cae a `otro` conservando su redacción en `tipo_crudo`, así que una
forma nueva se puede leer luego y decidir si merece entrar al vocabulario.

Y `otro` es un CAJÓN, no un predicado: la clave que impide duplicar una
arista al reintegrar incluye el `tipo_crudo` cuando el tipo es `otro`.
Colapsar en una sola arista dos verbos distintos que todavía no tienen
nombre inventaría una relación que nadie afirmó — el error opuesto, y peor.

**La lista es del operador.** Lo que hay hoy es la semilla que propone el
diagnóstico v02 §G2, literal. Quien conoce el dominio aduanal la corrige
editando dos tuplas; nada más se entera. Por eso el `CHECK` **no** está en
la tabla: obligaría a reconstruirla en cada cambio de vocabulario, y la
puerta única de escritura (ADR-0004) ya es el sitio donde la ley se aplica.

### 2 · La cita señala el trozo, y se comprueba

`ag_citas(sujeto_kind, sujeto_id, fragmento_id, inicio, fin)`. `evidencia`
**no se toca** —media docena de módulos la leen como lista de ids, y el id
suelto sigue siendo evidencia válida—: el span vive aparte y es aditivo.

Lo importante no es el resaltado, es la verificación. `sanear_propuesta`
comprueba que la frase citada EXISTA en el fragmento, y `integrar_propuesta`
la vuelve a comprobar en la puerta. Un modelo puede citar el id correcto y
atribuirle una frase que no está: con la cita por id eso era indetectable.

El criterio es deliberadamente asimétrico: si las coordenadas están mal pero
la frase sí aparece, se **reubican** las coordenadas (un modelo cuenta
caracteres fatal y eso no lo vuelve un mentiroso); si la frase no aparece, la
cita se **descarta**. La comparación tolera el espacio —el extractor parte
las líneas donde quiere— y es estricta con todo lo demás.

### 3 · La confianza se deriva al leer, y viaja con su derivación

`autogenes/confianza.py` cuenta **artefactos distintos** que citan la
relación: dos documentos independientes que dicen lo mismo valen más que un
documento citado dos veces. A eso se suman el `origen` (lo que afirmó el
operador no es lo mismo que lo que propuso un modelo — no es «más verdad»,
es otra clase de afirmación) y los spans verificados.

Cada número sale con la frase que permite rehacerlo a mano. Un número sin
derivación es exactamente lo que este módulo existe para no producir. La
escala (`corroborada`/`contrastada`/`citada`) es declarada, no una
probabilidad, y el operador la puede mover.

Lo que el modelo afirmaba se conserva, y se llama por su nombre: la columna
`peso` pasó a `peso_declarado`. El `peso` que sigue existiendo en el grafo
proyectado es el peso ESTRUCTURAL del lienzo (muelle, grosor, centralidad) y
se alimenta de `peso_declarado` igual que antes: esta ADR no cambia ninguna
cifra de panel, solo deja de llamar confianza a lo que no lo era.

## La migración 2, de paso

Al renombrar la columna salió a la luz que la migración 2 no era idempotente:
recreaba `ag_relaciones` nombrando `peso` explícitamente, y se **reproduce**
sobre bases nuevas cuyo esquema ya trae `peso_declarado`. Ahora mira las
columnas que hay y no hace nada si `origen` ya está — que es lo que una
migración debió ser desde el principio. Es la lección general: una migración
que nombra columnas envejece con el esquema que hay debajo.

## Consecuencias

- Se puede preguntar «todos los proveedores de X» y escribir reglas sobre el
  grafo (G8, ola 8): eran imposibles con tipo libre.
- La ley de procedencia gana un diente: antes verificaba QUE se citara un
  fragmento real, ahora también QUE lo citado esté ahí.
- El expediente enseña la confianza con su derivación; el `peso_declarado`
  sigue visible, declarado como lo que es.
- Coste: una tabla más, dos columnas más y un vocabulario que hay que
  mantener. El vocabulario es trabajo del dominio, no del código — y esa es
  la parte que no se puede automatizar sin inventar.
- **Pendiente del operador:** la lista de predicados. La semilla cubre lo que
  el diagnóstico vio en los documentos; el dominio aduanal sabrá si falta
  `clasifica_en`, `paga` o `consolida`.
