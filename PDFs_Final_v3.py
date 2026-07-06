#!/usr/bin/env python
# coding: utf-8

# In[1]:


from PDFs_v2 import PDFs_v1, PDFs_v2, PDFs_v3, PDFs_v4
from archivos import archivos
import pandas as pd
import os
import re

import os
import pandas as pd

import os
import pandas as pd


def classify_pdf(path):
    """Clasifica un PDF que falló todos los parsers.
    Retorna (categoria, detalle_señales)
    """
    try:
        import PyPDF2
        with open(path, 'rb') as f:
            if hasattr(PyPDF2, 'PdfReader'):
                reader = PyPDF2.PdfReader(f)
                text = " ".join((page.extract_text() or "") for page in reader.pages)
            else:
                reader = PyPDF2.PdfFileReader(f)
                text = " ".join(
                    (reader.getPage(i).extractText() or "")
                    for i in range(reader.numPages)
                )
    except Exception as e:
        return 'corrupto', f'No se pudo abrir: {e}'

    if not text.strip():
        return 'imagen_o_corrupto', 'PDF de imagen: sin texto extraíble'

    has_vin      = bool(re.search(r'\b[A-HJ-NPR-Z0-9]{17}\b', text))
    has_invoice  = bool(re.search(r'Invoice|Factura|InvoiceNumber', text, re.I))
    has_currency = bool(re.search(r'\b(USD|EUR|MXN|GBP)\b', text))
    has_origin   = bool(re.search(r'preferential origin|origen preferencial|UNION EUROPEA', text, re.I))

    signals = (
        ([' VIN encontrado'] if has_vin else []) +
        (['número de factura'] if has_invoice else []) +
        (['moneda detectada'] if has_currency else []) +
        (['declaración de origen'] if has_origin else [])
    )
    score = len(signals)

    if score >= 3:
        return 'factura_formato_desconocido', ' | '.join(signals)
    elif score >= 1:
        return 'datos_incompletos', f'Señales parciales: {" | ".join(signals)}'
    else:
        return 'documento_no_relacionado', f'Sin señales de factura. Inicio texto: {text[:150]}'


def PDFs_to_excel(base_path, previous_excel_path=None, output_excel_name="PDFs_result.xlsx"):
    if not os.path.exists(base_path):
        raise FileNotFoundError(f"The path {base_path} does not exist.")

    def _normalize_df(df):
        if df is None or df.empty:
            return df
        if 'Pais' in df.columns:
            country_map = {
                'CZECH': 'CZE',
                'GERMAN': 'DEU',
                'Deutschland': 'DEU',
                'Slowakei': 'SVK',
                'SPANISH': 'ESP',
                'UK': 'GBR',
                'HUNGARY': 'HUN'
            }
            df['Pais'] = df['Pais'].apply(
                lambda x: country_map.get(x, x) if pd.notna(x) else x
            )
        if 'Moneda' in df.columns:
            df['Moneda'] = df['Moneda'].astype(str).str.replace(
                'CURRENCY: ', '', regex=False
            )
        return df

    listaErrores = []
    errores_detalle = {}
    dfs_successful = []
    seen_filenames = set()

    # Step 1: Collect all unique PDF paths
    path_cleards_documents = []
    for root, _, files in os.walk(base_path):
        for file in files:
            if file.lower().endswith('.pdf') and not file.startswith('.') and file not in seen_filenames:
                seen_filenames.add(file)
                full_path = os.path.join(root, file)
                path_cleards_documents.append(full_path)

    # Step 2: Process each PDF
    total_files = len(path_cleards_documents)
    for index, path in enumerate(path_cleards_documents, start=1):
        print(f"📄 Processing file {index} of {total_files}: {path}")
        success = False
        parser_errors = []

        for parser in [PDFs_v2, PDFs_v3, PDFs_v4, PDFs_v1]:
            try:
                df_result = parser(path)
                if df_result is None or not isinstance(df_result, pd.DataFrame):
                    continue

                dfs_successful.append(df_result)
                success = True
                print(f"🟢 Successfully processed {path} with {parser.__name__}")
                break
            except Exception as e:
                parser_errors.append(f"{parser.__name__}: {type(e).__name__}: {str(e)[:120]}")
                print(f"⚠️ {parser.__name__} failed on {path}: {e}")
                continue

        if not success:
            listaErrores.append(path)
            print(f"❌ All PDF parsers failed for: {path}")
            categoria, senales = classify_pdf(path)
            errores_detalle[os.path.basename(path)] = {
                'categoria': categoria,
                'mensaje': f"{senales} | Parsers: {' | '.join(parser_errors)}"
            }

    # Step 3: Concatenate all new results
    if dfs_successful:
        try:
            df_new = pd.concat(dfs_successful, ignore_index=True)
        except Exception as e:
            print(f"❌ Error concatenating new DataFrames: {e}")
            return pd.DataFrame(), pd.DataFrame(), listaErrores, errores_detalle
    else:
        print("❌ No PDFs were successfully parsed.")
        return pd.DataFrame(), pd.DataFrame(), listaErrores, errores_detalle

    # Normalize the new-only DataFrame so callers receive it clean
    df_new_only = _normalize_df(df_new.copy())

    # Step 4: Append with previous results if provided
    if previous_excel_path and os.path.exists(previous_excel_path):
        try:
            _engine = 'xlrd' if str(previous_excel_path).lower().endswith('.xls') else 'openpyxl'
            df_previous = pd.read_excel(previous_excel_path, engine=_engine)
            df_PDFs_documents = pd.concat([df_previous, df_new], ignore_index=True)
            print(f"📎 Appended previous results from: {previous_excel_path}")
        except Exception as e:
            print(f"⚠️ Could not append previous Excel: {e}")
            df_PDFs_documents = df_new
    else:
        df_PDFs_documents = df_new

    # Step 5+6: Normalize combined DataFrame ('Pais' and 'Moneda')
    df_PDFs_documents = _normalize_df(df_PDFs_documents)

    # Step 7: Export errors (if any)
    if listaErrores:
        errores_filenames = [os.path.basename(path) for path in listaErrores]
        errores_txt_path = os.path.join(base_path, 'PDFs_con_errores.txt')
        with open(errores_txt_path, 'w', encoding='utf-8') as f:
            for name in errores_filenames:
                f.write(name + '\n')
        print(f"📝 Exported error list to: {errores_txt_path}")

    # Step 8: Export final DataFrame
    output_path = os.path.join(base_path, output_excel_name)
    df_PDFs_documents.to_excel(output_path, index=False)
    print(f"📤 Exported updated results to: {output_path}")

    print(f"🟢 Total PDFs processed this run: {len(dfs_successful)}")
    print(f"❌ PDFs with errors this run: {len(listaErrores)}")
    return df_new_only, df_PDFs_documents, listaErrores, errores_detalle



def PDFs_to_excel28ago(base_path):
    if not os.path.exists(base_path):
        raise FileNotFoundError(f"The path {base_path} does not exist.")

    listaErrores = []
    dfs_successful = []
    seen_filenames = set()

    # Step 1: Collect all unique PDF paths
    path_cleards_documents = []
    for root, _, files in os.walk(base_path):
        for file in files:
            if file.lower().endswith('.pdf') and not file.startswith('.') and file not in seen_filenames:
                seen_filenames.add(file)
                full_path = os.path.join(root, file)
                path_cleards_documents.append(full_path)

    # Step 2: Process each PDF with fallback parsers
    total_files = len(path_cleards_documents)
    for index, path in enumerate(path_cleards_documents, start=1):
        print(f"📄 Processing file {index} of {total_files}: {path}")
        success = False

        for parser in [PDFs_v2, PDFs_v3, PDFs_v4, PDFs_v1]:
            try:
                df_result = parser(path)

                # Skip if result is None or not a DataFrame
                if df_result is None or not isinstance(df_result, pd.DataFrame):
                    continue

                dfs_successful.append(df_result)
                success = True
                print(f"🟢 Successfully processed {path} with {parser.__name__}")
                break
            except Exception as e:
                print(f"⚠️ {parser.__name__} failed on {path}: {e}")
                continue

        if not success:
            listaErrores.append(path)
            print(f"❌ All PDF parsers failed for: {path}")

    # Step 3: Concatenate all successful DataFrames
    if dfs_successful:
        try:
            df_PDFs_documents = pd.concat(dfs_successful, ignore_index=True)
        except Exception as e:
            print(f"❌ Error concatenating DataFrames: {e}")
            return pd.DataFrame()  # Return empty DataFrame
    else:
        print("❌ No PDFs were successfully parsed.")
        return pd.DataFrame()

    # Step 4: Normalize 'Pais' column if it exists
    if 'Pais' in df_PDFs_documents.columns:
        country_map = {
            'CZECH': 'CZE',
            'GERMAN': 'DEU',
            'Deutschland': 'DEU',
            'Slowakei': 'SVK',
            'SPANISH': 'ESP',
            'UK': 'GBR',
            'HUNGARY': 'HUN'
        }
        try:
            df_PDFs_documents['Pais'] = df_PDFs_documents['Pais'].apply(lambda x: country_map.get(x, x) if pd.notna(x) else x)
        except Exception as e:
            print(f"⚠️ Failed to normalize 'Pais': {e}")

    # Step 5: Clean 'Moneda' column if it exists
    if 'Moneda' in df_PDFs_documents.columns:
        try:
            df_PDFs_documents['Moneda'] = df_PDFs_documents['Moneda'].astype(str).str.replace('CURRENCY: ', '', regex=False)
        except Exception as e:
            print(f"⚠️ Failed to clean 'Moneda': {e}")

    print(f"🟢 PDFs processed successfully: {len(dfs_successful)}")
    print(f"❌ PDFs with errors: {len(listaErrores)}")
    if listaErrores:
        print('📌 Files with errors:', listaErrores)
        
        # Keep only the rightmost part of each path (filename)
        errores_filenames = [os.path.basename(path) for path in listaErrores]
        
        # Export to TXT
        errores_txt_path = os.path.join(base_path, 'PDFs_con_errores.txt')
        with open(errores_txt_path, 'w', encoding='utf-8') as f:
            for name in errores_filenames:
                f.write(name + '\n')

        print(f"📝 Exported error list to: {errores_txt_path}")
    print(df_PDFs_documents)
    return df_PDFs_documents


def PDFs_to_excelOld(base_path):
    listaErrores = []
    df_PDFs_documents = []
    # ✅ Recursively find all PDFs in base_path and its subfolders
    seen_filenames = set()
    path_cleards_documents = []

    for root, _, files in os.walk(base_path):
        for file in files:
            if file.lower().endswith('.pdf') and not file.startswith('.'):
                if file not in seen_filenames:
                    seen_filenames.add(file)
                    full_path = os.path.join(root, file)
                    path_cleards_documents.append(full_path)
    ##################### HACE DATAFRAMES TODOS LOS CLEARDS DOCUMENTS ##########################
    path_cleards_documents2 = []
    total_files = len(path_cleards_documents)
    
    for index, path in enumerate(path_cleards_documents, start=1):
        print(f"Processing file {index} of {total_files}: {path}")
        success = False

        for func in [PDFs_v2, PDFs_v3, PDFs_v4, PDFs_v1]:
            try:
                result = func(path)
                path_cleards_documents2.append(result)
                success = True
                break
            except Exception as e:
                continue  # Try the next function

        if not success:
            listaErrores.append(path)
            print(f"❌ All PDF parsers failed for: {path}")
    try:                
        df_PDFs_documents = pd.concat(path_cleards_documents2, ignore_index=True, axis=0)
        print(df_PDFs_documents)
    except ValueError as e:
        print(f"❌ Error concatenating DataFrames: {e}")


    # ✅ Normaliza la columna 'Pais'
    country_map = {
        'CZECH': 'CZE',
        'GERMAN': 'DEU',
        'Deutschland': 'DEU',
        'Slowakei': 'SVK',
        'SPANISH': 'ESP',
        'UK': 'GBR',
        'HUNGARY': 'HUN'
    }
    df_PDFs_documents['Pais'] = df_PDFs_documents['Pais'].apply(lambda x: country_map.get(x, x))

    # ✅ Limpia la columna 'Moneda'
    df_PDFs_documents['Moneda'] = df_PDFs_documents['Moneda'].astype(str).str.replace('CURRENCY: ', '')
    print('pdfs con errores :', listaErrores)
    return df_PDFs_documents



def PDFs_to_excel2(pdfs_paths):
    path_cleards_documents = archivos(pdfs_paths)
        # ✅ Filter out non-PDFs and hidden files
    path_cleards_documents = [
        f for f in path_cleards_documents
        if f.lower().endswith('.pdf') and not os.path.basename(f).startswith('.')
    ]

    ##################### HACE DATAFRAMES TODOS LOS CLEARDS DOCUMENTS ##########################
    path_cleards_documents2 = []
    total_files = len(path_cleards_documents)
    
    for index, i in enumerate(path_cleards_documents, start=1):
        print(f"Process ing file {index} of {total_files}: {i}")
        try:
            path_cleards_documents2.append(PDFs_v2(i))
        except:
            try:
                path_cleards_documents2.append(PDFs_v3(i))
                print('aaa1')

            except:
                try:
                    path_cleards_documents2.append(PDFs_v4(i))

                except:
                    path_cleards_documents2.append(PDFs_v1(i))
        #print(j," of ",len(path_cleards_documents))
    #print('yaaaaa')    
    df_PDFs_documents = pd.concat(path_cleards_documents2, ignore_index=True, axis=0)
    print(df_PDFs_documents)

    # CORRECCION DE COLUMNA -Pais-
    list_pais = list(df_PDFs_documents['Pais'])

    list_pais_depurado = []
    for i in list_pais:
        if i == 'CZECH':
            list_pais_depurado.append('CZE')
        elif i == 'GERMAN':
            list_pais_depurado.append('DEU')
        elif i == 'Deutschland':
            list_pais_depurado.append('DEU')
        elif i == 'Slowakei':
            list_pais_depurado.append('SVK')
        elif i == 'SPANISH':
            list_pais_depurado.append('ESP')
        elif i == 'UK':
            list_pais_depurado.append('GBR')
        else:
            list_pais_depurado.append(i)

    df_PDFs_documents['Pais'] = list_pais_depurado
    
    # DEPURANDO COLUMNA MONEDA
    
    list_moneda = list(df_PDFs_documents['Moneda'])
    #print(list_moneda)
    list_moneda_depurado = []
    for i in list_moneda:
        list_moneda_depurado.append(str(i).replace('CURRENCY: ', ''))
        
    df_PDFs_documents['Moneda'] = list_moneda_depurado

    return df_PDFs_documents


