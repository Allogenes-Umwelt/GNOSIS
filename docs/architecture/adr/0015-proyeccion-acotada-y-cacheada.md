# ADR-0015 — La proyección se cachea, no construye lo que va a tirar, y declara lo que recorta

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [componentes AUTOGENES](../components/autogenes.md), [modelo de datos](../data-model.md)
- **Refina:** [ADR-0006](0006-proyeccion-en-tiempo-de-lectura.md)

## Contexto

ADR-0006 decidió proyectar el dato aduanal **en tiempo de lectura** para no
tener dos verdades. La consecuencia era que cada lectura lo pagaba entero, y
a escala eso dejó de ser barato (`docs/DIAGNOSTICO_FABLE_v02.md` §1, S2/S3).
Medido con 8 000 documentos:

- `construir_grafo` devolvía **20 001 nodos** (16 000 artefactos y
  fragmentos) en 1,16 s;
- `red_de_sesion` en lente **negocio** construía esa capa documental entera
  y **la tiraba** — 0,98 s para devolver los nodos de negocio;
- nadie cacheaba nada, así que lo pagaban la lente, el snapshot QUALIA, el
  metabolismo, el chord y cada tool del chat que tocara el grafo;
- el lienzo recibía los documentos sin tope: 5 000 PDFs son 20 000 nodos en
  el JSON y en la simulación de fuerzas del navegador.

## Decisión

1. **No construir lo que se va a descartar.** `incluir_documental=False` no
   consulta artefactos ni fragmentos. La lente de negocio lo usa.
2. **Cachear por versión.** La proyección es pura y determinista
   (ADR-0006), así que mientras `version_de_sesion` no se mueva el resultado
   es idéntico. Mismo patrón que `autogenes/red.py` ya usaba para la lente
   NetworkX.
3. **Acotar declarando.** `limite_documentos` recorta los artefactos y emite
   un nodo `agregado` con el resto (`+7 800 documentos`). El mismo contrato
   honesto que `arbol_ontologia` ya aplicaba con `MAX_HOJAS_POR_RAMA`: un
   lienzo que muestra 200 de 5 000 sin decirlo miente.

## Frontera de la caché — declarada

**Solo se cachean bases en ARCHIVO.** `version_de_sesion` incluye la ruta, y
todas las bases en memoria dicen `:memory:`: dos bases distintas con los
mismos conteos compartirían clave y una serviría el grafo de la otra. Es
exactamente la colisión contra la que `red.py` ya avisaba. En producción la
base siempre es un archivo, así que la caché aplica donde importa y no puede
mentir donde no aplica. Lo encontró una prueba existente
(`test_vehiculo_con_pedimento_cross_sesion_se_ancla_al_nucleo`), no el
razonamiento — vale la pena anotarlo.

## Resultado medido (8 000 documentos)

| | Antes | Después |
|---|---|---|
| Proyección completa | 1,16 s | 0,80 s (frío) · **0,8 ms** (caché) |
| Lente de negocio | 0,98 s | **0,02 s** |
| `registrar_snapshot` | 1,06 s | **0,00 s** |
| Lienzo | 20 001 nodos | **402**, con el resto declarado |

## Consecuencias

- La ley de "una sola verdad" de ADR-0006 se conserva: la caché se invalida
  con la versión, no con el reloj. Una mutación la tira.
- La caché es de proceso: con dos workers de gunicorn cada uno tiene la
  suya, y ambas son correctas porque la clave incluye la versión.
- Cambiar el tope del lienzo cambia lo que se ve, nunca lo que se afirma: el
  nodo agregado lleva el número recortado.
