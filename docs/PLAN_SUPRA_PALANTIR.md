# PLAN SUPRA-PALANTIR — Analítica que eleva a AUTOGENES por encima de Foundry/Gotham

**Estado:** propuesta para aprobación del operador (regla de trabajo: dirección
antes de código). Nada de este documento se construye sin visto bueno.

---

## Tesis

Palantir gana por cuatro cosas: ontología viva, linaje de datos, simulación
what-if y orquestación de IA sobre la ontología (AIP). AUTOGENES ya tiene el
núcleo de las cuatro — en pequeño, pero con tres ventajas estructurales que
Palantir **no puede** copiar sin romper su modelo de negocio:

1. **Soberanía total** — local-first, SQLite en el escritorio del operador.
   En Palantir los datos viven en su nube; aquí no salen de la máquina.
2. **Honestidad verificable como arquitectura** — la ley de procedencia se
   aplica EN SERVIDOR (saneadores), los montos jamás se estiman ni se
   convierten, y lo desconocido se declara. Foundry muestra números; AUTOGENES
   muestra números **con su prueba adjunta y su incertidumbre declarada**.
3. **Confidencialidad ante el modelo** — la ofuscación reversible de
   identificadores (chasis/factura/pedimento) significa que la IA trabaja sin
   ver lo sensible. AIP manda los datos al modelo; nosotros no.

La estrategia no es igualar el catálogo de Palantir (imposible y innecesario):
es **profundizar donde ellos son genéricos** (el dominio aduanal-automotriz) y
**hacer estructural lo que en ellos es promesa comercial** (procedencia,
reproducibilidad, gobernanza de la IA).

Cada propuesta indica sobre qué módulo existente se construye, qué entrega,
su tamaño (S/M/L/XL) y contra qué capacidad de Palantir compite.

---

## OLA A — Profundidad analítica (los motores que faltan encima de lo medido)

### A1 · DIKTYON — resolución de entidades inter-sesión con adjudicación HITL
- **Sobre:** `sustrato.py` (upsert aditivo), `proyeccion.py`, bitácora WORM.
- **Qué es:** el mismo proveedor/agente aduanal aparece con variantes de
  nombre entre sesiones. Un motor puro propone candidatos a fusión (por alias,
  RFC, evidencia compartida) con un **score explicable** (no ML opaco:
  coincidencias contadas); el operador adjudica en una cola de decisión y la
  fusión queda en bitácora, reversible por CRONOS.
- **Entrega:** identidad longitudinal — "este proveedor, a través de 14
  sesiones" — que hoy no existe.
- **vs Palantir:** su entity resolution es caja negra; la nuestra es
  aritmética citada + decisión humana registrada. **Tamaño: L.**

### A2 · SERIE — estacionalidad y tendencia del flujo aduanal
- **Sobre:** `anomalias.py` (ya trae autocorrelación), CRONOS (`created_at`),
  las tablas aduanales por sesión.
- **Qué es:** series temporales por marca/país/aduana/moneda: tendencia,
  estacionalidad medida por autocorrelación, y bandas de variación históricas
  (percentiles reales, no intervalos inventados). Sin pronóstico puntual —
  **rangos observados**, que es lo defendible.
- **Entrega:** "septiembre concentra históricamente el 22% del volumen BRA"
  con las sesiones exactas que lo sostienen.
- **vs Palantir:** Foundry haría un forecast; nosotros damos el hecho medido
  que un auditor no puede rebatir. **Tamaño: M.**

### A3 · CONTROL — cartas de control del proceso aduanal (SPC)
- **Sobre:** QUALIA snapshots (`registrar_snapshot`), `validacion.py`
  (`conformidad_pct`), CONCILIA (hallazgos por sesión).
- **Qué es:** control estadístico de proceso clásico (media móvil, límites por
  desviación medida) sobre las métricas por sesión: conformidad, % faltantes,
  % extracción fallida, valor en riesgo por divisa. Señala **cuándo el proceso
  cambió**, no solo cuánto mide hoy.
- **Entrega:** "la conformidad lleva 3 sesiones fuera de su banda histórica"
  — accionable antes de que el SAT lo note.
- **vs Palantir:** es la misma matemática que usan las plantas de VW (SPC);
  hablar el idioma de calidad del cliente vale más que un dashboard genérico.
  **Tamaño: S.**

### A4 · COBERTURA — el índice de evidencia (qué tan probado está el caso)
- **Sobre:** `sustrato.py`, `metabolismo.py`, `senales.py` (fuentes frías).
- **Qué es:** una métrica de primera clase por entidad/hallazgo/caso: cuántas
  citas lo sostienen, de cuántas fuentes independientes, qué fracción del
  valor en riesgo está amparada por documento legible. El complemento se
  declara: "el 12% del valor de esta sesión se sostiene en PDFs ilegibles".
- **Entrega:** el "score de defendibilidad" del dossier — antes de ir al SAT
  sabes exactamente qué flancos están débiles.
- **vs Palantir:** ellos no exponen la fragilidad de su propia evidencia;
  para nosotros es el producto. **Tamaño: S.**

### A5 · PALANCA — causa-efecto medido de las intervenciones del operador
- **Sobre:** `horizonte.py` (ya mide deltas alrededor de intervenciones),
  bitácora WORM, TBV.
- **Qué es:** un libro mayor de intervenciones: cada acción del operador
  (regla nueva, fusión, corrección) se cruza con el delta medido de las
  métricas de negocio antes/después (método de `horizonte`, nunca
  interpolado). Ranking de qué acciones movieron la aguja.
- **Entrega:** "activar la regla NOMOS-7 redujo las disputas J/N de 41 a 9
  en dos sesiones" — el ROI del propio sistema, automedido.
- **vs Palantir:** su "impact analysis" es narrativa de venta; el nuestro es
  el delta de la bitácora. **Tamaño: M.**

### A6 · ESCENARIOS — what-if de negocio sobre la cascada
- **Sobre:** `cascada.py` (deducción destructiva / inducción creativa),
  TBV-03 rutas, cupos (F9 ola 2 ya tiene what-if de cupos).
- **Qué es:** extender la cascada del grafo a preguntas de negocio: ¿qué
  pierde el caso si la aduana X se cierra? (qué rutas, qué valor por divisa,
  qué entidades quedan huérfanas); ¿qué se conecta si el proveedor A absorbe
  al B? Simulación en memoria del grafo PROPIO — jamás predicción del mundo.
- **Entrega:** planeación de contingencia con números reales del caso.
- **vs Palantir:** mismo tipo de simulación que Foundry, pero cada onda de la
  cascada es auditable nodo por nodo. **Tamaño: M.**

### A7 · NOMOS ola 2 — minería de reglas propuestas (el volante insight→regla)
- **Sobre:** `nomos.py`, `sinapsis.py` (el volante quedó apuntado en F11),
  historial de violaciones.
- **Qué es:** un minero determinista de patrones frecuentes sobre las filas
  violadoras históricas (conteo de co-ocurrencias campo=valor, soporte real)
  que PROPONE reglas candidatas ("BRA + aduana Colombia + moneda USD viola X
  en 9 de 9 casos"). El operador acepta/rechaza; lo aceptado entra como
  neurona M-P normal.
- **Entrega:** el sistema aprende reglas SIN machine learning opaco: patrones
  contados, umbral explícito, decisión humana.
- **vs Palantir:** AIP sugiere con LLM; nosotros con aritmética reproducible
  + HITL. **Tamaño: M.**

### A8 · DOSSIER 2.0 — el expediente de defensa autoensamblado
- **Sobre:** informe/`sanear_informe`, CONCILIA (referencias por hallazgo),
  COBERTURA (A4), export PDF (ya dominamos el render).
- **Qué es:** por cada hallazgo o requerimiento del SAT, un botón que
  ensambla el expediente completo: el hecho, las filas exactas, los PDFs
  fuente con página citada, la regla violada, el índice de cobertura y la
  cronología CRONOS de cuándo se supo qué. Exportable como PDF firmado con
  hash del bundle.
- **Entrega:** de "junta de pánico + semana de PDFs" a un expediente en
  minutos.
- **vs Palantir:** este es el entregable que el equipo legal/aduanal toca;
  Foundry no baja a este grano de dominio. **Tamaño: M.**

---

## OLA B — Paridad Palantir, hecha honesta

### B1 · RAMAS — hipótesis como branch del grafo (el Foundry branching, local)
- **Sobre:** CRONOS (reconstrucción aditiva), `cascada.py`, sustrato.
- **Qué es:** una capa de superposición (overlay) donde el operador ensaya
  mutaciones — fusiones, reglas, correcciones — sin tocar el sustrato real;
  el diff rama-vs-verdad se calcula con la misma maquinaria de CRONOS; aplicar
  la rama = replay de operaciones aditivas por la puerta única del sustrato.
- **Entrega:** "¿qué pasaría con mis hallazgos si esta corrección es cierta?"
  sin riesgo, con diff exacto.
- **vs Palantir:** branching de datasets es SU feature estrella en Foundry —
  tenerlo local y citado lo neutraliza. **Tamaño: L.**

### B2 · CASOS — el expediente de investigación (port del D3 de KARELEN)
- **Sobre:** `ref_karelen/features/casos`, productos, sustrato.
- **Qué es:** archivos de investigación que anclan entidades/fuentes/productos
  por id + notas del operador; todo lo demás deriva vivo del grafo. Un caso =
  un requerimiento SAT, una disputa de proveedor, una auditoría interna.
- **Entrega:** la unidad de trabajo de un equipo de investigación — lo que
  Gotham llama "investigation".
- **vs Palantir:** ya está diseñado y probado en KARELEN; es port, no
  invención. **Tamaño: M.**

### B3 · CENTINELA — alertas continuas por umbral del operador
- **Sobre:** `senales.py` (Radar), motores puros (todos leen por sesión),
  el contenedor de escritorio (ya corre como servicio).
- **Qué es:** suscripciones declarativas del operador ("avísame si el valor
  en riesgo MXN supera X", "si aparece un VIN duplicado", "si una fuente
  lleva 7 días fría"). Al ingerir una sesión, un pase de centinela corre los
  motores, hace diff contra la anterior y dispara las alertas cumplidas — en
  la campana del Radar y opcionalmente por correo local.
- **Entrega:** el sistema vigila solo; el operador atiende excepciones.
- **vs Palantir:** paridad con sus "alert rules", sin nube. **Tamaño: M.**

### B4 · TERRITORIO — la capa geo del grafo de evidencia
- **Sobre:** TBV-03 (tiles OSM + coordenadas oficiales SEMAR ya integradas),
  `proyeccion.py`, eventos.
- **Qué es:** geo-anclar las entidades del grafo (aduanas ya están;
  proveedores/plantas por dirección citada en documento) y proyectar
  hallazgos/flujos sobre el mapa: el valor en disputa POR aduana, la ruta de
  un embarque como camino citado sobre territorio.
- **Entrega:** la vista Gotham-style de mapa+grafo, con la ley de cita.
- **vs Palantir:** su geo es fortísimo; no competimos en imágenes satelitales
  — competimos en que cada pin cita su documento. **Tamaño: M.**

### B5 · KYBERNES — el agente investigador con dimmer de autonomía (D6)
- **Sobre:** `extraccion.py` (propuesta + integración saneada ya separadas),
  quórum, el diseño `proponer_plan` de KARELEN (vocabulario cerrado ADITIVO;
  deletes jamás delegados).
- **Qué es:** el agente recibe un objetivo ("prepara el caso del requerimiento
  X"), PROPONE un plan de operaciones del vocabulario cerrado (ingerir,
  extraer, vincular, dockear), y el dimmer del operador decide qué nivel corre
  solo y qué requiere aprobación por paso. Todo plan y toda ejecución quedan
  en bitácora.
- **Entrega:** el equivalente de AIP Agents, gobernado en el dispositivo.
- **vs Palantir:** la gobernanza de agentes es SU tema débil frente a
  auditores; la nuestra es verificable línea por línea. **Tamaño: L.**

### B6 · FEDERACIÓN GESTELL — inteligencia entre instancias sin ceder datos
- **Sobre:** export/import de bundle JSON saneado (transversal 7 de la ruta),
  ofuscación (fichas estables), COBERTURA (A4).
- **Qué es:** dos instancias GNOSIS (p. ej. dos agencias aduanales del grupo)
  intercambian bundles SANEADOS: estructuras, hallazgos agregados y entidades
  públicas viajan; identificadores sensibles viajan como fichas irreversibles
  fuera de su instancia. Cada instancia decide qué exporta.
- **Entrega:** benchmark entre plantas/agencias sin centralizar datos — la
  anti-nube.
- **vs Palantir:** su modelo ES la centralización; esto invierte el tablero.
  **Tamaño: XL (Fase II real).**

---

## OLA C — Lo que nadie más puede firmar

### C1 · SELLO — certificado de reproducibilidad por número
- **Sobre:** motores puros y deterministas (ley de diseño ya cumplida:
  topología sin numpy por determinismo), bitácora.
- **Qué es:** todo número visible lleva un sello re-derivable: qué motor, qué
  entradas (ids), qué versión de código, y un hash del resultado. Un endpoint
  `verificar` re-ejecuta el motor y confirma el hash. El PDF del dossier
  imprime los sellos.
- **Entrega:** auditoría de terceros SIN acceso a los datos: "re-córranlo,
  les dará el mismo hash".
- **vs Palantir:** irreplicable para ellos — sus pipelines no son
  deterministas ni auditables externamente. Es nuestra firma. **Tamaño: M.**

### C2 · LO-NO-SABIDO — el dashboard de ignorancia declarada
- **Sobre:** todo lo que ya se declara (sin precio, extracción fallida,
  fuentes frías, quorum=False, reglas no evaluables) hoy disperso.
- **Qué es:** una vista única que agrega TODO lo que el sistema sabe que no
  sabe, monetizado donde se puede (valor de las filas sin amparo legible) y
  priorizado por COBERTURA. Es el anti-dashboard: mide la sombra.
- **Entrega:** la lista de trabajo con mayor retorno: cada punto resuelto
  sube la defendibilidad medible del caso.
- **vs Palantir:** ningún vendor muestra su ignorancia; para un auditor, que
  el sistema la declare ES la credibilidad. **Tamaño: S.**

### C3 · QUÓRUM VISIBLE — el desacuerdo entre modelos como señal
- **Sobre:** `quorum.py` (ya corre doble modelo y marca quorum por entidad).
- **Qué es:** elevar el desacuerdo a analítica: qué campos/documentos generan
  más discrepancia entre modelos (proxy honesto de ambigüedad del documento),
  y usar ese ranking para priorizar revisión humana.
- **Entrega:** el esfuerzo de curación va exactamente donde los modelos
  dudan.
- **vs Palantir:** AIP oculta la varianza del modelo; nosotros la cobramos
  como señal. **Tamaño: S.**

---

## Ruta recomendada (90 días de trabajo efectivo)

La lógica: primero lo que multiplica la defendibilidad con poco esfuerzo
(S/M sobre motores existentes), después las piezas de paridad, al final lo
federado.

```
Sprint 1 (quick wins, todo S/M):  A4 COBERTURA → C2 LO-NO-SABIDO → A3 CONTROL → C3 QUÓRUM
Sprint 2 (dominio profundo):      A2 SERIE → A8 DOSSIER 2.0 → A5 PALANCA
Sprint 3 (paridad visible):       B2 CASOS → B3 CENTINELA → B4 TERRITORIO
Sprint 4 (los grandes):           A1 DIKTYON → A7 NOMOS ola 2 → A6 ESCENARIOS
Sprint 5 (la firma):              C1 SELLO → B1 RAMAS
Fase II:                          B5 KYBERNES → B6 FEDERACIÓN
```

Dependencias duras: A8 y C2 consumen A4 · A5 consume A3 (bandas) · B1
consume CRONOS tal cual está · C1 conviene antes de B6 (los bundles viajan
sellados).

## Leyes que este plan NO negocia

Todo lo anterior hereda las leyes vigentes: cero snake oil (ningún número
inventado; rangos observados, no pronósticos puntuales), montos por divisa
sin conversión, procedencia saneada en servidor, ofuscación de
identificadores hacia cualquier modelo, escritura solo por el sustrato,
deletes jamás delegados, y el pipeline legado no se toca.
