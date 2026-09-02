# ADR-0009 — La selección de reglas de ruff se declara, no se hereda

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [calidad](../quality.md)

## Contexto

CI llevaba roja en `main` desde el 2026-08-23. El commit que la rompió,
`95c2c76`, tocaba **solo documentación**: ni una línea de código. El paso de
lint reportaba 313 errores de reglas (BLE, UP, I, RUF, S, DTZ) que este árbol
nunca seleccionó.

`ruff.toml` declaraba `exclude` pero no `select`, y `ci.yml` instala ruff sin
pin. La compuerta heredaba, por tanto, el default de la versión que tocara
instalarse. Una ruff nueva amplió su default y cambió el veredicto bajo un
árbol idéntico. Con la selección histórica, el mismo árbol sale limpio:

    ruff check . --select E4,E7,E9,F   ->  All checks passed!

## Decisión

`ruff.toml` declara `select = ["E4", "E7", "E9", "F"]` — el conjunto que el
comentario de cabecera del propio archivo ya decía que se linteaba. Además el
paso de CI pasa a `ruff check .`: el alcance lo fija el `exclude` de
`ruff.toml`, y la lista de rutas a mano que había antes se saltaba
silenciosamente `database/`.

## Alternativa descartada

Pinear la versión de ruff en CI. Congela también las mejoras de pyflakes
dentro del conjunto elegido, y obliga a un bump manual. La selección
explícita da determinismo sin congelar corrección.

## Consecuencias

- La compuerta obedece la misma ley que el render: mismo árbol, mismo
  veredicto, corra donde corra y con la versión que sea.
- Adoptar una familia de reglas nueva pasa a ser una decisión explícita —
  una línea en `select` — y no un efecto colateral de `pip install`.
