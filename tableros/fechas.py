"""Fechas del DWH — tolerantes y honestas. FECFACT llega cruda del
Excel: ISO (YYYY-MM-DD[ HH:MM:SS]), dd/mm/aa o dd/mm/aaaa. Lo que no
casa con esas formas es None — se cuenta, no se adivina."""
import re
from datetime import date
from typing import Optional

_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_DMY = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$")


def parsear_fecha(texto: Optional[str]) -> Optional[date]:
    if not texto:
        return None
    limpio = str(texto).strip()
    m = _ISO.match(limpio)
    if m:
        a, mes, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = _DMY.match(limpio)
        if not m:
            return None
        d, mes, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if a < 100:                       # dd/mm/aa -> siglo XXI
            a += 2000
    try:
        return date(a, mes, d)
    except ValueError:
        return None


def periodo_de(f: date, escala: str) -> str:
    """La cubeta del periodo: mes YYYY-MM, trimestre YYYY-Qn, semestre
    YYYY-Sn o año YYYY."""
    if escala == "mes":
        return f"{f.year:04d}-{f.month:02d}"
    if escala == "trimestre":
        return f"{f.year:04d}-Q{(f.month - 1) // 3 + 1}"
    if escala == "semestre":
        return f"{f.year:04d}-S{1 if f.month <= 6 else 2}"
    return f"{f.year:04d}"
