"""
18 herramientas SQL para Gnosis AI (+ 6 tools de grafo en tools_grafo.py).
Cada funcion recibe parametros y retorna lista de dicts.
TOOL_DEFINITIONS contiene los schemas JSON para Anthropic tool_use.
"""

from database import get_connection
from .ambito import FueraDeAmbito, sesion_en_ambito
from .tools_grafo import GRAFO_TOOL_DEFINITIONS


def _get_session(session_id=None):
    """Resuelve session_id contra el AMBITO declarado por quien atiende al
    operador. El modelo no elige la sesion: pedir una fuera del ambito es un
    error explicito, no una respuesta silenciosa con cifras de otro mes."""
    return sesion_en_ambito(session_id)


# ============================================================
# 1. buscar_por_vin
# ============================================================
def buscar_por_vin(vin, session_id=None):
    """Busca registros por VIN/chasis en importaciones y extraccion_facturas."""
    sid = _get_session(session_id)
    conn = get_connection()
    results = {'importaciones': [], 'extraccion': []}

    rows = conn.execute(
        """SELECT i.*, p.numero_pedimento, p.patente, p.fecha_pedimento, p.aduana,
                  c.tipo, c.fraccion, c.fletes, c.seguros, m.nombre as marca
           FROM importaciones i
           LEFT JOIN pedimentos p ON i.pedimento_id = p.id
           LEFT JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
           LEFT JOIN marcas m ON c.marca_id = m.id
           WHERE i.chasis LIKE ? AND i.session_id = ?""",
        (f"%{vin}%", sid)
    ).fetchall()
    results['importaciones'] = [dict(r) for r in rows]

    rows2 = conn.execute(
        "SELECT * FROM extraccion_facturas WHERE chasis LIKE ? AND session_id = ?",
        (f"%{vin}%", sid)
    ).fetchall()
    results['extraccion'] = [dict(r) for r in rows2]

    conn.close()
    return results


# ============================================================
# 2. buscar_por_factura
# ============================================================
def buscar_por_factura(factura, session_id=None):
    """Busca por numero de factura en importaciones y extraccion_facturas."""
    sid = _get_session(session_id)
    conn = get_connection()
    results = {'importaciones': [], 'extraccion': []}

    rows = conn.execute(
        """SELECT i.*, p.numero_pedimento, p.patente, p.fecha_pedimento, p.aduana,
                  c.tipo, c.fraccion, m.nombre as marca
           FROM importaciones i
           LEFT JOIN pedimentos p ON i.pedimento_id = p.id
           LEFT JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
           LEFT JOIN marcas m ON c.marca_id = m.id
           WHERE i.factura LIKE ? AND i.session_id = ?""",
        (f"%{factura}%", sid)
    ).fetchall()
    results['importaciones'] = [dict(r) for r in rows]

    rows2 = conn.execute(
        "SELECT * FROM extraccion_facturas WHERE factura LIKE ? AND session_id = ?",
        (f"%{factura}%", sid)
    ).fetchall()
    results['extraccion'] = [dict(r) for r in rows2]

    conn.close()
    return results


# ============================================================
# 3. contar_por_marca
# ============================================================
def contar_por_marca(session_id=None):
    """Cuenta vehiculos importados por marca."""
    sid = _get_session(session_id)
    conn = get_connection()
    rows = conn.execute(
        """SELECT m.nombre as marca, COUNT(*) as total
           FROM importaciones i
           JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
           JOIN marcas m ON c.marca_id = m.id
           WHERE i.session_id = ?
           GROUP BY m.nombre
           ORDER BY total DESC""",
        (sid,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 4. contar_por_pais
# ============================================================
def contar_por_pais(session_id=None):
    """Cuenta vehiculos importados por pais de origen."""
    sid = _get_session(session_id)
    conn = get_connection()
    rows = conn.execute(
        """SELECT i.pais_code, p.nombre as pais_nombre, COUNT(*) as total
           FROM importaciones i
           LEFT JOIN paises p ON i.pais_code = p.codigo
           WHERE i.session_id = ?
           GROUP BY i.pais_code
           ORDER BY total DESC""",
        (sid,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 5. precio_promedio
# ============================================================
def precio_promedio(marca=None, pais=None, session_id=None):
    """Precio promedio, minimo y maximo con filtros opcionales."""
    sid = _get_session(session_id)
    conn = get_connection()

    query = """SELECT AVG(i.precio) as promedio, MIN(i.precio) as minimo,
                      MAX(i.precio) as maximo, COUNT(*) as total
               FROM importaciones i
               LEFT JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
               LEFT JOIN marcas m ON c.marca_id = m.id
               WHERE i.session_id = ? AND i.precio IS NOT NULL"""
    params = [sid]

    if marca:
        query += " AND UPPER(m.nombre) = UPPER(?)"
        params.append(marca)
    if pais:
        query += " AND UPPER(i.pais_code) = UPPER(?)"
        params.append(pais)

    row = conn.execute(query, params).fetchone()
    conn.close()
    return dict(row) if row else {}


# ============================================================
# 6. estado_cupos
# ============================================================
def estado_cupos(session_id=None):
    """Saldo de cupos de produccion e inversion."""
    sid = _get_session(session_id)
    conn = get_connection()
    rows = conn.execute(
        """SELECT tipo, numero_autorizacion, cantidad_inicial,
                  cantidad_consumida, cantidad_saldo, mes_agotado
           FROM cupos WHERE session_id = ?
           ORDER BY tipo, numero_autorizacion""",
        (sid,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 7. seguimiento_mensual
# ============================================================
def seguimiento_mensual(session_id=None):
    """Tracking mes a mes de cupos."""
    sid = _get_session(session_id)
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM seguimiento_mensual WHERE session_id = ? ORDER BY mes",
        (sid,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 8. desglose_preferencia_arancelaria
# ============================================================
def desglose_preferencia_arancelaria(session_id=None):
    """Breakdown de J vs N en importaciones."""
    sid = _get_session(session_id)
    conn = get_connection()
    rows = conn.execute(
        """SELECT j_y_n, COUNT(*) as total
           FROM importaciones
           WHERE session_id = ?
           GROUP BY j_y_n
           ORDER BY total DESC""",
        (sid,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 9. top_modelos
# ============================================================
def top_modelos(n=10, session_id=None):
    """Top-N modelos mas importados."""
    sid = _get_session(session_id)
    conn = get_connection()
    rows = conn.execute(
        """SELECT c.tipo as modelo, c.auto_code, m.nombre as marca, COUNT(*) as total
           FROM importaciones i
           JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
           JOIN marcas m ON c.marca_id = m.id
           WHERE i.session_id = ?
           GROUP BY c.tipo, c.auto_code
           ORDER BY total DESC
           LIMIT ?""",
        (sid, int(n))
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 10. comparar_meses
# ============================================================
def comparar_meses(mes1, mes2, session_id=None):
    """Comparacion lado a lado del seguimiento mensual de 2 meses."""
    sid = _get_session(session_id)
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM seguimiento_mensual WHERE session_id = ? AND mes IN (?, ?) ORDER BY mes",
        (sid, int(mes1), int(mes2))
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 11. detectar_datos_faltantes
# ============================================================
def detectar_datos_faltantes(session_id=None):
    """Registros con datos faltantes en importaciones + facturas faltantes."""
    sid = _get_session(session_id)
    conn = get_connection()
    results = {}

    # Registros sin precio
    rows = conn.execute(
        "SELECT COUNT(*) as cnt FROM importaciones WHERE session_id = ? AND precio IS NULL",
        (sid,)
    ).fetchone()
    results['registros_sin_precio'] = rows['cnt']

    # Registros sin J y N
    rows = conn.execute(
        "SELECT COUNT(*) as cnt FROM importaciones WHERE session_id = ? AND (j_y_n IS NULL OR j_y_n = '')",
        (sid,)
    ).fetchone()
    results['registros_sin_j_y_n'] = rows['cnt']

    # Registros sin catalogo
    rows = conn.execute(
        "SELECT COUNT(*) as cnt FROM importaciones WHERE session_id = ? AND catalogo_id IS NULL",
        (sid,)
    ).fetchone()
    results['registros_sin_catalogo'] = rows['cnt']

    # Facturas faltantes
    rows_falt = conn.execute(
        "SELECT factura FROM facturas_faltantes WHERE session_id = ?", (sid,)
    ).fetchall()
    results['facturas_faltantes'] = [r['factura'] for r in rows_falt]
    results['total_facturas_faltantes'] = len(results['facturas_faltantes'])

    # Facturas con error de extraccion
    rows_err = conn.execute(
        "SELECT filename FROM facturas_errores WHERE session_id = ?", (sid,)
    ).fetchall()
    results['facturas_con_error'] = [r['filename'] for r in rows_err]
    results['total_facturas_con_error'] = len(results['facturas_con_error'])

    conn.close()
    return results


# ============================================================
# 12. resumen_sesion
# ============================================================
def resumen_sesion(session_id=None):
    """Resumen completo de una sesion de procesamiento."""
    sid = _get_session(session_id)
    conn = get_connection()

    session_row = conn.execute(
        "SELECT * FROM processing_sessions WHERE id = ?", (sid,)
    ).fetchone()
    if not session_row:
        conn.close()
        return {'error': 'Sesion no encontrada'}

    result = dict(session_row)

    # Counts
    for table in ['importaciones', 'extraccion_facturas', 'catalogo_vehiculos',
                   'pedimentos', 'facturas_errores', 'facturas_faltantes']:
        cnt = conn.execute(
            f"SELECT COUNT(*) as cnt FROM {table} WHERE session_id = ?", (sid,)  # noqa: S608 — el nombre de tabla sale de un literal fijo, nunca de entrada
        ).fetchone()
        result[f'total_{table}'] = cnt['cnt']

    # Marca breakdown
    marcas = conn.execute(
        """SELECT m.nombre, COUNT(*) as total FROM importaciones i
           JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
           JOIN marcas m ON c.marca_id = m.id
           WHERE i.session_id = ? GROUP BY m.nombre ORDER BY total DESC""",
        (sid,)
    ).fetchall()
    result['por_marca'] = [dict(r) for r in marcas]

    # J y N breakdown
    jn = conn.execute(
        "SELECT j_y_n, COUNT(*) as total FROM importaciones WHERE session_id = ? GROUP BY j_y_n",
        (sid,)
    ).fetchall()
    result['por_j_y_n'] = [dict(r) for r in jn]

    conn.close()
    return result


# ============================================================
# 13. tendencia_anual
# ============================================================
def tendencia_anual(dimension='marca', session_id=None):
    """Tendencia mes a mes del seguimiento mensual por dimension."""
    sid = _get_session(session_id)
    conn = get_connection()

    if dimension == 'consumo':
        rows = conn.execute(
            """SELECT mes, mes_nombre, consumo_total, consumo_produccion,
                      consumo_inversion, acumulado_total
               FROM seguimiento_mensual WHERE session_id = ? ORDER BY mes""",
            (sid,)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT mes, mes_nombre, disponible_produccion_inicio,
                      disponible_inversion_inicio, disponible_produccion_fin,
                      disponible_inversion_fin
               FROM seguimiento_mensual WHERE session_id = ? ORDER BY mes""",
            (sid,)
        ).fetchall()

    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 14. analisis_fracciones
# ============================================================
def analisis_fracciones(session_id=None):
    """Distribucion de fracciones arancelarias."""
    sid = _get_session(session_id)
    conn = get_connection()
    rows = conn.execute(
        """SELECT c.fraccion, COUNT(*) as total, m.nombre as marca
           FROM importaciones i
           JOIN catalogo_vehiculos c ON i.catalogo_id = c.id
           JOIN marcas m ON c.marca_id = m.id
           WHERE i.session_id = ?
           GROUP BY c.fraccion, m.nombre
           ORDER BY total DESC""",
        (sid,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 15. consulta_historica
# ============================================================
def consulta_historica():
    """Comparacion entre todas las sesiones de procesamiento."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT ps.id, ps.session_date, ps.month_processed, ps.year_processed,
                  ps.total_pdfs_processed, ps.total_records, ps.processing_time_seconds,
                  ps.status,
                  (SELECT COUNT(*) FROM importaciones WHERE session_id = ps.id) as total_importaciones,
                  (SELECT COUNT(*) FROM extraccion_facturas WHERE session_id = ps.id) as total_extraccion
           FROM processing_sessions ps
           ORDER BY ps.session_date DESC"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 16. resumen_extraccion
# ============================================================
def resumen_extraccion(session_id=None):
    """Stats de la extraccion: total registros de facturas, por pais, por moneda, errores."""
    sid = _get_session(session_id)
    conn = get_connection()
    result = {}

    cnt = conn.execute(
        "SELECT COUNT(*) as total FROM extraccion_facturas WHERE session_id = ?", (sid,)
    ).fetchone()
    result['total_registros'] = cnt['total']

    por_pais = conn.execute(
        """SELECT pais_code, COUNT(*) as total FROM extraccion_facturas
           WHERE session_id = ? GROUP BY pais_code ORDER BY total DESC""",
        (sid,)
    ).fetchall()
    result['por_pais'] = [dict(r) for r in por_pais]

    por_moneda = conn.execute(
        """SELECT moneda, COUNT(*) as total FROM extraccion_facturas
           WHERE session_id = ? GROUP BY moneda ORDER BY total DESC""",
        (sid,)
    ).fetchall()
    result['por_moneda'] = [dict(r) for r in por_moneda]

    errores = conn.execute(
        "SELECT COUNT(*) as total FROM facturas_errores WHERE session_id = ?", (sid,)
    ).fetchone()
    result['total_errores'] = errores['total']

    conn.close()
    return result


# ============================================================
# 17. buscar_en_extraccion
# ============================================================
def buscar_en_extraccion(campo, valor, session_id=None):
    """Busca en datos crudos de extraccion por campo y valor."""
    sid = _get_session(session_id)
    allowed_fields = ['factura', 'pais_code', 'auto', 'chasis', 'j_y_n', 'moneda', 'filename']
    if campo not in allowed_fields:
        return {'error': f'Campo no permitido. Usar: {allowed_fields}'}

    conn = get_connection()
    rows = conn.execute(
        f"SELECT * FROM extraccion_facturas WHERE {campo} LIKE ? AND session_id = ? LIMIT 50",  # noqa: S608 — columna validada contra allowlist antes de llegar aquí
        (f"%{valor}%", sid)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ============================================================
# 18. consulta_sql
# ============================================================
def buscar_fragmentos(consulta, limite=None):
    """Busqueda de texto en los documentos de la sesion EN AMBITO.

    Va por `autogenes.busqueda`, no por el sandbox SQL: el indice FTS5 no es
    una tabla que el modelo deba poder consultar libremente, y el resultado ya
    llega acotado a la sesion y con su procedencia."""
    from autogenes.busqueda import MAX_RESULTADOS, buscar_fragmentos as _buscar

    try:
        sid = _get_session(None)
    except FueraDeAmbito as e:
        return {'error': str(e)}
    if not sid:
        return {'error': 'No hay sesion activa que consultar.'}
    conn = get_connection()
    try:
        return _buscar(conn, sid, consulta, limite or MAX_RESULTADOS)
    finally:
        conn.close()


def consulta_sql(query):
    """Ejecuta un SELECT del modelo dentro del sandbox de solo lectura.

    La garantia no es lexica sino estructural (ver jarvis/sandbox.py):
    conexion `mode=ro`, allowlist de tablas por autorizador y vistas
    acotadas a la sesion del ambito. La lista negra de palabras que habia
    aqui no acotaba ni la sesion ni las tablas: `SELECT content FROM
    chat_conversations` la pasaba entera.
    """
    import database
    from .sandbox import ConsultaRechazada, ejecutar_select

    try:
        sid = _get_session(None)
    except FueraDeAmbito as e:
        return {'error': str(e)}
    if not sid:
        return {'error': 'No hay sesion activa que consultar.'}
    try:
        return ejecutar_select(database.DB_PATH, sid, query)
    except ConsultaRechazada as e:
        return {'error': str(e)}


# ============================================================
# TOOL DEFINITIONS para Anthropic tool_use
# ============================================================

TOOL_DEFINITIONS = [
    {
        "name": "buscar_por_vin",
        "description": "Busca registros de un vehiculo por su numero VIN/chasis en importaciones y extraccion de facturas. Util para rastrear un vehiculo especifico.",
        "input_schema": {
            "type": "object",
            "properties": {
                "vin": {"type": "string", "description": "Numero VIN o chasis del vehiculo (parcial o completo)"},
                "session_id": {"type": "integer", "description": "ID de sesion (opcional, usa la mas reciente si no se especifica)"}
            },
            "required": ["vin"]
        }
    },
    {
        "name": "buscar_por_factura",
        "description": "Busca registros por numero de factura en importaciones y extraccion de facturas.",
        "input_schema": {
            "type": "object",
            "properties": {
                "factura": {"type": "string", "description": "Numero de factura (parcial o completo)"},
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": ["factura"]
        }
    },
    {
        "name": "contar_por_marca",
        "description": "Cuenta el total de vehiculos importados agrupados por marca (Audi, Bentley, Porsche, Seat, Volkswagen).",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "contar_por_pais",
        "description": "Cuenta vehiculos importados agrupados por pais de origen (DEU, CZE, SVK, ESP, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "precio_promedio",
        "description": "Calcula precio promedio, minimo y maximo de los vehiculos. Permite filtrar por marca y/o pais.",
        "input_schema": {
            "type": "object",
            "properties": {
                "marca": {"type": "string", "description": "Filtrar por marca (ej: AUDI, VOLKSWAGEN)"},
                "pais": {"type": "string", "description": "Filtrar por pais de origen (ej: DEU, CZE)"},
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "estado_cupos",
        "description": "Muestra el estado actual de los cupos de produccion e inversion: cantidad inicial, consumida, saldo y mes de agotamiento.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "seguimiento_mensual",
        "description": "Muestra el tracking mes a mes de consumo de cupos: produccion, inversion, disponible y acumulado.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "desglose_preferencia_arancelaria",
        "description": "Muestra el desglose de preferencia arancelaria J (si aplica) vs N (no aplica) en las importaciones.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "top_modelos",
        "description": "Muestra los N modelos de vehiculos mas importados con su marca y cantidad.",
        "input_schema": {
            "type": "object",
            "properties": {
                "n": {"type": "integer", "description": "Cantidad de modelos a mostrar (default: 10)", "default": 10},
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "comparar_meses",
        "description": "Compara el seguimiento de cupos entre dos meses especificos (1=Enero, 12=Diciembre).",
        "input_schema": {
            "type": "object",
            "properties": {
                "mes1": {"type": "integer", "description": "Primer mes (1-12)"},
                "mes2": {"type": "integer", "description": "Segundo mes (1-12)"},
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": ["mes1", "mes2"]
        }
    },
    {
        "name": "detectar_datos_faltantes",
        "description": "Detecta registros con datos faltantes: sin precio, sin J y N, sin catalogo, facturas faltantes y facturas con error de extraccion.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "resumen_sesion",
        "description": "Resumen completo de una sesion: totales, desglose por marca, por preferencia arancelaria, tiempos de procesamiento.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "tendencia_anual",
        "description": "Muestra la tendencia mes a mes del consumo o disponibilidad de cupos a lo largo del ano.",
        "input_schema": {
            "type": "object",
            "properties": {
                "dimension": {
                    "type": "string",
                    "description": "Dimension a analizar: 'consumo' (consumo mensual) o 'disponibilidad' (cupos disponibles)",
                    "enum": ["consumo", "disponibilidad"]
                },
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "analisis_fracciones",
        "description": "Distribucion de fracciones arancelarias del SAT, agrupadas por marca y cantidad.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "consulta_historica",
        "description": "Compara todas las sesiones de procesamiento: fechas, totales, tiempos. No requiere session_id.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "resumen_extraccion",
        "description": "Estadisticas de la extraccion de facturas PDF: total registros, desglose por pais, por moneda, errores.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": []
        }
    },
    {
        "name": "buscar_en_extraccion",
        "description": "Busca en los datos crudos de extraccion de facturas por un campo especifico (factura, pais_code, auto, chasis, j_y_n, moneda, filename).",
        "input_schema": {
            "type": "object",
            "properties": {
                "campo": {
                    "type": "string",
                    "description": "Campo por el cual buscar",
                    "enum": ["factura", "pais_code", "auto", "chasis", "j_y_n", "moneda", "filename"]
                },
                "valor": {"type": "string", "description": "Valor a buscar (parcial o completo)"},
                "session_id": {"type": "integer", "description": "ID de sesion (opcional)"}
            },
            "required": ["campo", "valor"]
        }
    },
    {
        "name": "consulta_sql",
        "description": "Ejecuta una consulta SQL SELECT personalizada contra la base de datos. Usar cuando las demas herramientas no cubran la pregunta del usuario. Solo se permiten consultas SELECT (lectura). El resultado se limita a 100 filas.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Consulta SQL SELECT a ejecutar. Debe ser exclusivamente un SELECT."}
            },
            "required": ["query"]
        }
    },
    {
        "name": "buscar_fragmentos",
        "description": (
            "Busca texto en los documentos dockeados de la sesion (contratos, "
            "actas, facturas, notas). Devuelve el extracto CON su procedencia: "
            "fragmento, pagina y documento. Usala cuando la pregunta sea sobre "
            "lo que DICE un documento, no sobre las cifras aduanales."),
        "input_schema": {
            "type": "object",
            "properties": {
                "consulta": {"type": "string",
                             "description": "Palabras a buscar. Soporta sintaxis FTS5: "
                                            "\"frase exacta\", palabra1 AND palabra2, prefijo*"},
                "limite": {"type": "integer",
                           "description": "Maximo de aciertos (por defecto 25)"}
            },
            "required": ["consulta"]
        }
    }
] + GRAFO_TOOL_DEFINITIONS  # F8: las tools de grafo del sustrato AUTOGENES
