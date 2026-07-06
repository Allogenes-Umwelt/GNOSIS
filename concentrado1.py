
import pandas as pd
import re
import itertools
import numpy as np
def ConcentradoOLD(file_path_DWH, file_path_Divisiones):


    # Cargar Datawerehouse
    df_data_werhouse = pd.read_csv(file_path_DWH, header=None, encoding='unicode_escape')
    # Carga de archivo Divisiones
    df_divisiones = pd.read_excel(file_path_Divisiones, engine='openpyxl')
    
    
    list_str = list(df_data_werhouse[0])
    list_index = list(df_data_werhouse.index)
    
    # OBTENIENDO COLUMNA A - ID
    # OBTENIENDO COLUMNA B - AUTO
    # OBTENIENDO COLUMNA C - FACTSEAT
    # OBTENIENDO COLUMNA D - FECFAC
    # OBTENIENDO COLUMNA E - CHASISAC
    # OBTENIENDO COLUMNA F - PRECIO
    list_col_A = []
    list_col_B = []
    list_col_C = []
    list_col_D = []
    list_col_E = []
    list_col_F = []
    for i in list_str:
        list_col_A.append(i[:2])
        list_col_B.append(i[2:8])
        list_col_C.append(i[8:16].replace(' ', ''))
        list_col_D.append(str(i[20:22] + i[18:20] + i[16:18]))
        list_col_E.append(i[22:39])
        list_col_F.append((i[39:46] + '.' + i[46:49]).replace(' ', ''))
        
    # OBTENIENDO COLUMNA J - PATENTE
    # OBTENIENDO COLUMNA K - PEDIMENTO
    list_recortado = []
    patron_2 = r'\w+-\d'  # \d+ coincide con uno o más dígitos
    
    for i in list_str:
        list_recortado.append(re.findall(patron_2, i))
        
    list_recortado_aplanado = list(itertools.chain(*list_recortado)) # aplanando listas
    
    list_recortado2 = []
    for i in list_recortado_aplanado:
        list_recortado2.append(re.sub(r'[a-zA-Z]', '', i))
    
    list_col_J = []
    list_col_K = []
    for i in list_recortado2:
        list_col_J.append(i[:4])
        list_col_K.append(i[4:11])
        
    # OBTENIENDO COLUMNA O - ADUANA
    list_col_O = []
    patron = r'\d\d-\d'  # coincide con encontrar '-' con dos numeros antes y un numero despues
    
    for i in list_str:
        list_col_O.append(re.findall(patron, i))
        
    list_col_O_aplanado = list(itertools.chain(*list_col_O)) # aplanando listas
    
    # Tratamiento archivo Divisiones
    list_cve_divisiones = list(df_divisiones['CLAVES'].astype(str))
    list_tip_divisiones = list(df_divisiones['Tipo'])
    list_frac_divisiones = list(df_divisiones['FRACCIÓN'])
    list_pais_divisiones = list(df_divisiones['Pais'])
    list_seguro_divisiones = list(df_divisiones['Seguro (Incrementables)'])
    list_flete_divisiones = list(df_divisiones['Flete (Incrementables)'])
    list_marca_divisiones = list(df_divisiones['MARCA'])
    
    
    # OBTENIENDO COLUMNA G - TIPO
    # OBTENIENDO COLUMNA H - FRACCION
    # OBTENIENDO COLUMNA I - PAIS
    # OBTENIENDO COLUMNA M - FLETE
    # OBTENIENDO COLUMNA N - SEGURO
    
    # En este paso obtengo todas las coincidencias que hay entre el concetrado y el archvio divisiones (sin necesidad de manipular el archivo divisiones)
    list_col_G = []
    list_col_H = []
    list_col_I = []
    list_col_M = []
    list_col_N = []
    list_col_EXTRA1 = []
    index_encontrado = []
    for i in range(len(list_col_B)):
        for j in range(len(list_cve_divisiones)):
            if list_col_B[i] in list_cve_divisiones[j]:
                #print('match auto')
                list_col_G.append(list_tip_divisiones[j])
                list_col_H.append(list_frac_divisiones[j])
                list_col_I.append(list_pais_divisiones[j])
                index_encontrado.append(list_index[i])
                list_col_M.append(list_flete_divisiones[j])
                list_col_N.append(list_seguro_divisiones[j])
                list_col_EXTRA1.append(list_marca_divisiones[j])
    # Si no encuentra coincidencia entre ambos archivos, este proceso hara que se llene con un nan, respetando la posicion del index que le corresponda
    list_col_G_2 = []
    list_col_H_2 = []
    list_col_I_2 = []
    list_col_M_2 = []
    list_col_N_2 = []
    list_col_EXTRA2 = []
    for i in range(len(list_index)):
        for j in range(len(index_encontrado)):
            if list_index[i] == index_encontrado[j]:
                #print('match index')

                list_col_G_2.append(list_col_G[j])
                list_col_H_2.append(list_col_H[j])
                list_col_I_2.append(list_col_I[j])
                list_col_M_2.append(list_col_M[j])
                list_col_N_2.append(list_col_N[j]/100)
                list_col_EXTRA2.append(list_col_EXTRA1[j])
        if list_index[i] not in index_encontrado:
            list_col_G_2.append(np.nan)
            list_col_H_2.append(np.nan)
            list_col_I_2.append(np.nan)
            list_col_M_2.append(np.nan)
            list_col_N_2.append(np.nan)
            list_col_EXTRA2.append(np.nan)
    # Columna L (se sigue pensando como se va a rellenar)
    list_col_L = [np.NaN]*(len(list_col_A))
    
    # Convirtiendo en DF
    df_col_A = pd.DataFrame(list_col_A)
    df_col_B = pd.DataFrame(list_col_B)
    df_col_C = pd.DataFrame(list_col_C)
    df_col_D = pd.DataFrame(list_col_D)
    df_col_E = pd.DataFrame(list_col_E)
    df_col_F = pd.DataFrame(list_col_F)
    df_col_G = pd.DataFrame(list_col_G_2)
    df_col_H = pd.DataFrame(list_col_H_2)
    df_col_I = pd.DataFrame(list_col_I_2)
    df_col_J = pd.DataFrame(list_col_J)
    df_col_K = pd.DataFrame(list_col_K)
    df_col_L = pd.DataFrame(list_col_L)
    df_col_M = pd.DataFrame(list_col_M_2)
    df_col_N = pd.DataFrame(list_col_N_2)
    df_col_O = pd.DataFrame(list_col_O_aplanado)
    df_col_P = pd.DataFrame(list_col_EXTRA2)

    # Se agrega de una vez la columna -J y N-, ya que se utilizara para el llenado del Concentrado2
    list_col_F_new_JyN = [np.nan]*len(list_col_A)
    df_col_F_new_JyN = pd.DataFrame(list_col_F_new_JyN)
    
    df_concentrado = pd.concat([df_col_A, df_col_B, df_col_C, df_col_D, df_col_E, df_col_F_new_JyN,df_col_F, 
                                df_col_G, df_col_H, df_col_I, df_col_J, df_col_K, df_col_L,
                                df_col_M, df_col_N, df_col_O, df_col_P], axis=1)
    
    
    
    df_concentrado.columns = ['ID', 'AUTO', 'FACT', 'FECFACT', 'CHASIS', 'J y N','PRECIO', 'TIPO', 'FRACCION', 'PAIS', 'PATENTE', 'PEDIMENTO', 'FECHA PEDIMENTO', 'FLETES', 'SEGUROS', 'ADUANA', 'MARCA']
    
    
    return [df_concentrado, df_data_werhouse]


def Concentrado(file_path_DWH, file_path_Divisiones):
    # Load Data
    df_data_warehouse = pd.read_csv(file_path_DWH, header=None, encoding='unicode_escape')
    df_divisiones = pd.read_excel(file_path_Divisiones, engine='openpyxl')
    
    print("Data Warehouse head:\n", df_data_warehouse.head())  # Check data loaded correctly
    print("Divisiones head:\n", df_divisiones.head())

    list_str = list(df_data_warehouse[0])
    list_index = list(df_data_warehouse.index)

    # Column Creations
    list_col_A = [i[:2] for i in list_str]
    list_col_B = [i[2:8] for i in list_str]
    list_col_C = [i[8:16].replace(' ', '') for i in list_str]
    list_col_D = [str(i[20:22] + i[18:20] + i[16:18]) for i in list_str]
    list_col_E = [i[22:39] for i in list_str]
    list_col_F = [(i[39:46] + '.' + i[46:49]).replace(' ', '') for i in list_str]

    print("List Column A sample:", list_col_A[:5])  # Checking the first few entries
    print("List Column B sample:", list_col_B[:5])

    # Process Columns J and K
    list_recortado = [re.findall(r'\w+-\d', i) for i in list_str]
    list_recortado_aplanado = list(itertools.chain(*list_recortado))
    list_recortado2 = [re.sub(r'[a-zA-Z]', '', i) for i in list_recortado_aplanado]
    
    list_col_J = [i[:4] for i in list_recortado2]
    list_col_K = [i[4:11] for i in list_recortado2]

    # Extracting Fecha Pedimento (Column L)
    list_col_L = [i[81:89] if len(i) >= 56 else np.nan for i in list_str]
    
    # Division Columns
    list_cve_divisiones = list(df_divisiones['CLAVES'].astype(str))
    list_tip_divisiones = list(df_divisiones['Tipo'])
    list_frac_divisiones = list(df_divisiones['FRACCIÓN'])
    list_pais_divisiones = list(df_divisiones['Pais'])
    list_seguro_divisiones = list(df_divisiones['Seguro (Incrementables)'])
    list_flete_divisiones = list(df_divisiones['Flete (Incrementables)'])
    list_marca_divisiones = list(df_divisiones['MARCA'])

    # Match Divisions and track any unmatched rows
    list_col_G, list_col_H, list_col_I = [], [], []
    list_col_M, list_col_N, list_col_EXTRA1 = [], [], []
    index_encontrado = []

    for i, val_B in enumerate(list_col_B):
        matched = False
        for j, val_div in enumerate(list_cve_divisiones):
            if val_B in val_div:
                list_col_G.append(list_tip_divisiones[j])
                list_col_H.append(list_frac_divisiones[j])
                list_col_I.append(list_pais_divisiones[j])
                index_encontrado.append(list_index[i])
                list_col_M.append(list_flete_divisiones[j])
                val = list_seguro_divisiones[j]
                if val is None or str(val).strip() == "":
                    list_col_N.append(0)
                else:
                    try:
                        list_col_N.append(float(val) / 100)
                    except ValueError:
                        list_col_N.append(0)  # fallback for "N/A", etc.

                list_col_EXTRA1.append(list_marca_divisiones[j])
                matched = True
                break
        if not matched:
            list_col_G.append(np.nan)
            list_col_H.append(np.nan)
            list_col_I.append(np.nan)
            list_col_M.append(np.nan)
            list_col_N.append(np.nan)
            list_col_EXTRA1.append(np.nan)

    # Log the lengths of lists before concatenation to identify any mismatches
    print("Length checks:")
    print("List A:", len(list_col_A), "List B:", len(list_col_B), "List C:", len(list_col_C))
    print("List G:", len(list_col_G), "List H:", len(list_col_H), "List I:", len(list_col_I))

    # Converting lists to DataFrames for concatenation
    df_col_A = pd.DataFrame(list_col_A)
    df_col_B = pd.DataFrame(list_col_B)
    df_col_C = pd.DataFrame(list_col_C)
    df_col_D = pd.DataFrame(list_col_D)
    df_col_E = pd.DataFrame(list_col_E)
    df_col_F = pd.DataFrame(list_col_F)
    df_col_G = pd.DataFrame(list_col_G)
    df_col_H = pd.DataFrame(list_col_H)
    df_col_I = pd.DataFrame(list_col_I)
    df_col_J = pd.DataFrame(list_col_J)
    df_col_K = pd.DataFrame(list_col_K)
    df_col_L = pd.DataFrame(list_col_L)
    df_col_M = pd.DataFrame(list_col_M)
    df_col_N = pd.DataFrame(list_col_N)
    df_col_O = pd.DataFrame([np.nan] * len(list_col_A))  # Placeholder
    df_col_P = pd.DataFrame(list_col_EXTRA1)

    # Concatenate columns
    df_concentrado = pd.concat([df_col_A, df_col_B, df_col_C, df_col_D, df_col_E, df_col_F, 
                                df_col_G, df_col_H, df_col_I, df_col_J, df_col_K, df_col_L,
                                df_col_M, df_col_N, df_col_O, df_col_P], axis=1)
    
    df_concentrado.columns = ['ID', 'AUTO', 'FACT', 'FECFACT', 'CHASIS', 'PRECIO', 'TIPO', 
                              'FRACCION', 'PAIS', 'PATENTE', 'PEDIMENTO', 'FECHA PEDIMENTO', 
                              'FLETES', 'SEGUROS', 'ADUANA', 'MARCA']

    return [df_concentrado, df_data_warehouse]
