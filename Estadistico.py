import pandas as pd
import re
from PyPDF2 import PdfFileReader
import matplotlib
import plotly.express as px


import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import bokeh
from bokeh.plotting import figure, output_file, save
from bokeh.io import curdoc
from bokeh.embed import file_html
from bokeh.resources import CDN, INLINE
from bokeh.models import HoverTool
from bokeh.models import Label

from bokeh.palettes import Blues9

from pywaffle import Waffle
import pandas as pd
import os
matplotlib.use('Agg')  # Non-interactive backend

def number_to_month(month_number):
    try:
        # List of month names
        months = [
            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre","Anual"
        ]
        # Return the month name based on the number
        return months[month_number - 1]
    except IndexError:
        raise ValueError("Month number must be between 1 and 12 - for anual use 13")

import matplotlib.patches as mpatches

def create_legend(ax, values, month, df, colors):
    print('Entering create_legend')

    # Ensure values are a numeric array
    values = [float(v) for v in values]

    if sum(values) > 0:
        legend_labels = [f"{name}: {int(value)} - {value / sum(values) * 100:.2f}%" for name, value in zip(df.index, values)]
    else:
        legend_labels = [f"{name}: {int(value)} - 0%" for name, value in zip(df.index, values)]

    # Ensure colors match the number of labels
    legend_elements = [mpatches.Patch(color=colors[i], label=legend_labels[i]) for i in range(len(legend_labels))]

    month_text = number_to_month(int(month))  # Ensure month is an integer

    ax.legend(
        handles=legend_elements,
        loc="upper left",
        title=f"{month_text}\nTotal - {int(sum(values))}",
        bbox_to_anchor=(1.04, 1),
        prop={'size': 14}
        
    )

    print('Exiting create_legend')


def estadistico_v2(Concentrado2_path: str, PDF_sec_economia_path: str, output_file: str,PDF_sec_economia_path2: str):
    #####################
    # LECTURA DE DATOS
    #####################
    output_folder = "static/waffle_charts"
    os.makedirs(output_folder, exist_ok=True)  # Ensure the folder exists

    
    print('entramos a estadistico')
    print(PDF_sec_economia_path)
    try:
        df_pedimentos = pd.read_excel(Concentrado2_path, engine='openpyxl', header=0, index_col=0)
    except Exception as e:
        raise Exception(f"Error al leer el archivo Excel: {e}")
    df_pedimentos['FECHA PEDIMENTO'] = df_pedimentos['FECHA PEDIMENTO'].astype(str)

    # Extracción de texto del PDF 1 
    try:
        with open(PDF_sec_economia_path, 'rb') as archivo_pdf:
            lector_pdf = PdfFileReader(archivo_pdf)
            num_paginas = lector_pdf.getNumPages()
            list_text1 = []
            for pagina_num in range(num_paginas):
                pagina = lector_pdf.getPage(pagina_num)
                text = pagina.extractText()
                list_text1.append(text)
            cadena1 = " ".join(list_text1)
            print('Extraido el pdf 1')
    except Exception as e:
        raise Exception(f"Error al leer el archivo PDF 1: {e}")

    # Procesando texto extraído del PDF
    patron_cupo = r'\bcertificado de cupo con número de autorización \w+/\w+'
    match_cupo = re.findall(patron_cupo, cadena1)
    match_cupo3 = match_cupo[0].split(' ')[-1] if match_cupo else 'N/A' 
    
    patron_pieza = r'\w+ Pieza.'
    match_pieza = re.findall(patron_pieza, cadena1)
    match_pieza3 = match_pieza[0][8:].replace(' Pieza.', '') if match_pieza else 'N/A'
    
# Extracción de texto del PDF 2 
    try:
        with open(PDF_sec_economia_path2, 'rb') as archivo_pdf:
            lector_pdf = PdfFileReader(archivo_pdf)
            num_paginas = lector_pdf.getNumPages()
            list_text1 = []
            for pagina_num in range(num_paginas):
                pagina = lector_pdf.getPage(pagina_num)
                text = pagina.extractText()
                list_text1.append(text)
            cadena2 = " ".join(list_text1)
            print('Extraido el pdf 2')

    except Exception as e:
        raise Exception(f"Error al leer el archivo PDF: 2 {e}")

    # Procesando texto extraído del PDF
    patron_cupo2 = r'\bcertificado de cupo con número de autorización \w+/\w+'
    match_cupo2 = re.findall(patron_cupo2, cadena2)
    match_cupo32 = match_cupo2[0].split(' ')[-1] if match_cupo2 else 'N/A' 
    
    patron_pieza2 = r'\w+ Pieza.'
    match_pieza2 = re.findall(patron_pieza2, cadena2)
    match_pieza32 = match_pieza2[0][8:].replace(' Pieza.', '') if match_pieza2 else 'N/A'
    
        
    
    
    # Prepare for summaries
    summary_data = {
        "Audi": 0,
        "Bentley": 0,
        "Porsche": 0,
        "Seat": 0,
        "Volkswagen": 0,
        "India": 0,
        "Sudafrica": 0,
    }

    # Generación de archivos mensuales
    with pd.ExcelWriter(output_file) as writer:
        previous_sheet_name = None

        for month in range(1, 13):
            month_str = f"{month:02d}"
            print(month_str)
            # Shift month by -1 (so Feb is treated as Jan, etc.)
            shifted_month_str = f"{(month) % 12 + 1:02d}"
            
            # Filtrar por mes en FECHA PEDIMENTO
            #df_pedimentos=df_pedimentos[df_pedimentos['J y N'].notna() ]
            df_pedimentos_mes = df_pedimentos[df_pedimentos['FECHA PEDIMENTO'].str[4:6] == shifted_month_str]
            print('---------------')
            print(df_pedimentos_mes)
            # Filtrando datos por país y marca
            df_pedimentos_India = df_pedimentos_mes[df_pedimentos_mes['PAIS'] == 'IND']
            df_pedimentos_Sudafrica = df_pedimentos_mes[df_pedimentos_mes['PAIS'] == 'ZAF']
            df_pedimentos_NO_India = df_pedimentos_mes[df_pedimentos_mes['PAIS'] != 'IND']
            df_pedimentos_NO_Sudafrica = df_pedimentos_NO_India[df_pedimentos_NO_India['PAIS'] != 'ZAF']
            df_pedimentos_N = df_pedimentos_NO_Sudafrica[df_pedimentos_NO_Sudafrica['J y N'] == 'N']
            #df_pedimentos_N_excepcion = df_pedimentos_N[df_pedimentos_N['FRACCION'] != 8703800100]
            
            df_pedimento_Audi = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'AUDI']
            df_pedimento_Bentley = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'BENTLEY']
            df_pedimento_Porsche = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'PORSCHE']
            df_pedimento_Seat = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'SEAT']
            df_pedimento_Volkswagen = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'VOLKSWAGEN']

            ################## GENERALES SIN ExCEPCIONES O CLASIFICACION POR MARCA anual
            gralAudi = df_pedimentos[df_pedimentos['MARCA'] =='AUDI']
            gralBentley = df_pedimentos[df_pedimentos['MARCA'] =='BENTLEY']
            gralPorsche= df_pedimentos[df_pedimentos['MARCA'] =='PORSCHE']
            gralSeat=df_pedimentos[df_pedimentos['MARCA'] =='SEAT']
            gralVolkswgen=df_pedimentos[df_pedimentos['MARCA'] =='VOLKSWAGEN']


            ############################################
            ################## GENERALES SIN ExCEPCIONES O CLASIFICACION POR MARCA por mes
            gralAudiMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='AUDI']
            gralBentleyMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='BENTLEY']
            gralPorscheMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='PORSCHE']
            gralSeatMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='SEAT']
            gralVolkswgenMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='VOLKSWAGEN']


            ############################################
            
            
            #Calculo para totales anuales
            summary_data["Audi"] += len(df_pedimento_Audi)
            summary_data["Bentley"] += len(df_pedimento_Bentley)
            summary_data["Porsche"] += len(df_pedimento_Porsche)
            summary_data["Seat"] += len(df_pedimento_Seat)
            summary_data["Volkswagen"] += len(df_pedimento_Volkswagen)
            summary_data["India"] += len(df_pedimentos_India)
            summary_data["Sudafrica"] += len(df_pedimentos_Sudafrica)


            # Cálculos
            suma_descargo = (len(df_pedimentos_India) + len(df_pedimentos_Sudafrica) + 
                             len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                             len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                             len(df_pedimento_Volkswagen))
            
            Subtotal_desglose_Europa = (len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                                        len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                                        len(df_pedimento_Volkswagen))
            Diferencia_cupo_desgloses = float(match_pieza3) - suma_descargo
            
            # Formato del estadístico para el mes
            list_col_A = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 
                          'TOTAL CUPO ' + match_pieza3, match_cupo3]
            list_col_B = ['', f'Periodo {month_str} 2024', '', f'Descargo {month_str} 2024', '', 'DESGLOSE EUROPA:', 
                          'Audi', 'Bentley', 'Porsche', 'Seat', 'Volkswagen (Vehiculos Comerciales)', 'Subtotal',
                          'Desglose INDIA:', 'India', 'Subtotal', 'Desglose SUDAFRICA', 'Sudafrica', 'Subtotal',
                          'TOTAL', '', 'CUPO', 'SALDO']
            list_col_C = ['', '',  '', suma_descargo, '', '', len(df_pedimento_Audi), len(df_pedimento_Bentley), 
                          len(df_pedimento_Porsche), len(df_pedimento_Seat), len(df_pedimento_Volkswagen),
                          Subtotal_desglose_Europa, '', len(df_pedimentos_India), len(df_pedimentos_India), 
                          '', len(df_pedimentos_Sudafrica), len(df_pedimentos_Sudafrica), int(suma_descargo), '', 
                          int(match_pieza3), int(Diferencia_cupo_desgloses)]
            list_col_D = ['', '', '', 'vehiculos', '', '', '', '', '', '', '', 'vehiculos', '', '', '', '', '', '',
                          'vehiculos', '', 'vehiculos', '']

            # DataFrame for the monthly sheet
            df_col_completo_pestana = pd.DataFrame([list_col_A, list_col_B, list_col_C, list_col_D]).T

            # Apply formula in C22
            if month == 1:
                df_col_completo_pestana.iloc[21, 2] = '=C22-C20'
            else:
                df_col_completo_pestana.iloc[20, 2] = f"='{previous_sheet_name}'!C23"
                df_col_completo_pestana.iloc[21, 2] = '=C22-C20'

            
            # Save in the sheet for each month
            sheet_name = f'Mes_{month_str}'
            df_col_completo_pestana.to_excel(writer, sheet_name=sheet_name, index=False)
            previous_sheet_name = sheet_name  # Update to current sheet name for next iteration

            print('termina de calcular mes e intenta hacer graficas.')
            ##### AQUI PONEMOS EL CODIGO PARA LAS GRAFICAS MESNSUALES
            data = {month_str: (len(gralBentleyMes) , len(gralAudiMes) , len(gralPorscheMes) , len(gralSeatMes) , len(gralVolkswgenMes)) }
            df = pd.DataFrame(data, index=[ 'Bentley', 'Audi', 'Porsche', 'Seat', 'Volkswagen'])
            cmap = plt.get_cmap("tab10")  # Use a colormap for distinct colors
            colors = [cmap(i) for i in range(len(df.index))]  # Generate colors dynamically
            fig, ax = plt.subplots(figsize=(5, 5))  # Create a new figure for each month
            values = df[month_str]   # Scale the values
            print(values)
            monthname = number_to_month(month)

            if values.sum() > 0:
                print('1$$$')
                brands2 = df.index.tolist()
                print(brands2)
                counts2 = values.tolist()
                print(counts2)

                print('2$$$')

                p = figure(
                    y_range=brands2, 
                    x_range=(0, max(counts2) + 5), 
                    title=f"Estadística Mensual {monthname}",
                    toolbar_location="above",
                    width=400,  # Fixed width for the graph
                    height=350,  # Fixed height for the graph
                    tools="pan,wheel_zoom,box_zoom,reset",
                    sizing_mode="stretch_both"  # Makes the chart adapt to its container

                )
                print('3$$$')
                                # Style upgrades
                p.title.text_font_size = "18pt"
                p.title.text_color = "#2c3e50"
                p.title.text_font = "Helvetica"
                p.background_fill_color = "#f8f9fa"
                p.border_fill_color = "#ffffff"
                p.outline_line_color = None
                p.toolbar.autohide = True
                p.xgrid.grid_line_color = "#e9ecef"
                p.ygrid.grid_line_color = None
                p.xaxis.axis_label_text_font_size = "12pt"
                p.yaxis.axis_label_text_font_size = "12pt"

                # Bar Chart with modern color
                bar_color = Blues9[4]  # Pick a nice mid-tone blue
                p.hbar(y=brands2, right=counts2, height=0.45, color=bar_color, line_color=None, fill_alpha=0.8)


                hover = HoverTool(tooltips=[("Marca", "@y"), ("Cantidad", "@right")])
                p.add_tools(hover)

                p.hbar(y=brands2, right=counts2, height=0.5, color="navy")

                p.xaxis.axis_label = "Cantidad"
                p.yaxis.axis_label = "Marca"
                print('4$$$')

                output_path = os.path.join("static", "bokeh_graphs", f"{month_str}.html")
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                print('crea grafica')
                html = file_html(p, INLINE, "Estadística Mensual")
                with open(output_path, "w") as f:
                    f.write(html)





                """fig, ax = plt.subplots(figsize=(8, 8))
                ax.set_title(f"Estadística Mensual - {monthname}", fontsize=14)

                Waffle.make_waffle(
                    ax=ax,
                    rows=20,
                    columns=5,
                    values=values,
                    title={"label": monthname, "loc": "left"},
                    colors=colors,
                    vertical=True,
                    font_size=14,
                    icon_legend=True,
                    legend={}  # Pasando un diccionario vacío para la leyenda
                )"""

            else:
                print('no crea grafica')


                #########
                # Create an empty graph with a message
                p_empty = figure(
                    title=f"Estadística Mensual {monthname}",
                    toolbar_location="above",
                    width=400,
                    height=350,
                    tools="pan,wheel_zoom,box_zoom,reset",
                    sizing_mode="stretch_both"  # Makes the chart adapt to its container
                )

                # Adding a message label to indicate no data
                message = Label(x=0.5, y=0.5, text="No hay datos disponibles", text_align="center", text_baseline="middle", text_font_size="16px")
                p_empty.add_layout(message)

                # Optionally, remove axis ticks if not needed
                p_empty.xaxis.visible = False
                p_empty.yaxis.visible = False

                output_path = os.path.join("static", "bokeh_graphs", f"{month_str}.html")
                os.makedirs(os.path.dirname(output_path), exist_ok=True)

                html = file_html(p_empty, INLINE, f"Estadística Mensual {month_str}")
                with open(output_path, "w") as f:
                    f.write(html)

                #########
                """fig, ax = plt.subplots(figsize=(8, 8))  # Manteniendo el mismo tamaño de la gráfica
                ax.set_title(f"Estadística Mensual - {monthname} - Sin Datos", fontsize=14)
                ax.text(0.5, 0.5, "No hay datos para este mes", ha='center', va='center', fontsize=12)
                ax.set_xticks([])
                ax.set_yticks([])
                ax.set_frame_on(False)"""
            #print('crea leyenda')
            # Add the legend
            #create_legend(ax, values*1000, month_str,df,colors)
            #filename = os.path.join(output_folder, f"{month_str}.png")
            #fig.savefig(filename, bbox_inches="tight", dpi=600, facecolor='white')
            #plt.close(fig)  # Close the figure to free memory
            print('termina de crear grafica y guarda.,')





        # Summary sheet
            TotalCoches = summary_data["Audi"]+ summary_data["Bentley"]+ summary_data["Porsche"]+ summary_data["Seat"]+ summary_data["Volkswagen"]+ summary_data["India"]+ summary_data["Sudafrica"]
            df_summary = pd.DataFrame({
            "Categoria": ["Audi", "Bentley", "Porsche", "Seat", "Volkswagen", "India", "Sudafrica",
                          'SUMA VEHÍCULOS TODAS LAS MARCAS SIN ORIGEN =','SALDO AGOSTO CUPO PRODUCCIÓN 2024',
                         '+','SALDO CUPO INVERSIÓN 2024',"'=",'SALDO TOTAL CUPOS UNILATERAL'],
            "Total": [summary_data["Audi"], summary_data["Bentley"], summary_data["Porsche"], 
                      summary_data["Seat"], summary_data["Volkswagen"], summary_data["India"], 
                      summary_data["Sudafrica"],
                      TotalCoches ,int(match_pieza32)-TotalCoches,'',int(match_pieza3),'',int(match_pieza32)-TotalCoches+int(match_pieza3)                     ]
            })
            
            
            #Asignacion para aplicados...
            SumaTotalCupos=int(match_pieza3)+ int(match_pieza32)
            if(int(match_pieza32)-TotalCoches <=0):
                AplicadoProduccion= int(match_pieza32)
                SaldoProduccion=0
                
                AplicadoInversion=TotalCoches-int(match_pieza32)
                SaldoInversion=int(match_pieza3)-AplicadoInversion
                
                MontoAplicado=AplicadoProduccion+AplicadoInversion
                PorcentajeAplicado=MontoAplicado*100/SumaTotalCupos
            else:
                AplicadoProduccion= TotalCoches
                SaldoProduccion= int(match_pieza32)-TotalCoches
                
                AplicadoInversion=0
                SaldoInversion=int(match_pieza3)
                MontoAplicado=AplicadoProduccion+AplicadoInversion
                PorcentajeAplicado=MontoAplicado*100/SumaTotalCupos
            
                
                

            sumarySec = [
                ['', 'RESUMEN CUPOS AÑO 2024', ''],
                ['PRODUCCION', 'INVERSION', 'SUMA TOTAL CUPOS'],
                [int(match_pieza32), int(match_pieza3), SumaTotalCupos],
                ['APLICADO', 'APLICADO', 'MONTO APLICADO'],
                [AplicadoProduccion, AplicadoInversion, MontoAplicado],
                ['SALDO', 'SALDO', 'PORCENTAJE APLICADO'],
                [SaldoProduccion, SaldoInversion, f"{PorcentajeAplicado:.2f}%"]
            ]
            df_sumarySec = pd.DataFrame(sumarySec)
            df_summary.to_excel(writer, sheet_name='Resumen', index=False)

            df_sumarySec.to_excel(writer, sheet_name='Resumen', index=False, startrow=0, startcol=len(df_summary.columns) + 2)
            ###AQUI PONEMOS EL CODIGO PARA LA GRAFICA ANUAL INDIVIDUAL. 
            #data = {month_str: (len(df_pedimentos_India) , len(df_pedimentos_Sudafrica) ,len(df_pedimento_Bentley) , len(df_pedimento_Audi) , len(df_pedimento_Porsche) , len(df_pedimento_Seat) , len(df_pedimento_Volkswagen)) }

                
        # Create a valid data dictionary
        data2 = {
            "Audi": len(gralAudi),
            "Bentley": len(gralBentley),
            "Porsche": len(gralPorsche),
            "Seat": len(gralSeat),
            "Volkswagen": len(gralVolkswgen)
        }

        print(data2)  # Debugging: Ensure data is correct
        if sum(data2.values()) > 0:
            brands = list(data2.keys())
            counts = list(data2.values())

            p = figure(
                y_range=brands, 
                x_range=(0, max(counts) + 5), 
                title="Estadística Anual",
                toolbar_location="above",
                width=400,  # Fixed width for the graph
                height=350,  # Fixed height for the graph
                tools="pan,wheel_zoom,box_zoom,reset",
                sizing_mode="stretch_both"  # Makes the chart adapt to its container

            )

# Style upgrades
            p.title.text_font_size = "18pt"
            p.title.text_color = "#2c3e50"
            p.title.text_font = "Helvetica"
            p.background_fill_color = "#f8f9fa"
            p.border_fill_color = "#ffffff"
            p.outline_line_color = None
            p.toolbar.autohide = True
            p.xgrid.grid_line_color = None
            p.ygrid.grid_line_color = "#e9ecef"
            p.xaxis.axis_label_text_font_size = "12pt"
            p.yaxis.axis_label_text_font_size = "12pt"

            # Bar Chart with modern color
            bar_color = Blues9[4]  # Pick a nice mid-tone blue
            p.hbar(y=brands, right=counts, height=0.45, color=bar_color, line_color=None, fill_alpha=0.55)

            
            hover = HoverTool(tooltips=[("Marca", "@y"), ("Cantidad", "@right")])
            p.add_tools(hover)

            p.hbar(y=brands, right=counts, height=0.5, color="navy")

            p.xaxis.axis_label = "Cantidad"
            p.yaxis.axis_label = "Marca"

            

            output_path = os.path.join("static", "bokeh_graphs", "13.html")
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            html = file_html(p, INLINE, "Estadística Anual")
            with open(output_path, "w") as f:
                f.write(html)

            print("Bokeh chart saved.")
        else:
            print("No data available for this chart.")


        """        if sum(data2.values()) > 0:            
            fig, ax = plt.subplots(figsize=(8, 8))
            ax.set_title(f"Estadística Anual", fontsize=14)

            # Generate colors dynamically
            cmap = plt.get_cmap("tab10")  # Change color scheme if needed
            colors = [cmap(i) for i in range(len(data2))]

            # Create Waffle Chart
            Waffle.make_waffle(
                ax=ax,
                rows=20,
                columns=5,
                values=data2,
                title={"label": 'Anual', "loc": "left"},
                colors=colors,
                vertical=True,
                font_size=14,
                icon_legend=True,
                legend={}  # Empty dictionary to remove duplicate legend
            )
        else:
            print('no crea grafica')

            fig, ax = plt.subplots(figsize=(8, 8))  # Manteniendo el mismo tamaño de la gráfica
            ax.set_title(f"Estadística Anual - Sin Datos", fontsize=14)
            ax.text(0.5, 0.5, "No hay datos para este mes", ha='center', va='center', fontsize=12)
            ax.set_xticks([])
            ax.set_yticks([])
            ax.set_frame_on(False)
        print('crea leyenda')
        # Add the legend
        create_legend(ax, list(data2.values()), 13, df, colors)
        filename = os.path.join(output_folder, "Anual.png")
        fig.savefig(filename, bbox_inches="tight", dpi=600, facecolor='white')
        plt.close(fig)  # Close the figure to free memory"""
        print('termina de crear grafica y guarda.,')


        ###sumary data to return
        """"
        SALDO CUPO PRODUCCIÓN ---
        CUPO INVERSIÓN 2023
        SALDO TOTAL CUPO UNILATERAL
        """

    dataTablasSalida = {
    "SALDO CUPO PRODUCCIÓN":int(match_pieza32) ,
    "SALDO CUPO INVERSIÓN": int(match_pieza3),
    "SALDO TOTAL CUPO UNILATERAL": SumaTotalCupos,
    "Audi": len(gralAudi) ,
    "Porsche": len(gralPorsche),
    "Seat": len(gralSeat),
    "Bentley": len(gralBentley),
    "Volkswagen (Vehiculos Comerciales)": len(gralVolkswgen),
    "India": len(df_pedimentos_India),
    "SUMA TODAS LAS MARCAS SIN ORIGEN":TotalCoches
    }
    print(dataTablasSalida)
    print(f"Estadístico mensual guardado en '{output_file}' para cada mes del año.")
    plt.close('all')

    return dataTablasSalida 



def estadistico_v3(Concentrado2_path: str, PDF_sec_economia_path: str, output_file: str, PDF_sec_economia_path2: str):
    #####################
    # LECTURA DE DATOS
    #####################
    output_folder = "static/waffle_charts"
    os.makedirs(output_folder, exist_ok=True)  # Ensure the folder exists
    plotly_folder = os.path.join("static", "plotly_graphs")
    os.makedirs(plotly_folder, exist_ok=True)

    print('entramos a estadistico')
    print(PDF_sec_economia_path)
    try:
        df_pedimentos = pd.read_excel(Concentrado2_path, engine='openpyxl', header=0, index_col=0)
    except Exception as e:
        raise Exception(f"Error al leer el archivo Excel: {e}")
    df_pedimentos['FECHA PEDIMENTO'] = df_pedimentos['FECHA PEDIMENTO'].astype(str)

    # Extracción de texto del PDF 1 
    try:
        with open(PDF_sec_economia_path, 'rb') as archivo_pdf:
            lector_pdf = PdfFileReader(archivo_pdf)
            num_paginas = lector_pdf.getNumPages()
            list_text1 = []
            for pagina_num in range(num_paginas):
                pagina = lector_pdf.getPage(pagina_num)
                text = pagina.extractText()
                list_text1.append(text)
            cadena1 = " ".join(list_text1)
            print('Extraido el pdf 1')
    except Exception as e:
        raise Exception(f"Error al leer el archivo PDF 1: {e}")

    # Procesando texto extraído del PDF
    patron_cupo = r'\bcertificado de cupo con número de autorización \w+/\w+'
    match_cupo = re.findall(patron_cupo, cadena1)
    match_cupo3 = match_cupo[0].split(' ')[-1] if match_cupo else 'N/A' 

    patron_pieza = r'\w+ Pieza.'
    match_pieza = re.findall(patron_pieza, cadena1)
    match_pieza3 = match_pieza[0][8:].replace(' Pieza.', '') if match_pieza else 'N/A'

    # Extracción de texto del PDF 2 
    try:
        with open(PDF_sec_economia_path2, 'rb') as archivo_pdf:
            lector_pdf = PdfFileReader(archivo_pdf)
            num_paginas = lector_pdf.getNumPages()
            list_text1 = []
            for pagina_num in range(num_paginas):
                pagina = lector_pdf.getPage(pagina_num)
                text = pagina.extractText()
                list_text1.append(text)
            cadena2 = " ".join(list_text1)
            print('Extraido el pdf 2')
    except Exception as e:
        raise Exception(f"Error al leer el archivo PDF: 2 {e}")

    # Procesando texto extraído del PDF
    patron_cupo2 = r'\bcertificado de cupo con número de autorización \w+/\w+'
    match_cupo2 = re.findall(patron_cupo2, cadena2)
    match_cupo32 = match_cupo2[0].split(' ')[-1] if match_cupo2 else 'N/A' 

    patron_pieza2 = r'\w+ Pieza.'
    match_pieza2 = re.findall(patron_pieza2, cadena2)
    match_pieza32 = match_pieza2[0][8:].replace(' Pieza.', '') if match_pieza2 else 'N/A'

    # Prepare for summaries
    summary_data = {
        "Audi": 0,
        "Bentley": 0,
        "Porsche": 0,
        "Seat": 0,
        "Volkswagen": 0,
        "India": 0,
        "Sudafrica": 0,
    }

    # Generación de archivos mensuales
    with pd.ExcelWriter(output_file) as writer:
        previous_sheet_name = None

        for month in range(1, 13):
            month_str = f"{month:02d}"
            print(month_str)
            # Shift month by -1 (so Feb is treated as Jan, etc.)
            shifted_month_str = f"{(month) % 12 + 1:02d}"

            # Filtrar por mes en FECHA PEDIMENTO
            df_pedimentos_mes = df_pedimentos[df_pedimentos['FECHA PEDIMENTO'].str[4:6] == shifted_month_str]
            print('---------------')
            print(df_pedimentos_mes)
            # Filtrando datos por país y marca
            df_pedimentos_India = df_pedimentos_mes[df_pedimentos_mes['PAIS'] == 'IND']
            df_pedimentos_Sudafrica = df_pedimentos_mes[df_pedimentos_mes['PAIS'] == 'ZAF']
            df_pedimentos_NO_India = df_pedimentos_mes[df_pedimentos_mes['PAIS'] != 'IND']
            df_pedimentos_NO_Sudafrica = df_pedimentos_NO_India[df_pedimentos_NO_India['PAIS'] != 'ZAF']
            df_pedimentos_N = df_pedimentos_NO_Sudafrica[df_pedimentos_NO_Sudafrica['J y N'] == 'N']

            df_pedimento_Audi = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'AUDI']
            df_pedimento_Bentley = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'BENTLEY']
            df_pedimento_Porsche = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'PORSCHE']
            df_pedimento_Seat = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'SEAT']
            df_pedimento_Volkswagen = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'VOLKSWAGEN']

            # GENERALES SIN ExCEPCIONES O CLASIFICACION POR MARCA anual
            gralAudi = df_pedimentos[df_pedimentos['MARCA'] =='AUDI']
            gralBentley = df_pedimentos[df_pedimentos['MARCA'] =='BENTLEY']
            gralPorsche= df_pedimentos[df_pedimentos['MARCA'] =='PORSCHE']
            gralSeat=df_pedimentos[df_pedimentos['MARCA'] =='SEAT']
            gralVolkswgen=df_pedimentos[df_pedimentos['MARCA'] =='VOLKSWAGEN']

            # GENERALES SIN ExCEPCIONES O CLASIFICACION POR MARCA por mes
            gralAudiMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='AUDI']
            gralBentleyMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='BENTLEY']
            gralPorscheMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='PORSCHE']
            gralSeatMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='SEAT']
            gralVolkswgenMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='VOLKSWAGEN']

            # Calculo para totales anuales
            summary_data["Audi"] += len(df_pedimento_Audi)
            summary_data["Bentley"] += len(df_pedimento_Bentley)
            summary_data["Porsche"] += len(df_pedimento_Porsche)
            summary_data["Seat"] += len(df_pedimento_Seat)
            summary_data["Volkswagen"] += len(df_pedimento_Volkswagen)
            summary_data["India"] += len(df_pedimentos_India)
            summary_data["Sudafrica"] += len(df_pedimentos_Sudafrica)

            # Cálculos
            suma_descargo = (len(df_pedimentos_India) + len(df_pedimentos_Sudafrica) + 
                             len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                             len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                             len(df_pedimento_Volkswagen))

            Subtotal_desglose_Europa = (len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                                        len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                                        len(df_pedimento_Volkswagen))
            Diferencia_cupo_desgloses = float(match_pieza3) - suma_descargo

            # Format monthly DataFrame (same as before)
            list_col_A = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 
                          'TOTAL CUPO ' + match_pieza3, match_cupo3]
            list_col_B = ['', f'Periodo {month_str} 2024', '', f'Descargo {month_str} 2024', '', 'DESGLOSE EUROPA:', 
                          'Audi', 'Bentley', 'Porsche', 'Seat', 'Volkswagen (Vehiculos Comerciales)', 'Subtotal',
                          'Desglose INDIA:', 'India', 'Subtotal', 'Desglose SUDAFRICA', 'Sudafrica', 'Subtotal',
                          'TOTAL', '', 'CUPO', 'SALDO']
            list_col_C = ['', '',  '', suma_descargo, '', '', len(df_pedimento_Audi), len(df_pedimento_Bentley), 
                          len(df_pedimento_Porsche), len(df_pedimento_Seat), len(df_pedimento_Volkswagen),
                          Subtotal_desglose_Europa, '', len(df_pedimentos_India), len(df_pedimentos_India), 
                          '', len(df_pedimentos_Sudafrica), len(df_pedimentos_Sudafrica), int(suma_descargo), '', 
                          int(match_pieza3), int(Diferencia_cupo_desgloses)]
            list_col_D = ['', '', '', 'vehiculos', '', '', '', '', '', '', '', 'vehiculos', '', '', '', '', '', '',
                          'vehiculos', '', 'vehiculos', '']

            df_col_completo_pestana = pd.DataFrame([list_col_A, list_col_B, list_col_C, list_col_D]).T

            if month == 1:
                df_col_completo_pestana.iloc[21, 2] = '=C22-C20'
            else:
                df_col_completo_pestana.iloc[20, 2] = f"='{previous_sheet_name}'!C23"
                df_col_completo_pestana.iloc[21, 2] = '=C22-C20'

            sheet_name = f'Mes_{month_str}'
            df_col_completo_pestana.to_excel(writer, sheet_name=sheet_name, index=False)
            previous_sheet_name = sheet_name

            print('termina de calcular mes e intenta hacer graficas.')
            ##### AQUI PONEMOS EL CODIGO PARA LAS GRAFICAS MESNSUALES
            data = {month_str: (len(gralBentleyMes) , len(gralAudiMes) , len(gralPorscheMes) , len(gralSeatMes) , len(gralVolkswgenMes)) }
            df = pd.DataFrame(data, index=[ 'Bentley', 'Audi', 'Porsche', 'Seat', 'Volkswagen'])
            cmap = plt.get_cmap("tab10")  # optional, kept for backwards compatibility
            colors = [cmap(i) for i in range(len(df.index))]
            values = df[month_str]
            print(values)
            monthname = number_to_month(month)

            if values.sum() > 0:
                print('1$$$')
                brands2 = df.index.tolist()
                print(brands2)
                counts2 = values.tolist()
                print(counts2)

                # Build DataFrame for plotly
                plot_df = pd.DataFrame({"brand": brands2, "count": counts2})

                # Plotly Express horizontal bar with distinct colors per brand
                fig = px.bar(
                    plot_df.sort_values("count"),  # sort so smaller on top if desired
                    x="count",
                    y="brand",
                    orientation="h",
                    title=f"Estadística Mensual {monthname}",
                    #labels={"count": "Cantidad", "brand": "Marca"},
                    text="count",
                    color="brand",
                    color_discrete_sequence=px.colors.qualitative.Set2
                )

                fig.update_traces(textposition="outside", marker_line_width=0)
                fig.update_layout(
                    title_font=dict(size=18, color="#2c3e50"),
                    plot_bgcolor="#f8f9fa",
                    paper_bgcolor="#ffffff",
                    #xaxis=dict(showgrid=True, gridcolor="#e9ecef", title="Cantidad"),
                    yaxis=dict(showgrid=False, title="Marca"),
                    width=700,
                    height=480,
                    showlegend=False,
                    margin=dict(l=80, r=40, t=80, b=40)
                )

                output_path = os.path.join(plotly_folder, f"{month_str}.html")
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                print('crea grafica')

                # write interactive html ready for iframe embedding
                fig.write_html(output_path, full_html=True, include_plotlyjs="cdn")
                print(f"Saved plotly monthly chart: {output_path}")

            else:
                print('no crea grafica (mes sin datos)')

                # Create a very small HTML with a message so iframe still works
                output_path = os.path.join(plotly_folder, f"{month_str}.html")
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                empty_html = f"""
                <html>
                <head><meta charset="utf-8"><title>Estadística Mensual {monthname}</title></head>
                <body style="font-family: Arial, Helvetica, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh;">
                  <div style="text-align:center;">
                    <h3>Estadística Mensual {monthname}</h3>
                    <p>No hay datos disponibles</p>
                  </div>
                </body>
                </html>
                """
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(empty_html)
                print(f"Saved empty placeholder: {output_path}")

            print('termina de crear grafica y guarda.,')

        # --- After monthly loop: create annual chart ---
        TotalCoches = summary_data["Audi"]+ summary_data["Bentley"]+ summary_data["Porsche"]+ summary_data["Seat"]+ summary_data["Volkswagen"]+ summary_data["India"]+ summary_data["Sudafrica"]
        df_summary = pd.DataFrame({
            "Categoria": ["Audi", "Bentley", "Porsche", "Seat", "Volkswagen", "India", "Sudafrica",
                          'SUMA VEHÍCULOS TODAS LAS MARCAS SIN ORIGEN =','SALDO AGOSTO CUPO PRODUCCIÓN 2024',
                         '+','SALDO CUPO INVERSIÓN 2024',"'=",'SALDO TOTAL CUPOS UNILATERAL'],
            "Total": [summary_data["Audi"], summary_data["Bentley"], summary_data["Porsche"], 
                      summary_data["Seat"], summary_data["Volkswagen"], summary_data["India"], 
                      summary_data["Sudafrica"],
                      TotalCoches ,int(match_pieza32)-TotalCoches,'',int(match_pieza3),'',int(match_pieza32)-TotalCoches+int(match_pieza3)                     ]
        })

        # ... (rest of your summary and Excel writes remain unchanged)
        # write summary sheets as before
        df_summary.to_excel(writer, sheet_name='Resumen', index=False)

        # Annual chart using the `gral*` totals computed earlier (use data2 as in your code)
        data2 = {
            "Audi": len(gralAudi),
            "Bentley": len(gralBentley),
            "Porsche": len(gralPorsche),
            "Seat": len(gralSeat),
            "Volkswagen": len(gralVolkswgen)
        }

        print(data2)
        if sum(data2.values()) > 0:
            tree_df = (
                df_pedimentos.groupby(['MARCA', 'TIPO'])
                .size()
                .reset_index(name='count')
                .rename(columns={'MARCA': 'brand', 'TIPO': 'model'})
            )

            fig = px.treemap(
                tree_df,
                path=["brand", "model"],
                values="count",
                color="brand",
                title="Estadística Anual"
            )

            fig.update_layout(
                title_font=dict(size=18, color="#459aee"),
                plot_bgcolor="#f8f9fa",
                paper_bgcolor="#ffffff",
                width=700,
                height=480,
                margin=dict(l=20, r=20, t=60, b=20)
            )

            output_path = os.path.join(plotly_folder, "13.html")
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            fig.write_html(output_path, full_html=True, include_plotlyjs="cdn")
            print("Plotly annual chart saved.")
        else:
            print("No data available for annual chart.")
            output_path = os.path.join(plotly_folder, "13.html")
            empty_html = f"""
            <html>
            <head><meta charset="utf-8"><title>Estadística Anual</title></head>
            <body style="font-family: Arial, Helvetica, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh;">
              <div style="text-align:center;">
                <h3>Estadística Anual</h3>
                <p>No hay datos disponibles</p>
              </div>
            </body>
            </html>
            """
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(empty_html)

        # The rest of your code that computes Aplicado, Saldo, etc. remains the same
        # (I omitted re-copying the long block to avoid duplication but left df_summary write above)
        # Make sure any subsequent variables referenced below exist in scope

        # Final summary calculations (kept from your original)
        SumaTotalCupos = int(match_pieza3) + int(match_pieza32)
        if (int(match_pieza32) - TotalCoches <= 0):
            AplicadoProduccion = int(match_pieza32)
            SaldoProduccion = 0

            AplicadoInversion = TotalCoches - int(match_pieza32)
            SaldoInversion = int(match_pieza3) - AplicadoInversion

            MontoAplicado = AplicadoProduccion + AplicadoInversion
            PorcentajeAplicado = MontoAplicado * 100 / SumaTotalCupos
        else:
            AplicadoProduccion = TotalCoches
            SaldoProduccion = int(match_pieza32) - TotalCoches

            AplicadoInversion = 0
            SaldoInversion = int(match_pieza3)
            MontoAplicado = AplicadoProduccion + AplicadoInversion
            PorcentajeAplicado = MontoAplicado * 100 / SumaTotalCupos

        sumarySec = [
            ['', 'RESUMEN CUPOS AÑO 2024', ''],
            ['PRODUCCION', 'INVERSION', 'SUMA TOTAL CUPOS'],
            [int(match_pieza32), int(match_pieza3), SumaTotalCupos],
            ['APLICADO', 'APLICADO', 'MONTO APLICADO'],
            [AplicadoProduccion, AplicadoInversion, MontoAplicado],
            ['SALDO', 'SALDO', 'PORCENTAJE APLICADO'],
            [SaldoProduccion, SaldoInversion, f"{PorcentajeAplicado:.2f}%"]
        ]
        df_sumarySec = pd.DataFrame(sumarySec)
        df_sumarySec.to_excel(writer, sheet_name='Resumen', index=False, startrow=0, startcol=len(df_summary.columns) + 2)

    # Outside ExcelWriter
    dataTablasSalida = {
        "SALDO CUPO PRODUCCIÓN": int(match_pieza32),
        "SALDO CUPO INVERSIÓN": int(match_pieza3),
        "SALDO TOTAL CUPO UNILATERAL": SumaTotalCupos,
        "Audi": len(gralAudi),
        "Porsche": len(gralPorsche),
        "Seat": len(gralSeat),
        "Bentley": len(gralBentley),
        "Volkswagen (Vehiculos Comerciales)": len(gralVolkswgen),
        "India": len(df_pedimentos_India),
        "SUMA TODAS LAS MARCAS SIN ORIGEN": TotalCoches
    }
    print(dataTablasSalida)
    print(f"Estadístico mensual guardado en '{output_file}' para cada mes del año.")
    plt.close('all')

    return dataTablasSalida




def estadistico_v4(Concentrado2_path: str, PDF_sec_economia_paths: list, output_file: str, PDF_sec_economia_paths2: list):
    """
    Processes multiple PDF pairs for production and investment quotas.
    
    Args:
        Concentrado2_path: Path to Excel file with pedimentos data
        PDF_sec_economia_paths: List of paths to investment quota PDFs
        output_file: Path for output Excel file
        PDF_sec_economia_paths2: List of paths to production quota PDFs
    """
    #####################
    # SETUP
    #####################
    import tempfile
    output_folder = os.path.join(tempfile.gettempdir(), "static", "waffle_charts")
    os.makedirs(output_folder, exist_ok=True)
    plotly_folder = os.path.join(tempfile.gettempdir(), "static", "plotly_graphs")
    os.makedirs(plotly_folder, exist_ok=True)

    print('entramos a estadistico')
    
    #####################
    # READ PEDIMENTOS DATA
    #####################
    try:
        df_pedimentos = pd.read_excel(Concentrado2_path, engine='openpyxl', header=0, index_col=0)
    except Exception as e:
        raise Exception(f"Error al leer el archivo Excel: {e}")
    df_pedimentos['FECHA PEDIMENTO'] = df_pedimentos['FECHA PEDIMENTO'].astype(str)

    #####################
    # EXTRACT PDF DATA
    #####################
    def extract_pdf_data(pdf_path):
        """Extract authorization number and quota from a PDF"""
        try:
            with open(pdf_path, 'rb') as archivo_pdf:
                lector_pdf = PdfFileReader(archivo_pdf)
                num_paginas = lector_pdf.getNumPages()
                list_text = []
                for pagina_num in range(num_paginas):
                    pagina = lector_pdf.getPage(pagina_num)
                    text = pagina.extractText()
                    list_text.append(text)
                cadena = " ".join(list_text)
                
                # Extract authorization number
                patron_cupo = r'\bcertificado de cupo con número de autorización \w+/\w+'
                match_cupo = re.findall(patron_cupo, cadena)
                cupo_num = match_cupo[0].split(' ')[-1] if match_cupo else 'N/A'
                
                # Extract quota amount
                patron_pieza = r'\w+ Pieza.'
                match_pieza = re.findall(patron_pieza, cadena)
                pieza_num = match_pieza[0][8:].replace(' Pieza.', '') if match_pieza else 'N/A'
                
                return cupo_num, pieza_num
        except Exception as e:
            raise Exception(f"Error al leer el archivo PDF {pdf_path}: {e}")

    # Process all investment quota PDFs
    inversion_quotas = []
    for pdf_path in PDF_sec_economia_paths:
        cupo_num, pieza_num = extract_pdf_data(pdf_path)
        inversion_quotas.append({
            'cupo': cupo_num,
            'cantidad': int(pieza_num) if pieza_num != 'N/A' else 0,
            'path': pdf_path
        })
        print(f'Extraído PDF inversión: {cupo_num} - {pieza_num} piezas')

    # Process all production quota PDFs
    produccion_quotas = []
    for pdf_path in PDF_sec_economia_paths2:
        cupo_num, pieza_num = extract_pdf_data(pdf_path)
        produccion_quotas.append({
            'cupo': cupo_num,
            'cantidad': int(pieza_num) if pieza_num != 'N/A' else 0,
            'path': pdf_path
        })
        print(f'Extraído PDF producción: {cupo_num} - {pieza_num} piezas')

    # Calculate totals
    total_inversion = sum(q['cantidad'] for q in inversion_quotas)
    total_produccion = sum(q['cantidad'] for q in produccion_quotas)
    
    # Format quota strings for display
    match_cupo3 = ', '.join([q['cupo'] for q in inversion_quotas])
    match_pieza3 = str(total_inversion)
    match_cupo32 = ', '.join([q['cupo'] for q in produccion_quotas])
    match_pieza32 = str(total_produccion)

    #####################
    # MONTHLY PROCESSING
    #####################
    summary_data = {
        "Audi": 0,
        "Bentley": 0,
        "Porsche": 0,
        "Seat": 0,
        "Volkswagen": 0,
        "India": 0,
        "Sudafrica": 0,
    }

    # Track quota usage month by month
    cumulative_usage = 0
    quota_transitions_produccion = []  # Track when production quotas are exhausted
    quota_transitions_inversion = []   # Track when investment quotas are exhausted
    monthly_tracking = []  # Track usage details for each month
    current_produccion_idx = 0
    current_inversion_idx = 0
    remaining_produccion = produccion_quotas[0]['cantidad'] if produccion_quotas else 0
    remaining_inversion = inversion_quotas[0]['cantidad'] if inversion_quotas else 0
    cupo_inicial_produccion = remaining_produccion
    cupo_inicial_inversion = remaining_inversion

    with pd.ExcelWriter(output_file) as writer:
        previous_sheet_name = None

        for month in range(1, 13):
            month_str = f"{month:02d}"
            print(month_str)
            shifted_month_str = f"{(month) % 12 + 1:02d}"

            # Filter by month
            df_pedimentos_mes = df_pedimentos[df_pedimentos['FECHA PEDIMENTO'].str[4:6] == shifted_month_str]
            
            # Filter by country and brand
            df_pedimentos_India = df_pedimentos_mes[df_pedimentos_mes['PAIS'] == 'IND']
            df_pedimentos_Sudafrica = df_pedimentos_mes[df_pedimentos_mes['PAIS'] == 'ZAF']
            df_pedimentos_NO_India = df_pedimentos_mes[df_pedimentos_mes['PAIS'] != 'IND']
            df_pedimentos_NO_Sudafrica = df_pedimentos_NO_India[df_pedimentos_NO_India['PAIS'] != 'ZAF']
            df_pedimentos_N = df_pedimentos_NO_Sudafrica[df_pedimentos_NO_Sudafrica['J y N'] == 'N']

            df_pedimento_Audi = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'AUDI']
            df_pedimento_Bentley = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'BENTLEY']
            df_pedimento_Porsche = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'PORSCHE']
            df_pedimento_Seat = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'SEAT']
            df_pedimento_Volkswagen = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'VOLKSWAGEN']

            # Annual totals by brand
            gralAudi = df_pedimentos[df_pedimentos['MARCA'] =='AUDI']
            gralBentley = df_pedimentos[df_pedimentos['MARCA'] =='BENTLEY']
            gralPorsche= df_pedimentos[df_pedimentos['MARCA'] =='PORSCHE']
            gralSeat=df_pedimentos[df_pedimentos['MARCA'] =='SEAT']
            gralVolkswgen=df_pedimentos[df_pedimentos['MARCA'] =='VOLKSWAGEN']

            # Monthly totals by brand
            gralAudiMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='AUDI']
            gralBentleyMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='BENTLEY']
            gralPorscheMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='PORSCHE']
            gralSeatMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='SEAT']
            gralVolkswgenMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='VOLKSWAGEN']

            # Update summary
            summary_data["Audi"] += len(df_pedimento_Audi)
            summary_data["Bentley"] += len(df_pedimento_Bentley)
            summary_data["Porsche"] += len(df_pedimento_Porsche)
            summary_data["Seat"] += len(df_pedimento_Seat)
            summary_data["Volkswagen"] += len(df_pedimento_Volkswagen)
            summary_data["India"] += len(df_pedimentos_India)
            summary_data["Sudafrica"] += len(df_pedimentos_Sudafrica)

            # Calculate monthly usage
            monthly_usage = (len(df_pedimentos_India) + len(df_pedimentos_Sudafrica) + 
                           len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                           len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                           len(df_pedimento_Volkswagen))
            
            # Track state before processing this month
            month_start_produccion = remaining_produccion
            month_start_inversion = remaining_inversion
            month_start_cupo_prod = produccion_quotas[current_produccion_idx]['cupo'] if current_produccion_idx < len(produccion_quotas) else 'AGOTADO'
            month_start_cupo_inv = inversion_quotas[current_inversion_idx]['cupo'] if current_inversion_idx < len(inversion_quotas) else 'AGOTADO'
            
            cumulative_usage += monthly_usage
            used_produccion_this_month = 0
            used_inversion_this_month = 0
            
            # Process monthly consumption using current active quotas
            if monthly_usage > 0:
                remaining_to_consume = monthly_usage
                
                # STEP 1: Try to consume from current PRODUCTION quota
                while remaining_to_consume > 0 and current_produccion_idx < len(produccion_quotas):
                    if remaining_produccion > 0:
                        # Consume from current production quota
                        consumed = min(remaining_to_consume, remaining_produccion)
                        used_produccion_this_month += consumed
                        remaining_produccion -= consumed
                        remaining_to_consume -= consumed
                        
                        # Check if this quota is now exhausted
                        if remaining_produccion == 0:
                            monthname = number_to_month(month)
                            quota_transitions_produccion.append({
                                'month': month,
                                'month_name': monthname,
                                'quota_exhausted': produccion_quotas[current_produccion_idx],
                                'cumulative_usage': cumulative_usage,
                                'remaining_after': remaining_to_consume
                            })
                            print(f"⚠️ CUPO PRODUCCIÓN AGOTADO en {monthname} - {produccion_quotas[current_produccion_idx]['cupo']} ({produccion_quotas[current_produccion_idx]['cantidad']} piezas)")
                            
                            # Move to next production quota
                            current_produccion_idx += 1
                            if current_produccion_idx < len(produccion_quotas):
                                remaining_produccion = produccion_quotas[current_produccion_idx]['cantidad']
                                print(f"✓ Activando siguiente cupo producción: {produccion_quotas[current_produccion_idx]['cupo']} ({remaining_produccion} piezas)")
                            else:
                                print(f"⚠️ TODOS LOS CUPOS DE PRODUCCIÓN AGOTADOS")
                                break
                    else:
                        # Current production quota is empty, try next one
                        break
                
                # STEP 2: If still need more, consume from INVESTMENT quota
                while remaining_to_consume > 0 and current_inversion_idx < len(inversion_quotas):
                    if remaining_inversion > 0:
                        # Consume from current investment quota
                        consumed = min(remaining_to_consume, remaining_inversion)
                        used_inversion_this_month += consumed
                        remaining_inversion -= consumed
                        remaining_to_consume -= consumed
                        
                        # Check if this quota is now exhausted
                        if remaining_inversion == 0:
                            monthname = number_to_month(month)
                            quota_transitions_inversion.append({
                                'month': month,
                                'month_name': monthname,
                                'quota_exhausted': inversion_quotas[current_inversion_idx],
                                'cumulative_usage': cumulative_usage,
                                'remaining_after': remaining_to_consume
                            })
                            print(f"⚠️ CUPO INVERSIÓN AGOTADO en {monthname} - {inversion_quotas[current_inversion_idx]['cupo']} ({inversion_quotas[current_inversion_idx]['cantidad']} piezas)")
                            
                            # Move to next investment quota
                            current_inversion_idx += 1
                            if current_inversion_idx < len(inversion_quotas):
                                remaining_inversion = inversion_quotas[current_inversion_idx]['cantidad']
                                print(f"✓ Activando siguiente cupo inversión: {inversion_quotas[current_inversion_idx]['cupo']} ({remaining_inversion} piezas)")
                            else:
                                print(f"⚠️ TODOS LOS CUPOS DE INVERSIÓN AGOTADOS")
                                break
                    else:
                        # Current investment quota is empty, try next one
                        break
                
                # Check if we couldn't fulfill the entire month's demand
                if remaining_to_consume > 0:
                    monthname = number_to_month(month)
                    print(f"🚨 ALERTA CRÍTICA en {monthname}: Faltan {remaining_to_consume} vehículos - TODOS LOS CUPOS AGOTADOS")
            
            # Record monthly tracking
            monthname = number_to_month(month)
            
            # Determine which quota is currently active
            active_prod_cupo = produccion_quotas[current_produccion_idx]['cupo'] if current_produccion_idx < len(produccion_quotas) else 'AGOTADO'
            active_inv_cupo = inversion_quotas[current_inversion_idx]['cupo'] if current_inversion_idx < len(inversion_quotas) else 'AGOTADO'
            
            monthly_tracking.append({
                'month': month,
                'month_name': monthname,
                'disponible_produccion_inicio': month_start_produccion,
                'disponible_inversion_inicio': month_start_inversion,
                'cupo_produccion_activo': active_prod_cupo,
                'cupo_inversion_activo': active_inv_cupo,
                'consumo_total': monthly_usage,
                'consumo_produccion': used_produccion_this_month,
                'consumo_inversion': used_inversion_this_month,
                'disponible_produccion_fin': remaining_produccion,
                'disponible_inversion_fin': remaining_inversion,
                'acumulado': cumulative_usage
            })

            # Calculations
            suma_descargo = (len(df_pedimentos_India) + len(df_pedimentos_Sudafrica) + 
                             len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                             len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                             len(df_pedimento_Volkswagen))

            Subtotal_desglose_Europa = (len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                                        len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                                        len(df_pedimento_Volkswagen))
            
            # Format monthly DataFrame
            # Use the CURRENT active INVESTMENT quota info for display (not production)
            current_cupo_number = inversion_quotas[current_inversion_idx]['cupo'] if current_inversion_idx < len(inversion_quotas) else 'AGOTADO'
            current_cupo_amount = str(remaining_inversion) if current_inversion_idx < len(inversion_quotas) else '0'
            
            # Calculate remaining for this month (from investment quota)
            Diferencia_cupo_desgloses = remaining_inversion
            
            # For row 20 (TOTAL CUPO), show current active quota amount
            # For row 21 (authorization number), show current active authorization
            list_col_A = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 
                          'TOTAL CUPO ' + current_cupo_amount, current_cupo_number]
            list_col_B = ['', f'Periodo {month_str} 2024', '', f'Descargo {month_str} 2024', '', 'DESGLOSE EUROPA:', 
                          'Audi', 'Bentley', 'Porsche', 'Seat', 'Volkswagen (Vehiculos Comerciales)', 'Subtotal',
                          'Desglose INDIA:', 'India', 'Subtotal', 'Desglose SUDAFRICA', 'Sudafrica', 'Subtotal',
                          'TOTAL', '', 'CUPO', 'SALDO']
            list_col_C = ['', '',  '', suma_descargo, '', '', len(df_pedimento_Audi), len(df_pedimento_Bentley), 
                          len(df_pedimento_Porsche), len(df_pedimento_Seat), len(df_pedimento_Volkswagen),
                          Subtotal_desglose_Europa, '', len(df_pedimentos_India), len(df_pedimentos_India), 
                          '', len(df_pedimentos_Sudafrica), len(df_pedimentos_Sudafrica), int(suma_descargo), '', 
                          int(current_cupo_amount), int(Diferencia_cupo_desgloses)]
            list_col_D = ['', '', '', 'vehiculos', '', '', '', '', '', '', '', 'vehiculos', '', '', '', '', '', '',
                          'vehiculos', '', 'vehiculos', '']

            df_col_completo_pestana = pd.DataFrame([list_col_A, list_col_B, list_col_C, list_col_D]).T

            # Set formulas correctly
            if month == 1:
                # First month: SALDO = CUPO - TOTAL (using investment quota)
                df_col_completo_pestana.iloc[21, 2] = int(current_cupo_amount) - int(suma_descargo)
            else:
                # Subsequent months: CUPO = remaining from tracking, SALDO = CUPO - TOTAL
                df_col_completo_pestana.iloc[20, 2] = month_start_inversion
                df_col_completo_pestana.iloc[21, 2] = remaining_inversion

            sheet_name = f'Mes_{month_str}'
            df_col_completo_pestana.to_excel(writer, sheet_name=sheet_name, index=False)
            previous_sheet_name = sheet_name

            #####################
            # MONTHLY CHARTS
            #####################
            data = {month_str: (len(gralBentleyMes), len(gralAudiMes), len(gralPorscheMes), 
                               len(gralSeatMes), len(gralVolkswgenMes))}
            df = pd.DataFrame(data, index=['Bentley', 'Audi', 'Porsche', 'Seat', 'Volkswagen'])
            values = df[month_str]
            monthname = number_to_month(month)

            if values.sum() > 0:
                brands2 = df.index.tolist()
                counts2 = values.tolist()
                plot_df = pd.DataFrame({"brand": brands2, "count": counts2})

                fig = px.bar(
                    plot_df.sort_values("count"),
                    x="count",
                    y="brand",
                    orientation="h",
                    title=f"Estadística Mensual {monthname}",
                    text="count",
                    color="brand",
                    color_discrete_sequence=px.colors.qualitative.Set2
                )

                fig.update_traces(textposition="outside", marker_line_width=0)
                fig.update_layout(
                    title_font=dict(size=18, color="#2c3e50"),
                    plot_bgcolor="#f8f9fa",
                    paper_bgcolor="#ffffff",
                    yaxis=dict(showgrid=False, title="Marca"),
                    width=700,
                    height=480,
                    showlegend=False,
                    margin=dict(l=80, r=40, t=80, b=40)
                )

                output_path = os.path.join(plotly_folder, f"{month_str}.html")
                fig.write_html(output_path, full_html=True, include_plotlyjs="cdn")
                print(f"Saved plotly monthly chart: {output_path}")
            else:
                output_path = os.path.join(plotly_folder, f"{month_str}.html")
                empty_html = f"""
                <html>
                <head><meta charset="utf-8"><title>Estadística Mensual {monthname}</title></head>
                <body style="font-family: Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh;">
                  <div style="text-align:center;">
                    <h3>Estadística Mensual {monthname}</h3>
                    <p>No hay datos disponibles</p>
                  </div>
                </body>
                </html>
                """
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(empty_html)

        #####################
        # ANNUAL SUMMARY
        #####################
        TotalCoches = sum(summary_data[k] for k in ["Audi", "Bentley", "Porsche", "Seat", "Volkswagen", "India", "Sudafrica"])
        
        # Build detailed summary with individual PDFs
        summary_rows = []
        
        # Add brand totals
        summary_rows.append(["Audi", summary_data["Audi"]])
        summary_rows.append(["Bentley", summary_data["Bentley"]])
        summary_rows.append(["Porsche", summary_data["Porsche"]])
        summary_rows.append(["Seat", summary_data["Seat"]])
        summary_rows.append(["Volkswagen", summary_data["Volkswagen"]])
        summary_rows.append(["India", summary_data["India"]])
        summary_rows.append(["Sudafrica", summary_data["Sudafrica"]])
        summary_rows.append(['SUMA VEHÍCULOS TODAS LAS MARCAS SIN ORIGEN =', TotalCoches])
        summary_rows.append(['', ''])  # Blank row
        
        # Add individual PRODUCTION quotas section
        summary_rows.append(['=== CUPOS DE PRODUCCIÓN (DETALLE POR CERTIFICADO) ===', ''])
        for i, quota in enumerate(produccion_quotas):
            # Calculate how much was consumed from this specific quota
            consumed = 0
            if i < current_produccion_idx:
                # This quota was fully used (we've moved past it)
                consumed = quota['cantidad']
            elif i == current_produccion_idx:
                # This is the current active quota
                consumed = quota['cantidad'] - remaining_produccion
            # else: quota was never activated, consumed = 0
            
            summary_rows.append([f"Certificado: {quota['cupo']}", ''])
            summary_rows.append(['  Cantidad Inicial', quota['cantidad']])
            summary_rows.append(['  Consumido', consumed])
            summary_rows.append(['  Saldo', quota['cantidad'] - consumed])
            
            # Show when it was exhausted if applicable
            for trans in quota_transitions_produccion:
                if trans['quota_exhausted']['cupo'] == quota['cupo']:
                    summary_rows.append(['  Agotado en', trans['month_name']])
                    break
            summary_rows.append(['', ''])  # Blank row between quotas
        
        # Total production
        total_prod_inicial = sum(q['cantidad'] for q in produccion_quotas)
        total_prod_consumido = sum(track['consumo_produccion'] for track in monthly_tracking)
        total_prod_saldo = total_prod_inicial - total_prod_consumido
        summary_rows.append(['TOTAL PRODUCCIÓN - Inicial', total_prod_inicial])
        summary_rows.append(['TOTAL PRODUCCIÓN - Consumido', total_prod_consumido])
        summary_rows.append(['TOTAL PRODUCCIÓN - Saldo', total_prod_saldo])
        summary_rows.append(['', ''])  # Blank row
        
        # Add individual INVESTMENT quotas section
        summary_rows.append(['=== CUPOS DE INVERSIÓN (DETALLE POR CERTIFICADO) ===', ''])
        for i, quota in enumerate(inversion_quotas):
            # Calculate how much was consumed from this specific quota
            consumed = 0
            if i < current_inversion_idx:
                # This quota was fully used (we've moved past it)
                consumed = quota['cantidad']
            elif i == current_inversion_idx:
                # This is the current active quota
                consumed = quota['cantidad'] - remaining_inversion
            # else: quota was never activated, consumed = 0
            
            summary_rows.append([f"Certificado: {quota['cupo']}", ''])
            summary_rows.append(['  Cantidad Inicial', quota['cantidad']])
            summary_rows.append(['  Consumido', consumed])
            summary_rows.append(['  Saldo', quota['cantidad'] - consumed])
            
            # Show when it was exhausted if applicable
            for trans in quota_transitions_inversion:
                if trans['quota_exhausted']['cupo'] == quota['cupo']:
                    summary_rows.append(['  Agotado en', trans['month_name']])
                    break
            summary_rows.append(['', ''])  # Blank row between quotas
        
        # Total investment
        total_inv_inicial = sum(q['cantidad'] for q in inversion_quotas)
        total_inv_consumido = sum(track['consumo_inversion'] for track in monthly_tracking)
        total_inv_saldo = total_inv_inicial - total_inv_consumido
        summary_rows.append(['TOTAL INVERSIÓN - Inicial', total_inv_inicial])
        summary_rows.append(['TOTAL INVERSIÓN - Consumido', total_inv_consumido])
        summary_rows.append(['TOTAL INVERSIÓN - Saldo', total_inv_saldo])
        summary_rows.append(['', ''])  # Blank row
        
        # Grand totals
        summary_rows.append(['=== TOTALES GENERALES ===', ''])
        summary_rows.append(['SUMA TOTAL CUPOS (Producción + Inversión)', total_prod_inicial + total_inv_inicial])
        summary_rows.append(['SUMA TOTAL CONSUMIDO', total_prod_consumido + total_inv_consumido])
        summary_rows.append(['SUMA TOTAL SALDO', total_prod_saldo + total_inv_saldo])
        
        df_summary = pd.DataFrame(summary_rows, columns=['Categoria', 'Total'])
        df_summary.to_excel(writer, sheet_name='Resumen', index=False)

        #####################
        # ANNUAL CHART
        #####################
        data2 = {
            "Audi": len(gralAudi),
            "Bentley": len(gralBentley),
            "Porsche": len(gralPorsche),
            "Seat": len(gralSeat),
            "Volkswagen": len(gralVolkswgen)
        }

        if sum(data2.values()) > 0:
            tree_df = (
                df_pedimentos.groupby(['MARCA', 'TIPO'])
                .size()
                .reset_index(name='count')
                .rename(columns={'MARCA': 'brand', 'TIPO': 'model'})
            )

            fig = px.treemap(
                tree_df,
                path=["brand", "model"],
                values="count",
                color="brand",
                title="Estadística Anual"
            )

            fig.update_layout(
                title_font=dict(size=18, color="#459aee"),
                plot_bgcolor="#f8f9fa",
                paper_bgcolor="#ffffff",
                width=700,
                height=480,
                margin=dict(l=20, r=20, t=60, b=20)
            )

            output_path = os.path.join(plotly_folder, "13.html")
            fig.write_html(output_path, full_html=True, include_plotlyjs="cdn")
            print("Plotly annual chart saved.")

        #####################
        # FINAL CALCULATIONS (for second summary table)
        #####################
        SumaTotalCupos = total_prod_inicial + total_inv_inicial
        MontoAplicado = total_prod_consumido + total_inv_consumido
        PorcentajeAplicado = (MontoAplicado * 100 / SumaTotalCupos) if SumaTotalCupos > 0 else 0

        sumarySec = [
            ['', 'RESUMEN CUPOS AÑO 2024', ''],
            ['PRODUCCION', 'INVERSION', 'SUMA TOTAL CUPOS'],
            [total_prod_inicial, total_inv_inicial, SumaTotalCupos],
            ['APLICADO', 'APLICADO', 'MONTO APLICADO'],
            [total_prod_consumido, total_inv_consumido, MontoAplicado],
            ['SALDO', 'SALDO', 'PORCENTAJE APLICADO'],
            [total_prod_saldo, total_inv_saldo, f"{PorcentajeAplicado:.2f}%"]
        ]
        df_sumarySec = pd.DataFrame(sumarySec)
        df_sumarySec.to_excel(writer, sheet_name='Resumen', index=False, 
                             startrow=0, startcol=len(df_summary.columns) + 2)

        #####################
        # QUOTA TRANSITIONS SHEET
        #####################
        if quota_transitions_produccion or quota_transitions_inversion:
            transitions_data = []
            
            # Add production transitions
            for trans in quota_transitions_produccion:
                transitions_data.append({
                    'Tipo': 'PRODUCCIÓN',
                    'Mes': trans['month_name'],
                    'Mes Número': trans['month'],
                    'Cupo Agotado': trans['quota_exhausted']['cupo'],
                    'Cantidad Agotada': trans['quota_exhausted']['cantidad'],
                    'Uso Acumulado': trans['cumulative_usage']
                })
            
            # Add investment transitions
            for trans in quota_transitions_inversion:
                transitions_data.append({
                    'Tipo': 'INVERSIÓN',
                    'Mes': trans['month_name'],
                    'Mes Número': trans['month'],
                    'Cupo Agotado': trans['quota_exhausted']['cupo'],
                    'Cantidad Agotada': trans['quota_exhausted']['cantidad'],
                    'Uso Acumulado': trans['cumulative_usage']
                })
            
            # Sort by month
            transitions_data.sort(key=lambda x: x['Mes Número'])
            
            df_transitions = pd.DataFrame(transitions_data)
            df_transitions.to_excel(writer, sheet_name='Transiciones_Cupo', index=False)
            print(f"✓ Hoja 'Transiciones_Cupo' creada con {len(transitions_data)} transiciones")
        
        #####################
        # MONTHLY TRACKING SHEET
        #####################
        tracking_data = []
        for track in monthly_tracking:
            tracking_data.append({
                'Mes': track['month_name'],
                'Cupo Producción Activo': track['cupo_produccion_activo'],
                'Disponible Prod. Inicio': track['disponible_produccion_inicio'],
                'Cupo Inversión Activo': track['cupo_inversion_activo'],
                'Disponible Inv. Inicio': track['disponible_inversion_inicio'],
                'Consumo Total': track['consumo_total'],
                'Consumo de Producción': track['consumo_produccion'],
                'Consumo de Inversión': track['consumo_inversion'],
                'Disponible Prod. Fin': track['disponible_produccion_fin'],
                'Disponible Inv. Fin': track['disponible_inversion_fin'],
                'Acumulado Total': track['acumulado']
            })
        
        df_tracking = pd.DataFrame(tracking_data)
        df_tracking.to_excel(writer, sheet_name='Seguimiento_Mensual', index=False)
        print(f"✓ Hoja 'Seguimiento_Mensual' creada con {len(monthly_tracking)} meses")

    #####################
    # RETURN DATA
    #####################
    dataTablasSalida = {
        "SALDO CUPO PRODUCCIÓN": int(match_pieza32),
        "SALDO CUPO INVERSIÓN": int(match_pieza3),
        "SALDO TOTAL CUPO UNILATERAL": SumaTotalCupos,
        "Audi": len(gralAudi),
        "Porsche": len(gralPorsche),
        "Seat": len(gralSeat),
        "Bentley": len(gralBentley),
        "Volkswagen (Vehiculos Comerciales)": len(gralVolkswgen),
        "India": len(df_pedimentos_India),
        "SUMA TODAS LAS MARCAS SIN ORIGEN": TotalCoches,
        "CUPOS_INVERSION": inversion_quotas,
        "CUPOS_PRODUCCION": produccion_quotas,
        "TRANSICIONES_PRODUCCION": quota_transitions_produccion,
        "TRANSICIONES_INVERSION": quota_transitions_inversion,
        "CUPOS_AGOTADOS": len(quota_transitions_produccion) + len(quota_transitions_inversion),
        "SEGUIMIENTO_MENSUAL": monthly_tracking
    }
    
    print(f"\n{'='*80}")
    print(f"Estadístico mensual guardado en '{output_file}'")
    print(f"Total cupos inversión: {len(inversion_quotas)} PDFs, {total_inversion} piezas")
    print(f"Total cupos producción: {len(produccion_quotas)} PDFs, {total_produccion} piezas")
    print(f"{'='*80}")
    
    # Print monthly tracking summary
    print(f"\n{'RESUMEN MENSUAL':^90}")
    print(f"{'='*90}")
    print(f"{'Mes':<12} {'Cupo Prod':<15} {'Disp':<8} {'Cupo Inv':<15} {'Disp':<8} {'Cons':<6} {'→P':<6} {'→I':<6} {'Acum':<8}")
    print(f"{'-'*90}")
    for track in monthly_tracking:
        prod_cupo = track['cupo_produccion_activo'][:13] if track['cupo_produccion_activo'] != 'AGOTADO' else 'AGOTADO'
        inv_cupo = track['cupo_inversion_activo'][:13] if track['cupo_inversion_activo'] != 'AGOTADO' else 'AGOTADO'
        
        print(f"{track['month_name']:<12} "
              f"{prod_cupo:<15} "
              f"{track['disponible_produccion_inicio']:<8} "
              f"{inv_cupo:<15} "
              f"{track['disponible_inversion_inicio']:<8} "
              f"{track['consumo_total']:<6} "
              f"{track['consumo_produccion']:<6} "
              f"{track['consumo_inversion']:<6} "
              f"{track['acumulado']:<8}")
    print(f"{'='*90}")
    
    if quota_transitions_produccion:
        print(f"\n⚠️  CUPOS DE PRODUCCIÓN AGOTADOS: {len(quota_transitions_produccion)}")
        for trans in quota_transitions_produccion:
            print(f"   • {trans['month_name']}: {trans['quota_exhausted']['cupo']} "
                  f"({trans['quota_exhausted']['cantidad']} piezas agotadas)")
    
    if quota_transitions_inversion:
        print(f"\n⚠️  CUPOS DE INVERSIÓN AGOTADOS: {len(quota_transitions_inversion)}")
        for trans in quota_transitions_inversion:
            print(f"   • {trans['month_name']}: {trans['quota_exhausted']['cupo']} "
                  f"({trans['quota_exhausted']['cantidad']} piezas agotadas)")
    
    if not quota_transitions_produccion and not quota_transitions_inversion:
        print(f"\n✓ No se agotaron cupos durante el año")
    
    print(f"\n{'='*80}\n")
    
    plt.close('all')

    return dataTablasSalida


def estadistico_v5(Concentrado2_path: str, PDF_sec_economia_paths: list, output_file: str, PDF_sec_economia_paths2: list):
    """
    Processes multiple PDF pairs for production and investment quotas.
    
    Args:
        Concentrado2_path: Path to Excel file with pedimentos data
        PDF_sec_economia_paths: List of paths to investment quota PDFs
        output_file: Path for output Excel file
        PDF_sec_economia_paths2: List of paths to production quota PDFs
    """
    #####################
    # SETUP
    #####################
    import tempfile
    output_folder = os.path.join(tempfile.gettempdir(), "static", "waffle_charts")
    os.makedirs(output_folder, exist_ok=True)
    plotly_folder = os.path.join(tempfile.gettempdir(), "static", "plotly_graphs")
    os.makedirs(plotly_folder, exist_ok=True)

    print('entramos a estadistico')
    
    #####################
    # READ PEDIMENTOS DATA
    #####################
    try:
        df_pedimentos = pd.read_excel(Concentrado2_path, engine='openpyxl', header=0, index_col=0)
    except Exception as e:
        raise Exception(f"Error al leer el archivo Excel: {e}")
    df_pedimentos['FECHA PEDIMENTO'] = df_pedimentos['FECHA PEDIMENTO'].astype(str)

    #####################
    # EXTRACT PDF DATA
    #####################
    def extract_pdf_data(pdf_path):
        """Extract authorization number and quota from a PDF"""
        try:
            with open(pdf_path, 'rb') as archivo_pdf:
                lector_pdf = PdfFileReader(archivo_pdf)
                num_paginas = lector_pdf.getNumPages()
                list_text = []
                for pagina_num in range(num_paginas):
                    pagina = lector_pdf.getPage(pagina_num)
                    text = pagina.extractText()
                    list_text.append(text)
                cadena = " ".join(list_text)
                
                # Extract authorization number
                patron_cupo = r'\bcertificado de cupo con número de autorización \w+/\w+'
                match_cupo = re.findall(patron_cupo, cadena)
                cupo_num = match_cupo[0].split(' ')[-1] if match_cupo else 'N/A'
                
                # Extract quota amount
                patron_pieza = r'\w+ Pieza.'
                match_pieza = re.findall(patron_pieza, cadena)
                pieza_num = match_pieza[0][8:].replace(' Pieza.', '') if match_pieza else 'N/A'
                
                return cupo_num, pieza_num
        except Exception as e:
            raise Exception(f"Error al leer el archivo PDF {pdf_path}: {e}")

    # Process all investment quota PDFs
    inversion_quotas = []
    for pdf_path in PDF_sec_economia_paths:
        cupo_num, pieza_num = extract_pdf_data(pdf_path)
        inversion_quotas.append({
            'cupo': cupo_num,
            'cantidad': int(pieza_num) if pieza_num != 'N/A' else 0,
            'path': pdf_path
        })
        print(f'Extraído PDF inversión: {cupo_num} - {pieza_num} piezas')

    # Process all production quota PDFs
    produccion_quotas = []
    for pdf_path in PDF_sec_economia_paths2:
        cupo_num, pieza_num = extract_pdf_data(pdf_path)
        produccion_quotas.append({
            'cupo': cupo_num,
            'cantidad': int(pieza_num) if pieza_num != 'N/A' else 0,
            'path': pdf_path
        })
        print(f'Extraído PDF producción: {cupo_num} - {pieza_num} piezas')

    # Calculate totals
    total_inversion = sum(q['cantidad'] for q in inversion_quotas)
    total_produccion = sum(q['cantidad'] for q in produccion_quotas)
    
    # Format quota strings for display
    match_cupo3 = ', '.join([q['cupo'] for q in inversion_quotas])
    match_pieza3 = str(total_inversion)
    match_cupo32 = ', '.join([q['cupo'] for q in produccion_quotas])
    match_pieza32 = str(total_produccion)

    #####################
    # MONTHLY PROCESSING
    #####################
    summary_data = {
        "Audi": 0,
        "Bentley": 0,
        "Porsche": 0,
        "Seat": 0,
        "Volkswagen": 0,
        "India": 0,
        "Sudafrica": 0,
    }

    # Track quota usage month by month
    cumulative_usage = 0
    quota_transitions_produccion = []  # Track when production quotas are exhausted
    quota_transitions_inversion = []   # Track when investment quotas are exhausted
    monthly_tracking = []  # Track usage details for each month
    current_produccion_idx = 0
    current_inversion_idx = 0
    remaining_produccion = produccion_quotas[0]['cantidad'] if produccion_quotas else 0
    remaining_inversion = inversion_quotas[0]['cantidad'] if inversion_quotas else 0
    cupo_inicial_produccion = remaining_produccion
    cupo_inicial_inversion = remaining_inversion

    with pd.ExcelWriter(output_file) as writer:
        previous_sheet_name = None

        for month in range(1, 13):
            month_str = f"{month:02d}"
            print(month_str)
            shifted_month_str = f"{(month) % 12 + 1:02d}"

            # Filter by month
            df_pedimentos_mes = df_pedimentos[df_pedimentos['FECHA PEDIMENTO'].str[4:6] == shifted_month_str]
            
            # Filter by country and brand
            df_pedimentos_India = df_pedimentos_mes[df_pedimentos_mes['PAIS'] == 'IND']
            df_pedimentos_Sudafrica = df_pedimentos_mes[df_pedimentos_mes['PAIS'] == 'ZAF']
            df_pedimentos_NO_India = df_pedimentos_mes[df_pedimentos_mes['PAIS'] != 'IND']
            df_pedimentos_NO_Sudafrica = df_pedimentos_NO_India[df_pedimentos_NO_India['PAIS'] != 'ZAF']
            df_pedimentos_N = df_pedimentos_NO_Sudafrica[df_pedimentos_NO_Sudafrica['J y N'] == 'N']

            df_pedimento_Audi = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'AUDI']
            df_pedimento_Bentley = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'BENTLEY']
            df_pedimento_Porsche = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'PORSCHE']
            df_pedimento_Seat = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'SEAT']
            df_pedimento_Volkswagen = df_pedimentos_N[df_pedimentos_N['MARCA'] == 'VOLKSWAGEN']

            # Annual totals by brand
            gralAudi = df_pedimentos[df_pedimentos['MARCA'] =='AUDI']
            gralBentley = df_pedimentos[df_pedimentos['MARCA'] =='BENTLEY']
            gralPorsche= df_pedimentos[df_pedimentos['MARCA'] =='PORSCHE']
            gralSeat=df_pedimentos[df_pedimentos['MARCA'] =='SEAT']
            gralVolkswgen=df_pedimentos[df_pedimentos['MARCA'] =='VOLKSWAGEN']

            # Monthly totals by brand
            gralAudiMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='AUDI']
            gralBentleyMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='BENTLEY']
            gralPorscheMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='PORSCHE']
            gralSeatMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='SEAT']
            gralVolkswgenMes = df_pedimentos_mes[df_pedimentos_mes['MARCA'] =='VOLKSWAGEN']

            # Update summary
            summary_data["Audi"] += len(df_pedimento_Audi)
            summary_data["Bentley"] += len(df_pedimento_Bentley)
            summary_data["Porsche"] += len(df_pedimento_Porsche)
            summary_data["Seat"] += len(df_pedimento_Seat)
            summary_data["Volkswagen"] += len(df_pedimento_Volkswagen)
            summary_data["India"] += len(df_pedimentos_India)
            summary_data["Sudafrica"] += len(df_pedimentos_Sudafrica)

            # Calculate monthly usage
            monthly_usage = (len(df_pedimentos_India) + len(df_pedimentos_Sudafrica) + 
                           len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                           len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                           len(df_pedimento_Volkswagen))
            
            # Track state before processing this month
            month_start_produccion = remaining_produccion
            month_start_inversion = remaining_inversion
            month_start_cupo_prod = produccion_quotas[current_produccion_idx]['cupo'] if current_produccion_idx < len(produccion_quotas) else 'AGOTADO'
            month_start_cupo_inv = inversion_quotas[current_inversion_idx]['cupo'] if current_inversion_idx < len(inversion_quotas) else 'AGOTADO'
            
            cumulative_usage += monthly_usage
            used_produccion_this_month = 0
            used_inversion_this_month = 0
            
            # Process monthly consumption using ALTERNATING production and investment quotas
            if monthly_usage > 0:
                remaining_to_consume = monthly_usage
                
                # Alternate between production and investment quotas
                # Process: Prod[0] -> Inv[0] -> Prod[1] -> Inv[1] -> Prod[2] -> Inv[2]...
                max_quotas = max(len(produccion_quotas), len(inversion_quotas))
                
                for quota_index in range(max_quotas):
                    if remaining_to_consume <= 0:
                        break
                        
                    # STEP 1: Try production quota at this index
                    if quota_index < len(produccion_quotas):
                        if quota_index == current_produccion_idx:  # This is the active production quota
                            if remaining_produccion > 0:
                                consumed = min(remaining_to_consume, remaining_produccion)
                                used_produccion_this_month += consumed
                                remaining_produccion -= consumed
                                remaining_to_consume -= consumed
                                
                                # Check if this quota is now exhausted
                                if remaining_produccion == 0:
                                    monthname = number_to_month(month)
                                    quota_transitions_produccion.append({
                                        'month': month,
                                        'month_name': monthname,
                                        'quota_exhausted': produccion_quotas[current_produccion_idx],
                                        'cumulative_usage': cumulative_usage,
                                        'remaining_after': remaining_to_consume
                                    })
                                    print(f"⚠️ CUPO PRODUCCIÓN AGOTADO en {monthname} - {produccion_quotas[current_produccion_idx]['cupo']} ({produccion_quotas[current_produccion_idx]['cantidad']} piezas)")
                                    
                                    # Move to next production quota
                                    current_produccion_idx += 1
                                    if current_produccion_idx < len(produccion_quotas):
                                        remaining_produccion = produccion_quotas[current_produccion_idx]['cantidad']
                                        print(f"✓ Activando siguiente cupo producción: {produccion_quotas[current_produccion_idx]['cupo']} ({remaining_produccion} piezas)")
                    
                    if remaining_to_consume <= 0:
                        break
                        
                    # STEP 2: Try investment quota at this index
                    if quota_index < len(inversion_quotas):
                        if quota_index == current_inversion_idx:  # This is the active investment quota
                            if remaining_inversion > 0:
                                consumed = min(remaining_to_consume, remaining_inversion)
                                used_inversion_this_month += consumed
                                remaining_inversion -= consumed
                                remaining_to_consume -= consumed
                                
                                # Check if this quota is now exhausted
                                if remaining_inversion == 0:
                                    monthname = number_to_month(month)
                                    quota_transitions_inversion.append({
                                        'month': month,
                                        'month_name': monthname,
                                        'quota_exhausted': inversion_quotas[current_inversion_idx],
                                        'cumulative_usage': cumulative_usage,
                                        'remaining_after': remaining_to_consume
                                    })
                                    print(f"⚠️ CUPO INVERSIÓN AGOTADO en {monthname} - {inversion_quotas[current_inversion_idx]['cupo']} ({inversion_quotas[current_inversion_idx]['cantidad']} piezas)")
                                    
                                    # Move to next investment quota
                                    current_inversion_idx += 1
                                    if current_inversion_idx < len(inversion_quotas):
                                        remaining_inversion = inversion_quotas[current_inversion_idx]['cantidad']
                                        print(f"✓ Activando siguiente cupo inversión: {inversion_quotas[current_inversion_idx]['cupo']} ({remaining_inversion} piezas)")
                
                # Check if we couldn't fulfill the entire month's demand
                if remaining_to_consume > 0:
                    monthname = number_to_month(month)
                    print(f"🚨 ALERTA CRÍTICA en {monthname}: Faltan {remaining_to_consume} vehículos - TODOS LOS CUPOS AGOTADOS")
            
            # Record monthly tracking
            monthname = number_to_month(month)
            
            # Determine which quota is currently active
            active_prod_cupo = produccion_quotas[current_produccion_idx]['cupo'] if current_produccion_idx < len(produccion_quotas) else 'AGOTADO'
            active_inv_cupo = inversion_quotas[current_inversion_idx]['cupo'] if current_inversion_idx < len(inversion_quotas) else 'AGOTADO'
            
            monthly_tracking.append({
                'month': month,
                'month_name': monthname,
                'disponible_produccion_inicio': month_start_produccion,
                'disponible_inversion_inicio': month_start_inversion,
                'cupo_produccion_activo': active_prod_cupo,
                'cupo_inversion_activo': active_inv_cupo,
                'consumo_total': monthly_usage,
                'consumo_produccion': used_produccion_this_month,
                'consumo_inversion': used_inversion_this_month,
                'disponible_produccion_fin': remaining_produccion,
                'disponible_inversion_fin': remaining_inversion,
                'acumulado': cumulative_usage
            })

            # Calculations
            print(f'[DEBUG] {month_str} - calculating sums...')
            suma_descargo = (len(df_pedimentos_India) + len(df_pedimentos_Sudafrica) + 
                             len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                             len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                             len(df_pedimento_Volkswagen))

            Subtotal_desglose_Europa = (len(df_pedimento_Bentley) + len(df_pedimento_Audi) + 
                                        len(df_pedimento_Porsche) + len(df_pedimento_Seat) + 
                                        len(df_pedimento_Volkswagen))
            
            # Format monthly DataFrame
            # Use the CURRENT active INVESTMENT quota info for display (not production)
            current_cupo_number = inversion_quotas[current_inversion_idx]['cupo'] if current_inversion_idx < len(inversion_quotas) else 'AGOTADO'
            current_cupo_amount = str(remaining_inversion) if current_inversion_idx < len(inversion_quotas) else '0'
            
            # Calculate remaining for this month (from investment quota)
            Diferencia_cupo_desgloses = remaining_inversion
            
            # For row 20 (TOTAL CUPO), show current active quota amount
            # For row 21 (authorization number), show current active authorization
            list_col_A = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 
                          'TOTAL CUPO ' + current_cupo_amount, current_cupo_number]
            list_col_B = ['', f'Periodo {month_str} 2024', '', f'Descargo {month_str} 2024', '', 'DESGLOSE EUROPA:', 
                          'Audi', 'Bentley', 'Porsche', 'Seat', 'Volkswagen (Vehiculos Comerciales)', 'Subtotal',
                          'Desglose INDIA:', 'India', 'Subtotal', 'Desglose SUDAFRICA', 'Sudafrica', 'Subtotal',
                          'TOTAL', '', 'CUPO', 'SALDO']
            list_col_C = ['', '',  '', suma_descargo, '', '', len(df_pedimento_Audi), len(df_pedimento_Bentley), 
                          len(df_pedimento_Porsche), len(df_pedimento_Seat), len(df_pedimento_Volkswagen),
                          Subtotal_desglose_Europa, '', len(df_pedimentos_India), len(df_pedimentos_India), 
                          '', len(df_pedimentos_Sudafrica), len(df_pedimentos_Sudafrica), int(suma_descargo), '', 
                          int(current_cupo_amount), int(Diferencia_cupo_desgloses)]
            list_col_D = ['', '', '', 'vehiculos', '', '', '', '', '', '', '', 'vehiculos', '', '', '', '', '', '',
                          'vehiculos', '', 'vehiculos', '']

            df_col_completo_pestana = pd.DataFrame([list_col_A, list_col_B, list_col_C, list_col_D]).T

            # Set formulas correctly
            if month == 1:
                # First month: SALDO = CUPO - TOTAL (using investment quota)
                df_col_completo_pestana.iloc[21, 2] = int(current_cupo_amount) - int(suma_descargo)
            else:
                # Subsequent months: CUPO = remaining from tracking, SALDO = CUPO - TOTAL
                df_col_completo_pestana.iloc[20, 2] = month_start_inversion
                df_col_completo_pestana.iloc[21, 2] = remaining_inversion

            sheet_name = f'Mes_{month_str}'
            df_col_completo_pestana.to_excel(writer, sheet_name=sheet_name, index=False)
            previous_sheet_name = sheet_name
            print(f'[DEBUG] {month_str} - excel sheet written')

            #####################
            # MONTHLY CHARTS
            #####################
            data = {month_str: (len(gralBentleyMes), len(gralAudiMes), len(gralPorscheMes), 
                               len(gralSeatMes), len(gralVolkswgenMes))}
            df = pd.DataFrame(data, index=['Bentley', 'Audi', 'Porsche', 'Seat', 'Volkswagen'])
            values = df[month_str]
            print(f'[DEBUG] {month_str} - starting chart, values sum: {values.sum()}')
            monthname = number_to_month(month)

            if values.sum() > 0:
                brands2 = df.index.tolist()
                counts2 = values.tolist()
                plot_df = pd.DataFrame({"brand": brands2, "count": counts2})
                print(f'[DEBUG] {month_str} - creating px.bar...')

                fig = px.bar(
                    plot_df.sort_values("count"),
                    x="count",
                    y="brand",
                    orientation="h",
                    title=f"Estadística Mensual {monthname}",
                    text="count",
                    color="brand",
                    color_discrete_sequence=px.colors.qualitative.Set2
                )

                print(f'[DEBUG] {month_str} - px.bar done, updating layout...')
                fig.update_traces(textposition="outside", marker_line_width=0)
                fig.update_layout(
                    title_font=dict(size=18, color="#2c3e50"),
                    plot_bgcolor="#f8f9fa",
                    paper_bgcolor="#ffffff",
                    yaxis=dict(showgrid=False, title="Marca"),
                    width=700,
                    height=480,
                    showlegend=False,
                    margin=dict(l=80, r=40, t=80, b=40)
                )

                output_path = os.path.join(plotly_folder, f"{month_str}.html")
                print(f'[DEBUG] {month_str} - layout done, writing html...')
                fig.write_html(output_path, full_html=True, include_plotlyjs="cdn")
                print(f"Saved plotly monthly chart: {output_path}")
            else:
                output_path = os.path.join(plotly_folder, f"{month_str}.html")
                empty_html = f"""
                <html>
                <head><meta charset="utf-8"><title>Estadística Mensual {monthname}</title></head>
                <body style="font-family: Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh;">
                  <div style="text-align:center;">
                    <h3>Estadística Mensual {monthname}</h3>
                    <p>No hay datos disponibles</p>
                  </div>
                </body>
                </html>
                """
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(empty_html)

                print(f'[DEBUG] {month_str} - empty chart written')
        #####################
        # ANNUAL SUMMARY
        #####################
        TotalCoches = sum(summary_data[k] for k in ["Audi", "Bentley", "Porsche", "Seat", "Volkswagen", "India", "Sudafrica"])
        
        # Build detailed summary with individual PDFs
        summary_rows = []
        
        # Add brand totals
        summary_rows.append(["Audi", summary_data["Audi"]])
        summary_rows.append(["Bentley", summary_data["Bentley"]])
        summary_rows.append(["Porsche", summary_data["Porsche"]])
        summary_rows.append(["Seat", summary_data["Seat"]])
        summary_rows.append(["Volkswagen", summary_data["Volkswagen"]])
        summary_rows.append(["India", summary_data["India"]])
        summary_rows.append(["Sudafrica", summary_data["Sudafrica"]])
        summary_rows.append(['SUMA VEHÍCULOS TODAS LAS MARCAS SIN ORIGEN =', TotalCoches])
        summary_rows.append(['', ''])  # Blank row
        
        # Add individual PRODUCTION quotas section
        summary_rows.append(['=== CUPOS DE PRODUCCIÓN (DETALLE POR CERTIFICADO) ===', ''])
        for i, quota in enumerate(produccion_quotas):
            # Calculate how much was consumed from this specific quota
            consumed = 0
            if i < current_produccion_idx:
                # This quota was fully used (we've moved past it)
                consumed = quota['cantidad']
            elif i == current_produccion_idx:
                # This is the current active quota
                consumed = quota['cantidad'] - remaining_produccion
            # else: quota was never activated, consumed = 0
            
            summary_rows.append([f"Certificado: {quota['cupo']}", ''])
            summary_rows.append(['  Cantidad Inicial', quota['cantidad']])
            summary_rows.append(['  Consumido', consumed])
            summary_rows.append(['  Saldo', quota['cantidad'] - consumed])
            
            # Show when it was exhausted if applicable
            for trans in quota_transitions_produccion:
                if trans['quota_exhausted']['cupo'] == quota['cupo']:
                    summary_rows.append(['  Agotado en', trans['month_name']])
                    break
            summary_rows.append(['', ''])  # Blank row between quotas
        
        # Total production
        total_prod_inicial = sum(q['cantidad'] for q in produccion_quotas)
        total_prod_consumido = sum(track['consumo_produccion'] for track in monthly_tracking)
        total_prod_saldo = total_prod_inicial - total_prod_consumido
        summary_rows.append(['TOTAL PRODUCCIÓN - Inicial', total_prod_inicial])
        summary_rows.append(['TOTAL PRODUCCIÓN - Consumido', total_prod_consumido])
        summary_rows.append(['TOTAL PRODUCCIÓN - Saldo', total_prod_saldo])
        summary_rows.append(['', ''])  # Blank row
        
        # Add individual INVESTMENT quotas section
        summary_rows.append(['=== CUPOS DE INVERSIÓN (DETALLE POR CERTIFICADO) ===', ''])
        for i, quota in enumerate(inversion_quotas):
            # Calculate how much was consumed from this specific quota
            consumed = 0
            if i < current_inversion_idx:
                # This quota was fully used (we've moved past it)
                consumed = quota['cantidad']
            elif i == current_inversion_idx:
                # This is the current active quota
                consumed = quota['cantidad'] - remaining_inversion
            # else: quota was never activated, consumed = 0
            
            summary_rows.append([f"Certificado: {quota['cupo']}", ''])
            summary_rows.append(['  Cantidad Inicial', quota['cantidad']])
            summary_rows.append(['  Consumido', consumed])
            summary_rows.append(['  Saldo', quota['cantidad'] - consumed])
            
            # Show when it was exhausted if applicable
            for trans in quota_transitions_inversion:
                if trans['quota_exhausted']['cupo'] == quota['cupo']:
                    summary_rows.append(['  Agotado en', trans['month_name']])
                    break
            summary_rows.append(['', ''])  # Blank row between quotas
        
        # Total investment
        total_inv_inicial = sum(q['cantidad'] for q in inversion_quotas)
        total_inv_consumido = sum(track['consumo_inversion'] for track in monthly_tracking)
        total_inv_saldo = total_inv_inicial - total_inv_consumido
        summary_rows.append(['TOTAL INVERSIÓN - Inicial', total_inv_inicial])
        summary_rows.append(['TOTAL INVERSIÓN - Consumido', total_inv_consumido])
        summary_rows.append(['TOTAL INVERSIÓN - Saldo', total_inv_saldo])
        summary_rows.append(['', ''])  # Blank row
        
        # Grand totals
        summary_rows.append(['=== TOTALES GENERALES ===', ''])
        summary_rows.append(['SUMA TOTAL CUPOS (Producción + Inversión)', total_prod_inicial + total_inv_inicial])
        summary_rows.append(['SUMA TOTAL CONSUMIDO', total_prod_consumido + total_inv_consumido])
        summary_rows.append(['SUMA TOTAL SALDO', total_prod_saldo + total_inv_saldo])
        
        df_summary = pd.DataFrame(summary_rows, columns=['Categoria', 'Total'])
        df_summary.to_excel(writer, sheet_name='Resumen', index=False)

        #####################
        # ANNUAL CHART
        #####################
        data2 = {
            "Audi": len(gralAudi),
            "Bentley": len(gralBentley),
            "Porsche": len(gralPorsche),
            "Seat": len(gralSeat),
            "Volkswagen": len(gralVolkswgen)
        }

        if sum(data2.values()) > 0:
            tree_df = (
                df_pedimentos.groupby(['MARCA', 'TIPO'])
                .size()
                .reset_index(name='count')
                .rename(columns={'MARCA': 'brand', 'TIPO': 'model'})
            )

            fig = px.treemap(
                tree_df,
                path=["brand", "model"],
                values="count",
                color="brand",
                title="Estadística Anual"
            )

            fig.update_layout(
                title_font=dict(size=18, color="#459aee"),
                plot_bgcolor="#f8f9fa",
                paper_bgcolor="#ffffff",
                width=700,
                height=480,
                margin=dict(l=20, r=20, t=60, b=20)
            )

            output_path = os.path.join(plotly_folder, "13.html")
            fig.write_html(output_path, full_html=True, include_plotlyjs="cdn")
            print("Plotly annual chart saved.")

        #####################
        # FINAL CALCULATIONS (for second summary table)
        #####################
        SumaTotalCupos = total_prod_inicial + total_inv_inicial
        MontoAplicado = total_prod_consumido + total_inv_consumido
        PorcentajeAplicado = (MontoAplicado * 100 / SumaTotalCupos) if SumaTotalCupos > 0 else 0

        sumarySec = [
            ['', 'RESUMEN CUPOS AÑO 2024', ''],
            ['PRODUCCION', 'INVERSION', 'SUMA TOTAL CUPOS'],
            [total_prod_inicial, total_inv_inicial, SumaTotalCupos],
            ['APLICADO', 'APLICADO', 'MONTO APLICADO'],
            [total_prod_consumido, total_inv_consumido, MontoAplicado],
            ['SALDO', 'SALDO', 'PORCENTAJE APLICADO'],
            [total_prod_saldo, total_inv_saldo, f"{PorcentajeAplicado:.2f}%"]
        ]
        df_sumarySec = pd.DataFrame(sumarySec)
        df_sumarySec.to_excel(writer, sheet_name='Resumen', index=False, 
                             startrow=0, startcol=len(df_summary.columns) + 2)

        #####################
        # QUOTA TRANSITIONS SHEET
        #####################
        if quota_transitions_produccion or quota_transitions_inversion:
            transitions_data = []
            
            # Add production transitions
            for trans in quota_transitions_produccion:
                transitions_data.append({
                    'Tipo': 'PRODUCCIÓN',
                    'Mes': trans['month_name'],
                    'Mes Número': trans['month'],
                    'Cupo Agotado': trans['quota_exhausted']['cupo'],
                    'Cantidad Agotada': trans['quota_exhausted']['cantidad'],
                    'Uso Acumulado': trans['cumulative_usage']
                })
            
            # Add investment transitions
            for trans in quota_transitions_inversion:
                transitions_data.append({
                    'Tipo': 'INVERSIÓN',
                    'Mes': trans['month_name'],
                    'Mes Número': trans['month'],
                    'Cupo Agotado': trans['quota_exhausted']['cupo'],
                    'Cantidad Agotada': trans['quota_exhausted']['cantidad'],
                    'Uso Acumulado': trans['cumulative_usage']
                })
            
            # Sort by month
            transitions_data.sort(key=lambda x: x['Mes Número'])
            
            df_transitions = pd.DataFrame(transitions_data)
            df_transitions.to_excel(writer, sheet_name='Transiciones_Cupo', index=False)
            print(f"✓ Hoja 'Transiciones_Cupo' creada con {len(transitions_data)} transiciones")
        
        #####################
        # MONTHLY TRACKING SHEET
        #####################
        tracking_data = []
        for track in monthly_tracking:
            tracking_data.append({
                'Mes': track['month_name'],
                'Cupo Producción Activo': track['cupo_produccion_activo'],
                'Disponible Prod. Inicio': track['disponible_produccion_inicio'],
                'Cupo Inversión Activo': track['cupo_inversion_activo'],
                'Disponible Inv. Inicio': track['disponible_inversion_inicio'],
                'Consumo Total': track['consumo_total'],
                'Consumo de Producción': track['consumo_produccion'],
                'Consumo de Inversión': track['consumo_inversion'],
                'Disponible Prod. Fin': track['disponible_produccion_fin'],
                'Disponible Inv. Fin': track['disponible_inversion_fin'],
                'Acumulado Total': track['acumulado']
            })
        
        df_tracking = pd.DataFrame(tracking_data)
        df_tracking.to_excel(writer, sheet_name='Seguimiento_Mensual', index=False)
        print(f"✓ Hoja 'Seguimiento_Mensual' creada con {len(monthly_tracking)} meses")

    #####################
    # RETURN DATA
    #####################
    dataTablasSalida = {
        "SALDO CUPO PRODUCCIÓN": int(match_pieza32),
        "SALDO CUPO INVERSIÓN": int(match_pieza3),
        "SALDO TOTAL CUPO UNILATERAL": SumaTotalCupos,
        "Audi": len(gralAudi),
        "Porsche": len(gralPorsche),
        "Seat": len(gralSeat),
        "Bentley": len(gralBentley),
        "Volkswagen (Vehiculos Comerciales)": len(gralVolkswgen),
        "India": len(df_pedimentos_India),
        "SUMA TODAS LAS MARCAS SIN ORIGEN": TotalCoches,
        "CUPOS_INVERSION": inversion_quotas,
        "CUPOS_PRODUCCION": produccion_quotas,
        "TRANSICIONES_PRODUCCION": quota_transitions_produccion,
        "TRANSICIONES_INVERSION": quota_transitions_inversion,
        "CUPOS_AGOTADOS": len(quota_transitions_produccion) + len(quota_transitions_inversion),
        "SEGUIMIENTO_MENSUAL": monthly_tracking
    }
    
    print(f"\n{'='*80}")
    print(f"Estadístico mensual guardado en '{output_file}'")
    print(f"Total cupos inversión: {len(inversion_quotas)} PDFs, {total_inversion} piezas")
    print(f"Total cupos producción: {len(produccion_quotas)} PDFs, {total_produccion} piezas")
    print(f"{'='*80}")
    
    # Print monthly tracking summary
    print(f"\n{'RESUMEN MENSUAL':^90}")
    print(f"{'='*90}")
    print(f"{'Mes':<12} {'Cupo Prod':<15} {'Disp':<8} {'Cupo Inv':<15} {'Disp':<8} {'Cons':<6} {'→P':<6} {'→I':<6} {'Acum':<8}")
    print(f"{'-'*90}")
    for track in monthly_tracking:
        prod_cupo = track['cupo_produccion_activo'][:13] if track['cupo_produccion_activo'] != 'AGOTADO' else 'AGOTADO'
        inv_cupo = track['cupo_inversion_activo'][:13] if track['cupo_inversion_activo'] != 'AGOTADO' else 'AGOTADO'
        
        print(f"{track['month_name']:<12} "
              f"{prod_cupo:<15} "
              f"{track['disponible_produccion_inicio']:<8} "
              f"{inv_cupo:<15} "
              f"{track['disponible_inversion_inicio']:<8} "
              f"{track['consumo_total']:<6} "
              f"{track['consumo_produccion']:<6} "
              f"{track['consumo_inversion']:<6} "
              f"{track['acumulado']:<8}")
    print(f"{'='*90}")
    
    if quota_transitions_produccion:
        print(f"\n⚠️  CUPOS DE PRODUCCIÓN AGOTADOS: {len(quota_transitions_produccion)}")
        for trans in quota_transitions_produccion:
            print(f"   • {trans['month_name']}: {trans['quota_exhausted']['cupo']} "
                  f"({trans['quota_exhausted']['cantidad']} piezas agotadas)")
    
    if quota_transitions_inversion:
        print(f"\n⚠️  CUPOS DE INVERSIÓN AGOTADOS: {len(quota_transitions_inversion)}")
        for trans in quota_transitions_inversion:
            print(f"   • {trans['month_name']}: {trans['quota_exhausted']['cupo']} "
                  f"({trans['quota_exhausted']['cantidad']} piezas agotadas)")
    
    if not quota_transitions_produccion and not quota_transitions_inversion:
        print(f"\n✓ No se agotaron cupos durante el año")
    
    print(f"\n{'='*80}\n")
    
    plt.close('all')

    return dataTablasSalida