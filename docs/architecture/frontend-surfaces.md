# Mapa de superficies frontend

> **Nivel:** Suplementario (no C4) — **Notación:** Tablas + reglas del design system
> **Pregunta que responde:** ¿Qué superficies visuales existen, qué pregunta responde cada una y con qué ley visual se dibuja?
> **Leyenda:** Cada fila: superficie · ruta · renderizador · pregunta que responde.
> **ADR:** [ADR-0008](adr/0008-sin-build-step-en-el-frontend.md)
> **Índice de vistas:** [docs/architecture/README.md](README.md)

**Nota de la vista.** El frontend es la mitad del sistema y C4 no tiene un nivel para él; esta vista es el complemento declarado, no un nivel C4 disfrazado.

La mitad del sistema es visual. Cada superficie declara su **medio** (canvas
2D para campos densos y continuos; **SVG para diagramas** — donde el texto
truncado debe ser estructuralmente imposible; DOM para formas documentales)
y su **forma visual**. Todo color sale de tokens; el cambio de tema no
redibuja. Ningún render usa `Math.random` — el mismo grafo abre idéntico.

### Núcleo AUTOGENES

| Superficie | Ruta | JS | Medio | Forma visual | Datos |
|---|---|---|---|---|---|
| Constelación (landing) | `/autogenes` | `constelacion.js` | SVG | Constelación de figuras vivas, una por motor, con su métrica citada | `estado.py` |
| Radar | `/autogenes/radar` | `metabolismo.js` | canvas | Pools y reacciones del caso (Fuente→…→Producto), fugas accionables + urgencias | `metabolismo.py` |
| Vínculos (grafo) | `/autogenes/grafo`, `/vinculos` | `fuerzas.js` + `grafo.js` (+`vinculos.js`) | canvas | Grafo fuerza-dirigida **determinista**; Δ-nodos de descuadre; ghost-ink de dispuestos; deep-link `#n=` | `proyeccion.py` |
| Ingesta | `/autogenes/ingesta` | `chord.js` + `ingesta.js` | canvas + DOM | Acorde bipartito documento↔entidad; goteo de ZIP con manifiesto | `chord_ingesta.py`, `lotes.py` |
| Síntesis | `/autogenes/sintesis` | `sintesis.js` | canvas | Informe ejecutivo citado sobre hechos medidos | `informe.py`, `hechos.py` |
| CRONOS | `/autogenes/cronos` | `cronos.js` | canvas | Time-travel aditivo de la bitácora | `cronos.py` |
| Expediente | `/autogenes/expediente/<id>` | — (print-first) | DOM | Documento de defensa imprimible (`@media print`) con sello sha256 y cobertura | producto dockeado |

### Studio QUALIA (OODA)

Siete instrumentos canvas + dos capas compartidas: `qualia_dossier.js` (el
**cajón de dossier** con selección `?sel` que persiste entre pestañas) y
`qualia_export.js` (PNG/CSV).

| Instrumento | Fase OODA | Forma visual |
|---|---|---|
| `qualia.js` | OBSERVAR | Tablero de anomalías vs base medida |
| `qualia_terreno.js` | OBSERVAR | Terreno de anomalías |
| `qualia_orbe.js` | ORIENTAR | Orbe de centralidad (masas) |
| `qualia_cuerdas.js` | ORIENTAR | Cuerdas de comunidades |
| `qualia_deriva.js` | ORIENTAR | Deriva entre sesiones (drift) |
| `qualia_cascada.js` | DECIDIR | Cascada simulada (¿qué cae si cae X?) |
| `qualia_horizonte.js` | ACTUAR | Horizonte de eventos + telemetría de intervenciones |
| `qualia_maquina.js` | el bucle | La máquina OODA completa |

### Flujo de descuadre (investigación)

| Superficie | JS | Medio | Forma visual | Datos |
|---|---|---|---|---|
| CONCILIA | `concilia.js` + `ciclo_vida.js` + `control.js` | **SVG** + DOM | **Escalera de derivaciones P&ID**: espina VENDIDO→CONCILIADO→LLEGADO, cada fuga una estación FG con monto real; ciclo de vida O1 (ledger, filtros, ≠); cartas SPC | `concilia.py`, `control.py` |
| VALIDACIÓN | `validacion.js` + `ciclo_vida.js` + `control.js` | **SVG** + DOM | **Lattice de conformidad**: ⊤=U por dos rieles (DWH/PDF), tamices por estrato de veredicto, ⊥=⋂ V̄ᵣ; **retícula héroe** (una celda por fila, peor veredicto); ciclo O1 en la ficha; cartas SPC | `validacion.py`, `nomos.py`, `control.py` |
| NOMOS | `nomos.js` + `ciclo_vida.js` | canvas + DOM | **Neurona McCulloch-Pitts** de la regla (entradas→Σ→umbral→veredicto); P&L; backtest histórico; ciclo O1 | `nomos.py` |
| SINAPSIS | `sinapsis.js` | canvas + DOM | **Diamante del lattice de particiones** (⊤ → P·CONCILIA / P·VALIDACIÓN → ínfimo P∧P); tarjetas insight con cadena de composición; volante «formalizar regla» | `sinapsis.py` |
| VIN → dossier | `vin_dossier.js` | DOM | Todo VIN citado es enlace al cajón de dossier compartido; `?sel=` lo auto-abre | `consultas.py` |

### Tableros VW (negocio) y shell

| Superficie | JS | Medio | Forma visual |
|---|---|---|---|
| TBV-01 Dominio | `tbv_dominio.js` | canvas | Dominio de mercado por marca/modelo |
| TBV-02 Maduración | `tbv_maduracion.js` | canvas | Curvas de maduración de pedimentos |
| TBV-03 Rutas | `tbv_rutas.js` | canvas + OSM | Mapa de teselas con arcos de flujo por volumen |
| TBV-04 Rechazos | `tbv_rechazos.js` | canvas | Análisis de rechazos |
| TBV-05 Cupo | `tbv_cupo.js` | canvas | Consumo/proyección de cupos (`cupos_what_if`, método declarado) |
| Dashboard | `veredicto.js` + `constelacion.js` | SVG | Franja de veredicto + constelación |
| Chat Gnosis·IA | `chat.js` | DOM | Conversación con tools, render escapado contra XSS |
| Errores | — | DOM | Panel de curación de `facturas_errores` |

### Design system — GESTELL/PANOPTES (leyes visuales)

- **Solo tokens** (`static/styles.css`): cero hex/px crudos en componentes.
  Dos temas (Nocturne oscuro / Daylight claro) con contraste **AAA en
  ambos**; el toggle no redibuja porque el color vive en CSS.
- **Magenta disciplinado**: SOLO vía `--danger`/`--telos-on` — magenta =
  alerta real (violación, contradicción ≠), jamás decoración.
- **Motion desde tokens**; sin flashes >5 Hz; `prefers-reduced-motion`
  degrada a estático. Glows se apagan en Daylight (el trazo basta).
- **Accesibilidad**: severidad y estado siempre como TEXTO además de color;
  blancos de clic accesibles por teclado (`tabindex`, `role=button`);
  `aria-label` en todo diagrama.
- **Sin build step** (decisión registrada en `docs/EVALUACION_ESTANDAR_A.md`):
  JS vanilla servido por Jinja; nada de React/TS/Vite/Tailwind/bundler.
