import numpy as np
import pandas as pd
source_incrementables = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Marzo/DIVISIONES (MARZ_6bri)/IncrementableSNEW6APR.xlsx'
source_Divisiones = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/Insumos/DIVISIONES NUEVO.xls'
target_DivInc = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/Insumos/DivIncMayo6_2026.xlsx'


df_incrementables = pd.read_excel(source_incrementables )
df_divisiones = pd.read_excel(source_Divisiones)
df_incrementables_depurado2 = df_incrementables.iloc[4:]
#df_incrementables_depurado2 = df_incrementables_depurado1.drop(['VOLKSWAGEN'], axis=1)
df_incrementables_depurado2.columns = ['Marca', 'Pais', '','Seguro', 'Flete Maritimo']
list_marca_incrementable_depurado2 = list(df_incrementables_depurado2['Marca'])
list_pais_incrementable_depurado2 = list(df_incrementables_depurado2['Pais'].astype(str))
list_seguro_incrementable_depurado2 = list(df_incrementables_depurado2['Seguro'].astype(str))
list_flete_incrementable_depurado2 = list(df_incrementables_depurado2['Flete Maritimo'].astype(str))
list_pais2_incrementable_depurado2 = []
for i in list_pais_incrementable_depurado2:
    list_pais2_incrementable_depurado2.append(i[0:3])
list_depuracion_marca = []
for i in list_marca_incrementable_depurado2:
    if ',' in str(i) or '/' in str(i):
        if i[:2] == 'VW':
            list_depuracion_marca.append(i.replace('/', '/ VW ').replace('/', ' /').replace('  ', ' '))
        elif i[:4].upper() == 'AUDI':
            list_depuracion_marca.append(i.replace('/', '/ Audi ').replace('/', ' /').replace('  ', ' ').replace(',', ', Audi ').replace(',', ' ,').replace('  ', ' ').replace('-', ' '))
        elif i[:4].upper() == 'SEAT':
            list_depuracion_marca.append(i.replace('/', '/ Seat ').replace('/', ' /').replace('  ', ' ').replace(',', ', Seat ').replace(',', ' ,').replace('  ', ' '))
        elif i[:7].upper() == 'PORSCHE':
            list_depuracion_marca.append(i.replace('/', '/ Porsche ').replace('/', ' /').replace('  ', ' ').replace(',', ', Porsche ').replace(',', ' ,').replace('  ', ' '))
        elif i[:3].upper() == 'NFZ':
            list_depuracion_marca.append(i.replace('/', '/ NFZ ').replace('/', ' /').replace('  ', ' ').replace(',', ', NFZ ').replace(',', ' ,').replace('  ', ' '))
    elif i == 'Marca VW' or i == 'Marca AUDI' or i == 'Marca SEAT' or i == 'Marca PORSCHE' or i == 'Marca BENTLEY' or i == 'Vehiculos Comerciales':
        list_depuracion_marca.append('segmento')
    else:
        list_depuracion_marca.append(str(i))
df_incrementables_depurado2['Marca'] = list_depuracion_marca
list_tipo_div = list(df_divisiones['Tipo'])
list_pais_div = list(df_divisiones['Pais'])
list_index = list(df_divisiones.index)
list_tipo_div_level2 = []
for i in range(len(list_tipo_div)):
    list_tipo_div_level2.append(list_tipo_div[i].split(' '))
list_tipo_div_level3 = []
for i in range(len(list_tipo_div)):
    palabras = list_tipo_div_level2[i]
    if len(palabras) >= 3 and list_tipo_div[i][0:6].upper() == 'AUDI E':
        list_tipo_div_level3.append(palabras[0] + ' ' + palabras[1] + ' ' + palabras[2])
    elif len(palabras) >= 2 and (
        (list_tipo_div[i][:4].upper() == 'AUDI' and list_tipo_div[i][:6].upper() != 'AUDI E') or
        list_tipo_div[i][:4].upper() == 'SEAT' or
        list_tipo_div[i][0:6].upper() == 'E TRON' or
        list_tipo_div[i][0:7].upper() == 'PORSCHE' or
        list_tipo_div[i][:2] == 'VW' or
        list_tipo_div[i][0] == 'E'
    ):
        list_tipo_div_level3.append(palabras[0] + ' ' + palabras[1])
    else:
        list_tipo_div_level3.append(palabras[0] if palabras else '')
list_tipo_div_level4 = []
for i in range(len(list_tipo_div_level3)):
    if len(list_tipo_div_level3[i]) == 1:
        list_tipo_div_level4.append(list_tipo_div[i])
    elif list_tipo_div_level3[i] == 'CROSS' or list_tipo_div_level3[i] == 'RS':
        list_tipo_div_level4.append(list_tipo_div[i])
    else:
        list_tipo_div_level4.append(list_tipo_div_level3[i])
def div_vs_inc(list_tipo_div, list_depuracion_marca, list_index, list_seguro_incrementable_depurado2, list_flete_incrementable_depurado2):
    list_para_marca_div_incrementables = []
    index_encontrado = []
    list_para_seguro_div_incrementables = []
    list_para_flete_div_incrementables = []
    for i in range(len(list_tipo_div)):
        for j in range(len(list_depuracion_marca)):
            if list_tipo_div[i].upper() in list_depuracion_marca[j].upper():
                list_para_marca_div_incrementables.append(list_depuracion_marca[j])
                index_encontrado.append(list_index[i])
                list_para_seguro_div_incrementables.append(list_seguro_incrementable_depurado2[j])
                list_para_flete_div_incrementables.append(list_flete_incrementable_depurado2[j])
    # Si no encuentra coincidencia entre ambos archivos, este proceso hara que se llene con un nan, respetando la posicion del index que le corresponda
    list_para_marca_div_incrementables_2 = []
    list_para_seguro_div_incrementables_2 = []
    list_para_flete_div_incrementables_2 = []
    for i in range(len(list_index)):
        for j in range(len(index_encontrado)):
            if list_index[i] == index_encontrado[j]:
                list_para_marca_div_incrementables_2.append(list_para_marca_div_incrementables[j])
                list_para_seguro_div_incrementables_2.append(list_para_seguro_div_incrementables[j])
                list_para_flete_div_incrementables_2.append(list_para_flete_div_incrementables[j])
        if list_index[i] not in index_encontrado:
            list_para_marca_div_incrementables_2.append(np.nan)
            list_para_seguro_div_incrementables_2.append(np.nan)
            list_para_flete_div_incrementables_2.append(np.nan)
    return [list_para_marca_div_incrementables_2, list_para_seguro_div_incrementables_2, list_para_flete_div_incrementables_2, list_para_marca_div_incrementables]
#df_list_para_marca_div_incrementables_2 = pd.DataFrame(list_para_marca_div_incrementables_2)
a = div_vs_inc(list_tipo_div_level4, list_depuracion_marca, list_index, list_seguro_incrementable_depurado2, list_flete_incrementable_depurado2)
df_list_para_marca_div_incrementables_2 = pd.DataFrame(a[0], columns = ['Marca (Incrementables)'])
df_list_para_seguro_div_incrementables_2 = pd.DataFrame(a[1], columns = ['Seguro (Incrementables)'])
df_list_para_flete_div_incrementables_2 = pd.DataFrame(a[2], columns = ['Flete (Incrementables)'])
df_divisiones_completando = pd.concat([df_divisiones, df_list_para_marca_div_incrementables_2, df_list_para_seguro_div_incrementables_2, df_list_para_flete_div_incrementables_2], axis=1)
df_divisiones_completando.to_excel(target_DivInc, sheet_name="divisiones", index=False)
print('Preproceso terminado')