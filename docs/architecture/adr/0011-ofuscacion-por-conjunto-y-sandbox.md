# ADR-0011 — La ofuscación mira el dato, no la sintaxis; y `consulta_sql` corre en un sandbox

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Sustituye en parte a:** [ADR-0007](0007-ofuscacion-antes-del-llm.md) (que sigue vigente en su ley; cambia el mecanismo)
- **Vistas afectadas:** [consulta IA](../process/consulta-ia.md), [contexto](../context.md)

## Contexto

ADR-0007 declara un "nunca": ningún identificador cruza al modelo en claro.
El mecanismo que lo sostenía tenía dos capas y las dos miraban la **sintaxis**:

1. `mask_row` enmascara por **nombre de columna** (`chasis`, `factura`,
   `numero_pedimento`, `patente`).
2. Como refuerzo, una regex de forma VIN — `^[A-HJ-NPR-Z0-9]{17}$`, anclada
   y solo en mayúsculas.

Y `consulta_sql` aceptaba cualquier `SELECT` filtrado por una **lista negra**
de palabras (`INSERT|UPDATE|DROP|…`), sin acotar sesión ni tablas.

Con eso, seis consultas que el modelo puede emitir por su cuenta devolvían el
identificador real. Cinco de las seis están hoy en `tests/test_frontera_llm.py`
y **fallan si se desactiva la corrección** — la evasión estaba medida, no
supuesta:

```sql
SELECT lower(chasis) AS c FROM importaciones            -- la regex es solo mayúsculas
SELECT substr(chasis,1,8)||'-'||substr(chasis,9) AS c   -- 18 chars: no casa ^…{17}$
SELECT hex(chasis) AS c FROM importaciones              -- codificado, no literal
SELECT factura AS f FROM importaciones                  -- 'f' no está en la lista de nombres
SELECT replace(chasis,'W','w') AS c FROM importaciones  -- ni mayúsculas ni forma
SELECT content FROM chat_conversations                  -- el historial, en claro (ADR se apoya en él)
```

Una lista negra sobre SQL es una carrera que se pierde: hay infinitas formas
de escribir el mismo dato, y solo hay que acertar una.

## Decisión

**La defensa que no se evade no mira cómo se pide el dato, mira el dato.** El
conjunto de identificadores reales de una sesión es conocido y finito.

1. **Enmascarado por conjunto** (`jarvis/identidades.py`), aplicado en
   `ToolExecutor.execute` sobre el resultado **ya serializado** — el único
   punto por el que pasa todo. Cubre alias, expresiones, JSON anidado a
   cualquier profundidad y prosa libre, y protege a **toda** tool, incluidas
   las que aún no existen: una tool nueva no necesita recordar apuntarse a
   ninguna lista. Se buscan además las variantes que una expresión produce
   (minúsculas, mayúsculas, hexadecimal) y la forma troceada por separadores.
2. **Sandbox estructural para `consulta_sql`** (`jarvis/sandbox.py`):
   conexión `mode=ro` (SQLite impide la escritura, no nosotros), autorizador
   con allowlist de tablas, y **vistas TEMP por sesión** — el modelo escribe
   `importaciones` y lo que ese nombre resuelve ya está filtrado por su
   sesión. El predicado no depende de que el modelo lo escriba.
   `chat_conversations`, `ag_bitacora`, `config` y `sqlite_master` no son
   alcanzables ni por subconsulta.
3. **El ámbito de sesión lo fija el operador** (`jarvis/ambito.py`), no el
   modelo. Antes toda tool hacía `int(session_id)` sin validar: el modelo
   podía responder con cifras de otro mes sin declararlo — no solo una fuga,
   un número equivocado con cara de correcto.
4. **La entrada del operador también se enmascara.** La ley no distingue
   entre lo que dice el modelo y lo que dice el operador; pegar un VIN en el
   chat lo filtraba igual.
5. **La conversación se persiste enmascarada.** Antes se guardaba el texto ya
   revertido, así que el turno 2 podía leer en claro por SQL lo que el turno 1
   guardó. La pantalla del operador sigue viendo el valor real.

## Frontera declarada

La patente aduanal son **4 dígitos**. Buscarla como subcadena destrozaría
importes, fechas y conteos ("3807" aparece en cualquier cifra), así que el
enmascarado por conjunto solo cubre valores de ≥ 6 caracteres
(`identidades.MIN_LONGITUD`). La patente se sigue enmascarando por **columna**
en `mask_row`, que es donde su significado está declarado. `mask_row` no se
retira: es la capa barata y con semántica; la nueva es la que no se evade.

## Corrección (2026-09-02): el coste no podía depender del conjunto

La primera implementación recorría los identificadores —cuatro variantes de
cada uno, y una regex compilada **por identificador**— así que su coste
crecía con cuántos hubiera. Medido después, sobre 12 KB de texto: 0,03 s con
225 formas, **3,77 s con 22 500** — y esto se aplica a cada resultado de tool
y a cada mensaje del operador, o sea ~7 s de regex por turno de chat en una
sesión de 10 000 vehículos. Las pruebas de esta ADR usaban dos
identificadores: correctas, y ciegas a ello
(`docs/DIAGNOSTICO_FABLE_v02.md` §2, R1).

El arreglo es algorítmico, no una caché. `enmascarar()` normaliza el texto
**una vez** (sin separadores, minúsculas, guardando el índice original de
cada carácter) y desliza ventanas de las **longitudes** que el conjunto
contiene —VIN 17, factura ~12, pedimento 15, más sus hexadecimales—
consultando un `set`. Las longitudes distintas son un puñado, tenga el
conjunto diez identificadores o cien mil, así que **el coste lo pone el
texto**. De paso, una sola pasada cubre lo que antes eran dos funciones:
literal, mayúsculas/minúsculas, troceado por separadores y hexadecimal.

Resultado: 3,77 s → **37 ms** con 15 000 identificadores, con el corpus de
evasión intacto. `tests/test_escala.py` fija la independencia respecto al
tamaño del conjunto, no un número de milisegundos.

## Consecuencias

- La ley de ADR-0007 pasa de ser disciplina a ser estructura.
- Coste: una consulta a la base por turno para cargar el conjunto (cacheada
  por sesión en el executor) y una pasada de sustitución sobre el texto de
  salida. Irrelevante frente a la latencia del proveedor.
- El modelo pierde la capacidad de explorar tablas que no le tocan. Es el
  punto.
- Toda tool nueva nace protegida sin hacer nada. La lista `DETAIL_TOOLS`
  deja de ser un riesgo de olvido (fue exactamente el hallazgo B1 de
  `docs/AUDITORIA.md`).
