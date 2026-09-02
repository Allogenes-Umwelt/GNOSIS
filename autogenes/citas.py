"""Verificación de citas con span — hallazgo G4 del diagnóstico v02.

La procedencia era de PÁGINA: `evidencia` es una lista de ids de fragmento, y
un fragmento puede tener 12 000 caracteres. La cita era cierta y a la vez
inútil — señalaba dónde buscar, no qué se dijo.

Con `{fragmento_id, inicio, fin}` la cita señala el trozo. Y, sobre todo, se
puede COMPROBAR: el saneador exige que el texto citado exista de verdad en el
fragmento. Eso convierte el span en algo más que una comodidad de pantalla —
es una defensa contra la fabricación, que es exactamente lo que la ley de
procedencia persigue. Un modelo puede citar el id correcto y atribuirle una
frase que no está; un span verificado no.

La comparación es tolerante con el ESPACIO (un extractor colapsa saltos de
línea) y estricta con todo lo demás.
"""
from typing import Iterable, Optional

from autogenes.tipos import Cita

#: Un span más largo que esto no es una cita, es un volcado del fragmento.
MAX_SPAN = 400


def _plano(texto: str) -> str:
    """El texto con el espacio colapsado, para comparar sin depender de cómo
    el extractor partió las líneas."""
    return " ".join((texto or "").split())


def verificar(cita: Cita, texto_fragmento: str) -> Optional[Cita]:
    """La cita con su span REAL, o `None` si no se sostiene.

    Se acepta por dos caminos, en este orden:
    1. Las coordenadas apuntan al texto que la cita dice llevar.
    2. Las coordenadas están mal pero el TEXTO citado sí aparece en el
       fragmento: se corrigen las coordenadas. Un modelo cuenta caracteres
       fatal y eso no lo vuelve un mentiroso; lo que no se perdona es la
       frase que no está.

    Sin `texto` no hay nada que verificar, así que solo se aceptan
    coordenadas dentro del fragmento y se rellena el texto desde él.
    """
    if not texto_fragmento or cita.fin <= cita.inicio:
        return None
    if cita.fin - cita.inicio > MAX_SPAN:
        return None

    citado = _plano(cita.texto)
    if not citado:
        # sin cita textual: solo vale si las coordenadas caben en el fragmento
        if cita.fin > len(texto_fragmento):
            return None
        return cita.model_copy(update={"texto": texto_fragmento[cita.inicio:cita.fin]})

    if (cita.fin <= len(texto_fragmento)
            and _plano(texto_fragmento[cita.inicio:cita.fin]) == citado):
        return cita

    posicion = _plano(texto_fragmento).find(citado)
    if posicion < 0:
        return None                    # la frase NO está: cita fabricada
    # se reubica sobre el texto original, no sobre el aplanado
    real = _reubicar(texto_fragmento, citado)
    if real is None:
        return None
    inicio, fin = real
    return cita.model_copy(update={"inicio": inicio, "fin": fin,
                                   "texto": texto_fragmento[inicio:fin]})


def _reubicar(texto: str, citado: str) -> Optional[tuple[int, int]]:
    """Dónde empieza y acaba `citado` dentro de `texto`, ignorando el espacio.

    Se recorre el original manteniendo la correspondencia con su forma
    aplanada; así el span devuelto indexa el texto REAL, que es el que la
    pantalla resalta y el que el expediente cita."""
    plano_a_real: list[int] = []
    plano = []
    espacio_previo = True
    for i, ch in enumerate(texto):
        if ch.isspace():
            if not espacio_previo:
                plano.append(" ")
                plano_a_real.append(i)
            espacio_previo = True
            continue
        espacio_previo = False
        plano.append(ch)
        plano_a_real.append(i)
    aplanado = "".join(plano).strip()
    desfase = len("".join(plano)) - len("".join(plano).lstrip())
    pos = aplanado.find(citado)
    if pos < 0:
        return None
    ini = plano_a_real[pos + desfase]
    fin_idx = pos + desfase + len(citado) - 1
    if fin_idx >= len(plano_a_real):
        return None
    return ini, plano_a_real[fin_idx] + 1


def verificar_todas(citas: Iterable[Cita],
                    textos: dict[str, str]) -> list[Cita]:
    """Las citas que se sostienen contra los fragmentos reales.

    Una cita a un fragmento que no es de esta sesión no existe: `textos` solo
    trae los de la sesión, así que la frontera se aplica sola."""
    buenas: list[Cita] = []
    vistas: set[tuple[str, int, int]] = set()
    for c in citas:
        texto = textos.get(c.fragmento_id)
        if texto is None:
            continue
        ok = verificar(c, texto)
        if ok is None:
            continue
        clave = (ok.fragmento_id, ok.inicio, ok.fin)
        if clave in vistas:
            continue
        vistas.add(clave)
        buenas.append(ok)
    return buenas
