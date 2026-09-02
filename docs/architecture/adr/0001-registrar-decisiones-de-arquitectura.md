# ADR-0001 — Registrar las decisiones de arquitectura como ADR

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** todas (`docs/architecture/`)

## Contexto

`docs/estandares/architecture-standards.md` §5 exige que todo cambio
estructural viaje con un ADR, y §7 marca la compuerta ADR como *soft*
"hasta que exista un corpus de ADR". GNOSIS no tenía corpus: las decisiones
vivían como una tabla-resumen de una línea por decisión al final de
`docs/ARQUITECTURA.md` — suficiente para recordar QUÉ se decidió, insuficiente
para saber POR QUÉ, qué se descartó y qué se rompe si se revierte.

## Decisión

Se abre `docs/architecture/adr/`. Cada ADR nombra las vistas que afecta; cada
vista cita sus ADR en la cabecera. Numeración correlativa de cuatro dígitos,
nombre-slug en español (el idioma de `docs/`).

Se retro-documentan solo las decisiones **portantes** — aquellas cuya
reversión cambiaría la forma del sistema. Las demás filas de la tabla
histórica se conservan verbatim en `decisiones-historicas.md`: son ciertas y
útiles, pero inventarles un contexto que nadie escribió sería fabricar
historia, y este repo no fabrica.

## Consecuencias

- Toda decisión estructural nueva nace como ADR en el MISMO commit que el
  código (regla de staleness, §6).
- La compuerta ADR puede endurecerse cuando Jesús lo decida: el corpus ya
  existe.
- Coste: un archivo más por decisión. Aceptado.
