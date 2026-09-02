# ADR-0014 — La identidad de una entidad se resuelve por índice, no por escaneo

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [modelo de datos](../data-model.md), [componentes AUTOGENES](../components/autogenes.md), [calidad](../quality.md)
- **Refina:** [ADR-0004](0004-sustrato-unico-escritor-de-ag.md)

## Contexto

`upsert_entidad` resolvía la identidad cargando **todas** las entidades de la
sesión, hidratando cada fila con pydantic, y comparando en Python el nombre
normalizado y cada alias. O(E) por llamada ⇒ **O(E²) por ingesta**.

Medido (`docs/DIAGNOSTICO_FABLE_v02.md` §1, y ahora `tests/test_escala.py`):

| Entidades ya dentro | Coste de 1 000 upserts |
|---|---|
| 0 → 1 000 | 4,8 s |
| 1 000 → 2 000 | 13,5 s |
| 2 000 → 3 000 | 22,2 s |
| 3 000 → 4 000 | **31,3 s** |

Reencontrar una entidad que ya existe —el caso que domina una ingesta real—
costaba **13,7× más** con 2 100 entidades dentro que con 100. Proyectado a
5 000 documentos × ~30 entidades ≈ 150 000 upserts, son **horas** de puro
escaneo antes de que el operador vea nada.

Había un segundo defecto, más silencioso: el escaneo devolvía la **primera**
coincidencia del cursor. Si dos entidades compartían un alias, cuál ganaba
dependía del orden físico de filas — no determinista, y contra la ley de
doble corrida.

## Decisión

**La resolución baja a SQL, y el empate se vuelve imposible por construcción.**

`ag_entidad_alias(session_id, alias_norm, entidad_id, es_nombre)` con
`PRIMARY KEY (session_id, alias_norm)`: cada nombre y cada alias es una fila
con su forma normalizada (`TRIM`+`LOWER`, el mismo `_norm` de siempre).
`upsert_entidad` hace una lectura indexada; el PRIMARY KEY impide que dos
entidades reclamen la misma clave, así que el empate que el escaneo resolvía
por azar ya no puede existir.

Toda ruta de escritura mantiene el índice, y las tres estaban en el mismo
sitio: `upsert_entidad` al crear, `editar_entidad` al renombrar o cambiar
alias, y `fusionar_entidades` al absorber —esta última importa especialmente,
porque el `ON DELETE CASCADE` se lleva las claves del perdedor y sin
reindexar al ganador el nombre fusionado dejaría de encontrar a nadie: la
siguiente mención crearía un duplicado, justo lo contrario de fusionar.

El índice **no es evidencia**: se deriva de `ag_entidades` y se reconstruye
desde ella. Por eso vive fuera de la ley de procedencia de ADR-0004 y su
relleno puede correr en una migración sin bitácora.

## Resultado medido

| | Antes | Después |
|---|---|---|
| 1 000 upserts con 3 000 dentro | 31,3 s | **0,34 s** |
| Forma de la curva | creciente | **plana** |
| Reencontrar con 4 000 dentro | ~31 ms | **0,26 ms** |

## Consecuencias

- Miles de documentos vuelven a ser minutos. La ingesta ya era plana; ahora
  la resolución también.
- `tests/test_escala.py` fija la **forma** de la curva, no un número de
  segundos: CI no es un banco de pruebas y un umbral absoluto se vuelve
  flaky en una máquina lenta. Lo que no puede cambiar es que el bloque N+1
  cueste como el bloque N.
- La migración se basta sola sobre una base anterior (crea la tabla si falta)
  y su relleno tolera un esquema parcial sin tumbar el arranque: una base
  legada puede no tener siquiera `ag_entidades`.
- Coste: una tabla derivada más que mantener en tres sitios. A cambio, la
  identidad deja de depender del orden de filas.
