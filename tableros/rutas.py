"""TBV-03 · RUTAS — dónde se concentra el flujo país → aduana.

Cada flujo es |unidades importadas| agrupadas por (pais_code, aduana del
pedimento). Las coordenadas NO vienen de los datos: el destino usa un
catálogo fijo de aduanas mexicanas conocidas y el origen se ancla en el
centroide del país — el puerto de salida no está en los datos y no se
inventa. Todo par sin coordenadas resolubles se declara en `sin_geo`
con su conteo: el mapa nunca dibuja lo que no puede ubicar, pero el
tablero sí lo confiesa.
"""
import sqlite3
import unicodedata
from typing import Any

# centroides de país (lat, lon) — catálogo de paises de GNOSIS
PAISES_GEO = {
    "CZE": (49.82, 15.47), "DEU": (51.16, 10.45), "SVK": (48.67, 19.70),
    "ESP": (40.46, -3.75), "GBR": (55.38, -3.44), "HUN": (47.16, 19.50),
    "IND": (20.59, 78.96), "ZAF": (-30.56, 22.94), "BRA": (-14.24, -51.93),
    "USA": (39.83, -98.58), "ARG": (-38.42, -63.62), "BEL": (50.50, 4.47),
    "POL": (51.92, 19.15), "TUR": (38.96, 35.24),
}

# aduanas mexicanas conocidas (lat, lon), clave normalizada sin acentos
ADUANAS_GEO = {
    "VERACRUZ": (19.1738, -96.1342),
    "ALTAMIRA": (22.3922, -97.9309),
    "LAZARO CARDENAS": (17.9583, -102.1994),
    "MANZANILLO": (19.0522, -104.3158),
    "TAMPICO": (22.2553, -97.8686),
    "MAZATLAN": (23.2494, -106.4111),
    "ENSENADA": (31.8667, -116.5964),
    "GUAYMAS": (27.9183, -110.8989),
    "PROGRESO": (21.2833, -89.6636),
    "NUEVO LAREDO": (27.4861, -99.5069),
    "COLOMBIA": (27.7017, -99.7581),
    "CIUDAD JUAREZ": (31.7386, -106.4870),
    "TIJUANA": (32.5149, -117.0382),
    "MEXICO": (19.4361, -99.0719),
    "TOLUCA": (19.3371, -99.5660),
}


def _normalizar(texto: str) -> str:
    plano = unicodedata.normalize("NFKD", texto)
    plano = "".join(c for c in plano if not unicodedata.combining(c))
    return " ".join(plano.upper().split())


def _geo_aduana(aduana: str) -> tuple[float, float] | None:
    clave = _normalizar(aduana)
    if clave in ADUANAS_GEO:
        return ADUANAS_GEO[clave]
    # «ADUANA DE VERACRUZ» → contiene una clave conocida; si contiene
    # más de una, es ambigua y se declara en vez de adivinar
    dentro = [k for k in ADUANAS_GEO if k in clave]
    if len(dentro) == 1:
        return ADUANAS_GEO[dentro[0]]
    return None


def rutas(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    filas = conn.execute(
        "SELECT COALESCE(i.pais_code, '') AS pais_code,"
        "       COALESCE(p.aduana, '') AS aduana,"
        "       COALESCE(pa.nombre, i.pais_code) AS pais,"
        "       COUNT(*) AS n"
        " FROM importaciones i"
        " LEFT JOIN pedimentos p ON i.pedimento_id = p.id"
        " LEFT JOIN paises pa ON i.pais_code = pa.codigo"
        " WHERE i.session_id = ?"
        " GROUP BY i.pais_code, p.aduana", (session_id,)).fetchall()

    total = sum(r["n"] for r in filas)
    flujos = []
    sin_geo = []
    for r in filas:
        pais_code, aduana = r["pais_code"].strip(), r["aduana"].strip()
        motivo = None
        origen = PAISES_GEO.get(pais_code)
        destino = _geo_aduana(aduana) if aduana else None
        if not pais_code:
            motivo = "sin país de origen registrado"
        elif not aduana:
            motivo = "sin aduana en el pedimento"
        elif origen is None:
            motivo = f"país {pais_code} sin coordenadas en el catálogo"
        elif destino is None:
            motivo = f"aduana «{aduana}» sin coordenadas en el catálogo"
        if motivo:
            sin_geo.append({"pais_code": pais_code or "—",
                            "aduana": aduana or "—", "n": r["n"],
                            "motivo": motivo})
            continue
        flujos.append({
            "pais_code": pais_code,
            "pais": r["pais"],
            "aduana": aduana,
            "n": r["n"],
            "pct": round(100 * r["n"] / total, 1) if total else 0,
            "origen": {"lat": origen[0], "lon": origen[1]},
            "destino": {"lat": destino[0], "lon": destino[1]},
        })
    flujos.sort(key=lambda f: (-f["n"], f["pais_code"], f["aduana"]))

    return {
        "session_id": session_id,
        "flujos": flujos,
        "sin_geo": sorted(sin_geo, key=lambda s: -s["n"]),
        "total": total,
        "geolocalizado": sum(f["n"] for f in flujos),
        "nota": ("El origen se ancla en el centroide del país — el puerto "
                 "de salida no está en los datos. Lo que no se puede "
                 "ubicar se declara, no se dibuja."),
    }
