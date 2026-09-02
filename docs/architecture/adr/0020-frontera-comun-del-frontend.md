# ADR-0020 — El frontend tiene una casa común, y la última petición gana

- **Estado:** aceptada
- **Fecha:** 2026-09-02
- **Vistas afectadas:** [superficies de frontend](../frontend-surfaces.md)
- **Refina:** [ADR-0008](0008-sin-build-step-en-el-frontend.md)

## Contexto

Dos hallazgos que el v01 dejó abiertos con una buena razón —no tocar el
frontend a ciegas— y que el v02 reabrió como R5, junto con el camino para
cerrarlos: **primero la prueba en un navegador de verdad**.

**H13 · Carreras de fetch.** El arreglo C5 —un token de secuencia— se quedó en
`nomos.js`, y solo en su backtest. El censo del v01: `metabolismo.js` 9 fetch
/ 0 guardas, `concilia.js` 5/0, `vinculos.js` 5/0, `validacion.js` 4/0,
`qualia_maquina.js` 4/0… Cambiar de sesión dos veces seguidas hace que la
respuesta lenta de la PRIMERA pinte encima de la segunda: el operador lee
cifras de una sesión bajo el título de otra. Es el peor tipo de defecto de
este repo — **no falla, miente**.

**H14 · `esc()` definido 19 veces.** No era un hallazgo de XSS: la muestra
leída escapaba correctamente. Era de **deriva** — 19 copias acaban
divergiendo, y la que diverja será la que nadie mira. De hecho ya habían
divergido: ninguna copia escapaba la comilla simple, con la que un valor
dentro de un atributo con comillas simples se sale del atributo.

## Decisión

### 1 · `static/gestell_comun.js`, la casa común

`esc` y `fetchUltimo`, en un archivo, sin estado global salvo el registro de
peticiones vivas — que es el estado que el problema exige llevar.

**`fetchUltimo(clave, url)` lleva dos guardas, no una.** `AbortController`
corta la petición anterior en la red (deja de bajar lo que nadie va a mirar y
libera un worker del servidor), y el número de secuencia descarta la respuesta
que aun así llegue tarde. La segunda hace falta porque **abortar es una
carrera en sí misma**: una respuesta ya en vuelo puede resolverse antes de que
el abort la alcance. Con una sola de las dos, el defecto sigue ahí un
porcentaje de las veces — y las pruebas lo ven: en unas corridas el abort gana
y en otras no.

Cuando una petición queda obsoleta, la promesa **no resuelve ni rechaza**: se
queda pendiente a propósito, para que el `.then()` de quien pinta no llegue a
ejecutarse. Un rechazo obligaría a cada superficie a distinguir «error de
verdad» de «guarda funcionando», y esa distinción es justo lo que este módulo
existe para no repartir.

### 2 · La prueba primero, en Chromium de verdad

`tests/test_frontend_carreras.py`. La primera prueba **reproduce el defecto**
sin la guarda; si dejara de reproducirlo, la siguiente no probaría nada.

El escenario **retiene** la respuesta vieja y la suelta cuando la prueba
quiere, en vez de dormir: un `sleep` dentro del manejador de rutas serializa
las dos peticiones —el manejador corre en un solo hilo— y entonces la carrera
no llega a ocurrir y la prueba pasa sin probar nada. Costó dos intentos
descubrirlo.

Las pruebas se saltan solas donde no hay Chromium o Playwright, como
`test_ingesta_ocr` sin Tesseract.

### 3 · Un contrato que el navegador no puede comprobar solo

Sin bundler (ADR-0008) nadie verifica que un `<script>` esté cargado antes de
usarse: se descubre en el navegador del operador, con un `ReferenceError` y un
panel en blanco. `tests/test_frontend_contrato.py` lo comprueba en Python:
quién usa `GestellComun` lo carga, y lo carga ANTES.

### 4 · `check-innerhtml.mjs`: HARD lo que se puede afirmar, SOFT lo demás

- **HARD:** un archivo que interpola dentro de `innerHTML` tiene que tener un
  `esc` a mano. No tenerlo no es olvidarse una vez: es no poder escapar nada.
  La compuerta encontró uno —`constelacion.js`— que interpolaba sin ningún
  escape disponible.
- **SOFT:** las líneas que interpolan sin `esc(` en la misma línea se listan,
  no se rechazan. Las diez que hay hoy están revisadas una a una y son
  correctas (interpolan índices y números). Hacerlas fallar sería una
  compuerta que grita en cada commit, y una compuerta desactivada protege
  menos que ninguna.

## Alcance, dicho con precisión

Se adoptó `fetchUltimo` en las **lecturas que repintan un panel** de seis
superficies (concilia, validación, qualia, qualia_maquina, vínculos,
metabolismo). **No** en las mutaciones: cancelar un POST a media escritura
sería peor que la carrera que evita.

Las copias de `esc` bajaron de 19 a 16, retirando las de las cuatro
superficies que ya cargan la casa común. Las doce restantes viven en
superficies que esta ola no tocó; desmontarlas es un refactor de su propia
ola, y mientras tanto la prueba impide que el número **suba**.

## Verificación

Además de las pruebas: las siete páginas afectadas se cargaron en Chromium
contra la app en marcha. **Cero errores de JavaScript** y todas sus llamadas
de API en 200. Un cambio de frontend sin abrir el navegador no está
verificado, y este repo no tiene manera de fingir que sí.

## Consecuencias

- La superficie deja de poder mentir por una carrera, en las seis adoptadas.
- Hay por fin infraestructura de prueba de navegador en el repo; la siguiente
  ola de frontend ya no empieza de cero.
- Coste: un archivo más que cargar en seis plantillas, y el orden de los
  `<script>` pasa a ser parte del contrato (con prueba que lo vigila).
- **Detectado, fuera de alcance:** `templates/base.html` y `main.html` cargan
  Bootstrap y pdf.js desde CDN. La ley local-first de `CLAUDE.md` dice «cero
  peticiones externas»; en el contenedor de este agente esas peticiones
  fallan y las páginas siguen funcionando, pero en la máquina del operador
  salen a la red. Vendorizarlas es una decisión con peso propio (tamaño del
  repo, actualizaciones) y es del operador.
