# Cumplimiento de doctrina — GNOSIS

Este directorio (docs/estandares/) es un espejo de la librería canónica
MD-FILES-SHOP (repositorio privado de Allogenes-Umwelt). El canon se
gobierna allí con `mdshop validate`; los repos consumidores no pueden
correr ese gate porque su chequeo de frescura compara `updated:` contra el
historial git del repo donde corre, y un commit de sync siempre postdata la
fecha del canon — falso fallo en cada ejecución. La propiedad del lado
consumidor es la ausencia de deriva, y eso es lo que verifica este repo.

## Mecánica del gate

- Manifest: docs/estandares/DOCTRINE_MANIFEST.sha256 (pin sha256 de los
  cinco archivos del canon, tal como salieron de la librería).
- CI: .github/workflows/doctrine.yml — corre `python3
  scripts/doctrine-check.py` en cada push/PR. Un archivo del canon editado a
  mano, o faltante, falla el build.
- Local: .pre-commit-config.yaml — hook doctrine-drift + higiene básica +
  gitleaks. Instalar una vez por clon: `pre-commit install`.

## Cómo se actualiza tras un bump del canon

1. Copiar los cinco archivos desde MD-FILES-SHOP/library a docs/estandares/.
2. `python3 scripts/doctrine-check.py --update` (re-pinea el manifest).
3. Commit y push. El gate valida que el pin y los archivos coincidan.

## Matriz por archivo (estado real, no aspiracional)

| Archivo | Aplica | Gate que corre hoy | Pendiente |
|---|---|---|---|
| backend-engineering.md | Sí — núcleo Flask/Python | ruff, mypy, pip-audit, pytest (ci.yml); drift doctrina | import-linter (requiere definir capas); mutmut (requiere presupuesto de tiempo) |
| api-design.md | Parcial — endpoints sin contrato OpenAPI publicado | drift doctrina | oasdiff/schemathesis hasta publicar spec |
| application-security.md | Sí | pip-audit (deps); gitleaks (pre-commit) | caminar benchmarks restantes del archivo |
| frontend-engineering.md | No aplica al núcleo de este repo | — | — |
| llm-engineering.md | Sí — uso de anthropic | drift doctrina | controles fuera del modelo (pendiente de diseño) |

Actualizado: 2026-09-09.
