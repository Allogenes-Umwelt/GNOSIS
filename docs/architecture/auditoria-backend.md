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
| Calidad de código · ruff | limpio | ✅ | `ruff check .` → *All checks passed*, ahora con E4/E7/E9/F **+ S** |
| Calidad de código · mypy | strict limpio | ❌ | `mypy --strict` → **827 errores en 51 archivos**; sin `--strict` → **56 en 22**. No hay anotaciones en el árbol legado ni stubs de pandas |
| Calidad de código · complejidad | ciclomática < 10 | ⚠️ | media **B (5.34)** sobre 538 bloques; **16 bloques ≥ 11**. Los peores son de `app.py`: `procesar_pipeline` **F(45)**, `procesar_fase1` **F(42)**, `dashboard` **E(35)** |
| Pruebas · cobertura | diff ≥ 80%, CI la exige | ⚠️ | **80%** en el árbol vivo tras las olas de corrección (era 78% con 539 pruebas; hoy 593). CI **sigue sin** medir cobertura, así que el número no es compuerta |
| Pruebas · pirámide | equilibrada | ✅ | **726 verdes** + 1 skip; unidad 1:1 con el motor, integración HTTP en `test_http_rutas.py`, sin mock del dominio (SQLite en memoria con el esquema real). **2026-09-02:** se suma un banco de ESCALA que afirma ratios y trabajo, no segundos (`test_escala.py`, marcado `slow`), y pruebas de NAVEGADOR con Chromium (`test_frontend_carreras.py`), que se saltan solas donde no están |
| Seguridad · OWASP | revisado por release | ✅ | `docs/AUDITORIA.md`: 5 olas, 20 hallazgos corregidos con prueba de regresión, 5 diferidos con justificación |
| Seguridad · SAST/DAST en CI | ambos | ⚠️ | **2026-09-02, v02:** se suma `scripts/check-innerhtml.mjs` como compuerta del frontend (HARD el archivo que interpola sin `esc` disponible; SOFT la línea a revisar) — el repo no tiene bundler que revise nada ([ADR-0020](adr/0020-frontera-comun-del-frontend.md)). | **2026-09-02:** SAST activo — `ruff --select S` (bandit) es compuerta HARD; los 38 sitios fuera de tests quedaron justificados uno a uno con su `noqa` y su razón, ninguno era inyección. Verificado que la compuerta atrapa una inyección real. **DAST sigue sin existir** |
| Seguridad · secretos | rotados | ❌ | **la llave DeepSeek que viajó por chat sigue sin rotar** (`docs/HANDOFF.md`). Acción del operador; ningún cambio de código la sustituye |
| Diseño de API | Richardson L3 donde aplique; versionada; mutaciones idempotentes | ⚠️ | versionada (`/api/v1/...`) ✅; L2 (verbos + recursos, sin HATEOAS) — **correcto para un cliente único que no descubre enlaces**, desviación declarada; idempotencia no verificada sistemáticamente |
| Datos · migraciones | hacia adelante | ✅ | `database/migrations.py` idempotente, sin rollback por diseño (la base del operador es producción) |
| Datos · EXPLAIN en consultas calientes | sí | ✅ | **2026-09-02, campaña v02:** los planes de las consultas calientes se midieron y algunos se **fijaron como contrato**. `ag_entidad_alias` convirtió la resolución de entidad de escaneo en lectura indexada ([ADR-0014](adr/0014-resolucion-de-entidad-por-indice.md)); en la búsqueda FTS5 el `CROSS JOIN` fija el orden de anidamiento y `tests/test_busqueda.py` afirma sobre `EXPLAIN QUERY PLAN`, no sobre el reloj ([ADR-0016](adr/0016-busqueda-de-texto-con-fts5.md)) |
| Datos · restauraciones probadas | sí | ✅ | **2026-09-02:** respaldo por la API en línea de SQLite (no depende de que el checkpoint complete — medido `busy` con un lector abierto), `integrity_check` sobre la copia, y `tests/test_respaldo.py` restaura y compara |
| Observabilidad · RED/USE, trazas, SLO | vivo | ⚠️ | **2026-09-02:** registro estructurado con nivel + id de petición (`registro.py`), `X-Peticion-Id` en toda respuesta, cero `print` en el árbol mantenido (con prueba). Sigue sin métricas RED/USE, trazas ni SLO — brecha consciente para un despliegue mono-operador |
| Entrega · DORA | despliegue semanal, restauración < 1h | N/A | no hay despliegue continuo: el operador reconstruye su contenedor. DORA no mide este perfil |
| Dependencias · lockfile | sí | ⚠️ | `requirements.txt` pinea, `requirements2.txt` es un pin congelado alterno; **no hay lockfile con hashes**. CI y la imagen ya no divergen (pins de Flask/Werkzeug sincronizados) |
| Dependencias · pip-audit limpio | sí | ✅ | limpio con 2 ignoradas y declaradas (PyPDF2, ver abajo). Compuerta HARD en CI |
| 12-factor | config en entorno, procesos sin estado, logs a stream | ✅ | secretos solo por entorno, `.env` gitignoreado, un solo código base. **Corregido el 2026-09-02:** esta celda decía ✅ cuando el chat era estado de proceso (globales de módulo con `--workers 2`). El hallazgo H3 lo midió y [ADR-0012](adr/0012-estado-conversacional-en-sqlite.md) lo cerró; ahora la marca es cierta |
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

---

# Auditoría de fin de campaña (§14.4)

Revisión del sistema **como un todo** tras integrar `main`, la rama
`claude/gnosis-systematic-audit-447oih` (32 commits) y las tres olas de esta
campaña. La pregunta no es si cada pieza pasó su compuerta, sino si el
conjunto sigue siendo coherente.

## Interacciones entre dominios

- **Integración × pruebas.** Las 32 correcciones de la rama de auditoría no
  tocan ninguno de los cinco archivos que esta campaña modificó: el cruce fue
  limpio por construcción, no por suerte. 539 verdes tras el merge.
- **Seguridad × fiabilidad.** Subir Flask/Werkzeug cierra 15 CVE y a la vez
  introduce el único riesgo no medido de la campaña: ninguna prueba renderiza
  la app real. Se resolvió a favor de la seguridad —13 vulnerabilidades de
  Werkzeug pesan más que un riesgo de regresión acotado a una superficie que
  el árbol apenas usa— y el riesgo residual queda escrito, no escondido.
- **Determinismo × mantenibilidad.** [ADR-0005](adr/0005-networkx-confinado-a-lentes.md)
  paga determinismo con código propio donde NetworkX bastaría. La campaña
  refuerza esa elección, no la revisa: [ADR-0010](adr/0010-metricas-citadas-evaluables-por-fecha.md)
  extiende la misma ley al tiempo.
- **Compuertas × velocidad.** CI pasa de tres pasos a seis. Medido en la
  corrida #232: `pip-audit` 12 s, `npm install mermaid jsdom` 7 s, los dos
  validadores 1 s — **20 s añadidos** sobre una corrida total de 49 s. Barato
  para lo que compra; si algún día molesta, la palanca es cachear npm y pip,
  no aflojar las compuertas.

## Conflictos de atributos de calidad

| Conflicto | Resolución | Coste aceptado |
|---|---|---|
| Seguridad vs. estabilidad (Flask 2→3) | seguridad | verificación final del operador pendiente |
| Determinismo vs. brevedad (NetworkX) | determinismo | topología reimplementada a mano |
| Rigor de compuerta vs. tiempo de CI | rigor | +20 s por corrida (medido, #232) |
| Completitud del diagrama vs. regla de ~6 elementos | completitud, declarada | dos vistas exceden la guía |

## Coherencia arquitectónica — verificada, no supuesta

Se contrastaron las cifras que los diagramas afirman contra el árbol real:

| Afirmación del diagrama | Real | |
|---|---|---|
| 121 rutas (81 + 11 + 29) | era **121**; hoy **123** (82 + 11 + 30) tras las olas 3 y 4 | ✅ actualizado |
| 26 tools de Gnosis·IA (18 + 8) | 18 + 8 = **26** | ✅ |
| 31 módulos AUTOGENES | **31** archivos en `autogenes/` | ✅ |
| 33 superficies JS | **34** | ❌ corregido |
| pytest (506) | **539** | ❌ corregido |

Dos cifras habían envejecido con el merge. **La compuerta de staleness no las
habría atrapado**: `static/` está exento a propósito para que la compuerta no
grite en cada retoque de frontend, y el número de superficies vive dentro de
una vista, no en el nombre de un archivo. Es una **ceguera declarada** de la
compuerta, no un fallo: se cubre con esta revisión de fin de campaña, que por
eso existe.

## Veredicto

El sistema queda **más coherente que al empezar**: seis semanas de
correcciones verificadas integradas, la CI mide lo que el operador ejecuta,
las compuertas que `CLAUDE.md` prometía existen y se probaron contra casos
que deben fallar, y la arquitectura está documentada vista por vista con sus
decisiones trazables.

Lo que queda abierto está nombrado con su medición en la tabla §13 y ordenado
por valor. Encabeza la lista, muy por encima del resto, **rotar la llave
DeepSeek**: es acción del operador y ninguna compuerta la sustituye.
