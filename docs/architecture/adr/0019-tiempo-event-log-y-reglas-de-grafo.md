# ADR-0019 — El tiempo se consulta, la bitácora se audita y las reglas ven el grafo

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [modelo de datos](../data-model.md), [componentes AUTOGENES](../components/autogenes.md), [investigación](../process/investigacion.md)
- **Refina:** [ADR-0004](0004-sustrato-unico-escritor-de-ag.md) · [ADR-0013](0013-sello-bajo-candado.md) · [ADR-0017](0017-vocabulario-span-y-confianza-derivada.md)

## Contexto

Cuatro hallazgos del diagnóstico v02 que comparten una misma forma: el
sustrato **tenía** el dato y no se podía **preguntar** por él.

- **G3.** `ag_relaciones` no tenía validez temporal. «¿Quién era el agente
  aduanal en julio?» era una lectura de la bitácora, no una consulta.
- **D1.** `ag_eventos.entidades` guardaba NOMBRES en JSON y `consultas` los
  buscaba con `entidades LIKE '%"nombre"%'`. Renombrar una entidad
  desligaba sus eventos; «VW» casaba dentro de «VW Servicios»; y el comodín
  inicial impedía usar índice alguno.
- **G7.** `_registrar(accion, detalle)` guardaba prosa libre («Entidad X
  (synesis)»). La bitácora WORM respondía «cuántas cosas pasaron», no «qué
  cambió».
- **G8.** NOMOS evalúa condiciones `campo=valor` sobre `{pais_code, j_y_n,
  auto_code, factura, chasis}`, fila a fila. Es un motor aduanal excelente y
  **no ve el grafo**: no se podía escribir «un proveedor con más de N
  facturas que ningún pedimento ampara».

## Decisión

### 1 · La vigencia es un dato, y su ausencia también

`valido_desde` / `valido_hasta`, opcionales, en `ag_relaciones`. Una fecha
mal formada **no se guarda**: envenenaría toda lectura temporal de la sesión,
y «no consta» es una respuesta honesta mientras que `2026-13-45` no es
ninguna respuesta.

Al leer, `NULL` se declara como **no consta**, que no es lo mismo que
«siempre». El expediente devuelve `vigencia: null` en vez de un rango
inventado: la diferencia entre no saber y afirmar.

### 2 · El evento liga por id

`ag_evento_entidad(evento_id, entidad_id)`. El nombre se resuelve **una vez**,
al crear el evento, con el mismo índice de resolución que usa la puerta
(ADR-0014) — así la migración no inventa emparejamientos que la ingesta no
habría hecho. La columna JSON de nombres se queda donde estaba (la escribe la
extracción y la poda `quitar_entidad`), pero quien pregunta usa la tabla, y
el `LIKE` desaparece de `consultas`.

### 3 · La bitácora es un event log, y el evento entra en el sello

`_registrar` acepta un `datos` estructurado —`{op, tabla, id, antes,
después}`— que viaja **junto a** la prosa, no en su lugar: `detalle` es la
frase que el operador lee en pantalla, `datos` es lo que una auditoría
consulta. Convertir `detalle` en JSON habría puesto JSON crudo en la UI.

**`datos` entra en el sello**, porque dato fuera del sello es dato editable.
Y entra **solo cuando existe**: las filas anteriores se siguen sellando con
la fórmula que las selló, así que no hay que re-sellar la historia — cosa
que, además, una bitácora WORM no debería permitir.

La regla es total y por eso no necesita un número de versión: una fila con
`datos` se sella con `datos`; una sin él, sin él. Quitarle el `datos` a una
fila la haría verificar con la fórmula corta contra un sello calculado con la
larga, y añadírselo a una fila vieja, al revés. **Los dos fraudes se ven**, y
hay prueba de cada uno.

### 4 · Las reglas de grafo son el gemelo de NOMOS, no su sustituto

`autogenes/patrones.py`: «un `sujeto` con `umbral` o más relaciones
`predicado` hacia un `objeto`, salvo las que ya tienen `salvo_predicado`».
Lo que lo hace escribible es el vocabulario cerrado (ADR-0017): sin él,
«ampara» y «cubre» eran dos condiciones distintas y una regla no podía
referirse a la relación, solo a una redacción de ella.

`ag_reglas.clase` separa las dos superficies (`fila` | `patron`) y **NOMOS
filtra por ella**: una regla de patrón tiene `condiciones` como objeto, y sin
el filtro el motor de filas la habría recorrido como si fuera su lista de
condiciones.

Un patrón se valida **al crearlo** contra el vocabulario y los tipos reales.
Una regla sobre un predicado que nadie escribe jamás dispararía, y nadie
sabría por qué: mejor decirlo en el momento de escribirla.

Y el disparo cumple ZERO SNAKE OIL: ni monto ni confianza — el conteo, el
umbral y las **citas**, los fragmentos que sostienen cada relación contada.

**La exención mira al objeto, no al par.** «Facturas sin pedimento que las
ampare» quiere decir que la factura no tiene amparo **de nadie**, no que no
lo tenga de su proveedor: el amparo lo emite un tercero, que es precisamente
el sentido de la palabra. Con la exención por par, la regla no encontraba
nada y parecía correcta.

## Consecuencias

- El expediente responde por vigencia, y los eventos de una entidad
  sobreviven a su renombrado.
- La bitácora pasa de contar sucesos a permitir reconstruir el estado en T y
  diferenciar dos momentos, sin perder su condición de WORM sellado.
- El grafo gana un motor de reglas propio sin tocar el aduanal.
- Verificado de punta a punta sobre una base legada: los eventos se ligan
  resolviendo por alias, las columnas nuevas entran, y una segunda corrida no
  cambia nada.
- Coste: tres columnas, una tabla y una segunda clase de regla que mantener.
  El `detalle` en prosa se conserva por duplicado con `datos` — redundancia
  deliberada: la pantalla y la auditoría no quieren lo mismo.
- **Pendiente:** las mutaciones que aún registran solo prosa (geo, productos,
  eventos, reglas de fila) siguen siendo válidas y verificables; añadirles su
  evento estructurado es aditivo y no requiere re-sellar nada.
