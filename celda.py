"""La Celda GNOSIS — el landing principal (INICIO) como celda cristalográfica.

Función pura: recibe las métricas vivas de la sesión y devuelve el SVG del
hexágono-menú (las ventanas del app en las posiciones de simetría) más la
lista de KPIs de la columna derecha. Sin estado, sin IO — el llamador
(app.dashboard) le pasa el dict de métricas ya leído de la base.

Ley de cero adorno muerto: cada cifra del hexágono es una métrica real; lo
que no hay se declara con «—» (latente), jamás un número inventado.
"""
from __future__ import annotations

import html
import math
from typing import Any, Optional

# Geometría del hexágono (coordenadas del viewBox).
_W, _H = 1180, 1050
_CX, _CY = 590, 430
_R = 262

# Colores por token del app (theme-aware Daylight/Nocturne) con fallback al
# hex de marca por si el token no está en alcance. El brand-rule: el acento
# es la Coral viva; el hexágono es el Frame documental.
_ACC = "var(--acc-text, #00D4FF)"
_INK = "var(--t1, #F4F5F6)"
_T3 = "var(--t3, #63676E)"
_T2 = "var(--t2, #9A9DA3)"
_SURF = "var(--surface, #050607)"


def _pol(ang_deg: float, r: float) -> tuple[float, float]:
    a = math.radians(ang_deg)
    return (_CX + r * math.cos(a), _CY - r * math.sin(a))


def _fmt(v: Optional[Any]) -> str:
    if v is None:
        return "—"
    if isinstance(v, int):
        return f"{v:,}".replace(",", " ")
    return str(v)


def _ventanas(m: dict[str, Any]) -> list[dict[str, str]]:
    """Las 6 ventanas del app en orden horario desde arriba, con su métrica
    viva. `ruta` la consume el front para navegar; DASHBOARD y GNOSIS·IA
    llevan acción especial (desplegar / abrir consola)."""
    sesion = f"#{m['session_id']:02d}" if m.get("session_id") else "—"
    return [
        {"n": "DASHBOARD", "mk": "sesión", "v": sesion,               "ruta": "#dashboard"},
        {"n": "ÁREAS",     "mk": "facturas", "v": _fmt(m.get("facturas")), "ruta": "/procesar"},
        {"n": "AUTOGENES", "mk": "entidades", "v": _fmt(m.get("entidades")), "ruta": "/autogenes"},
        {"n": "TABLEROS",  "mk": "tableros", "v": _fmt(m.get("tableros")), "ruta": "/tableros"},
        {"n": "ERRORES",   "mk": "por revisar", "v": _fmt(m.get("errores")), "ruta": "/errores"},
        {"n": "GNOSIS·IA", "mk": "pregunta al caso", "v": "•",        "ruta": "#ia"},
    ]


def _rotulo(x: float, y: float, w: dict[str, str]) -> str:
    ang = math.degrees(math.atan2(_CY - y, x - _CX))
    ox, oy = math.cos(math.radians(ang)), -math.sin(math.radians(ang))
    lx, ly = x + ox * 30, y + oy * 30
    anchor = "middle"
    if ox > 0.3:
        anchor = "start"
    elif ox < -0.3:
        anchor = "end"
    dy = 4 if abs(oy) < 0.4 else (18 if oy > 0 else -10)
    nombre = html.escape(w["n"])
    mk = html.escape(w["mk"])
    val = html.escape(w["v"])
    ruta = html.escape(w["ruta"], quote=True)
    return (
        f'<a class="cel-nodo" href="{ruta}" data-ruta="{ruta}" tabindex="0" '
        f'role="button" aria-label="{nombre}">'
        f'<g filter="url(#cel-glow)"><circle cx="{x:.1f}" cy="{y:.1f}" r="12" '
        f'fill="{_SURF}" stroke="{_ACC}" stroke-width="1.7"/>'
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.4" fill="{_ACC}"/></g>'
        f'<text x="{lx:.1f}" y="{ly + dy:.1f}" fill="{_INK}" class="cel-nm" '
        f'text-anchor="{anchor}">{nombre}</text>'
        f'<text x="{lx:.1f}" y="{ly + dy + 17:.1f}" fill="{_ACC}" class="cel-mk" '
        f'text-anchor="{anchor}"><tspan fill="{_T3}">{mk} </tspan>{val}</text></a>'
    )


def construir_celda_svg(m: dict[str, Any]) -> str:
    """El SVG del hexágono-menú con las métricas vivas ya incrustadas."""
    vert = [_pol(90 - 60 * k, _R) for k in range(6)]
    ventanas = _ventanas(m)

    defs = (
        '<defs>'
        '<filter id="cel-glow" x="-70%" y="-70%" width="240%" height="240%">'
        '<feGaussianBlur stdDeviation="3" result="b"/><feMerge>'
        '<feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
        '<radialGradient id="cel-core" cx="50%" cy="50%" r="50%">'
        f'<stop offset="0%" stop-color="#FAFAF8"/><stop offset="40%" stop-color="{_ACC}"/>'
        '<stop offset="100%" stop-color="#0A6E86"/></radialGradient>'
        '<radialGradient id="cel-halo" cx="50%" cy="50%" r="50%">'
        f'<stop offset="0%" stop-color="{_ACC}" stop-opacity=".18"/>'
        f'<stop offset="100%" stop-color="{_ACC}" stop-opacity="0"/></radialGradient>'
        '<marker id="cel-ax" markerWidth="8" markerHeight="8" refX="5" refY="3" '
        'orient="auto"><path d="M0,0 L5,3 L0,6" fill="none" stroke="'+_T2+'" '
        'stroke-width="1"/></marker></defs>'
    )

    halo = f'<circle cx="{_CX}" cy="{_CY}" r="420" fill="url(#cel-halo)"/>'
    spokes = "".join(
        f'<line x1="{_CX}" y1="{_CY}" x2="{x:.1f}" y2="{y:.1f}"/>' for x, y in vert)
    spokes = f'<g stroke="{_ACC}" stroke-width=".7" opacity=".16" fill="none">{spokes}</g>'
    hexpts = " ".join(f"{x:.1f},{y:.1f}" for x, y in vert)
    hexg = f'<polygon points="{hexpts}" fill="none" stroke="{_INK}" stroke-width="1.4" opacity=".8"/>'

    nodos = "".join(_rotulo(x, y, w) for (x, y), w in zip(vert, ventanas))

    nucleo = (
        f'<circle cx="{_CX}" cy="{_CY}" r="95" fill="url(#cel-halo)"/>'
        f'<g filter="url(#cel-glow)"><circle cx="{_CX}" cy="{_CY}" r="19" fill="url(#cel-core)"/>'
        f'<circle cx="{_CX}" cy="{_CY}" r="19" fill="none" stroke="{_INK}" stroke-width="1"/></g>'
        f'<text x="{_CX}" y="{_CY + 44}" fill="{_INK}" class="cel-core-t" text-anchor="middle">GNOSIS</text>'
        f'<text x="{_CX}" y="{_CY + 60}" fill="{_T3}" class="cel-core-s" text-anchor="middle">una sola fuente de la verdad</text>'
    )

    ax, ay = 96, 940
    ejes = (
        f'<g stroke="{_T2}" stroke-width="1.2" fill="{_T2}" class="cel-ejes" font-style="italic">'
        f'<line x1="{ax}" y1="{ay}" x2="{ax + 62}" y2="{ay}" marker-end="url(#cel-ax)"/>'
        f'<line x1="{ax}" y1="{ay}" x2="{ax + 31}" y2="{ay - 54}" marker-end="url(#cel-ax)"/>'
        f'<text x="{ax + 70}" y="{ay + 5}">a</text><text x="{ax + 36}" y="{ay - 60}">b</text></g>'
    )

    return (
        f'<svg viewBox="0 0 {_W} {_H}" class="cel-svg" preserveAspectRatio="xMidYMid meet" '
        f'role="img" aria-label="Celda de navegación GNOSIS">'
        f'{defs}{halo}{spokes}{hexg}{nodos}{nucleo}{ejes}</svg>'
    )


def kpis_de_sesion(m: dict[str, Any]) -> list[dict[str, str]]:
    """KPIs de la columna derecha del landing. `valor_total` no se estima:
    se muestra el real si existe, o «—» si no hay precio legible."""
    valor = m.get("valor_total")
    conf = m.get("conciliado_pct")
    return [
        {"k": "Vehículos · DWH", "v": _fmt(m.get("vehiculos")), "d": "conciliados", "cls": ""},
        {"k": "Registros factura", "v": _fmt(m.get("facturas")), "d": "procesados", "cls": ""},
        {"k": "Facturas faltantes", "v": _fmt(m.get("faltantes")), "d": "sin conciliar", "cls": "warn"},
        {"k": "Registros con error", "v": _fmt(m.get("errores")), "d": "auto-detectado", "cls": "warn"},
        {"k": "Valor importado", "v": (_fmt(valor) if valor else "—"), "d": "Σ precio · divisa", "cls": ""},
        {"k": "Conformidad", "v": (f"{conf}%" if conf is not None else "—"), "d": "reglas de norma", "cls": ""},
    ]
