"""
Boat Analysis Module
Shows exact matched records: Factura, Chassis, Boat
"""

import pandas as pd
from pathlib import Path


def load_boat_manifests(boat_files):
    """Load boat manifest files."""
    all_boats = []
    for f in boat_files:
        try:
            df = pd.read_excel(f)
            df['SourceFile'] = Path(f).name
            df['FolderPath'] = str(Path(f).parent)
            all_boats.append(df)
            print(f"[OK] {Path(f).name} ({len(df)} rows)")
        except Exception as e:
            print(f"[ERROR] {Path(f).name}: {e}")

    df_boats = pd.concat(all_boats, ignore_index=True)
    return df_boats


def find_chassis_in_boats_not_in_extraccion(df_boats, df_extraccion):
    """
    Compare chassis from boats vs extraction.
    Shows exact Factura, Chassis, Boat for each match.
    """
    df_boats_clean = df_boats.copy()
    df_boats_clean['Chassis Number'] = df_boats_clean['Chassis Number'].astype(str).str.strip()
    df_boats_clean['FI: Invoice No.'] = df_boats_clean['FI: Invoice No.'].astype(str).str.strip()

    extraccion_chassis = set(df_extraccion['Chasis'].astype(str).str.strip().unique())

    df_boats_clean['In Extraccion'] = df_boats_clean['Chassis Number'].isin(extraccion_chassis)

    df_missing = df_boats_clean[df_boats_clean['In Extraccion'] == False].copy()
    df_found = df_boats_clean[df_boats_clean['In Extraccion'] == True].copy()

    print("=" * 80)
    print("CHASSIS FROM BOATS vs EXTRACCION")
    print("=" * 80)
    print(f"\nFound in extraccion: {len(df_found)}")
    print(f"Missing from extraccion: {len(df_missing)}")

    # Only show MISSING data (what we need to locate)
    if len(df_missing) > 0:
        print(f"\n[MISSING] {len(df_missing)} chassis NOT in extraccion:")
        print("-" * 80)
        print(df_missing[['FI: Invoice No.', 'Chassis Number', 'Ship Name', 'FolderPath']].to_string(index=False))

    return df_missing, df_found


def check_invoices_in_extraccion(df_missing, df_extraccion):
    """
    Check if invoices for missing chassis exist in extraction.
    Shows exact Factura, Chassis, Boat.
    """
    df_missing_clean = df_missing.copy()
    df_missing_clean['FI: Invoice No.'] = df_missing_clean['FI: Invoice No.'].astype(str).str.strip()

    extraccion_invoices = set(df_extraccion['Factura'].astype(str).str.strip().unique())

    df_missing_clean['Invoice in Extraccion'] = df_missing_clean['FI: Invoice No.'].isin(extraccion_invoices)

    df_found = df_missing_clean[df_missing_clean['Invoice in Extraccion'] == True].copy()
    df_not_found = df_missing_clean[df_missing_clean['Invoice in Extraccion'] == False].copy()

    print("=" * 80)
    print("INVOICES FOR MISSING CHASSIS vs EXTRACCION")
    print("=" * 80)

    # MATCHED - invoice exists but chassis wasn't extracted
    if len(df_found) > 0:
        print(f"\n[MATCHED] {len(df_found)} - Invoice in extraccion (chassis missing from PDF):")
        print("-" * 80)
        print(df_found[['FI: Invoice No.', 'Chassis Number', 'Ship Name']].to_string(index=False))
    else:
        print("\n[MATCHED] 0 invoices found")

    # NOT MATCHED - invoice doesn't exist
    if len(df_not_found) > 0:
        print(f"\n[NOT MATCHED] {len(df_not_found)} - Invoice NOT in extraccion (PDF missing):")
        print("-" * 80)
        print(df_not_found[['FI: Invoice No.', 'Chassis Number', 'Ship Name', 'FolderPath']].to_string(index=False))
    else:
        print("\n[NOT MATCHED] 0 invoices missing")

    return df_found, df_not_found


def check_faltantes_in_extraccion(df_faltantes, df_extraccion):
    """
    Check FacturasFaltantes vs extraction.
    Shows exact Factura, Chasis.
    """
    df_faltantes_clean = df_faltantes.copy()
    df_faltantes_clean['FACT'] = df_faltantes_clean['FACT'].astype(str).str.strip()

    df_extraccion_clean = df_extraccion.copy()
    df_extraccion_clean['Factura'] = df_extraccion_clean['Factura'].astype(str).str.strip()
    df_extraccion_clean['Chasis'] = df_extraccion_clean['Chasis'].astype(str).str.strip()

    extraccion_invoices = set(df_extraccion_clean['Factura'].unique())

    df_faltantes_clean['In Extraccion'] = df_faltantes_clean['FACT'].isin(extraccion_invoices)

    df_found = df_faltantes_clean[df_faltantes_clean['In Extraccion'] == True].copy()
    df_not_found = df_faltantes_clean[df_faltantes_clean['In Extraccion'] == False].copy()

    # Merge to get chassis
    if len(df_found) > 0:
        df_found = df_found.merge(
            df_extraccion_clean[['Factura', 'Chasis']],
            left_on='FACT',
            right_on='Factura',
            how='left'
        )

    print("=" * 80)
    print("FACTURAS FALTANTES vs EXTRACCION")
    print("=" * 80)

    # MATCHED
    if len(df_found) > 0:
        print(f"\n[MATCHED] {df_found['FACT'].nunique()} facturas FOUND in extraccion:")
        print("-" * 80)
        print(df_found[['FACT', 'Chasis']].to_string(index=False))
    else:
        print("\n[MATCHED] 0 facturas found")

    # NOT MATCHED
    if len(df_not_found) > 0:
        print(f"\n[NOT MATCHED] {len(df_not_found)} facturas NOT in extraccion:")
        print("-" * 80)
        print(df_not_found['FACT'].to_string(index=False))
    else:
        print("\n[NOT MATCHED] 0 facturas missing")

    return df_found, df_not_found


def check_faltantes_in_boats(df_faltantes, df_boats):
    """
    Check FacturasFaltantes vs boat manifests.
    Shows exact Factura, Chassis, Boat, Folder.
    """
    df_faltantes_clean = df_faltantes.copy()
    df_faltantes_clean['FACT'] = df_faltantes_clean['FACT'].astype(str).str.strip()

    df_boats_clean = df_boats.copy()
    df_boats_clean['FI: Invoice No.'] = df_boats_clean['FI: Invoice No.'].astype(str).str.strip()
    df_boats_clean['Chassis Number'] = df_boats_clean['Chassis Number'].astype(str).str.strip()

    boat_invoices = set(df_boats_clean['FI: Invoice No.'].unique())

    df_faltantes_clean['In Boats'] = df_faltantes_clean['FACT'].isin(boat_invoices)

    df_found = df_faltantes_clean[df_faltantes_clean['In Boats'] == True].copy()
    df_not_found = df_faltantes_clean[df_faltantes_clean['In Boats'] == False].copy()

    # Merge to get boat info
    if len(df_found) > 0:
        df_found = df_found.merge(
            df_boats_clean[['FI: Invoice No.', 'Chassis Number', 'Ship Name', 'FolderPath']],
            left_on='FACT',
            right_on='FI: Invoice No.',
            how='left'
        )

    print("=" * 80)
    print("FACTURAS FALTANTES vs BOAT MANIFESTS")
    print("=" * 80)

    # MATCHED
    if len(df_found) > 0:
        print(f"\n[MATCHED] {len(df_found)} records FOUND in boats:")
        print("-" * 80)
        print(df_found[['FACT', 'Chassis Number', 'Ship Name', 'FolderPath']].to_string(index=False))
    else:
        print("\n[MATCHED] 0 records found")

    # NOT MATCHED
    if len(df_not_found) > 0:
        print(f"\n[NOT MATCHED] {len(df_not_found)} facturas NOT in any boat:")
        print("-" * 80)
        print(df_not_found['FACT'].to_string(index=False))
    else:
        print("\n[NOT MATCHED] 0 facturas missing")

    return df_found, df_not_found


def find_boats_not_in_faltantes(df_boats, df_faltantes):
    """
    Find boat records vs FacturasFaltantes.
    Shows exact Factura, Chassis, Boat.
    """
    df_boats_clean = df_boats.copy()
    df_boats_clean['FI: Invoice No.'] = df_boats_clean['FI: Invoice No.'].astype(str).str.strip()
    df_boats_clean['Chassis Number'] = df_boats_clean['Chassis Number'].astype(str).str.strip()

    faltantes_invoices = set(df_faltantes['FACT'].astype(str).str.strip().unique())

    df_boats_clean['In Faltantes'] = df_boats_clean['FI: Invoice No.'].isin(faltantes_invoices)

    df_in_faltantes = df_boats_clean[df_boats_clean['In Faltantes'] == True].copy()
    df_not_in_faltantes = df_boats_clean[df_boats_clean['In Faltantes'] == False].copy()

    print("=" * 80)
    print("BOAT RECORDS vs FACTURAS FALTANTES")
    print("=" * 80)

    # MATCHED - boat records that ARE in faltantes
    if len(df_in_faltantes) > 0:
        print(f"\n[MATCHED] {len(df_in_faltantes)} boat records ARE in FacturasFaltantes:")
        print("-" * 80)
        print(df_in_faltantes[['FI: Invoice No.', 'Chassis Number', 'Ship Name', 'FolderPath']].to_string(index=False))
    else:
        print("\n[MATCHED] 0 boat records in faltantes")

    # NOT MATCHED - boat records not in faltantes
    if len(df_not_in_faltantes) > 0:
        print(f"\n[NOT MATCHED] {len(df_not_in_faltantes)} boat records NOT in FacturasFaltantes:")
        print("-" * 80)
        print(df_not_in_faltantes[['FI: Invoice No.', 'Chassis Number', 'Ship Name']].to_string(index=False))
    else:
        print("\n[NOT MATCHED] 0 boat records outside faltantes")

    return df_not_in_faltantes, df_in_faltantes


def show_files_to_locate(df_found, df_not_found):
    """
    Summary: Shows exactly WHERE to find the missing files.
    """
    print("\n" + "=" * 80)
    print("FILES TO LOCATE - SUMMARY")
    print("=" * 80)

    if len(df_found) > 0:
        print("\n[FOUND IN BOATS] These invoices are in boat manifests - check these folders:")
        print("-" * 80)
        for boat in df_found['Ship Name'].unique():
            boat_data = df_found[df_found['Ship Name'] == boat]
            folder = boat_data['FolderPath'].iloc[0]
            invoices = boat_data['FACT'].unique() if 'FACT' in boat_data.columns else boat_data['FI: Invoice No.'].unique()
            chassis = boat_data['Chassis Number'].unique()
            print(f"\nBOAT: {boat}")
            print(f"FOLDER: {folder}")
            print(f"INVOICES ({len(invoices)}): {list(invoices)}")
            print(f"CHASSIS ({len(chassis)}): {list(chassis)}")

    if len(df_not_found) > 0:
        print("\n[NOT IN ANY BOAT] These invoices are NOT in any boat manifest:")
        print("-" * 80)
        if 'FACT' in df_not_found.columns:
            print(df_not_found['FACT'].tolist())
        else:
            print(df_not_found['FI: Invoice No.'].tolist())


def run_full_analysis(df_boats, df_extraccion, df_faltantes):
    """
    Find missing chassis from boats and show where to locate the PDFs.
    Also shows which FacturasFaltantes appear in boat manifests.
    """
    results = {}

    # Step 1: Find chassis in boats NOT in extraccion
    print("\n[1/3] Chassis in boats vs extraction...")
    results['chassis_not_in_extraccion'], results['chassis_in_extraccion'] = find_chassis_in_boats_not_in_extraccion(df_boats, df_extraccion)

    # Step 2: For missing chassis, check if invoice exists
    print("\n[2/3] Invoices for missing chassis...")
    results['invoices_found'], results['invoices_not_found'] = check_invoices_in_extraccion(
        results['chassis_not_in_extraccion'], df_extraccion
    )

    # Step 3: Check which FacturasFaltantes appear in boats
    print("\n[3/3] FacturasFaltantes vs boats...")
    results['faltantes_in_boats'], results['faltantes_not_in_boats'] = check_faltantes_in_boats(
        df_faltantes, df_boats
    )

    print("\n" + "=" * 80)
    print("DONE - Check folders above to locate missing PDFs")
    print("=" * 80)

    return results
