"""Contrato del frontend sin build step — R5 (H13/H14) del diagnóstico v02.

El repo no tiene bundler a propósito (ADR-0008), así que nadie comprueba que
un `<script>` esté cargado antes de usarse: se descubre en el navegador del
operador, con un `ReferenceError` y un panel en blanco. Estas pruebas son ese
comprobador, en Python y sin navegador.
"""
import pathlib
import re

ESTATICO = pathlib.Path("static")
PLANTILLAS = pathlib.Path("templates")

#: `esc` fuera de un módulo compartido. 19 copias no era un hallazgo de XSS
#: —la muestra leída escapaba bien— sino de DERIVA: acaban divergiendo, y la
#: que diverja será la que nadie mira.
CASAS_DE_ESC = {"gestell_comun.js", "qualia_comun.js"}


def _scripts_de(plantilla: pathlib.Path) -> set[str]:
    return set(re.findall(r"filename='([^']+\.js)'", plantilla.read_text()))


def _plantillas_que_cargan(nombre: str) -> list[pathlib.Path]:
    return [p for p in PLANTILLAS.glob("*.html") if nombre in _scripts_de(p)]


def test_quien_usa_GestellComun_lo_carga():
    """El fallo que este repo no puede detectar solo: usar el helper sin el
    `<script>` que lo define deja la superficie muerta en el navegador."""
    faltan = []
    for js in ESTATICO.glob("*.js"):
        if js.name == "gestell_comun.js" or "GestellComun" not in js.read_text():
            continue
        for plantilla in _plantillas_que_cargan(js.name):
            if "gestell_comun.js" not in _scripts_de(plantilla):
                faltan.append(f"{plantilla.name} carga {js.name} sin gestell_comun.js")
    assert not faltan, "\n".join(faltan)


def test_gestell_comun_se_carga_ANTES_de_quien_lo_usa():
    """El orden importa sin módulos ES: un script que corre antes de que
    `GestellComun` exista falla en la primera línea que lo toca."""
    malos = []
    for plantilla in PLANTILLAS.glob("*.html"):
        texto = plantilla.read_text()
        if "gestell_comun.js" not in texto:
            continue
        orden = re.findall(r"filename='([^']+\.js)'", texto)
        posicion = orden.index("gestell_comun.js")
        for js in orden[:posicion]:
            ruta = ESTATICO / js
            if ruta.exists() and "GestellComun" in ruta.read_text():
                malos.append(f"{plantilla.name}: {js} se carga antes que gestell_comun.js")
    assert not malos, "\n".join(malos)


def test_las_lecturas_que_repintan_van_por_fetchUltimo():
    """La guarda de H13, fijada donde se puede olvidar: una superficie que
    vuelve a leer un panel sin `fetchUltimo` puede pintar la sesión vieja
    encima de la nueva. Esta lista es la que ya se adoptó; añadir una lectura
    nueva a una de estas superficies exige adoptarla también."""
    adoptadas = {"concilia.js", "validacion.js", "qualia.js", "qualia_maquina.js",
                 "vinculos.js", "metabolismo.js"}
    sin_guarda = []
    for nombre in sorted(adoptadas):
        texto = (ESTATICO / nombre).read_text()
        assert "GestellComun.fetchUltimo" in texto, f"{nombre} perdió la guarda"
        # una GET que pinta se reconoce por el `.then(r => r.json())` pegado
        crudas = re.findall(
            r"fetch\((['\"][^'\"]*api[^'\"]*['\"][^)]*)\)\s*\n?\s*"
            r"\.then\(function \(r\) \{ return r\.json\(\); \}\)", texto)
        if crudas:
            sin_guarda.append(f"{nombre}: {len(crudas)} lectura(s) sin fetchUltimo")
    assert not sin_guarda, "\n".join(sin_guarda)


def test_esc_no_prolifera_mas():
    """H14. No se exige desmontar las 19 copias de golpe —eso es un
    refactor de su propia ola— pero sí que no aparezcan MÁS: el número solo
    puede bajar."""
    copias = [js.name for js in ESTATICO.glob("*.js")
              if re.search(r"function esc\s*\(", js.read_text())]
    assert len(copias) <= 16, (
        f"`esc()` se define en {len(copias)} archivos, más que los 16 que quedan "
        f"tras la ola 9: {sorted(copias)}")
    for casa in CASAS_DE_ESC:
        assert casa in copias, f"{casa} debería definir el `esc` compartido"


def test_el_escape_compartido_cubre_la_comilla_simple():
    """La copia de `qualia_comun.js` no escapaba `'`: un valor dentro de un
    atributo con comillas simples se sale del atributo. El de la casa nueva
    sí, y esta prueba lo fija."""
    fuente = (ESTATICO / "gestell_comun.js").read_text()
    assert "&#39;" in fuente
    for caracter in ("&amp;", "&lt;", "&gt;", "&quot;"):
        assert caracter in fuente
