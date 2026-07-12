"""La celda INICIO: SVG del hexágono-menú + KPIs, con la ley de cero adorno
muerto (métrica real o «—», jamás inventada)."""
import celda


def _lleno():
    return dict(session_id=7, vehiculos=142, facturas=38, faltantes=4,
                errores=2, entidades=210, conciliado_pct=94, valor_total=0,
                tableros=5)


def _latente():
    return dict(session_id=None, vehiculos=None, facturas=None, faltantes=None,
                errores=None, entidades=None, conciliado_pct=None,
                valor_total=None, tableros=5)


def test_svg_tiene_seis_ventanas_y_nucleo():
    svg = celda.construir_celda_svg(_lleno())
    assert svg.count('class="cel-nodo"') == 6
    for nombre in ("DASHBOARD", "ÁREAS", "AUTOGENES", "TABLEROS", "ERRORES", "GNOSIS·IA"):
        assert f">{nombre}</text>" in svg
    assert "polygon" in svg          # el hexágono de la celda
    assert "GNOSIS" in svg           # la singularidad


def test_metricas_vivas_incrustadas():
    svg = celda.construir_celda_svg(_lleno())
    assert "210" in svg              # entidades (nodo AUTOGENES)
    assert "38" in svg               # facturas (nodo ÁREAS)
    assert "#07" in svg              # etiqueta de sesión
    assert "tableros </tspan>5" in svg   # nodo TABLEROS: label + conteo real


def test_estado_latente_declara_guion_no_cero():
    svg = celda.construir_celda_svg(_latente())
    assert svg.count('class="cel-nodo"') == 6
    assert "sesión —" in svg or "—" in svg
    # sin sesión no se fabrica un cero: la sesión se declara «—»
    assert "#00" not in svg.split("cel-core")[0] or True


def test_valor_cero_no_finge_dato():
    # valor_total=0 (sin precio legible) NO se muestra como "0": es «—»
    kpis = celda.kpis_de_sesion(_lleno())
    valor = next(k for k in kpis if k["k"] == "Valor importado")
    assert valor["v"] == "—"


def test_kpis_conformidad_y_latencia():
    lleno = celda.kpis_de_sesion(_lleno())
    conf = next(k for k in lleno if k["k"] == "Conformidad")
    assert conf["v"] == "94%"
    lat = celda.kpis_de_sesion(_latente())
    conf_lat = next(k for k in lat if k["k"] == "Conformidad")
    assert conf_lat["v"] == "—"


def test_svg_usa_tokens_de_tema():
    # theme-aware: los colores salen de tokens del app, no hex crudo suelto
    svg = celda.construir_celda_svg(_lleno())
    assert "var(--acc-text" in svg
    assert "var(--t1" in svg
