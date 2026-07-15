"""Ley de idioma de QUALIA (Q0 del PLAN_QUALIA_UPLIFT).

QUALIA hablaba topología abstracta en la cara del usuario ("PROYECCIÓN
ESPECTRAL (FIEDLER)", "renormalización", "monolito"). El uplift la hace
hablar negocio; la matemática NO se esconde, se DECLARA en una ficha
técnica. Este test es el ratchet que sostiene esa ley:

  - Escanea el copy VISIBLE de los instrumentos (texto de plantilla +
    literales de string de los JS; NO comentarios, NO URLs de API).
  - Prohíbe el vocabulario matemático crudo salvo dos excepciones
    EXPLÍCITAS: `CUARENTENA` (deuda heredada que cada fase borra) y
    `FICHA_TECNICA_OK` (término dejado a propósito dentro de una ficha
    técnica declarada).
  - Verde hoy (documenta la deuda exacta). Rojo si aparece jerga NUEVA
    fuera de esos carriles. Y una entrada de cualquiera de los dos
    carriles que ya no corresponda a una ocurrencia real TAMBIÉN falla,
    para forzar su limpieza conforme el copy se traduce.

Cuando `CUARENTENA` quede vacío, Q3 habrá cerrado la traducción.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Instrumentos QUALIA: plantillas (UI pura) + sus JS.
PLANTILLAS = [
    "templates/autogenes_qualia.html",
    "templates/autogenes_qualia_orbe.html",
    "templates/autogenes_qualia_cuerdas.html",
    "templates/autogenes_qualia_terreno.html",
    "templates/autogenes_qualia_cascada.html",
    "templates/autogenes_qualia_horizonte.html",
    "templates/autogenes_qualia_maquina.html",
]
SCRIPTS = [
    "static/qualia.js",
    "static/qualia_orbe.js",
    "static/qualia_cuerdas.js",
    "static/qualia_terreno.js",
    "static/qualia_cascada.js",
    "static/qualia_horizonte.js",
    "static/qualia_maquina.js",
]

# Vocabulario matemático que NO va en la cara del usuario (stems, sin
# acento; el match es case-insensitive y sin diacríticos).
JERGA_PROHIBIDA = [
    "fiedler",
    "espectral",
    "renormaliz",
    "eigen",
    "autovalor",
    "laplacian",
    "monolito",
    "baricentr",
    "betti",
    "persistencia h0",
]

# ── carril 1: deuda heredada. Cada fase que traduce una etiqueta borra su
#    entrada. Una entrada que ya no corresponda a una ocurrencia real falla
#    (no se deja cuarentena muerta). Meta de Q3: {} vacío. ───────────────
CUARENTENA: dict[str, set[str]] = {}

# ── carril 2: término dejado a propósito dentro de una ficha técnica
#    declarada (método honesto, no etiqueta gritada). Vacío hoy; Q3 lo
#    puebla cuando construya las fichas técnicas. También se vigila contra
#    entradas muertas. ──────────────────────────────────────────────────
FICHA_TECNICA_OK: dict[str, set[str]] = {}

_LITERAL = re.compile(r"""(['"`])(?:\\.|(?!\1).)*\1""")


def _sin_acentos(s: str) -> str:
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u")):
        s = s.replace(a, b).replace(a.upper(), b.upper())
    return s


def _es_url_api(literal: str) -> bool:
    return "/api/" in literal or "?" in literal and "=" in literal


def _copy_visible(rel: str) -> str:
    """Texto que un usuario podría ver. Para JS: solo literales de string,
    excluyendo URLs de API (los `?espectral=1` son parámetros de endpoint,
    no copy). Para plantillas: el archivo entero (atributos aria/label y
    nodos de texto son todos superficie)."""
    with open(os.path.join(RAIZ, rel), encoding="utf-8") as fh:
        crudo = fh.read()
    if rel.endswith(".js"):
        trozos = [m.group(0) for m in _LITERAL.finditer(crudo)
                  if not _es_url_api(m.group(0))]
        return "\n".join(trozos)
    return crudo


def _ocurrencias() -> dict[str, set[str]]:
    hits: dict[str, set[str]] = {}
    for rel in PLANTILLAS + SCRIPTS:
        texto = _sin_acentos(_copy_visible(rel)).lower()
        for termino in JERGA_PROHIBIDA:
            if termino in texto:
                hits.setdefault(rel, set()).add(termino)
    return hits


def test_sin_jerga_matematica_nueva_en_la_ui():
    """Ninguna ocurrencia de jerga fuera de los dos carriles declarados."""
    permitido: dict[str, set[str]] = {}
    for carril in (CUARENTENA, FICHA_TECNICA_OK):
        for rel, terms in carril.items():
            permitido.setdefault(rel, set()).update(terms)

    nuevos = {}
    for rel, terms in _ocurrencias().items():
        extra = terms - permitido.get(rel, set())
        if extra:
            nuevos[rel] = extra
    assert not nuevos, (
        "Jerga matemática NUEVA en la UI (tradúcela al diccionario del "
        f"PLAN_QUALIA_UPLIFT o decláralo en una ficha técnica): {nuevos}"
    )


def test_sin_cuarentena_muerta():
    """Una entrada de cuarentena/ficha que ya no corresponde a una
    ocurrencia real debe borrarse: fuerza limpiar el ratchet conforme el
    copy se traduce (así el test avanza a verde por reducción, no por
    olvido)."""
    reales = _ocurrencias()
    muertas = {}
    for carril, nombre in ((CUARENTENA, "CUARENTENA"),
                           (FICHA_TECNICA_OK, "FICHA_TECNICA_OK")):
        for rel, terms in carril.items():
            sobra = terms - reales.get(rel, set())
            if sobra:
                muertas[f"{nombre}[{rel}]"] = sobra
    assert not muertas, (
        f"Entradas de ratchet sin ocurrencia real (bórralas): {muertas}"
    )
