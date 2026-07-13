# Benchmark — el grafo de GNOSIS contra Palantir (Gotham/Foundry)

> v1 · 2026-07-13 · Compañero de `PROPUESTA_GRAFO.md` v3.
> **Método y límite declarado (B0, confianza calibrada):** la columna Palantir
> se basa en las capacidades públicamente documentadas de Gotham (aplicación
> Graph) y Foundry (Object Explorer/Vertex) al corte de conocimiento del
> autor (enero 2026); no es un benchmark independiente ni una evaluación con
> licencia en mano. La columna GNOSIS, en cambio, es verificable
> `archivo:línea` en este repo. Donde la comparación sea dudosa, se dice.

---

## 0. Respuesta primero: qué significa "superior a Palantir" aquí — y qué no

**La afirmación honesta:** GNOSIS puede ser superior a Palantir **en su
dominio (analítica aduanal-automotriz de un caso por sesión) y en seis
dimensiones medibles** (§2): procedencia citable, reproducibilidad
determinista, honestidad epistémica, soberanía local-first, ajuste de dominio
y accesibilidad. Ninguna de las seis depende de tamaño de empresa: dependen de
leyes de diseño que Palantir no promete y GNOSIS ya legisla.

**La afirmación deshonesta que este documento prohíbe:** "GNOSIS reemplaza a
Gotham". No compite en multi-analista en tiempo real, GIS profundo, escala
petabyte ni marketplace de integraciones — **por diseño** (§4). Decir lo
contrario sería el snake oil que el propio sistema veda.

**La brecha real que sí hay que cerrar:** el valor central de Palantir no es
el dibujo del grafo — es el **flujo de investigación** (expandir, seleccionar,
anotar, guardar, comparar, simular, informar). GNOSIS hoy tiene un visor
excelente y motores fuertes, pero no ese flujo. La Pista P de la propuesta v3
existe para cerrarlo (§3).

---

## 1. Capacidad por capacidad

Estados: ✅ ya existe · 🔶 parcial · ⬜ no existe · 🚫 fuera de alcance por diseño.
"Tras el plan" = al completar las pistas I/L/P de `PROPUESTA_GRAFO.md` v3.

| Capacidad | Palantir (documentado) | GNOSIS hoy | GNOSIS tras el plan | Fase que la cierra |
|---|---|---|---|---|
| Ontología tipada de objetos/enlaces | ✅ | ✅ AUTOGENES: kinds + relaciones tipadas (`proyeccion.py:27-46`) | ✅ | — |
| Procedencia por objeto | ✅ (linaje de datasets) | ✅ **más fina**: cada entidad cita fragmentos; bitácora WORM (`ag_bitacora`); ley de citación | ✅ | — |
| Reproducibilidad determinista del render | ⬜ no prometida | ✅ por ley y por test (`fuerzas.js:5-7`, `proyeccion.py:188-206`) | ✅ + test de doble corrida en toda métrica | I1 |
| SNA (centralidades, comunidades) | ✅ | 🔶 motor existe, no orientado a negocio ni surfaceado | ✅ con lentes y panel de negocio | I1–I2 |
| Búsqueda y pivote (search-around tipado) | ✅ gesto central de Gotham | 🔶 vecindario fijo + expandir racimo | ✅ expansión por tipo de enlace n-saltos | P2 |
| Selección múltiple + operaciones de grupo | ✅ | ⬜ selección única (`sel`, `grafo.js:659`) | ✅ lasso/shift + aislar/expandir/exportar grupo | P2 |
| Facetas por propiedades + vistas vinculadas | ✅ (histogramas ligados a la selección) | ⬜ solo filtros por kind en leyenda | ✅ facetas (precio/J-N/aduana/mes) + histograma con brushing bidireccional | P4 |
| Investigaciones guardadas / snapshots | ✅ | ⬜ solo deep-link propuesto | ✅ Producto{clase:'investigacion'}: estado + notas + tarjetas fijadas, reabrible | P1 (sobre L1) |
| Anotación del analista sobre el grafo | ✅ | 🔶 tarjetas fijables (`grafo.js:1190`), sin notas persistidas | ✅ notas del operador vía Sustrato (origen=operador, ley de procedencia) | P1 |
| What-if / simulación | ✅ | 🔶 **motor completo** (`cascada.py`, API `qualia/cascada`) pero solo en la vista QUALIA | ✅ en el lienzo principal: caída de aduana/marca con radio de impacto y volumen afectado medidos | P3 |
| Diff temporal del grafo | ✅ (time slider) | 🔶 drift entre sesiones existe como cifras (`qualia.drift_sesiones`) | ✅ modo diff visual sobre el lienzo (ganado/perdido) | I4 + P5 |
| Reglas y alertas como ciudadanos | ✅ | ✅ NOMOS: reglas M-P con P&L y backtest (`rutas/autogenes.py:707-764`); Δ proyectadas al grafo (`proyeccion.py:115-185`) | ✅ + lift de anomalías por ruta | I1 |
| Vigilancia (watchlist) con delta al reabrir | ✅ | ⬜ | ✅ nodos vigilados en la investigación; delta medido al abrir sesión nueva | P8 |
| Export a informe/briefing citado | ✅ | 🔶 Síntesis (informe citado) y dockeo de caminos existen; sin export visual | ✅ + export PNG de exhibit con pie de fuente y deep-link | L2-E8 |
| Geo | ✅ GIS completo | ⬜ | 🔶 mapa **esquemático** local de flujos país→MX (asset empaquetado, cero tiles externos); se declara esquemático, no GIS | P6 |
| Multi-analista en tiempo real | ✅ | 🚫 | 🚫 por diseño (local-first, 1 operador) — trigger en `EVALUACION_ESTANDAR_A.md` §6 | — |
| Escala | Petabytes, millones de objetos | Sesión (miles de nodos) | Igual — **y es la elección que compra el determinismo** | — |
| Soberanía del dato | Cloud/on-prem gestionado por el vendor | ✅ local-first: nada sale sin aprobación | ✅ | — |
| Accesibilidad | No documentada como AAA | 🔶 base decente, teclado incompleto | ✅ AAA: teclado completo, aria-live, modo tabla | L2/§7-A |
| Costo | Contratos enterprise (7-8 cifras/año documentadas en casos públicos) | Costo marginal ~0 | Igual | — |

## 2. Las seis dimensiones donde "superior" es medible

1. **Procedencia.** Palantir traza linaje de datasets; GNOSIS cita al nivel del
   **fragmento de evidencia** y cada mutación queda en bitácora WORM. Medible:
   toda cifra de panel enlaza a sus filas fuente (test de gramática de tarjeta,
   Pista I2).
2. **Reproducibilidad.** "Mismo grafo abre idéntico" es ley con test de doble
   corrida — Palantir no promete render determinista. Medible: igualdad exacta
   de coordenadas y cifras entre corridas.
3. **Honestidad epistémica.** Prohibición ejecutable de montos/confianzas
   inventados (grep de vocabulario prohibido en panel + revisión B5). Ninguna
   plataforma generalista impone esto por construcción.
4. **Soberanía.** Local-first real: el sustrato no hace red sin aprobación;
   exportación completa a JSON auditable (`/api/v1/autogenes/exportar`).
5. **Dominio.** Lentes que responden preguntas aduanales-automotrices
   específicas (broker aduanal, corte de suministro, brecha J/N, lift de
   anomalías) **sin configuración**: en Foundry eso es un proyecto de
   implementación; aquí es el producto.
6. **Accesibilidad.** Meta AAA verificada en dos temas + modo tabla + teclado
   completo. Las herramientas enterprise de grafos rara vez pasan de AA
   parcial.

## 3. La brecha que el plan cierra (y su costo honesto)

Lo que Palantir tiene y GNOSIS no tenía **ni en la propuesta v2**: el flujo de
investigación. La Pista P lo construye en 8 fases (P1–P8, ver propuesta v3),
de las cuales dos son baratas porque el servidor ya está hecho: el what-if
(P3 — `cascada.py` completo, solo falta surfacing) y la paleta de comandos
(P7). Las caras son las facetas con vistas vinculadas (P4, talla L) y el mapa
esquemático (P6, talla M). Ninguna fase de la Pista P compromete las leyes: las
investigaciones se persisten por la única puerta de escritura (Sustrato) y las
notas llevan origen=operador.

## 4. Donde no competimos — por diseño, no por derrota

Multi-analista, GIS profundo, escala petabyte y marketplace de integraciones
quedan fuera. La razón es la misma que sostiene las seis dimensiones de §2: el
determinismo total, la citación al fragmento y el local-first son **posibles
porque** el alcance es una sesión local de un operador. Si el producto pivota
(multi-usuario, SaaS), aplican los triggers de `EVALUACION_ESTANDAR_A.md` §6 y
esta tabla se revisa.
