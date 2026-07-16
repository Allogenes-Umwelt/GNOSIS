"""
Despacho de tool calls: ejecuta la funcion SQL correcta,
aplica ofuscacion cuando es necesario, y retorna resultados.
"""

import json
from . import tools as t
from .ofuscation import ObfuscationLayer
from .tools_grafo import GRAFO_TOOL_FUNCTIONS


# Tools que retornan datos individuales (necesitan ofuscacion)
DETAIL_TOOLS = {'buscar_por_vin', 'buscar_por_factura', 'buscar_en_extraccion', 'detectar_datos_faltantes', 'consulta_sql'}

# Tools de grafo cuyos resultados pueden arrastrar chasis/facturas
# (etiquetas de nodos vehiculo, campos anidados): ofuscacion recursiva.
# conciliacion/resumen_grafo/senales_caso/hallazgos_pendientes emiten
# chasis (evidencia/afectados/etiqueta de nodo) y numeros de factura
# (faltantes) — sin ofuscar filtraban identificadores reales al modelo.
GRAFO_DETAIL_TOOLS = {'expediente_entidad', 'camino_entre', 'vecindario',
                      'conciliacion', 'resumen_grafo', 'senales_caso',
                      'hallazgos_pendientes'}

# Mapeo nombre -> funcion
TOOL_FUNCTIONS = {
    'buscar_por_vin': t.buscar_por_vin,
    'buscar_por_factura': t.buscar_por_factura,
    'contar_por_marca': t.contar_por_marca,
    'contar_por_pais': t.contar_por_pais,
    'precio_promedio': t.precio_promedio,
    'estado_cupos': t.estado_cupos,
    'seguimiento_mensual': t.seguimiento_mensual,
    'desglose_preferencia_arancelaria': t.desglose_preferencia_arancelaria,
    'top_modelos': t.top_modelos,
    'comparar_meses': t.comparar_meses,
    'detectar_datos_faltantes': t.detectar_datos_faltantes,
    'resumen_sesion': t.resumen_sesion,
    'tendencia_anual': t.tendencia_anual,
    'analisis_fracciones': t.analisis_fracciones,
    'consulta_historica': t.consulta_historica,
    'resumen_extraccion': t.resumen_extraccion,
    'buscar_en_extraccion': t.buscar_en_extraccion,
    'consulta_sql': t.consulta_sql,
    **GRAFO_TOOL_FUNCTIONS,
}


class ToolExecutor:
    """Ejecuta tool calls y aplica ofuscacion."""

    def __init__(self, obfuscation_layer: ObfuscationLayer):
        self.obfuscation = obfuscation_layer

    def execute(self, tool_name, tool_input):
        """Ejecuta una tool y retorna el resultado (ofuscado si aplica).
        Returns: (result_str, raw_result)
        """
        func = TOOL_FUNCTIONS.get(tool_name)
        if not func:
            return json.dumps({'error': f'Tool no encontrada: {tool_name}'}), None

        try:
            result = func(**tool_input)
        except Exception as e:
            return json.dumps({'error': f'Error ejecutando {tool_name}: {str(e)}'}), None

        # Aplicar ofuscacion a tools de detalle
        if tool_name in DETAIL_TOOLS:
            result = self._obfuscate_result(result)
        elif tool_name in GRAFO_DETAIL_TOOLS:
            result = self._obfuscate_grafo(result)

        result_str = json.dumps(result, ensure_ascii=False, default=str)

        # Truncar si es muy largo (proteccion de contexto)
        if len(result_str) > 15000:
            result_str = result_str[:15000] + '... [TRUNCADO - resultado muy largo]'

        return result_str, result

    def _obfuscate_result(self, result):
        """Aplica ofuscacion recursivamente a un resultado."""
        if isinstance(result, list):
            if result and isinstance(result[0], dict):
                return self.obfuscation.mask_results(result)
            return result
        elif isinstance(result, dict):
            obfuscated = {}
            for key, value in result.items():
                if isinstance(value, list):
                    if value and isinstance(value[0], dict):
                        obfuscated[key] = self.obfuscation.mask_results(value)
                    else:
                        obfuscated[key] = value
                elif isinstance(value, dict):
                    obfuscated[key] = self.obfuscation.mask_row(value)
                else:
                    obfuscated[key] = value
            return obfuscated
        return result

    def _obfuscate_grafo(self, obj):
        """Ofuscacion recursiva para resultados de grafo: la etiqueta de
        un nodo vehiculo ES su chasis, y los campos chasis/factura pueden
        aparecer anidados a cualquier profundidad."""
        if isinstance(obj, list):
            return [self._obfuscate_grafo(x) for x in obj]
        if isinstance(obj, dict):
            es_vehiculo = obj.get('kind') == 'vehiculo'
            salida = {}
            for key, value in obj.items():
                if es_vehiculo and key == 'etiqueta' and value:
                    salida[key] = self.obfuscation.mask_value(value, 'chasis')
                elif key in ('chasis', 'factura') and isinstance(value, str) and value:
                    salida[key] = self.obfuscation.mask_value(value, key)
                else:
                    salida[key] = self._obfuscate_grafo(value)
            return salida
        return obj
