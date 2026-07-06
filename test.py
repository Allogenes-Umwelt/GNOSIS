from PDFs_v2 import PDFs_v1,PDFs_v3
from PDFs_Final_v3 import PDFs_to_excel
import PDFs_v2  
from concentrado1 import Concentrado
from concentrado2 import Concentrado2
from Estadistico import estadistico_v5
import datetime 


#Factura Porsche en junta 
#factura2 = '/home/gestell3/Desktop/TODAS FACTURAS VW/TODASLAS FACTURAS/2024.05.07 1301541200.pdf'
#factura sin leyenda 
#factura3 ='/home/gestell3/Desktop/TODAS FACTURAS VW/TODASLAS FACTURAS/2024.02.15 1301509173.pdf'
#porsche = PDFs_v3(factura3)
#print(porsche)
#porsche.to_excel('/home/gestell3/Desktop/TODAS FACTURAS VW/PorscheProcesado.xlsx', sheet_name="Extraccion", index=False)


#facturas8jul = '/home/gestell3/Desktop/TODAS FACTURAS VW/batchFebrero'
#procesadoFebrero=PDFs_to_excel(facturas8jul)
#procesadoFebrero.to_excel('/home/gestell3/Desktop/TODAS FACTURAS VW/FacturasProcesadas8Jul.xlsx', sheet_name="Extraccion", index=False)

####Funcion de prueba antes de actualizar concentrado2
import pandas as pd
import numpy as np
def PruebaConcentrado2(file_path_concentrado1, file_path_PDFs):
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
#inicio

###############################################ARCHIVO PARA PRUEBAS###############3
inicio = datetime.datetime.now()
#/Users/jorgevilchis/Documents/Cosas Gestell/FacturasVW/InsumosParaCorrer/DWH TODOOOO/TODOOOOO.txt

#SOURCES 
dwh = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/Insumos/DWH_6Mayo.txt'
divisiones = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/Insumos/DivIncMayo6_2026.xlsx'
#facturas
facturas = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/Facturas/Attachments-RE_ pendientes por cargar.  (22)'
extraccionPrevia = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/NEWSOLOABRIL/ExtraccionFacturas_SoloAbril2026.xlsx'
pdfProduccion_files='/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Marzo/ResultadosMarzo26/Cupo de PRODUCCIÓN_24VEH001122-2134.pdf'
#pdfProduccion_files2='/home/gestell3/Desktop/TODAS FACTURAS VW/P1 - PDFs/Noviembre2025/Cupo de PRODUCCIÓN_24VEH001122-2134.pdf'
pdfInversion_files= '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Marzo/ResultadosMarzo26/Cupo de INVERSIÓN_25VEH000718-2134.pdf'
pdfInversion_files2='/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2025/Noviembre2025/Cupo de INVERSIÓN_25VEH000718-2134.pdf'
########################################


### TARGETS 
targetFacturas = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/NEWSOLOABRIL/TEST_Comb.xlsx'
TargetFacturasMes = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/NEWSOLOABRIL/TESTSOLO.xlsx'
targetC1 = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/RESULTADOS/Concentrado1_5_Historico_6Mayo2026.xlsx'
targetC2 = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/NEWSOLOABRIL/Concentrado2_HISTORICO_ACT.xlsx'
targetFacturasFaltantes = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/NEWSOLOABRIL/FacturasFaltantes_HISTORICO_ACT.xlsx'
targetEstadistico = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/NEWSOLOABRIL/Estadistico_HISTORICO_ACT.xlsx'
targetNuevoFormato = '/Users/jorgevilchis/Library/CloudStorage/ProtonDrive-jvilchis@gestell.co-folder/P1 - PDFs/2026/Abril/NEWSOLOABRIL/NuevoFormato_HISTORICO_ACT.xlsx'


#Proceso
# 1. Procesamos las factuas
df_nuevas,FacturasPRocesadas,listErrores,errores_detalle = PDFs_to_excel(facturas,extraccionPrevia)
#df_nuevas,FacturasPRocesadas,listErrores,errores_detalle = PDFs_to_excel(facturas)
if errores_detalle:
    print('---- Clasificación de PDFs fallidos ----')
    for archivo, info in errores_detalle.items():
        print(f"[{info['categoria']}] {archivo}: {info['mensaje']}")

Factt=FacturasPRocesadas.to_excel(targetFacturas, sheet_name="concentrado", index=False)
print(FacturasPRocesadas.head())
#print('--------------------------------------------------------------------')
df_nuevas.to_excel(TargetFacturasMes, sheet_name="concentrado", index=False)
facturasTime = datetime.datetime.now()


# 2. HAcemos concentrado 1
print('inicia C1')

"""
concentrado1 = Concentrado(dwh,divisiones)
C1Excel=concentrado1[0].to_excel(targetC1, sheet_name="concentrado", index=False)
print('termina c1')
print('inicia c2')
#print(concentrado1[0])
print('---------------------------------------------------------------------')

concentrado1Time = datetime.datetime.now()
# 3. Hacemos concentrado 2

print('start')
concentrado2normal = Concentrado2(targetC1,targetFacturas)
concentrado2normal[0].to_excel(targetC2, sheet_name="concentrado", index=False)
facturasFaltantes_array = concentrado2normal[2]
df_copy = concentrado2normal[3]


# Guardar el DataFrame final
df_copy.to_excel(
    targetNuevoFormato,
    sheet_name="concentrado",
    index=False
)

print(df_copy)



facturasFaltantes_df = pd.DataFrame({'FACT': facturasFaltantes_array})

# Now you can use .to_excel() on the DataFrame
facturasFaltantes_df.to_excel(targetFacturasFaltantes, sheet_name="Facturas Faltantes", index=False)

print('finish')
#print (concenrtado2[0])
concentrado2Time = datetime.datetime.now()



# 4. Hacemos estadistico con graficas
estadistico_v5(targetC2,[pdfProduccion_files],targetEstadistico,[pdfInversion_files])
esrtadisticoTime = datetime.datetime.now()
"""
print('---------------------------------------------------------------------')
#print('Tiempo de procesamiento de facturas: ', facturasTime - inicio)
#print('Tiempo de procesamiento de concentrado 1: ', concentrado1Time - facturasTime)
#print('Tiempo de procesamiento de concentrado 2: ', concentrado2Time - concentrado1Time)
#print('Tiempo de procesamiento de estadistico: ', esrtadisticoTime - concentrado2Time)
#print('Tiempo total de procesamiento: ', esrtadisticoTime - inicio)
print('---------------------------------------------------------------------')

"""
"""



import sys, os
if sys.platform == 'darwin':
    os.system('afplay /System/Library/Sounds/Glass.aiff')
elif sys.platform == 'win32':
    import winsound; winsound.MessageBeep()
else:
    os.system('paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || beep 2>/dev/null || echo -e "\\a"')

