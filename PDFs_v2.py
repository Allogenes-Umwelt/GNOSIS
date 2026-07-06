import tabula
from tabula import read_pdf
import pandas as pd
import numpy as np
from archivos import archivos
import PyPDF2
import re
import itertools
from itertools import cycle, islice
from collections import deque
import os

#
# # Funcion para PDFs de Audi - VW

def PDFs_v1(file_path1):
    valid_currencies = {
    "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BGN", "BHD", "BIF",
    "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY", "COP", "CRC",
    "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "FOK", "GBP", "GEL",
    "GGP", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR", "ILS", "IMP", "INR",
    "IQD", "IRR", "ISK", "JEP", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KID", "KMF", "KRW", "KWD", "KYD", "KZT",
    "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR",
    "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR",
    "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SOS",
    "SRD", "SSP", "STN", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TVD", "TWD", "TZS", "UAH",
    "UGX", "USD", "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XOF", "XPF", "YER", "ZAR", "ZMW", "ZWL"
}
    OnepageFlag = False
    print('audio o vw') 
    df_PDF = tabula.read_pdf(file_path1, pages= 'all', pandas_options={'header':None})
    df_PDF_concatenado = pd.concat(df_PDF, axis = 0)
    print(df_PDF_concatenado)
    # Esta condicion es para ArgentinaP
    if len(df_PDF_concatenado.columns) == 3:
        list_col2 = list(df_PDF[0][2])
        factura = list_col2[0][-8:]
        date = list_col2[2].replace('FECHA: ', '').replace('20', '').replace('/', '')

        if len(date) == 4:
            date = '20' + date

        list_col0 = list(df_PDF[0][0])
        if 'Argentina' in list_col0[1]:
            pais = ['ARG']
            J_y_N = ['CUPO']
            list_leyenda_depurado_junto = 'NO EXISTEN CONVENIOS QUE PERMITAN ALTERACIONES DE PRECIOS.'
            list_moneda = ['USD']

        list_col0_concatenado = list(df_PDF_concatenado[0])
        list_col2_concatenado = list(df_PDF_concatenado[2])

        list_chasis = []
        list_auto = []
        list_amount = []
        for i in range(len(list_col0_concatenado)):
            if '•' in str(list_col0_concatenado[i]) and str(list_col2_concatenado[i]) != 'nan':
                list_auto.append(list_col0_concatenado[i][2:8])
                list_chasis.append(list_col0_concatenado[i][9:26])
                list_amount.append(list_col2_concatenado[i].split(' ')[-1])

        list_J_N = J_y_N*len(list_auto)
        list_pais = pais*len(list_auto)

    else:
        fila_1 = df_PDF_concatenado.iloc[0]
        #print('--------------------------',str(fila_1[1]))
        # Se ajusta por si la factura vive en otra columna y con otra leyenda
        if 'Invoice No.: ' in str(fila_1[1]):
            factura = fila_1[1].replace('Invoice No.: ', '')
            #print(factura)
            # Se condiciona cuando la fecha vive en otra columna
            try:
                date = fila_1[3].replace('20', '').replace('.', '')
                #print(date)
            except:
                date = fila_1[2].replace('20', '').replace('.', '').replace('Date: ', '')
        if 'Factura: ' in str(fila_1[0]):
            factura = fila_1[0].replace('Factura: ', '')
            date = fila_1[2].replace('20', '').replace('.', '')

        if len(date) == 4:
            date = '20' + date

        # A veces la primera hoja tiene 6 columnas y el resto 7 columnas, se tratara por separado la primera hoja y luego el resto
        # 1ra hoja:
        #print('len df_PDF[0].columns', len(df_PDF[0].columns))
        #print('len df_PDF_concatenado.columns', len(df_PDF_concatenado.columns))
        if len(df_PDF[0].columns) != len(df_PDF_concatenado.columns):
            if len(df_PDF[0].columns) == 6:


                df_PDF_concatenado2 = pd.concat(df_PDF[1:], axis = 0)

                list_col0_hoja0 = list(df_PDF[0][0])
                list_col1_hoja0 = list(df_PDF[0][1])
                list_col6_hoja0 = list(df_PDF[0][5])

                list_col0_demas_hojas = list(df_PDF_concatenado2[0])
                list_col1_demas_hojas = list(df_PDF_concatenado2[1])
                list_col6_demas_hojas = list(df_PDF_concatenado2[6])

                list_col0 = list_col0_hoja0 + list_col0_demas_hojas
                list_col1 = list_col1_hoja0 + list_col1_demas_hojas
                list_col6 = list_col6_hoja0 + list_col6_demas_hojas

                # Aseguro que sea solo numero para poder usarlo como condicion
                list_col6_depurando = []
                list_col6_depurando2 = []
                for i in range(len(list_col6)):
                    list_col6_depurando.append(str(list_col6[i]))
                    list_col6_depurando2.append(list_col6_depurando[i].replace('.', '').replace(',', ''))

                list_auto_chasis = []
                list_auto = []
                list_chasis = []
                list_amount = []
                list_J_N = []
                list_pais = []
                for i in range(len(list_col6_depurando2)):
                    #print('list_col1',list_col1[i])
                    if str(list_col6_depurando2[i]) != 'nan' and len(str(list_col0[i])) > 23 and list_col6_depurando2[i].isnumeric() == True and 'EXTENDED WARRANTY - REVERSE CHARGE' not in str(list_col0[i]):
                        list_auto_chasis.append(list_col0[i])
                        list_auto.append(list_col0[i][:6])
                        list_chasis.append(list_col0[i][7:24])
                        list_amount.append(list_col6[i])
                    if str(list_col0[i]) == 'J' or str(list_col0[i]) == 'N':
                        list_J_N.append(list_col0[i])
                        list_pais.append(list_col1[i][:3])
                    # Se agrega condicion cuando es vw-IND
                    if str(list_col1[i]) == 'IND':
                        list_J_N.append('CUPO')
                        list_pais.append(list_col1[i][:3])

            # A veces la primera hoja tiene 7 columnas y el resto 8 columnas, se tratara por separado la primera hoja y luego el resto
            elif len(df_PDF[0].columns) == 7:
                df_PDF_concatenado2 = pd.concat(df_PDF[1:], axis = 0)

                list_col0_hoja0 = list(df_PDF[0][0])
                list_col1_hoja0 = list(df_PDF[0][1])
                list_col6_hoja0 = list(df_PDF[0][6])

                list_col0_demas_hojas = list(df_PDF_concatenado2[0])
                list_col1_demas_hojas = list(df_PDF_concatenado2[1])
                list_col6_demas_hojas = list(df_PDF_concatenado2[7])

                list_col0 = list_col0_hoja0 + list_col0_demas_hojas
                list_col1 = list_col1_hoja0 + list_col1_demas_hojas
                list_col6 = list_col6_hoja0 + list_col6_demas_hojas

                # Aseguro que sea solo numero para poder usarlo como condicion
                list_col6_depurando = []
                list_col6_depurando2 = []
                for i in range(len(list_col6)):
                    list_col6_depurando.append(str(list_col6[i]))
                    list_col6_depurando2.append(list_col6_depurando[i].replace('.', '').replace(',', ''))

                list_auto_chasis = []
                list_auto = []
                list_chasis = []
                list_amount = []
                list_J_N = []
                list_pais = []
                for i in range(len(list_col6_depurando2)):
                    if str(list_col6_depurando2[i]) != 'nan' and len(str(list_col0[i])) > 23 and list_col6_depurando2[i].isnumeric() == True and 'EXTENDED WARRANTY - REVERSE CHARGE' not in str(list_col0[i]):
                        list_auto_chasis.append(list_col0[i])
                        list_auto.append(list_col0[i][:6])
                        list_chasis.append(list_col0[i][7:24])
                        list_amount.append(list_col6[i])
                    if str(list_col0[i]) == 'J' or str(list_col0[i]) == 'N':
                        list_J_N.append(list_col0[i])
                        list_pais.append(list_col1[i][:3])
                    # Se agrega condicion cuando es vw-IND
                    if str(list_col1[i]) == 'IND':
                        list_J_N.append('CUPO')
                        list_pais.append(list_col1[i][:3])
                    #Se agrega condicion cuando es vw-TUR
                    if str(list_col1[i]) == 'TUR':
                        list_J_N.append('CUPO')
                        list_pais.append(list_col1[i][:3])
        # Demas hojas
        else:
            
            # Condicion para cuando sean 7 o 6 columnas o 8
            if len(df_PDF_concatenado.columns) == 7:
                #print('list_col0')
                list_col0 = list(df_PDF_concatenado[0])
                #print(list_col0)
                #print('--------'*10)

                list_col1 = list(df_PDF_concatenado[1])
                #print('list_col1')
                #print(list_col1)
                #print('--------'*10)
                #print('list_col2')

                list_col2 = list(df_PDF_concatenado[2])
                #print(list_col2)
                #print('--------'*10)
                list_col3 = list(df_PDF_concatenado[3])
                #print('list_col3')  
                #print(list_col3)
                #print('--------'*10)
                list_col4 = list(df_PDF_concatenado[4])
                #print('list_col4')
                #print(list_col4)
                #print('--------'*10)
                list_col6 = list(df_PDF_concatenado[6])
                
                list_col5 = list(df_PDF_concatenado[5])
                #print('list_col5')
                #print(list_col5)
                #print('--------'*10)
                #print('--------'*10)
                #print('list_col6')
                #print(list_col6)
                #print('--------')

            elif len(df_PDF_concatenado.columns) == 6:
                #print('cols num: 6')

                list_col0 = list(df_PDF_concatenado[0])
                list_col1 = list(df_PDF_concatenado[1])
                list_col6 = list(df_PDF_concatenado[5])
            elif len(df_PDF_concatenado.columns) == 8:
                #print(df_PDF_concatenado[4])
                #print(df_PDF_concatenado[5])
                ####CASO CUANDO ES 1 SOLA HOJA DE BRASIL Y TIENE COLUMNAS VACIAS
                if(df_PDF_concatenado[6].isna().all() and  df_PDF_concatenado[5].isna().all() ):
                    print('cols num: 8 pero 5 y 6 vacias')
                    list_col0 = list(df_PDF_concatenado[0])
                    list_col1 = list(df_PDF_concatenado[1])
                    list_col6 = list(df_PDF_concatenado[7])
                    list_col5 = list(df_PDF_concatenado[4])
                    OnepageFlag = True



                else:
                    #print('cols num: 8')
                    OnepageFlag = False
                    list_col0 = list(df_PDF_concatenado[0])
                    list_col1 = list(df_PDF_concatenado[1])
                    list_col5 = list(df_PDF_concatenado[4])

                    list_col6 = list(df_PDF_concatenado[7])
                #print('lista_col6 len',len(list_col6))




                



            # Aseguro que sea solo numero para poder usarlo como condicion
            list_col6_depurando = []
            list_col6_depurando2 = []
            for i in range(len(list_col6)):
                list_col6_depurando.append(str(list_col6[i]))
                list_col6_depurando2.append(list_col6_depurando[i].replace('.', '').replace(',', ''))
             #   print(i,'list_col6_depurando2 ',list_col6_depurando2[i])
                #print(i,'list_col0_chasis corr ',list_col0[i])


            list_auto_chasis = []
            list_auto = []
            list_chasis = []
            list_amount = []
            list_J_N = []
            list_pais = []


            ####CONDIION PARA BELGICA 
            if 'BEL' in str(list_col1):
                print('entramos a belgica')

                list_col5_depurando = []
                list_col5_depurando2 = []
                for i in range(len(list_col5)):
                    list_col5_depurando.append(str(list_col5[i]))
                    list_col5_depurando2.append(list_col5_depurando[i].replace('.', '').replace(',', ''))
                    print(i,'list_col5_depurando2 ',list_col5_depurando2[i])

                for i in range(len(list_col0)): 
                    if  str(list_col5_depurando2[i]) != 'nan' and len(str(list_col0[i])) > 23 and list_col5_depurando2[i].isnumeric() ==True:
                        #print(i,' ---->  col0[i]: ',list_col0[i])
                        #print(i,' ---->  col6[i]: ',list_col6_depurando2[i])
                        #print(i,' ---->  col1[i]: ',list_col1[i])
                        #print(i,' ---->  col5[i]: ',list_col5[i])
                        list_auto_chasis.append(list_col0[i])
                        list_auto.append(list_col0[i][:6])
                        list_chasis.append(list_col0[i][7:24])
                        list_amount.append(list_col5[i])
                    else: print(i,' col0[i]: ',list_col0[i])

                for i in range(len(list_col6)):
                    print(i,' col6[i]: ',list_col6[i])

                for i in range(len(list_col1)):
                    print(i,' col1[i]: ',list_col1[i])


            

        ################EXTRAS POR SI NO JALA LA PIRMERA HOJA
            extraHeap= []
            extracurr = []
            extracalif = []
            extraPais = []
            print('len col5',len(list_col5))
            for i, val in enumerate(list_col5):
                if isinstance(val, str) and re.fullmatch(r'\d{1,3}(?:\.\d{3})*,\d{2}', val.strip()):
                    print(i, 'valid amount:', val)
                    extracurr.append(val)


            for i in range(len(list_col6_depurando2)):
                #print(list_col1)
                if len(str(list_col0[i])) > 35 and len(str(list_col0[i])) < 39:
                    extraHeap.append(list_col0[i])    


      ###############################################################
            #print('factura',factura)
               # print(i,' col0[i]: ',list_col0[i])
                #print(i,' col6[i]: ',list_col6_depurando2[i])
                if str(list_col6_depurando2[i]) != 'nan' and len(str(list_col0[i])) > 23 and list_col6_depurando2[i].isnumeric() == True and 'EXTENDED WARRANTY - REVERSE CHARGE' not in str(list_col0[i]):
                    #print(i,' ---->  col0[i]: ',list_col0[i])
                    #print(i,' ---->  col6[i]: ',list_col6[i])


                    list_auto_chasis.append(list_col0[i])
                    list_auto.append(list_col0[i][:6])
                    list_chasis.append(list_col0[i][7:24])
                    list_amount.append(list_col6[i])
                if str(list_col0[i]) == 'J' or str(list_col0[i]) == 'N':
                    #print(i,' ---->  [J y N} col0[i]: ',list_col0[i])

                    #print(i,' col0[i]: ',list_col0[i])

                    list_J_N.append(list_col0[i])
                    list_pais.append(list_col1[i][:3])
                    extracalif.append(list_col0[i])
                    extraPais.append(list_col1[i][:3])
                # Se agrega condicion cuando es vw-IND
                if str(list_col1[i]) == 'IND':
                    print(i,' ---->  [CUPO} col1[i]: ',list_col1[i])
                    print(list_col1[i][:3])
                    list_J_N.append('CUPO')
                    list_pais.append(list_col1[i][:3])
                if 'TUR' in str(list_col1[i]):
                    print(i,' ---->  [CUPO} col1[i]: ',list_col1[i])
                    print(list_col1[i][:3])
                    list_J_N.append('CUPO')
                    list_pais.append(list_col1[i][:3])
                    
            print('extraHeap---------------------------',extraHeap)
            print('extracurr---------------------------',extracurr)
            print('extracalif---------------------------',extracalif)
            print('extraPais---------------------------',extraPais)
            print('List j Y N ---------------------------',list_J_N)
            # Rotate full extracalif by the difference

            paired_values = []

            if len(extraHeap) > 0 and len(extracurr) > 0 and len(extracalif) > 0 and len(extraPais) > 0:
                print('HAY QUE HACER ROTACIONES"')
                extracurr_index = 0
                                    
                used_indices = set()

                                                # Pairing

                # ✅ Correct shift calculation
                rotation_amount = len(extraHeap) - len(extracurr)

                # ✅ Rotate extracalif
                d_calif = deque(extracalif)
                d_calif.rotate(+rotation_amount+1)
                extracalif = list(d_calif)
                print('extracalif rotated:------------------------', extracalif)

                # ✅ Rotate extraPais
                d_pais = deque(extraPais)
                d_pais.rotate(rotation_amount)
                extraPais = list(d_pais)

                # ✅ Pairing
                j = 0  # index for extracurr, extracalif, extraPais

                for value in extraHeap:
                    if value not in list_auto_chasis:
                        if j < len(extracurr):
                            pair = (value, extracurr[j], list_J_N[j], extraPais[j])
                            paired_values.append(pair)
                            j += 1
                        else:
                            break  # Stop if extracurr runs out
                list_J_N = extracalif

                # ✅ Add to master lists
                for value in paired_values:
                    list_auto_chasis.append(value[0])
                    list_auto.append(value[0][:6])
                    list_chasis.append(value[0][7:24])
                    list_amount.append(value[1])
                    list_J_N.append(value[2])
                    list_pais.append(value[3])


################################################################################################################################################################################
            # Se agrega otra condicion porque en ocasiones la informacion vive en la columna 5

            
            if len(list_auto_chasis) != len(list_pais) and not OnepageFlag:
                list_col0 = list(df_PDF_concatenado[0])
                list_col1 = list(df_PDF_concatenado[1])
                list_col6 = list(df_PDF_concatenado[5])

                for i in range(len(list_col6)):
                    if str(list_col6[i]) != 'nan' and len(str(list_col0[i])) > 23 and type(list_col1[i]) == float:
                        list_auto_chasis.append(list_col0[i])
                        list_auto.append(list_col0[i][:6])
                        list_chasis.append(list_col0[i][7:24])
                        list_amount.append(list_col6[i])

        # Obteniendo moneda
        # Condicion para cuando sean 7 o 6 columnas
        if len(df_PDF[0].columns) == 7:
            list_col4_hoja1 = list(df_PDF[0][4])
            list_col5_hoja1 = list(df_PDF[0][5])
            list_col6_hoja1 = list(df_PDF[0][6])
        elif len(df_PDF[0].columns) == 6:
            list_col4_hoja1 = list(df_PDF[0][3])
            list_col5_hoja1 = list(df_PDF[0][4])
            list_col6_hoja1 = list(df_PDF[0][5])
        elif len(df_PDF_concatenado.columns) == 8:
            list_col4_hoja1 = list(df_PDF[0][5])
            list_col5_hoja1 = list(df_PDF[0][6])
            list_col6_hoja1 = list(df_PDF[0][7])
            

        # Se utilizan dos columnas donde puede vivir la leyenda -CURRENCY- o -MONEDA-
        list_moneda = []
        for i in range(len(list_col5_hoja1)):
            if str(list_col5_hoja1[i]) == 'CURRENCY:' or str(list_col4_hoja1[i]) == 'CURRENCY:' or str(list_col5_hoja1[i]) == 'MONEDA' or str(list_col4_hoja1[i]) == 'MONEDA':
                list_moneda.append(list_col6_hoja1[i])
            elif (str(list_col5_hoja1[i]) =='MONEDA' or str(list_col5_hoja1[i]=='CURRENCY')):
                #print('entramos a moneda por col 5 Y 6')
                #print(list_col5[i])
                #print(list_col6[i])
                list_moneda.append(list_col6[i])
        # Obteniendo leyenda, se utilizara como pivote la leyenda -SHIPPING MARKS- o -DECLARAMOS BAJO JURAMENTO- o -THESE ITEMS ARE CONTROLLED- y se toman las ultimas dos hojas
        df_PDF_lastpages_concatenado = pd.concat(df_PDF[-2:], axis = 0)
        list_col0_lastpage = list(df_PDF_lastpages_concatenado[0])
        list_leyenda = []
        for i in range(len(list_col0_lastpage)):
            if 'SHIPPING MARKS' in str(list_col0_lastpage[i]) or 'DECLARAMOS BAJO JURAMENTO' in str(list_col0_lastpage[i]) or 'THESE ITEMS ARE CONTROLLED' in str(list_col0_lastpage[i]):
                index = i

        # Este try es para SUDAFRICA
        try:
            list_leyenda = list_col0_lastpage[index:]
            list_leyenda_depurado = []
            for i in range(len(list_leyenda)):
                if str(list_leyenda[i]) != 'nan':
                    list_leyenda_depurado.append(list_leyenda[i])

            list_leyenda_depurado_junto = ' '.join(list_leyenda_depurado)
        except:
            list_leyenda_depurado_junto = 'No existen convenios Aranceralios'

        # SE AGREGA CONDICION SI NUESTRAS LISTAS DE -PAIS- y -J y N- SON VACIAS
        list_col0_hoja0 = list(df_PDF[0][0])
        print(len(list_J_N), 'len list J y N')
        print(len(list_pais), 'len list pais')
        if len(list_J_N) == 0:
            for i in list_col0_hoja0:
                if 'BRASIL' in list_leyenda_depurado_junto:
                    pais = 'BRA'
                    J_N = 'C.O'
                elif 'U.S.' in list_leyenda_depurado_junto:
                    pais = 'USA'
                    J_N = 'C.O'
                elif 'BRASIL' in str(i):
                    pais = 'BRA'
                    J_N = 'C.O'
                elif 'IND' in str(i):
                    pais = 'IND'
                    J_N = 'CUPO'
                elif 'TUR' in str(i):
                    pais = 'TUR'
                    J_N = 'CUPO'
                else:
                    pais = 'ZAF'
                    J_N = 'CUPO'

            list_J_N = [J_N]*len(list_auto_chasis)
            list_pais = [pais]*len(list_auto_chasis)

    
    list_moneda = [x for x in list_moneda if pd.notna(x) and x in valid_currencies]
    print('list_moneda',list_moneda)
    # Completando listas, para que tengan el mismo num de filas
    list_factura = [factura]*len(list_J_N)
    list_Date = [date]*len(list_J_N)
    list_moneda_completa = list_moneda*len(list_J_N)
    list_leyenda_depurado_junto_completo = [list_leyenda_depurado_junto] + [np.nan]*(len(list_J_N) - 1)
    list_filepath = [os.path.basename(file_path1)]*len(list_J_N)   

    # Convirtiendo en DF
    df_factura = pd.DataFrame(list_factura, columns = ['Factura'])
    df_date = pd.DataFrame(list_Date, columns = ['Fecha'])
    df_auto = pd.DataFrame(list_auto, columns = ['Auto'])
    df_chasis = pd.DataFrame(list_chasis, columns = ['Chasis'])
    df_amount = pd.DataFrame(list_amount, columns = ['Amount'])
    df_J_N = pd.DataFrame(list_J_N, columns = ['J y N'])
    df_pais = pd.DataFrame(list_pais, columns = ['Pais'])
    df_moneda = pd.DataFrame(list_moneda_completa, columns = ['Moneda'])
    df_leyenda = pd.DataFrame(list_leyenda_depurado_junto_completo, columns = ['Leyenda'])
    df_filename = pd.DataFrame(list_filepath, columns = ['Filename'])
    #print('Paired Values:-----------------------------:-----------------------------:-----------------------------:-----------------------------')
    #print(paired_values)
    # Concatenando df
    df_final = pd.concat([df_factura, df_pais, df_date, df_auto, df_chasis, df_J_N, df_amount, df_moneda, df_leyenda, df_filename], axis = 1)
    df_final = df_final.drop_duplicates(subset='Chasis', keep='last').reset_index(drop=True)
    if df_final.empty:
        print('No se encontraron datos en el PDF')
        return Exception('No se encontraron datos en el PDF')

    return df_final


# # FUNCION AUDI FORMATO NUEVO 
"""
def PDFs_AudiNuevo(file_path1):
    print('Audi Formato nuevo')
    df_PDF = tabula.read_pdf(file_path1, pages= 'all', pandas_options={'header':None})
    df_PDF_concatenado = pd.concat(df_PDF, axis = 0)
    print(df_PDF_concatenado)
    if len(df_PDF_concatenado.columns==3): #tiene 3 columnas
        print('tiene 3 columnas')
        if df_PDF_concatenado[0][0] == 'Proforma Invoice No.':
            print('tiene el mismo texto!!')
    
    
    
    df_Final = pd.DataFrame(columns=['df_factura', 'df_pais', 'df_date', 'df_auto', 'df_chasis', 'df_J_N', 'df_amount', 'df_moneda', 'df_leyenda'])
    return df_Final
"""

# # Funcion para PDFs de SEAT

def PDFs_v2OLDAGAIN(file_path1):
    print('seat')

    # PDFs que se pueden leer con PyPDF2 ('Seat con pocos registros')
    # Abre el archivo PDF en modo de lectura binaria
    with open(file_path1, 'rb') as archivo_pdf:
        # Crea un objeto PdfFileReader
        lector_pdf = PyPDF2.PdfFileReader(archivo_pdf, strict=False)

        # Obtén el número de páginas en el PDF
        num_paginas = lector_pdf.numPages

        list_text1 = []
        # Itera sobre todas las páginas y extrae el texto
        for pagina_num in range(num_paginas):
            # Obtén el objeto de la página
            pagina = lector_pdf.getPage(pagina_num)
            list_text1.append(pagina.extractText())
            cadena1 = " ".join(list_text1)
    #print('cadena1',cadena1)
    patron_factura = r'\b\d+E\b'
    match_fact = re.findall(patron_factura, list_text1[0])

    patron_date = r'\b\d\d-\d\d-\d\d'
    match_date = re.findall(patron_date, list_text1[0])
    match_date2 = match_date[0].replace('-', '')

    patron_auto = r'\bCOD.:\s\d+\s\w+'
    match_auto = re.findall(patron_auto, cadena1)
    match_auto2 = match_auto[0].split(' ')
    match_auto3 = match_auto2[-1]

    patron_chasis = r'\b\w{17}\b'
    match_chasis = re.findall(patron_chasis, cadena1)


    #######################
    ########################
    ##########################
    #SI ENCUENTRA SOLAMENTE UN CHASIS, TIENER QUE USAR UNA FUNCION ALTERNATIVA PARA QUE AGARRE EL COSTO CORRECTO, Y NO EL DEL ENVIO...
    #EJEMPLO:_/home/gestell3/Desktop/TODAS FACTURAS VW/P1 - PDFs/Noviembre2025/Facturas/SoloNoviembre/redwhsalespedimentos/905756E.pdf


###########################################
    patron_pais = r'\bWE HEREBY CERTIFY THAT THE GOODS ARE OF +\w+'
    match_pais = re.findall(patron_pais, cadena1)
    match_pais2 = match_pais[0].replace('WE HEREBY CERTIFY THAT THE GOODS ARE OF ', '')

    if 'MXN' in cadena1:
        match_moneda = ['MXN']
    elif 'USD' in cadena1:
        match_moneda = ['USD']
    else:
        match_moneda = ['No se encontro coincidencia']


    #patron_amount = r'[\d,.]+\s+([\d,.]+)\s*(?=PRODUCTION|$)|[\d,.]+\s+TOTAL\s+\d+\s+\d+\s+KGS\.|[\d.,]+.\d{3},\d{2}\s+[-]+\s+SUMA Y SIGUE'
    #patron_amount = r'(?:^|\n)\s+([\d,.]+)\s*(?=\n|$)|TOTAL\s+.*?([\d,.]+)\s+KGS|[\d.,]+\.\d{3},\d{2}\s+[-]'
    #patron_amount = r'\s+([\d,.]+)\s*(?=\n|$)(?!.*\d)'
    
    patron_chasis_amount = r'(\w{17})[^\n]+\n(?:.*?\n)*?\s+([\d,.]+)\s*(?=\n\s*(?:VSS|PRODUCTION|---))'

    matches = re.findall(patron_chasis_amount, cadena1, re.DOTALL)
    match_chasis = [m[0] for m in matches]
    match_amount4 = [m[1] for m in matches]
    """
    patron_amount3 = r'[\d,.]+\s'
    match_amount2 = []
    for i in match_amount:
        print(i)
        match_amount2.append(re.findall(patron_amount3,i))

    match_amount3 = list(itertools.chain(*match_amount2))
    match_amount4 = []
    print('-------------------------')
    for i in match_amount3:
        
        print(i)
        match_amount4.append(i.replace(' ', ''))
    print('-------------------------')
    match_amount4 = match_amount
    """
    patron_leyenda = 'ESTOS PRODUCTOS GOZAN DE UN ORIGEN\s+PREFERENCIAL DE LA UNION EUROPEA'
    match_leyenda = re.findall(patron_leyenda, cadena1)
    #print('-.-.-.-.-.-.-.-.-.-.-..-.-.-..')
    #print('leyenda',match_leyenda)

    patron_leyenda_parcial = ' ESTOS PRODUCTOS GOZAN DE UN ORIGEN'
    match_leyenda_Parcial = re.findall(patron_leyenda_parcial, cadena1)
    #print('leyenda p1',match_leyenda_Parcial)

    patron_leyenda_parcial2 = 'PREFERENCIAL DE LA UNION EUROPEA'
    match_leyenda_Parcial2 = re.findall(patron_leyenda_parcial2, cadena1)
    #print('leyenda p2',match_leyenda_Parcial2)

    
    if match_leyenda:
        print('encuentra completo')
        match_J_y_N = ['J']

    elif match_leyenda_Parcial and match_leyenda_Parcial2:
        print('encuentra leyenda partida')
        match_J_y_N = ['J']

    else:
        print('no encuentra leyenda')
        match_J_y_N = ['N']
    
    
    """
    #####
    if len(match_leyenda) != 0:
        match_leyenda = [match_leyenda[0].replace('  ', '').replace('ORIGENPREFERENCIAL', 'ORIGEN PREFERENCIAL')]

        if match_leyenda[0] != 'ESTOS PRODUCTOS GOZAN DE UN ORIGEN PREFERENCIAL DE LA UNION EUROPEA':
            match_J_y_N = ['Revisar']
        elif match_leyenda[0] == 'ESTOS PRODUCTOS GOZAN DE UN ORIGEN PREFERENCIAL DE LA UNION EUROPEA':
            match_J_y_N = ['J']

    elif len(match_leyenda) == 0:
        match_leyenda = ['No se encontro leyenda']
        match_J_y_N = ['N']
    ################
    """
    list_match_fact = match_fact*len(match_chasis)
    list_match_date = [match_date2]*len(match_chasis)
    list_match_auto = [match_auto3]*len(match_chasis)
    list_match_pais = [match_pais2]*len(match_chasis)
    list_match_moneda = match_moneda*len(match_chasis)
    list_match_J_y_N = match_J_y_N*len(match_chasis)
    if match_leyenda:
        list_match_leyenda = [match_leyenda[0]] + [np.nan] * (len(match_chasis) - 1)
    elif match_leyenda_Parcial and match_leyenda_Parcial2:
        list_match_leyenda = [match_leyenda_Parcial[0] + ' ' + match_leyenda_Parcial2[0]] + [np.nan] * (len(match_chasis) - 1)
    else:
        list_match_leyenda = ['No se encontro leyenda'] + [np.nan] * (len(match_chasis) - 1)

    # Convirtiendo en DF
    df_factura = pd.DataFrame(list_match_fact, columns = ['Factura'])
    df_date = pd.DataFrame(list_match_date, columns = ['Fecha'])
    df_auto = pd.DataFrame(list_match_auto, columns = ['Auto'])
    df_chasis = pd.DataFrame(match_chasis, columns = ['Chasis'])
    df_amount = pd.DataFrame(match_amount4, columns = ['Amount'])
    df_J_N = pd.DataFrame(list_match_J_y_N, columns = ['J y N'])
    df_pais = pd.DataFrame(list_match_pais, columns = ['Pais'])
    df_moneda = pd.DataFrame(list_match_moneda, columns = ['Moneda'])
    df_leyenda = pd.DataFrame(list_match_leyenda, columns = ['Leyenda'])

    # Concatenando df
    df_SEAT = pd.concat([df_factura, df_pais, df_date, df_auto, df_chasis, df_J_N, df_amount, df_moneda, df_leyenda], axis = 1)
    print(df_SEAT)

    return df_SEAT

import re
import PyPDF2
import pandas as pd
import numpy as np



def PDFs_v2(file_path1):
    print('seat')

    # PDFs que se pueden leer con PyPDF2 ('Seat con pocos registros')
    # Abre el archivo PDF en modo de lectura binaria
    with open(file_path1, 'rb') as archivo_pdf:
        # Crea un objeto PdfFileReader
        lector_pdf = PyPDF2.PdfFileReader(archivo_pdf, strict=False)

        # Obtén el número de páginas en el PDF
        num_paginas = lector_pdf.numPages

        list_text1 = []
        # Itera sobre todas las páginas y extrae el texto
        for pagina_num in range(num_paginas):
            # Obtén el objeto de la página
            pagina = lector_pdf.getPage(pagina_num)
            list_text1.append(pagina.extractText())
        
        # Join pages with newline to preserve some structure
        cadena1 = "\n".join(list_text1)

    patron_factura = r'\b\d+E\b'
    match_fact = re.findall(patron_factura, list_text1[0])

    if not match_fact:
        # Try alternate pattern for format like "N007065" or "N001458"
        patron_factura_alt = r'\bN\d+\b'
        match_fact = re.findall(patron_factura_alt, list_text1[0])


    patron_date = r'\b\d\d-\d\d-\d\d'
    match_date = re.findall(patron_date, list_text1[0])
    match_date2 = match_date[0].replace('-', '')

    patron_auto = r'\bCOD.:\s\d+\s\w+'
    match_auto = re.findall(patron_auto, cadena1)
    match_auto2 = match_auto[0].split(' ')
    match_auto3 = match_auto2[-1]

    patron_pais = r'\bWE HEREBY CERTIFY THAT THE GOODS ARE OF +\w+'
    match_pais = re.findall(patron_pais, cadena1)
    match_pais2 = match_pais[0].replace('WE HEREBY CERTIFY THAT THE GOODS ARE OF ', '')

    if 'MXN' in cadena1:
        match_moneda = ['MXN']
    elif 'USD' in cadena1:
        match_moneda = ['USD']
    else:
        match_moneda = ['No se encontro coincidencia']

    # Match complete vehicle blocks
    # Each vehicle has: VIN line -> PRODUCTION DATE -> options -> total price
    
    patron_chasis = r'\b\w{17}\b'
    match_chasis = re.findall(patron_chasis, cadena1)
    
    # Split text by VINs to create blocks for each vehicle
    vin_blocks = re.split(r'\b\w{17}\b', cadena1)
    
    match_amount4 = []
    
    # Process each block (skip first as it's before any VIN)
    for i in range(1, len(vin_blocks)):
        block = vin_blocks[i]
        print('-- Vehicle Block ---')
        print(block)
        
        # Try to find PRODUCTION DATE first
        prod_date_match = re.search(r'PRODUCTION\s+DATE', block)
        
        if prod_date_match:
            print("Found PRODUCTION DATE")
            # Normal case: has PRODUCTION DATE
            text_after_prod = block[prod_date_match.end():]
            
            # Look for the final section markers
            total_match = re.search(r'TOTAL\s+.*?\d+\s+KGS', text_after_prod)
            final_dash_match = re.search(r'=+', text_after_prod)
            
            # Find the earliest END marker
            end_pos = None
            for match in [total_match, final_dash_match]:
                if match:
                    if end_pos is None or match.start() < end_pos:
                        end_pos = match.start()
            
            # Extract relevant text
            if end_pos:
                relevant_text = text_after_prod[:end_pos]
            else:
                relevant_text = text_after_prod
            
            # Remove "SUMA Y SIGUE" sections (page breaks)
            relevant_text = re.sub(r'-{25,}.*?SUMA Y SIGUE.*?-{25,}.*?(?=\d|\w{4}\w{4})', '', relevant_text, flags=re.DOTALL)
            
            # Find all prices
            prices = re.findall(r'(\d{1,3}(?:\.\d{3})+,\d{2})', relevant_text)
            print(f"Prices found after PROD DATE: {prices}")
            
            if prices:
                match_amount4.append(prices[-1])
            else:
                match_amount4.append('0,00')
        else:
            print("NO PRODUCTION DATE - using alternative method")
            # Alternative case: NO PRODUCTION DATE line
            
            # Look for section end markers in the entire block
            total_match = re.search(r'TOTAL\s+.*?\d+\s+KGS', block)
            final_dash_match = re.search(r'=+', block)
            
            end_pos = None
            for match in [total_match, final_dash_match]:
                if match:
                    if end_pos is None or match.start() < end_pos:
                        end_pos = match.start()
            
            if end_pos:
                relevant_text = block[:end_pos]
            else:
                relevant_text = block
            
            print(f"Relevant text length: {len(relevant_text)}")
            print(f"Relevant text preview: {relevant_text[:200]}")
            
            # Find all prices
            prices = re.findall(r'(\d{1,3}(?:\.\d{3})+,\d{2})', relevant_text)
            print(f"Prices found: {prices}")
            
            if prices:
                match_amount4.append(prices[-1])
            else:
                match_amount4.append('0,00')

    print(f"Found {len(match_chasis)} VINs and {len(match_amount4)} prices")
        
    # Ensure counts match
    if len(match_amount4) < len(match_chasis):
        match_amount4.extend(['0,00'] * (len(match_chasis) - len(match_amount4)))
    elif len(match_amount4) > len(match_chasis):
        match_amount4 = match_amount4[:len(match_chasis)]

    patron_leyenda = 'ESTOS PRODUCTOS GOZAN DE UN ORIGEN\s+PREFERENCIAL DE LA UNION EUROPEA'
    match_leyenda = re.findall(patron_leyenda, cadena1)

    patron_leyenda_parcial = ' ESTOS PRODUCTOS GOZAN DE UN ORIGEN'
    match_leyenda_Parcial = re.findall(patron_leyenda_parcial, cadena1)

    patron_leyenda_parcial2 = 'PREFERENCIAL DE LA UNION EUROPEA'
    match_leyenda_Parcial2 = re.findall(patron_leyenda_parcial2, cadena1)

    if match_leyenda:
        print('encuentra completo')
        match_J_y_N = ['J']
    elif match_leyenda_Parcial and match_leyenda_Parcial2:
        print('encuentra leyenda partida')
        match_J_y_N = ['J']
    else:
        print('no encuentra leyenda')
        match_J_y_N = ['N']

    list_match_fact = match_fact * len(match_chasis)
    list_match_date = [match_date2] * len(match_chasis)
    list_match_auto = [match_auto3] * len(match_chasis)
    list_match_pais = [match_pais2] * len(match_chasis)
    list_match_moneda = match_moneda * len(match_chasis)
    list_match_J_y_N = match_J_y_N * len(match_chasis)
    list_filename = [os.path.basename(file_path1)] * len(match_chasis)
    
    if match_leyenda:
        list_match_leyenda = [match_leyenda[0]] + [np.nan] * (len(match_chasis) - 1)
    elif match_leyenda_Parcial and match_leyenda_Parcial2:
        list_match_leyenda = [match_leyenda_Parcial[0] + ' ' + match_leyenda_Parcial2[0]] + [np.nan] * (len(match_chasis) - 1)
    else:
        list_match_leyenda = ['No se encontro leyenda'] + [np.nan] * (len(match_chasis) - 1)

    # Convirtiendo en DF
    df_factura = pd.DataFrame(list_match_fact, columns=['Factura'])
    df_date = pd.DataFrame(list_match_date, columns=['Fecha'])
    df_auto = pd.DataFrame(list_match_auto, columns=['Auto'])
    df_chasis = pd.DataFrame(match_chasis, columns=['Chasis'])
    df_amount = pd.DataFrame(match_amount4, columns=['Amount'])
    df_J_N = pd.DataFrame(list_match_J_y_N, columns=['J y N'])
    df_pais = pd.DataFrame(list_match_pais, columns=['Pais'])
    df_moneda = pd.DataFrame(list_match_moneda, columns=['Moneda'])
    df_leyenda = pd.DataFrame(list_match_leyenda, columns=['Leyenda'])
    df_filename = pd.DataFrame(list_filename, columns=['Filename'])

    # Concatenando df
    df_SEAT = pd.concat([df_factura, df_pais, df_date, df_auto, df_chasis, df_J_N, df_amount, df_moneda, df_leyenda, df_filename], axis=1)
    print(df_SEAT)

    return df_SEAT



# # Funcion para PDFs Porsche

def PDFs_v3(file_path1):
    print('porsche')

    # PDFs que se pueden leer con PyPDF2 ('Porshce con pocos registros')
    # Abre el archivo PDF en modo de lectura binaria
    with open(file_path1, 'rb') as archivo_pdf:
        # Crea un objeto PdfFileReader
        lector_pdf = PyPDF2.PdfFileReader(archivo_pdf, strict=False)
    
        # Obtén el número de páginas en el PDF
        num_paginas = lector_pdf.numPages
    
        list_text1 = []
        # Itera sobre todas las páginas y extrae el texto
        for pagina_num in range(num_paginas):
            # Obtén el objeto de la página
            pagina = lector_pdf.getPage(pagina_num)
            list_text1.append(pagina.extractText())
            cadena1 = " ".join(list_text1)
    
    patron_facura_date = r'Invoice\w+.\d{2}.\d{4}'
    match_factura_date = re.findall(patron_facura_date, list_text1[0])
    
    match_factura_date0 = match_factura_date[0].replace('Invoice', '')
    
    factura = match_factura_date0[:-10]
    date = match_factura_date0[-10:].replace('20', '').replace('.', '')
    
    if len(date) == 4:
        date = '20' + date
        
    patron_moneda = r'\bCURRENCY: \w{3}'
    match_moneda = re.findall(patron_moneda, list_text1[-1])
    
    # Condicion porque en ocasiones la ultima hoja es pura basura
    if len(match_moneda) == 0:
        match_moneda = re.findall(patron_moneda, list_text1[-2])
    
    cadena2 = cadena1.replace('.', '').replace(',', '.')
    separando_cadena2 = cadena2.split('statistical commodity')
    separando_cadena2_sin_last_page = separando_cadena2[:-1]
    
    patron_chasis_auto = r'\bTotal\d\w+'
    patron_chasis_auto2 = r'\bcode:\w+'
    
    patron1_match_chasis_auto = []
    patron2_match_chasis_auto = []
    for i in range(len(separando_cadena2_sin_last_page)):
        patron1_match_chasis_auto.append(re.findall(patron_chasis_auto, separando_cadena2_sin_last_page[i]))
        patron2_match_chasis_auto.append(re.findall(patron_chasis_auto2, separando_cadena2_sin_last_page[i]))
        
        
    patron_precio = r'\d+.\d+\sUrsprungsland\b'
    patron_precio2 = r'\d+.\d{2} Board:'
    
    patron_match_precio1 = []
    patron_match_precio2 = []
    for i in range(len(separando_cadena2_sin_last_page)):
        patron_match_precio1.append(re.findall(patron_precio, separando_cadena2_sin_last_page[i]))
        patron_match_precio2.append(re.findall(patron_precio2, separando_cadena2_sin_last_page[i]))
        
        
    # JUNTANDO PATRONES DE CHASIS Y AUTOS
    patron_match_chasis_auto_completo = []
    for i in range(len(patron1_match_chasis_auto)):
        if len(patron1_match_chasis_auto[i]) != 0 and len(patron1_match_chasis_auto[i][0]) > 24:
            patron_match_chasis_auto_completo.append(patron1_match_chasis_auto[i])
        elif len(patron2_match_chasis_auto[i]) != 0:
            if len(patron2_match_chasis_auto[i][0]) > 24:
                patron_match_chasis_auto_completo.append(patron2_match_chasis_auto[i])
    
    # JUNTANDO PATRONES DE PRECIO      
    patron_match_precio_completo = []
    for i in range(len(patron_match_precio1)):
        if len(patron_match_precio1[i]) != 0:
            if len(patron_match_precio1[i][0]) == 23:
                patron_match_precio_completo.append([patron_match_precio1[i][0].replace(' Ursprungsland', '')])
            elif len(patron_match_precio1[i][0]) == 24:
                patron_match_precio_completo.append([patron_match_precio1[i][0].replace(' Ursprungsland', '')])
            elif len(patron_match_precio1[i][0]) == 25:
                patron_match_precio_completo.append([patron_match_precio1[i][0][1:].replace(' Ursprungsland', '')])
            elif len(patron_match_precio1[i][0]) == 26:
                patron_match_precio_completo.append([patron_match_precio1[i][0][2:].replace(' Ursprungsland', '')])
        
        elif len(patron_match_precio2[i]) != 0:
            patron_match_precio_completo.append([patron_match_precio2[i][0].replace('Board:', '')])
            
    # Aplanando listas
    patron_match_chasis_auto_completo_aplanado = list(itertools.chain(*patron_match_chasis_auto_completo))
    patron_match_precio_completo_aplanado = list(itertools.chain(*patron_match_precio_completo))
    
    patron_pais = r'\bcountry of origin:\w+'
    match_pais = re.findall(patron_pais, cadena1)
    
    pais_final = []
    for i in range(len(match_pais)):
        pais_final.append(match_pais[i].replace('country of origin:', ''))
        
    # Encontrando la leyenda y J y N
    # Usando expresión regular para extraer el párrafo
    leyendaPbuscar1 = 'The exporter of the products covered by this document [customs or competent'
    paragraph = re.search(r'these products are of European Community preferential origin', cadena1, re.DOTALL)
    if paragraph:
        extracted_text = paragraph.group(0)
        leyenda = [extracted_text]
    # Second condition: Check for another pattern (e.g., 'other text condition')
    elif re.search(r'these products are of European Union preferential origin.', cadena1, re.DOTALL):
        extracted_text = re.search(r'these products are of European Union preferential origin.', cadena1, re.DOTALL).group(0)
        leyenda = [extracted_text]
    else:
        leyenda = ['No se encontró preferencias Arancelarias']



    # Usando expresión regular para extraer el párrafo
    paragraph2 = re.search(r'The preceding preferential origin declaration does not apply to the following.*?\.', cadena1, re.DOTALL)
    #print(paragraph2)
    if paragraph2:
        extracted_text2 = paragraph2.group(0)
        leyenda2 = [extracted_text2]
        numbers = re.findall(r'\d+', leyenda2[0])
        # Convert extracted numbers to integers
        numbers = [int(num) for num in numbers]
        #print(numbers)
    else:
        leyenda2 = ['No se encontró excepciones en donde no aplique las preferencias arancelarias']

    chasis_final = []
    autos_final = []
    for i in range(len(patron_match_chasis_auto_completo_aplanado)):
        if 'Total' in patron_match_chasis_auto_completo_aplanado[i] and i in [0,1,2,3,4,5,6,7,8]:
            chasis_final.append(patron_match_chasis_auto_completo_aplanado[i][12:29])
            autos_final.append(patron_match_chasis_auto_completo_aplanado[i][6:12])

        elif 'Total' in patron_match_chasis_auto_completo_aplanado[i] and i not in [0,1,2,3,4,5,6,7,8]:
            chasis_final.append(patron_match_chasis_auto_completo_aplanado[i][13:30])
            autos_final.append(patron_match_chasis_auto_completo_aplanado[i][7:13])

        elif 'code' in patron_match_chasis_auto_completo_aplanado[i] and i in [0,1,2,3,4,5,6,7,8]:
            chasis_final.append(patron_match_chasis_auto_completo_aplanado[i][20:37])
            autos_final.append(patron_match_chasis_auto_completo_aplanado[i][14:20])

        elif 'code' in patron_match_chasis_auto_completo_aplanado[i] and i not in [0,1,2,3,4,5,6,7,8]:
            chasis_final.append(patron_match_chasis_auto_completo_aplanado[i][21:38])
            autos_final.append(patron_match_chasis_auto_completo_aplanado[i][15:21])

    list_leyenda = leyenda + [np.nan]*(len(chasis_final) - 1)
    list_factura = [factura]*(len(chasis_final))
    list_date = [date]*(len(chasis_final))
    list_match_moneda = match_moneda*(len(chasis_final))

    rango = list(range(len(chasis_final) + 1))
    rango2 = rango[1:]
    print(list_leyenda)

    list_J_y_N = []
    print(leyenda[0])
    if leyenda[0] == 'these products are of European Community preferential origin' or leyenda[0] == 'these products are of European Union preferential origin.':
        if leyenda2[0] == 'No se encontró excepciones en donde no aplique las preferencias arancelarias':
            list_J_y_N.append('J')
            print(leyenda2[0])
            print('Ja sin excepciones')
        else:
            for i in range(len(rango2)):
                if (i+1) in numbers:
                    list_J_y_N.append('N')
                    print('nein con excepciones')
                    list_leyenda[i]=('Calificado N por excepcion en leyenda')
                    #if str(rango2[i]) in leyenda2[0]:
                     #   list_J_y_N.append('N')

                    #else:
                     #   list_J_y_N.append('J')
                else:
                    list_J_y_N.append('J')
                    print('Ja')
                    list_leyenda[i]=(leyenda[0] + leyenda2[0])
                    
    else:
        list_J_y_N.append('N')
        print('nein')


    if len(list_J_y_N) == 1:
        list_J_y_N_completo = list_J_y_N*(len(chasis_final))
    else:
        list_J_y_N_completo = list_J_y_N

    precios_final = patron_match_precio_completo_aplanado

    list_filename = [os.path.basename(file_path1)] * len(chasis_final)
    # Convirtiendo en DF
    df_factura = pd.DataFrame(list_factura, columns = ['Factura'])
    df_date = pd.DataFrame(list_date, columns = ['Fecha'])
    df_auto = pd.DataFrame(autos_final, columns = ['Auto'])
    df_chasis = pd.DataFrame(chasis_final, columns = ['Chasis'])
    df_amount = pd.DataFrame(precios_final, columns = ['Amount'])
    df_J_N = pd.DataFrame(list_J_y_N_completo, columns = ['J y N'])
    df_pais = pd.DataFrame(pais_final, columns = ['Pais'])
    df_moneda = pd.DataFrame(list_match_moneda, columns = ['Moneda'])
    df_leyenda = pd.DataFrame(list_leyenda, columns = ['Leyenda'])
    df_filename = pd.DataFrame(list_filename, columns = ['Filename'])

    # Concatenando df
    df_porsche = pd.concat([df_factura, df_pais, df_date, df_auto, df_chasis, df_J_N, df_amount, df_moneda, df_leyenda, df_filename], axis = 1)
    print('\n sale de funcion')
    return df_porsche


# # Funcion para PDFs Bentley

def PDFs_v4_DEPRECATED(file_path1):
    print('bentley')

    with open(file_path1, 'rb') as archivo_pdf:
        # Crea un objeto PdfFileReader
        lector_pdf = PyPDF2.PdfFileReader(archivo_pdf, strict=False)
        
        # Obtén el número de páginas en el PDF
        num_paginas = lector_pdf.numPages
        
        list_text1 = []
        # Itera sobre todas las páginas y extrae el texto
        for pagina_num in range(num_paginas):
            # Obtén el objeto de la página
            pagina = lector_pdf.getPage(pagina_num)
            list_text1.append(pagina.extractText())
            cadena1 = " ".join(list_text1)
    
    if 'estos productos gozan de un origenpreferencial de la United Kingdom' in cadena1:
        leyenda = ['Salvo indicacion en sentido contrario, estos productos gozan de un origen preferencial de la United Kingdom']
        J_y_N = ['J']
    else:
        leyenda = ['No cuenta con preferencias aranceralias']
        J_y_N = ['N']
        
    patron_date = r'\d{2}.\d{2}.\d{4}Chassis'
    match_date = re.findall(patron_date, cadena1)
    match_date2 = match_date[0].replace('Chassis', '').replace('20', '').replace('.', '')
    
    if len(match_date2) == 4:
        match_date2 = '20' + match_date2
    
    patron_pais = r'Manufactured in the \w{2}'
    match_pais = re.findall(patron_pais, cadena1)
    match_pais2 = match_pais[0][-2:]
    
    patron_factura = r'InvoiceNumber/Date\w+'
    match_factura = re.findall(patron_factura, cadena1)
    match_factura2 = match_factura[0].replace('InvoiceNumber/Date', '')
    
    patron_moneda = r'Currency \w{3}'
    match_moneda = re.findall(patron_moneda, cadena1)
    match_moneda2 = match_moneda[0].replace('Currency ', '')
    
    patron_chasis = r'VIN.\w{17}'
    match_chasis = re.findall(patron_chasis, cadena1)
    match_chasis2 = match_chasis[0].replace('VIN.', '')
    
    patron_amount = r'Final amountUSD\s+[\d.,]+'
    match_amount = re.findall(patron_amount, cadena1)
    match_amount2 = match_amount[0].replace(' ', '').replace('FinalamountUSD', '')
    
    patron_auto = r'Kingdom.[_]+DescriptionPrice\s+[_]+\w{8}'
    match_auto = re.findall(patron_auto, cadena1)
    match_auto2 = match_auto[0].replace('_','').replace(' ', '').replace('Kingdom.DescriptionPrice', '')
    
    # Convirtiendo en DF
    df_factura = pd.DataFrame([match_factura2], columns = ['Factura'])
    df_date = pd.DataFrame([match_date2], columns = ['Fecha'])
    df_auto = pd.DataFrame([match_auto2], columns = ['Auto'])
    df_chasis = pd.DataFrame([match_chasis2], columns = ['Chasis'])
    df_amount = pd.DataFrame([match_amount2], columns = ['Amount'])
    df_J_N = pd.DataFrame(J_y_N, columns = ['J y N'])
    df_pais = pd.DataFrame([match_pais2], columns = ['Pais'])
    df_moneda = pd.DataFrame([match_moneda2], columns = ['Moneda'])
    df_leyenda = pd.DataFrame(leyenda, columns = ['Leyenda'])
    
    # Concatenando df
    df_Bentley = pd.concat([df_factura, df_pais, df_date, df_auto, df_chasis, df_J_N, df_amount, df_moneda, df_leyenda], axis = 1)
    
    
    return df_Bentley

def PDFs_v4(file_path1):
    print('bentley')

    with open(file_path1, 'rb') as archivo_pdf:
        lector_pdf = PyPDF2.PdfFileReader(archivo_pdf, strict=False)
        num_paginas = lector_pdf.numPages
        
        list_text1 = []
        for pagina_num in range(num_paginas):
            pagina = lector_pdf.getPage(pagina_num)
            list_text1.append(pagina.extractText())
        
        # Unir todo el texto
        cadena_completa = " ".join(list_text1)

    # Dividir por cada factura usando "InvoiceNumber/Date"
    bloques = cadena_completa.split("RequirementsCurrency")
    df_final = []
    import re

    # Usamos un patrón más flexible
    patron_leyenda = r"El exportador de los productos incluidos en el presente documento\s*\(.*?\)\s*declara que, salvo indicacion en sentido contrario, estos productos gozan de un origenpreferencial de la United Kingdom"

    for bloque in bloques[1:]:
        # 1. Normalizar espacios
        bloque_limpio = re.sub(r'\s+', ' ', bloque).strip()
        

        match = re.search(patron_leyenda, bloque_limpio, re.IGNORECASE | re.DOTALL)
        if match:
            leyenda = match.group(0)  # Esto contiene el texto que hizo match
            J_y_N = 'J'
        else:
            leyenda = 'No cuenta con preferencias arancelarias'
            J_y_N = 'N'



        # Extraer datos con regex
        try:
            match_date = re.findall(r'\d{2}.\d{2}.\d{4}Chassis', bloque)[0]
            match_date2 = match_date.replace('Chassis', '').replace('20', '').replace('.', '')
            if len(match_date2) == 4:
                match_date2 = '20' + match_date2
        except:
            match_date2 = ''

        try:
            match_pais2 = re.findall(r'Manufactured in the \w{2}', bloque)[0][-2:]
        except:
            match_pais2 = ''

        try:
            match_factura2 = re.findall(r'InvoiceNumber/Date\w+', bloque)[0].replace('InvoiceNumber/Date', '')
        except:
            match_factura2 = ''

        try:
            match_moneda2 = re.findall(r'Currency \w{3}', bloque)[0].replace('Currency ', '')
        except:
            match_moneda2 = ''

        try:
            match_chasis2 = re.findall(r'VIN.\w{17}', bloque)[0].replace('VIN.', '')
        except:
            match_chasis2 = ''

        try:
            match_amount2 = re.findall(r'Final amountUSD\s+[\d.,]+', bloque)[0].replace(' ', '').replace('FinalamountUSD', '')
        except:
            match_amount2 = ''

        try:
            match_auto2 = re.findall(r'Kingdom.[_]+DescriptionPrice\s+[_]+\w{8}', bloque)[0].replace('_','').replace(' ', '').replace('Kingdom.DescriptionPrice', '')
        except:
            match_auto2 = ''

        # Crear fila de datos
        df_row = pd.DataFrame([{
            'Factura': match_factura2,
            'Pais': match_pais2,
            'Fecha': match_date2,
            'Auto': match_auto2,
            'Chasis': match_chasis2,
            'J y N': J_y_N,
            'Amount': match_amount2,
            'Moneda': match_moneda2,
            'Leyenda': leyenda,
            'Filename': os.path.basename(file_path1)
        }])

        df_final.append(df_row)

    # Concatenar todas las filas en un solo DataFrame
    df_Bentley = pd.concat(df_final, ignore_index=True)
    return df_Bentley

