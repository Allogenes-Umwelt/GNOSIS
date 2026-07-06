import pandas as pd
import numpy as np

def Concentrado2OLD(file_path_concentrado1, file_path_PDFs):


    # 1er concentrado
    df_concentrado1 = pd.read_excel(file_path_concentrado1, engine='openpyxl', dtype=str)

    # Informacion de los PDFs extraidos
    df_pdfs = pd.read_excel(file_path_PDFs, engine='openpyxl', dtype=str)
    
    # Columnas por rectificar del Concentrado
    list_fact_concentrado = list(df_concentrado1['FACT'])
    list_chasis_concentrado = list(df_concentrado1['CHASIS'])
    list_precio_concentrado = list(df_concentrado1['PRECIO'])
    list_pais_concentrado = list(df_concentrado1['PAIS'])
    list_index_concentrado = list(df_concentrado1.index)
    
    # Columnas que se usaran del PDFs
    list_fact_pdfs = list(df_pdfs['Factura'])
    list_chasis_pdfs = list(df_pdfs['Chasis'])
    list_precio_pdfs = list(df_pdfs['Amount'])
    list_pais_pdfs = list(df_pdfs['Pais'])
    list_JyN_pdfs = list(df_pdfs['J y N'])
    
    list_index_encontrado = []
    list_JyN_revision = []
    list_pais_revision = []
    list_precio_revision = []
    list_fact_revision = []
    
    for i in range(len(list_fact_concentrado)):
        for j in range(len(list_fact_pdfs)):
            if str(list_fact_concentrado[i]) == str(list_fact_pdfs[j][:8]) and list_chasis_concentrado[i] == list_chasis_pdfs[j]:
                list_index_encontrado.append(i)
                list_pais_revision.append(list_pais_pdfs[j])
                list_precio_revision.append(list_precio_pdfs[j])
                list_fact_revision.append(list_fact_pdfs[j])
                # Condiciones especiales
                if list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'USA':
                    list_JyN_revision.append('J')
                elif list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'BRA':
                    list_JyN_revision.append('N')
                elif list_JyN_pdfs[j] == 'CUPO' and list_pais_pdfs[j] == 'IND': 
                    list_JyN_revision.append('N')
                else:
                    list_JyN_revision.append(list_JyN_pdfs[j])
                    
    # Si no encuentra coincidencia entre ambos archivos, este proceso hara que se llene con un nan, respetando la posicion del index que le corresponda
    list_JyN_revision_2 = []
    list_pais_revision_2 = []
    list_precio_revision_2 = []
    list_fact_revision_2 = []
    
    for i in range(len(list_index_concentrado)):
        for j in range(len(list_index_encontrado)):
            if list_index_concentrado[i] == list_index_encontrado[j]:
                list_JyN_revision_2.append(list_JyN_revision[j])
                list_pais_revision_2.append(list_pais_revision[j])
                list_precio_revision_2.append(list_precio_revision[j])
                list_fact_revision_2.append(list_fact_revision[j])
                
        if list_index_concentrado[i] not in list_index_encontrado:
            list_JyN_revision_2.append(np.nan)
            list_pais_revision_2.append(list_pais_concentrado[i])
            list_precio_revision_2.append(list_precio_concentrado[i])
            list_fact_revision_2.append(list_fact_concentrado[i])
        

    df_concentrado1['J y N'] = list_JyN_revision_2
    df_concentrado1['PAIS'] = list_pais_revision_2
    df_concentrado1['PRECIO'] = list_precio_revision_2
    df_concentrado1['FACT'] = list_fact_revision_2

    return [df_concentrado1, df_pdfs]


def Concentrado2OLD2(file_path_concentrado1, file_path_PDFs):
    # 1er concentrado
    df_concentrado1 = pd.read_excel(file_path_concentrado1, engine='openpyxl', dtype=str)

    # Informacion de los PDFs extraidos
    df_pdfs = pd.read_excel(file_path_PDFs, engine='openpyxl', dtype=str)
    
    # Columnas por rectificar del Concentrado
    list_fact_concentrado = list(df_concentrado1['FACT'])
    list_chasis_concentrado = list(df_concentrado1['CHASIS'])
    list_precio_concentrado = list(df_concentrado1['PRECIO'])
    list_pais_concentrado = list(df_concentrado1['PAIS'])
    list_index_concentrado = list(df_concentrado1.index)
    
    # Columnas que se usaran del PDFs
    list_fact_pdfs = list(df_pdfs['Factura'])
    list_chasis_pdfs = list(df_pdfs['Chasis'])
    list_precio_pdfs = list(df_pdfs['Amount'])
    list_pais_pdfs = list(df_pdfs['Pais'])
    list_JyN_pdfs = list(df_pdfs['J y N'])
    
    list_index_encontrado = []
    list_JyN_revision = []
    list_pais_revision = []
    list_precio_revision = []
    list_fact_revision = []
        
    for i in range(len(list_fact_concentrado)):
        for j in range(len(list_fact_pdfs)):
            # Convert to string and slice safely, ignoring NaN values
            fact_pdf_str = str(list_fact_pdfs[j])[:8] if pd.notna(list_fact_pdfs[j]) else ''
            if str(list_fact_concentrado[i]) == fact_pdf_str and list_chasis_concentrado[i] == list_chasis_pdfs[j]:
                print('match: ', fact_pdf_str)
                list_index_encontrado.append(i)
                list_pais_revision.append(list_pais_pdfs[j])
                list_precio_revision.append(list_precio_pdfs[j])
                list_fact_revision.append(list_fact_pdfs[j])
                print('pais: ', list_JyN_pdfs[j])
                # Condiciones especiales
                if list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'USA':
                    list_JyN_revision.append('J')
                elif list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'BRA':
                    list_JyN_revision.append('N')
                elif list_JyN_pdfs[j] == 'CUPO' and list_pais_pdfs[j] == 'IND': 
                    list_JyN_revision.append('N')
                else:
                    list_JyN_revision.append(list_JyN_pdfs[j])

                    
    # Si no encuentra coincidencia entre ambos archivos, este proceso hara que se llene con un nan, respetando la posicion del index que le corresponda
    list_JyN_revision_2 = []
    list_pais_revision_2 = []
    list_precio_revision_2 = []
    list_fact_revision_2 = []
    list_pais_witness = []

    for i in range(len(list_index_concentrado)):
        matched = False
        for j in range(len(list_index_encontrado)):
            if list_index_concentrado[i] == list_index_encontrado[j]:
                list_JyN_revision_2.append(list_JyN_revision[j])
                list_pais_revision_2.append(list_pais_revision[j])
                list_precio_revision_2.append(list_precio_revision[j])
                list_fact_revision_2.append(list_fact_revision[j])
                matched = True
                # Witness contains 'sin cambio' if there's no change in 'PAIS', otherwise contains new 'PAIS'
                if list_pais_revision_2[-1] == list_pais_concentrado[i]:
                    list_pais_witness.append('sin cambio')
                else:
                    list_pais_witness.append(list_pais_revision_2[-1])
                
        if not matched:
            list_JyN_revision_2.append(np.nan)
            list_pais_revision_2.append(list_pais_concentrado[i])
            list_precio_revision_2.append(list_precio_concentrado[i])
            list_fact_revision_2.append(list_fact_concentrado[i])
            list_pais_witness.append('sin cambio')

    df_concentrado1['J y N'] = list_JyN_revision_2
    df_concentrado1['PAIS'] = list_pais_revision_2
    df_concentrado1['PRECIO'] = list_precio_revision_2
    df_concentrado1['FACT'] = list_fact_revision_2
    df_concentrado1['PAIS_WITNESS'] = list_pais_witness  # Add witness column

    return [df_concentrado1, df_pdfs]

def Concentrado2old2(file_path_concentrado1, file_path_PDFs):
    # 1er concentrado
    df_concentrado1 = pd.read_excel(file_path_concentrado1, engine='openpyxl', dtype=str)

    # Informacion de los PDFs extraidos
    df_pdfs = pd.read_excel(file_path_PDFs, engine='openpyxl', dtype=str)
    
    # Columnas por rectificar del Concentrado
    list_fact_concentrado = list(df_concentrado1['FACT'])
    list_chasis_concentrado = list(df_concentrado1['CHASIS'])
    list_precio_concentrado = list(df_concentrado1['PRECIO'])
    list_pais_concentrado = list(df_concentrado1['PAIS'])
    list_index_concentrado = list(df_concentrado1.index)
    
    # Columnas que se usaran del PDFs
    list_fact_pdfs = list(df_pdfs['Factura'])
    list_chasis_pdfs = list(df_pdfs['Chasis'])
    list_precio_pdfs = list(df_pdfs['Amount'])
    list_pais_pdfs = list(df_pdfs['Pais'])
    list_JyN_pdfs = list(df_pdfs['J y N'])
    
    list_index_encontrado = []
    list_JyN_revision = []
    list_pais_revision = []
    list_precio_revision = []
    list_fact_revision = []
        
    for i in range(len(list_fact_concentrado)):
        for j in range(len(list_fact_pdfs)):
            # Convert to string and slice safely, ignoring NaN values
            fact_pdf_str = str(list_fact_pdfs[j])[:8] if pd.notna(list_fact_pdfs[j]) else ''
            if str(list_fact_concentrado[i]) == fact_pdf_str and list_chasis_concentrado[i] == list_chasis_pdfs[j]:
                print('match: ', fact_pdf_str)
                list_index_encontrado.append(i)
                list_pais_revision.append(list_pais_pdfs[j])
                list_precio_revision.append(list_precio_pdfs[j])
                list_fact_revision.append(list_fact_pdfs[j])
                print('pais: ', list_JyN_pdfs[j])
                # Condiciones especiales
                if list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'USA':
                    list_JyN_revision.append('J')
                elif list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'BRA':
                    list_JyN_revision.append('N')
                elif list_JyN_pdfs[j] == 'CUPO' and list_pais_pdfs[j] == 'IND': 
                    list_JyN_revision.append('N')
                else:
                    list_JyN_revision.append(list_JyN_pdfs[j])

                    
    # Si no encuentra coincidencia entre ambos archivos, este proceso hara que se llene con un nan, respetando la posicion del index que le corresponda
    list_JyN_revision_2 = []
    list_pais_revision_2 = []
    list_precio_revision_2 = []
    list_fact_revision_2 = []
    list_pais_witness = []

    for i in range(len(list_index_concentrado)):
        matched = False
        for j in range(len(list_index_encontrado)):
            if list_index_concentrado[i] == list_index_encontrado[j]:
                list_JyN_revision_2.append(list_JyN_revision[j])
                list_pais_revision_2.append(list_pais_revision[j])
                list_precio_revision_2.append(list_precio_revision[j])
                list_fact_revision_2.append(list_fact_revision[j])
                matched = True
                # Witness contains 'sin cambio' if there's no change in 'PAIS', otherwise contains new 'PAIS'
                if list_pais_revision_2[-1] == list_pais_concentrado[i]:
                    list_pais_witness.append('sin cambio')
                else:
                    list_pais_witness.append(list_pais_revision_2[-1])
                
        if not matched:
            list_JyN_revision_2.append(np.nan)
            list_pais_revision_2.append(list_pais_concentrado[i])
            list_precio_revision_2.append(list_precio_concentrado[i])
            list_fact_revision_2.append(list_fact_concentrado[i])
            list_pais_witness.append('sin cambio')

    df_concentrado1['J y N'] = list_JyN_revision_2
    df_concentrado1['PAIS'] = list_pais_revision_2
    df_concentrado1['PRECIO'] = list_precio_revision_2
    df_concentrado1['FACT'] = list_fact_revision_2
    df_concentrado1['PAIS_WITNESS'] = list_pais_witness  # Add witness column

    return [df_concentrado1, df_pdfs]


import pandas as pd
import numpy as np

def Concentrado2Deprecated(file_path_concentrado1, file_path_PDFs):
    # Leer el primer concentrado
    df_concentrado1 = pd.read_excel(file_path_concentrado1, engine='openpyxl', dtype=str)

    # Leer la información de los PDFs extraídos
    df_pdfs = pd.read_excel(file_path_PDFs, engine='openpyxl', dtype=str)

    # Columnas por rectificar del Concentrado
    list_fact_concentrado = list(df_concentrado1['FACT'])
    list_chasis_concentrado = list(df_concentrado1['CHASIS'])
    list_precio_concentrado = list(df_concentrado1['PRECIO'])
    list_pais_concentrado = list(df_concentrado1['PAIS'])
    list_index_concentrado = list(df_concentrado1.index)

    # Columnas del archivo PDFs
    list_fact_pdfs = list(df_pdfs['Factura'])
    list_chasis_pdfs = list(df_pdfs['Chasis'])
    list_precio_pdfs = list(df_pdfs['Amount'])
    list_pais_pdfs = list(df_pdfs['Pais'])
    list_JyN_pdfs = list(df_pdfs['J y N'])

    # Listas temporales para los datos que se usarán para corregir
    list_index_encontrado = []
    list_JyN_revision = []
    list_pais_revision = []
    list_precio_revision = []
    list_fact_revision = []

    for i in range(len(list_fact_concentrado)):
        print('Processing Factura:', i, '- de ', len(list_fact_concentrado))
        for j in range(len(list_fact_pdfs)):
            fact_pdf_str = str(list_fact_pdfs[j])[:8] if pd.notna(list_fact_pdfs[j]) else ''
            
            # Check if FACT in concentrado is '*' - if so, only match by chassis
            if str(list_fact_concentrado[i]) == '*':
                match_condition = list_chasis_concentrado[i] == list_chasis_pdfs[j]
            else:
                # Normal matching: both FACT and chassis must match
                match_condition = (str(list_fact_concentrado[i]) == fact_pdf_str and 
                                list_chasis_concentrado[i] == list_chasis_pdfs[j])
            
            if match_condition:
                list_index_encontrado.append(i)
                list_pais_revision.append(list_pais_pdfs[j])
                list_precio_revision.append(list_precio_pdfs[j])
                list_fact_revision.append(list_fact_pdfs[j])

                # Reglas especiales para JyN
                if list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'USA':
                    list_JyN_revision.append('J')
                elif list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'BRA':
                    list_JyN_revision.append('N')
                elif list_JyN_pdfs[j] == 'CUPO' and list_pais_pdfs[j] == 'IND':
                    list_JyN_revision.append('N')
                else:
                    list_JyN_revision.append(list_JyN_pdfs[j])

    # Crear un mapeo índice -> datos corregidos
    mapa_datos = {
        i: (jy, pais, precio, fact)
        for i, jy, pais, precio, fact in zip(
            list_index_encontrado,
            list_JyN_revision,
            list_pais_revision,
            list_precio_revision,
            list_fact_revision
        )
    }

    # Crear las listas completas respetando la longitud del DataFrame
    list_JyN_revision_2 = []
    list_pais_revision_2 = []
    list_precio_revision_2 = []
    list_fact_revision_2 = []
    list_pais_witness = []

    for i in list_index_concentrado:
        if i in mapa_datos:
            jy, pais, precio, fact = mapa_datos[i]
            list_JyN_revision_2.append(jy)
            list_pais_revision_2.append(pais)
            list_precio_revision_2.append(precio)
            list_fact_revision_2.append(fact)

            if pais == list_pais_concentrado[i]:
                list_pais_witness.append('sin cambio')
            else:
                list_pais_witness.append(pais)
        else:
            list_JyN_revision_2.append(np.nan)
            list_pais_revision_2.append(list_pais_concentrado[i])
            list_precio_revision_2.append(list_precio_concentrado[i])
            list_fact_revision_2.append(list_fact_concentrado[i])
            list_pais_witness.append('sin cambio')

    # Validar que todas las listas tengan el mismo largo que el DataFrame original
    assert len(list_JyN_revision_2) == len(df_concentrado1)
    assert len(list_pais_revision_2) == len(df_concentrado1)
    assert len(list_precio_revision_2) == len(df_concentrado1)
    assert len(list_fact_revision_2) == len(df_concentrado1)
    assert len(list_pais_witness) == len(df_concentrado1)

    # Asignar al DataFrame
    df_concentrado1['J y N'] = list_JyN_revision_2
    df_concentrado1['PAIS'] = list_pais_revision_2
    df_concentrado1['PRECIO'] = list_precio_revision_2
    df_concentrado1['FACT'] = list_fact_revision_2
    df_concentrado1['PAIS_WITNESS'] = list_pais_witness


    ###FACTURAS FALTANTES DE J Y N 

    facturas_faltantes = []
    facturas_faltantes = df_concentrado1[df_concentrado1['J y N'].isna()]['FACT'].tolist()
    dfFacturasFaltantes = pd.DataFrame(facturas_faltantes, columns=['FACT'])
    facturas_faltantes_unique = dfFacturasFaltantes['FACT'].unique()

    if facturas_faltantes:
        print('Facturas faltantes de J y N:',len(facturas_faltantes_unique), facturas_faltantes_unique)
    else:
        print('No hay facturas faltantes de J y N.')


    ###PAISES DE LOS CUALES SE TIENE REFERENCIA PROGRAMATICA
    PaisesExistente = {
        'CZE':'Republica Checa',
        'DEU':'Alemania',
        'SVK':'Eslovaquia',
        'ESP':'Espana',
        'GBR':'Reino Unido',
        'HUN':'Hungria',
        'BRA':'Brasil',
        'IND':'India',
        'ZAF':'Sudafrica',
        'ARG': 'Argentina',
        'BEL' : 'Belgica',
        'POL' : 'Polonia',
        'USA' : 'Estados Unidos',
        'HUNGARY' : 'Hungria',
        'TUR' : 'Turquia'
    }
    paises_encontrados = df_concentrado1['PAIS'].unique()
    paisesNuevos = [pais for pais in paises_encontrados if pais not in PaisesExistente]
    
    if paisesNuevos:
        print('Paises nuevos encontrados:', paisesNuevos)
    else:
        print('No se encontraron paises nuevos.')

    df_copy = df_concentrado1.copy()
    df_copy.rename(columns={
        'FECFACT': 'FECHA FACTURA',
        'FACT': 'FACTURA',
        'CHASIS': 'VIN',
        'J y N': 'PREFERENCIA ARANCELARIA'
    }, inplace=True)

    # 1. Limpiar y convertir la columna 'FECHA FACTURA'
    df_copy['FECHA FACTURA'] = df_copy['FECHA FACTURA'].astype(str).str.replace(r'\D', '', regex=True)
    df_copy.loc[df_copy['FECHA FACTURA'] == '', 'FECHA FACTURA'] = None

    # Ahora usamos el formato correcto: ddmmyy
    df_copy['FECHA FACTURA'] = pd.to_datetime(
        df_copy['FECHA FACTURA'],
        format='%d%m%y',
        errors='coerce'
    )

    # 2. Formatear la fecha a 'dd/mm/aa', dejando en blanco las no válidas
    df_copy['FECHA FACTURA'] = df_copy['FECHA FACTURA'].apply(lambda x: x.strftime('%d/%m/%y') if pd.notnull(x) else '')

    # 3. Convertir la columna 'FACTURA' a string
    df_copy['FACTURA'] = df_copy['FACTURA'].astype(str)

    # Seleccionar y reordenar columnas
    df_copy = df_copy[['VIN',  'FACTURA', 'FECHA FACTURA', 'PAIS','PREFERENCIA ARANCELARIA']]

    return [df_concentrado1, df_pdfs, facturas_faltantes_unique,df_copy]



def Concentrado2(file_path_concentrado1, file_path_PDFs):
    # Leer el primer concentrado
    df_concentrado1 = pd.read_excel(file_path_concentrado1, engine='openpyxl', dtype=str)

    # Leer la información de los PDFs extraídos
    df_pdfs = pd.read_excel(file_path_PDFs, engine='openpyxl', dtype=str)

    # Columnas por rectificar del Concentrado
    list_fact_concentrado = list(df_concentrado1['FACT'])
    list_chasis_concentrado = list(df_concentrado1['CHASIS'])
    list_precio_concentrado = list(df_concentrado1['PRECIO'])
    list_pais_concentrado = list(df_concentrado1['PAIS'])
    list_index_concentrado = list(df_concentrado1.index)

    # Columnas del archivo PDFs
    list_fact_pdfs = list(df_pdfs['Factura'])
    list_chasis_pdfs = list(df_pdfs['Chasis'])
    list_precio_pdfs = list(df_pdfs['Amount'])
    list_pais_pdfs = list(df_pdfs['Pais'])
    list_JyN_pdfs = list(df_pdfs['J y N'])

    # Listas temporales para los datos que se usarán para corregir
    list_index_encontrado = []
    list_JyN_revision = []
    list_pais_revision = []
    list_precio_revision = []
    list_fact_revision = []

    for i in range(len(list_fact_concentrado)):
        print('Processing Factura:', i, '- de ', len(list_fact_concentrado))
        for j in range(len(list_fact_pdfs)):
            fact_pdf_str = str(list_fact_pdfs[j])[:8] if pd.notna(list_fact_pdfs[j]) else ''
            
            # Check if FACT in concentrado is '*' - if so, only match by chassis
            if str(list_fact_concentrado[i]) == '*':
                match_condition = list_chasis_concentrado[i] == list_chasis_pdfs[j]
            else:
                # Normal matching: both FACT and chassis must match
                match_condition = (str(list_fact_concentrado[i]) == fact_pdf_str and 
                                list_chasis_concentrado[i] == list_chasis_pdfs[j])
            
            if match_condition:
                list_index_encontrado.append(i)
                list_pais_revision.append(list_pais_pdfs[j])
                list_precio_revision.append(list_precio_pdfs[j])
                list_fact_revision.append(list_fact_pdfs[j])

                # Reglas especiales para JyN
                if list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'USA':
                    list_JyN_revision.append('J')
                elif list_JyN_pdfs[j] == 'C.O' and list_pais_pdfs[j] == 'BRA':
                    list_JyN_revision.append('C.O')
                elif list_JyN_pdfs[j] == 'CUPO' and list_pais_pdfs[j] == 'IND':
                    list_JyN_revision.append('N')
                else:
                    list_JyN_revision.append(list_JyN_pdfs[j])

    # Crear un mapeo índice -> datos corregidos
    mapa_datos = {
        i: (jy, pais, precio, fact)
        for i, jy, pais, precio, fact in zip(
            list_index_encontrado,
            list_JyN_revision,
            list_pais_revision,
            list_precio_revision,
            list_fact_revision
        )
    }

    # Crear las listas completas respetando la longitud del DataFrame
    list_JyN_revision_2 = []
    list_pais_revision_2 = []
    list_precio_revision_2 = []
    list_fact_revision_2 = []
    list_pais_witness = []

    for i in list_index_concentrado:
        if i in mapa_datos:
            jy, pais, precio, fact = mapa_datos[i]
            list_JyN_revision_2.append(jy)
            list_pais_revision_2.append(pais)
            list_precio_revision_2.append(precio)
            list_fact_revision_2.append(fact)

            if pais == list_pais_concentrado[i]:
                list_pais_witness.append('sin cambio')
            else:
                list_pais_witness.append(pais)
        else:
            list_JyN_revision_2.append(np.nan)
            list_pais_revision_2.append(list_pais_concentrado[i])
            list_precio_revision_2.append(list_precio_concentrado[i])
            list_fact_revision_2.append(list_fact_concentrado[i])
            list_pais_witness.append('sin cambio')

    # Validar que todas las listas tengan el mismo largo que el DataFrame original
    assert len(list_JyN_revision_2) == len(df_concentrado1)
    assert len(list_pais_revision_2) == len(df_concentrado1)
    assert len(list_precio_revision_2) == len(df_concentrado1)
    assert len(list_fact_revision_2) == len(df_concentrado1)
    assert len(list_pais_witness) == len(df_concentrado1)

    # Asignar al DataFrame
    df_concentrado1['J y N'] = list_JyN_revision_2
    df_concentrado1['PAIS'] = list_pais_revision_2
    df_concentrado1['PRECIO'] = list_precio_revision_2
    df_concentrado1['FACT'] = list_fact_revision_2
    df_concentrado1['PAIS_WITNESS'] = list_pais_witness


    ###FACTURAS FALTANTES DE J Y N 

    facturas_faltantes = []
    facturas_faltantes = df_concentrado1[df_concentrado1['J y N'].isna()]['FACT'].tolist()
    dfFacturasFaltantes = pd.DataFrame(facturas_faltantes, columns=['FACT'])
    facturas_faltantes_unique = dfFacturasFaltantes['FACT'].unique()

    if facturas_faltantes:
        print('Facturas faltantes de J y N:',len(facturas_faltantes_unique), facturas_faltantes_unique)
    else:
        print('No hay facturas faltantes de J y N.')


    ###PAISES DE LOS CUALES SE TIENE REFERENCIA PROGRAMATICA
    PaisesExistente = {
        'CZE':'Republica Checa',
        'DEU':'Alemania',
        'SVK':'Eslovaquia',
        'ESP':'Espana',
        'GBR':'Reino Unido',
        'HUN':'Hungria',
        'BRA':'Brasil',
        'IND':'India',
        'ZAF':'Sudafrica',
        'ARG': 'Argentina',
        'BEL' : 'Belgica',
        'POL' : 'Polonia',
        'USA' : 'Estados Unidos',
        'HUNGARY' : 'Hungria',
        'TUR' : 'Turquia'
    }
    paises_encontrados = df_concentrado1['PAIS'].unique()
    paisesNuevos = [pais for pais in paises_encontrados if pais not in PaisesExistente]
    
    if paisesNuevos:
        print('Paises nuevos encontrados:', paisesNuevos)
    else:
        print('No se encontraron paises nuevos.')

    df_copy = df_concentrado1.copy()
    df_copy.rename(columns={
        'FECFACT': 'FECHA FACTURA',
        'FACT': 'FACTURA',
        'CHASIS': 'VIN',
        'J y N': 'PREFERENCIA ARANCELARIA'
    }, inplace=True)

    # 1. Limpiar y convertir la columna 'FECHA FACTURA'
    df_copy['FECHA FACTURA'] = df_copy['FECHA FACTURA'].astype(str).str.replace(r'\D', '', regex=True)
    df_copy.loc[df_copy['FECHA FACTURA'] == '', 'FECHA FACTURA'] = None

    # Ahora usamos el formato correcto: ddmmyy
    df_copy['FECHA FACTURA'] = pd.to_datetime(
        df_copy['FECHA FACTURA'],
        format='%d%m%y',
        errors='coerce'
    )

    # 2. Formatear la fecha a 'dd/mm/aa', dejando en blanco las no válidas
    df_copy['FECHA FACTURA'] = df_copy['FECHA FACTURA'].apply(lambda x: x.strftime('%d/%m/%y') if pd.notnull(x) else '')

    # 3. Convertir la columna 'FACTURA' a string
    df_copy['FACTURA'] = df_copy['FACTURA'].astype(str)

    # Seleccionar y reordenar columnas
    df_copy = df_copy[['VIN',  'FACTURA', 'FECHA FACTURA', 'PAIS','PREFERENCIA ARANCELARIA']]

    return [df_concentrado1, df_pdfs, facturas_faltantes_unique,df_copy]
