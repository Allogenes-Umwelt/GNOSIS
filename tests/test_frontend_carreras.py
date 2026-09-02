"""Spec de las CARRERAS DE FETCH en el navegador — R5 (H13) del v02.

El arreglo C5 —un token de secuencia— se quedó en `nomos.js`, y solo en su
backtest. El resto de superficies no tenía guarda: cambiar de sesión dos veces
seguidas hace que la respuesta lenta de la PRIMERA pinte encima de la segunda,
y el operador lee cifras de una sesión bajo el título de otra. Es el peor tipo
de defecto de este repo: no falla, MIENTE.

Opus dejó H13 abierto por una razón buena —no tocar el frontend a ciegas— y el
v02 pidió el camino: primero la prueba en un navegador de verdad, después el
arreglo. Esto es esa prueba.

Chromium viene en el contenedor; el paquete `playwright` de Python puede no
estar, y entonces esto se salta como `test_ingesta_ocr` sin Tesseract.
"""
import json
import os

import pytest

pw = pytest.importorskip("playwright.sync_api", reason="playwright no instalado")

#: El contenedor trae Chromium en una versión distinta de la que el paquete
#: espera por defecto, así que se apunta al binario real (ver AGENTS/entorno).
CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

pytestmark = pytest.mark.skipif(
    not os.path.exists(CHROMIUM), reason="Chromium no está en este contenedor")


@pytest.fixture(scope="module")
def navegador():
    with pw.sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROMIUM)
        yield b
        b.close()


@pytest.fixture()
def pagina(navegador):
    """Una página con `gestell_comun.js` cargado y un hueco donde pintar.

    Se sirve desde un origen ficticio, interceptado por Playwright: sin él la
    página vive en `about:blank` y una URL relativa como `/api/x` no se puede
    resolver. No hace falta levantar el servidor — lo que se prueba es la
    guarda del navegador, no la ruta de Flask."""
    ctx = navegador.new_context()
    pg = ctx.new_page()
    fuente = open("static/gestell_comun.js", encoding="utf-8").read()
    pg.route("**/panel", lambda route: route.fulfill(
        status=200, content_type="text/html",
        body="<html><body><div id='panel'>vacio</div></body></html>"))
    pg.goto("http://gnosis.test/panel")
    pg.add_script_tag(content=fuente)
    yield pg
    ctx.close()


class Servidor:
    """Sirve /api/x?s=N y deja RETENER una respuesta para soltarla después.

    Retener en vez de dormir: un `sleep` dentro del manejador de rutas serializa
    las dos peticiones —el manejador corre en un solo hilo— y entonces la
    carrera no llega a ocurrir y la prueba pasa sin probar nada. Reteniendo, el
    orden de llegada lo decide la prueba, y es exactamente el del defecto: la
    respuesta de la sesión vieja aterriza DESPUÉS de la nueva.
    """

    def __init__(self, pagina, respuestas, retener=()):
        self.respuestas = respuestas
        self.retenidas = {}
        self.retener = set(retener)
        pagina.route("**/api/x*", self._manejar)

    def _manejar(self, route):
        from urllib.parse import parse_qs, urlparse
        s = parse_qs(urlparse(route.request.url).query)["s"][0]
        if s in self.retener:
            self.retenidas[s] = route
            return
        self._responder(route, s)

    def _responder(self, route, s):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(self.respuestas[s]))

    def soltar(self, s) -> bool:
        """Suelta la respuesta retenida. Devuelve False si nunca llegó a
        retenerse: con la guarda puesta, el abort puede matar la petición
        ANTES de que toque el manejador — que es el mejor desenlace posible,
        no un fallo de la prueba."""
        route = self.retenidas.pop(s, None)
        if route is None:
            return False
        self._responder(route, s)
        return True


CARRERA = """
  window.pintado = [];
  function pedir(sesion) {
    return %s
  }
  pedir('1'); pedir('2');
"""

CON_GUARDA = """GestellComun.fetchUltimo('panel', '/api/x?s=' + sesion)
      .then(function (d) {
        window.pintado.push(d.sesion);
        document.getElementById('panel').textContent = d.sesion;
      });"""

SIN_GUARDA = """fetch('/api/x?s=' + sesion).then(function (r) { return r.json(); })
      .then(function (d) {
        window.pintado.push(d.sesion);
        document.getElementById('panel').textContent = d.sesion;
      });"""


def test_la_respuesta_lenta_de_la_sesion_vieja_pinta_encima_SIN_guarda(pagina):
    """Primero se REPRODUCE el defecto: sin guarda, la sesión 1 —lenta— gana
    la pantalla aunque el operador ya esté mirando la 2. Si este escenario
    dejara de reproducir la carrera, la prueba de abajo no probaría nada."""
    srv = Servidor(pagina, {"1": {"sesion": "uno"}, "2": {"sesion": "dos"}},
                   retener=["1"])
    pagina.evaluate(CARRERA % SIN_GUARDA)
    pagina.wait_for_function("window.pintado.length === 1", timeout=5000)
    assert pagina.inner_text("#panel") == "dos"

    srv.soltar("1")                      # la vieja aterriza tarde
    pagina.wait_for_function("window.pintado.length === 2", timeout=5000)

    assert pagina.evaluate("window.pintado") == ["dos", "uno"]
    assert pagina.inner_text("#panel") == "uno", (
        "el escenario no reprodujo la carrera")


def test_con_fetchUltimo_la_respuesta_vieja_no_pinta(pagina):
    """La guarda: la última petición de la clave gana, siempre."""
    srv = Servidor(pagina, {"1": {"sesion": "uno"}, "2": {"sesion": "dos"}},
                   retener=["1"])
    pagina.evaluate(CARRERA % CON_GUARDA)
    pagina.wait_for_function("window.pintado.length === 1", timeout=5000)
    # el MISMO escenario de arriba. Si el abort ya se llevó la petición vieja,
    # no hay nada que soltar: las dos formas de no pintarla valen.
    srv.soltar("1")
    pagina.wait_for_timeout(300)

    assert pagina.evaluate("window.pintado") == ["dos"]
    assert pagina.inner_text("#panel") == "dos"


def test_la_peticion_vieja_se_aborta_en_la_red(pagina):
    """No solo se descarta la respuesta: se corta la petición. Descartarla al
    llegar ya bastaría para no mentir, pero seguir bajando lo que nadie va a
    mirar cuesta ancho de banda y un worker del servidor."""
    abortadas = []
    pagina.on("requestfailed", lambda r: abortadas.append(r.url))
    Servidor(pagina, {"1": {"sesion": "uno"}, "2": {"sesion": "dos"}},
             retener=["1"])
    pagina.evaluate(CARRERA % CON_GUARDA)
    pagina.wait_for_timeout(500)

    assert any("s=1" in u for u in abortadas), "la petición vieja siguió viva"


def test_claves_distintas_no_se_estorban(pagina):
    """Dos paneles que piden a la vez no pueden cancelarse entre ellos: la
    clave agrupa lo que compite por el MISMO hueco de pantalla."""
    Servidor(pagina, {"1": {"sesion": "uno"}, "2": {"sesion": "dos"}})
    pagina.evaluate("""
      window.pintado = [];
      GestellComun.fetchUltimo('panel_a', '/api/x?s=1')
        .then(function (d) { window.pintado.push('a:' + d.sesion); });
      GestellComun.fetchUltimo('panel_b', '/api/x?s=2')
        .then(function (d) { window.pintado.push('b:' + d.sesion); });
    """)
    pagina.wait_for_function("window.pintado.length === 2", timeout=5000)
    assert sorted(pagina.evaluate("window.pintado")) == ["a:uno", "b:dos"]


def test_cancelar_invalida_lo_que_este_en_vuelo(pagina):
    """Cuando la superficie se desmonta o el operador cancela."""
    srv = Servidor(pagina, {"1": {"sesion": "uno"}}, retener=["1"])
    pagina.evaluate("""
      window.pintado = [];
      GestellComun.fetchUltimo('panel', '/api/x?s=1')
        .then(function (d) { window.pintado.push(d.sesion); });
      GestellComun.cancelar('panel');
    """)
    pagina.wait_for_timeout(200)
    srv.soltar("1")
    pagina.wait_for_timeout(300)
    assert pagina.evaluate("window.pintado") == []


def test_un_error_de_verdad_SI_se_propaga(pagina):
    """La guarda no puede tragarse los errores reales: un 500 en la petición
    vigente tiene que llegar a quien pinta, o el panel se queda mudo."""
    pagina.route("**/api/roto*", lambda route: route.fulfill(
        status=500, content_type="application/json", body="{}"))
    pagina.evaluate("""
      window.error = null;
      GestellComun.fetchUltimo('panel', '/api/roto')
        .catch(function (e) { window.error = String(e); });
    """)
    pagina.wait_for_function("window.error !== null", timeout=5000)
    assert "500" in pagina.evaluate("window.error")
