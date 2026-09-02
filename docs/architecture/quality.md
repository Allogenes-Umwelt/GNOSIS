# Calidad — compuertas y doctrina de prueba

> **Nivel:** Atributos de calidad (arc42 §10) — **Notación:** tablas + reglas
> **Pregunta que responde:** ¿Qué impide que un cambio malo llegue a `main`, y con qué se mide?
> **Leyenda:** HARD = falla el build · SOFT = avisa, la revisión decide.
> **ADR:** [ADR-0009](adr/0009-seleccion-de-reglas-ruff-declarada.md) · [ADR-0010](adr/0010-metricas-citadas-evaluables-por-fecha.md)
> **Índice de vistas:** [docs/architecture/README.md](README.md)

## Compuertas de CI

| Compuerta | Herramienta | Dureza | Regla |
|---|---|---|---|
| Lint Python | `ruff check .` | HARD | Selección declarada en `ruff.toml` (`E4,E7,E9,F` **+ `S`**), nunca heredada de la versión instalada — [ADR-0009](adr/0009-seleccion-de-reglas-ruff-declarada.md). Alcance por `exclude`: el pipelegado y los scripts legados quedan fuera a propósito. |
| Lint JS | `npx eslint static` | HARD | 0 errores. Warnings de variables sin usar toleradas. |
| SAST | `ruff check .` (reglas `S`) | HARD | Toda construcción de SQL por interpolación, `except: pass` o hash débil se declara con `# noqa: S… — razón`. Sin razón escrita, no pasa. |
| Suite | `python -m pytest -q` | HARD | Verde completa. Sin `xfail` de conveniencia, sin tests saltados para pasar. |
| Diagramas Mermaid | `node scripts/validate-mermaid.mjs docs/architecture` | HARD | Cabecera de vista completa (nivel · notación · pregunta · leyenda) y bloques Mermaid que parsean. |
| Staleness de diagramas | `node scripts/check-diagram-staleness.mjs` | HARD | Un cambio estructural sin tocar `docs/architecture/` en el mismo diff no pasa. |
| ADR | el mismo script | SOFT | Avisa si un cambio estructural no toca ningún ADR. Endurecible: el corpus ya existe ([ADR-0001](adr/0001-registrar-decisiones-de-arquitectura.md)). |

|---|---|---|
| Lint Python | `ruff check .` | Limpio; el pipeline legado excluido a propósito |
| Lint JS | `npx eslint static` | 0 errores |
| Suite | `pytest tests/` (506 verdes + 4 gated por OCR) | 1:1 con los motores |
| Determinismo | test de **doble corrida** | Toda métrica nueva de panel: misma base ⇒ misma salida |
| CI | `.github/workflows/ci.yml` | ruff + pytest en cada push y PR |
| Visual | mock-first + captura Nocturne/Daylight | Ningún uplift visual sin visto bueno del operador |

## Doctrina de prueba

- **Doble corrida.** Toda métrica que alimente un panel numérico citado se
  prueba corriéndola dos veces y exigiendo salida idéntica. Sin esto, una
  métrica puede depender del orden de un `set` o de `PYTHONHASHSEED` sin que
  nadie lo note.
- **Doble corrida en el tiempo.** La fecha es una entrada, no un ambiente:
  fijado `hoy`, dos corridas bajo relojes distintos dan lo mismo
  ([ADR-0010](adr/0010-metricas-citadas-evaluables-por-fecha.md)). Una prueba
  que siembra fechas y lee el reloj real es una bomba de tiempo, no una prueba.
- **1:1 con el motor.** Cada módulo de `autogenes/` tiene su archivo en
  `tests/`. Un motor sin spec es un motor sin contrato.
- **Regresión con nombre.** Cada defecto corregido en `docs/AUDITORIA.md` deja
  una prueba que falla si el defecto vuelve.
- **Sin mock del dominio.** Las pruebas siembran SQLite en memoria con el
  esquema real; no se simula la base.

## Formateo — decisión declarada

No se impone formateador automático. `ruff format` reformatearía ~46 archivos
y destruiría el alineado y los comentarios densos PANOPTES, que son
deliberados. El linter de correctitud sí es compuerta; el formateo es manual.

## Observabilidad — el mínimo, declarado

No hay métricas RED/USE ni trazas: para un despliegue mono-operador local es
una brecha consciente, no un descuido (ver
[auditoría §13](auditoria-backend.md)). Lo que sí existe desde el 2026-09-02:

- **Registro estructurado** (`registro.py`) a stderr — logs a stream,
  12-factor. Nivel por `GNOSIS_LOG_NIVEL`. El árbol mantenido no usa `print`:
  hay una prueba que lo fija (`tests/test_observabilidad.py`).
- **Id de petición** en cada request, devuelto en `X-Peticion-Id` y en el
  campo `referencia` de todo error de API. Sin él, dos operaciones
  concurrentes entrelazan sus líneas y ninguna se puede seguir.
- **Degradar no es callar.** El tablero declaraba "sin datos" ante cualquier
  excepción, que es una afirmación falsa sobre el expediente; ahora dice qué
  falló y con qué referencia buscarlo.
