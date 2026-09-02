# Auditoría contra los benchmarks §13 de `backend-engineering.md`

> **Nivel:** Auditoría de fin de ola (arc42 §10) — **Notación:** tabla de veredictos medidos
> **Pregunta que responde:** ¿Dónde está GNOSIS respecto a la doctrina backend del ecosistema, medido y no opinado?
> **Leyenda:** ✅ cumple · ⚠️ parcial (con brecha nombrada) · ❌ no cumple · N/A no aplica al perfil de este repo.
> **ADR:** [ADR-0009](adr/0009-seleccion-de-reglas-ruff-declarada.md) · [ADR-0010](adr/0010-metricas-citadas-evaluables-por-fecha.md)
> **Índice de vistas:** [docs/architecture/README.md](README.md)

Medido el **2026-09-02** sobre el árbol de
`claude/gnosis-hardening-debugging-ip8iwg` tras integrar `main` y la rama
`claude/gnosis-systematic-audit-447oih`. Cada fila es una **medición**, con el
comando que la produce. Ninguna casilla se marca por impresión.

## Veredictos

| Dominio | Benchmark §13 | Veredicto | Medición |
|---|---|---|---|
| Documentación de arquitectura | C4 completo y al día; ADR por decisión | ✅ | 10 vistas en `docs/architecture/`, cabecera completa las 10; corpus de 10 ADR; compuerta de staleness en CI |
| Modelado de procesos | BPMN válido, sin bloqueos, fiel a la realidad | ⚠️ | 3 vistas de proceso, todas parsean. Son **BPMN-style en Mermaid**, no BPMN 2.0 con XML validable — desviación declarada: no hay motor de procesos que consuma el XML |
| Calidad de código · ruff | limpio | ✅ | `ruff check .` → *All checks passed* |
| Calidad de código · mypy | strict limpio | ❌ | `mypy --strict` → **827 errores en 51 archivos**; sin `--strict` → **56 en 22**. No hay anotaciones en el árbol legado ni stubs de pandas |
| Calidad de código · complejidad | ciclomática < 10 | ⚠️ | media **B (5.34)** sobre 538 bloques; **16 bloques ≥ 11**. Los peores son de `app.py`: `procesar_pipeline` **F(45)**, `procesar_fase1` **F(42)**, `dashboard` **E(35)** |
| Pruebas · cobertura | diff ≥ 80%, CI la exige | ⚠️ | **93%** en `autogenes/` (los motores), **78%** en el árbol vivo completo. CI **no** mide cobertura todavía |
| Pruebas · pirámide | equilibrada | ✅ | 539 verdes + 1 skip; unidad 1:1 con el motor, integración HTTP en `test_http_rutas.py`, sin mock del dominio (SQLite en memoria con el esquema real) |
| Seguridad · OWASP | revisado por release | ✅ | `docs/AUDITORIA.md`: 5 olas, 20 hallazgos corregidos con prueba de regresión, 5 diferidos con justificación |
| Seguridad · SAST/DAST en CI | ambos | ❌ | ninguno. Ruff tiene reglas `S` (bandit) disponibles y **no están activadas** — ver recomendaciones |
| Seguridad · secretos | rotados | ❌ | **la llave DeepSeek que viajó por chat sigue sin rotar** (`docs/HANDOFF.md`). Acción del operador; ningún cambio de código la sustituye |
| Diseño de API | Richardson L3 donde aplique; versionada; mutaciones idempotentes | ⚠️ | versionada (`/api/v1/...`) ✅; L2 (verbos + recursos, sin HATEOAS) — **correcto para un cliente único que no descubre enlaces**, desviación declarada; idempotencia no verificada sistemáticamente |
| Datos · migraciones | hacia adelante | ✅ | `database/migrations.py` idempotente, sin rollback por diseño (la base del operador es producción) |
| Datos · EXPLAIN en consultas calientes | sí | ❌ | no se ha hecho. Con el volumen de una sesión aduanal no ha dolido, pero es una medición que falta |
| Datos · restauraciones probadas | sí | ⚠️ | `database/backup.py` hace `wal_checkpoint(TRUNCATE)` antes de copiar (corrige el hallazgo D3); **no existe una prueba que restaure y verifique** |
| Observabilidad · RED/USE, trazas, SLO | vivo | ❌ | no hay métricas ni trazas. Para un despliegue mono-operador local es defendible; se declara como brecha consciente, no como cumplimiento |
| Entrega · DORA | despliegue semanal, restauración < 1h | N/A | no hay despliegue continuo: el operador reconstruye su contenedor. DORA no mide este perfil |
| Dependencias · lockfile | sí | ⚠️ | `requirements.txt` pinea, `requirements2.txt` es un pin congelado alterno; **no hay lockfile con hashes**. CI y la imagen ya no divergen (pins de Flask/Werkzeug sincronizados) |
| Dependencias · pip-audit limpio | sí | ✅ | limpio con 2 ignoradas y declaradas (PyPDF2, ver abajo). Compuerta HARD en CI |
| 12-factor | config en entorno, procesos sin estado, logs a stream | ✅ | secretos solo por entorno (`docker/.env.example`), `.env` gitignoreado, un solo código base, sin estado en el proceso (la verdad vive en SQLite) |
| Atributos de calidad ISO 25010 | pasa | ⚠️ | seguridad y fiabilidad bien cubiertas por auditoría y pruebas; **mantenibilidad** penalizada por `app.py` (3 funciones ≥ E) y por la ausencia de tipos |

## Lo corregido en esta ola

- **15 CVE conocidos en el stack web del operador.** `requirements.txt`
  pineaba `Flask==2.0.3` y `Werkzeug==2.0.3` — 2 y 13 vulnerabilidades
  conocidas respectivamente, y es lo que la imagen instala
  (`docker/Containerfile` → `pip install -r requirements.txt`). Subidos a
  `Flask==3.1.3` / `Werkzeug==3.1.8`. Evidencia: las 539 pruebas pasan contra
  el stack nuevo en un venv aislado, y la superficie usada (`HTTPException`,
  `secure_filename`, `Blueprint`, `render_template`, `request`, `jsonify`,
  `current_app`) no toca ninguna API retirada en 3.x.
  **Riesgo residual declarado:** ninguna prueba renderiza la app real bajo
  carga; el operador debería levantar su contenedor una vez antes de confiar.
- **CI no probaba lo que el operador ejecuta.** El workflow instalaba Flask sin
  pin mientras la imagen corría 2.0.3: la compuerta verde no decía nada sobre
  el despliegue real. Flask y Werkzeug van ahora pineados en ambos sitios, con
  un comentario cruzado para que no vuelvan a separarse.
- **Compuerta de dependencias.** `pip-audit -r requirements.txt` es HARD en CI.

## Lo que queda, en orden de valor

1. **Rotar la llave DeepSeek.** Es del operador y lleva meses pendiente.
   Ninguna otra fila de esta tabla importa tanto.
2. **SAST barato: activar las reglas `S` de ruff.** Reportan 14 `S608`
   (construcción de SQL por interpolación) y 6 `S110`/`S112` (`except: pass`).
   Varios son falsos positivos legítimos — nombres de tabla que vienen de
   literales fijos, no de entrada — pero cada uno tendría que justificarse con
   un `# noqa: S608` y su razón, que es exactamente lo que una compuerta SAST
   compra. Trabajo acotado, valor alto.
3. **PyPDF2.** `PYSEC-2022-194` y `PYSEC-2026-1837`, con fix en 1.27.x, y la
   librería está deprecada en favor de `pypdf`. **No se tocó**: solo la
   importan el pipelegado y la ruta de extracción de `app.py`, calibrados al
   formato exacto de las facturas VW y sin fixtures reales aquí. Subirla a
   ciegas es justo lo que ZERO SNAKE OIL prohíbe. Decisión del operador con
   PDFs delante.
4. **Cobertura en CI.** 78% global; el suelo lo ponen `jarvis/` (chat 0%,
   tools 14%) y `database/persistence.py` (36%). Medirla en CI con umbral
   convierte el número en compuerta.
5. **Complejidad de `app.py`.** `procesar_pipeline` F(45) y `procesar_fase1`
   F(42) son las funciones más caras de mantener del repo.
   `docs/HANDOFF.md` ya propone extraerlas a blueprints; el número lo
   confirma.
6. **mypy.** 827 errores en `--strict` es un proyecto, no un remate. Un camino
   realista: `--strict` solo sobre `autogenes/` (los motores puros, ya
   tipados en su mayoría) y dejar el resto fuera hasta que valga la pena.
7. **`ANTHROPIC_MODEL` por defecto.** `jarvis/llm_interface.py` fija un id de
   modelo de la generación anterior. El proveedor de respaldo funciona, pero
   apunta a un modelo viejo; conviene revisarlo al mismo tiempo que la llave.

## Cómo reproducir estas mediciones

```bash
ruff check .
pytest tests/ -q --cov=autogenes --cov=rutas --cov=tableros --cov=database --cov=jarvis
mypy --strict autogenes rutas tableros database jarvis app.py
radon cc autogenes rutas tableros database jarvis app.py -n C -s
pip-audit -r requirements.txt
node scripts/validate-mermaid.mjs docs/architecture
```
