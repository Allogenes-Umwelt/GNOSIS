# ADR-0010 — Una cifra citada debe ser evaluable para una fecha dada

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [calidad](../quality.md), [componentes AUTOGENES](../components/autogenes.md)

## Contexto

`estado_de_sesion()` publica `senales`, la cifra que llena el satélite Radar
de las constelaciones. Llamaba a `senales_de_sesion(conn, session_id)` sin
`hoy`, así que leía `date.today()`.

Consecuencia: la cifra no era reproducible. `tests/test_f4_f5.py` fijaba el
Radar a `hoy="2026-07-10"` y lo comparaba contra un `estado_de_sesion` que
leía el reloj real; al pasar el 2026-07-20 el vencimiento sembrado salió de
la ventana de 30 días por un solo lado de la comparación y la prueba se puso
roja sola. Llevaba seis semanas fallando, tapada por el lint rojo.

La ley de determinismo de `CLAUDE.md` exige que toda métrica que alimente un
panel numérico citado sea pura y determinista, con test de doble corrida.
Una métrica que depende del reloj no puede satisfacerla.

## Decisión

Toda métrica citada acepta la fecha como **parámetro**, nunca la lee del
entorno. `estado_de_sesion` gana `hoy: Optional[str] = None` y lo reenvía,
igual que ya hacían `metabolismo` y `consultas`. El default no cambia
(hoy), así que las rutas y sus payloads se comportan igual.

La ley de doble corrida se extiende al tiempo: fijado `hoy`, dos corridas
bajo relojes separados por un año devuelven un payload idéntico
(`test_estado_con_hoy_no_depende_del_reloj`).

## Consecuencias

- Las pruebas que siembran fechas dejan de envejecer hasta ponerse rojas.
- Una cifra citada puede re-derivarse para el día en que se afirmó — que es
  lo que un expediente de defensa necesita.
- Toda métrica temporal nueva nace con `hoy` inyectable. Sin excepción.
