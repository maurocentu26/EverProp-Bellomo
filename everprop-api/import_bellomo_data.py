import zipfile
import xml.etree.ElementTree as ET
import uuid
import json
import subprocess
import os

xlsx_path = r'C:\Users\mauro\Documents\EverSys\Documentos\Análisis Bellomo\tablas.xlsx'

with zipfile.ZipFile(xlsx_path, 'r') as z:
    shared_strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
            text_parts = [t.text for t in si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') if t.text]
            shared_strings.append(''.join(text_parts))

    # 1. Parse Edificio
    ws_ed = ET.fromstring(z.read('xl/worksheets/sheet4.xml'))
    ed_rows = ws_ed.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
    ed_headers = []
    for c in ed_rows[0].findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
        t_attr = c.attrib.get('t')
        v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
        val = v.text if v is not None else ''
        if t_attr == 's' and val.isdigit(): val = shared_strings[int(val)]
        ed_headers.append(val.strip())

    edificios = []
    for r in ed_rows[1:]:
        row_map = {}
        for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
            col_letter = ''.join([ch for ch in c.attrib.get('r') if ch.isalpha()])
            col_idx = 0
            for ch in col_letter: col_idx = col_idx * 26 + (ord(ch) - ord('A') + 1)
            col_idx -= 1
            t_attr = c.attrib.get('t')
            v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
            val = v.text if v is not None else ''
            if t_attr == 's' and val.isdigit(): val = shared_strings[int(val)]
            if col_idx < len(ed_headers):
                row_map[ed_headers[col_idx]] = val.strip()
        if row_map.get('EdId'):
            edificios.append(row_map)

    # 2. Parse Productos
    ws_prod = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    prod_rows = ws_prod.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
    prod_headers = []
    for c in prod_rows[0].findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
        t_attr = c.attrib.get('t')
        v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
        val = v.text if v is not None else ''
        if t_attr == 's' and val.isdigit(): val = shared_strings[int(val)]
        prod_headers.append(val.strip())

    productos = []
    for r in prod_rows[1:]:
        row_map = {}
        for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
            col_letter = ''.join([ch for ch in c.attrib.get('r') if ch.isalpha()])
            col_idx = 0
            for ch in col_letter: col_idx = col_idx * 26 + (ord(ch) - ord('A') + 1)
            col_idx -= 1
            t_attr = c.attrib.get('t')
            v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
            val = v.text if v is not None else ''
            if t_attr == 's' and val.isdigit(): val = shared_strings[int(val)]
            if col_idx < len(prod_headers):
                row_map[prod_headers[col_idx]] = val.strip()
        if row_map.get('EdId') and row_map.get('ProPis') and row_map.get('ProDep'):
            productos.append(row_map)

print(f"Loaded {len(edificios)} edificios and {len(productos)} productos.")

sql_lines = []
sql_lines.append("USE bellomo_crm;\n")
sql_lines.append("SET FOREIGN_KEY_CHECKS=0;\n")

# Project mapping metadata
project_metadata = {
    '70': {
        'name': 'Loteo San Pablo 1',
        'code': 'SP1',
        'city': 'San Salvador de Jujuy',
        'province': 'Jujuy',
        'address': 'Ruta Provincial 1, km 9',
        'description': 'Desarrollo residencial abierto Loteo San Pablo 1 en San Salvador de Jujuy. Lotes con posesión y servicios.',
        'masterplan_image_url': 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1200',
        'status': 'UNDER_CONSTRUCTION',
        'progress': 65,
        'total_units': 35
    },
    '83': {
        'name': 'Valle Verde Loteo',
        'code': 'VV',
        'city': 'San Salvador de Jujuy',
        'province': 'Jujuy',
        'address': 'Acceso Norte, San Salvador de Jujuy',
        'description': 'Loteo residencial Valle Verde, parcelas amplias de más de 250 m² en entorno natural consolidado.',
        'masterplan_image_url': 'https://images.unsplash.com/photo-1524813686514-a57563d77d61?q=80&w=1200',
        'status': 'PRE_SALE',
        'progress': 30,
        'total_units': 40
    },
    '77': {
        'name': 'Remanente El Rocío',
        'code': 'ROCIO',
        'city': 'El Carmen',
        'province': 'Jujuy',
        'address': 'El Carmen, Valle de los Pericos',
        'description': 'Remanente de lotes exclusivos El Rocío en El Carmen, Jujuy. Disponibilidad inmediata para escriturar.',
        'masterplan_image_url': 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1200',
        'status': 'COMPLETED',
        'progress': 100,
        'total_units': 20
    }
}

# Insert / Update Projects
for ed in edificios:
    ed_id = ed['EdId']
    meta = project_metadata.get(ed_id, {
        'name': ed['EdNom'].title(),
        'code': f"ED-{ed_id}",
        'city': 'San Salvador de Jujuy' if ed.get('LocCod') == '1' else 'El Carmen',
        'province': 'Jujuy',
        'address': ed.get('EdDir', ''),
        'description': ed['EdNom'],
        'masterplan_image_url': '',
        'status': 'UNDER_CONSTRUCTION',
        'progress': 50,
        'total_units': 30
    })
    
    p_uuid = str(uuid.uuid4())
    legacy_json = json.dumps(ed).replace("'", "''")
    
    sql = f"""
    INSERT INTO projects (
        tenant_id, public_id, code, legacy_id, name, project_type, status,
        progress, total_units, city, province, address, description, masterplan_image_url, legacy_data_json
    ) VALUES (
        1, '{p_uuid}', '{meta['code']}', {ed_id}, '{meta['name'].replace("'", "''")}', 'LAND_DEVELOPMENT', '{meta['status']}',
        {meta['progress']}, {meta['total_units']}, '{meta['city'].replace("'", "''")}', '{meta['province'].replace("'", "''")}',
        '{meta['address'].replace("'", "''")}', '{meta['description'].replace("'", "''")}', '{meta['masterplan_image_url']}', '{legacy_json}'
    ) ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        city = VALUES(city),
        legacy_data_json = VALUES(legacy_data_json);
    """
    sql_lines.append(sql)

# Insert / Update Properties
for p in productos:
    ed_id = int(p['EdId'])
    pis = p['ProPis'].strip()
    dep = p['ProDep'].strip()
    code = f"{ed_id}-{pis}-{dep}"
    
    title = f"Lote {dep} — Manzana {pis}"
    unit_number = f"Lote {dep}"
    sector_name = f"Manzana {pis}"
    
    des1 = p.get('ProDes1', '').strip()
    des2 = p.get('ProDes2', '').strip()
    full_desc = f"{des1} {des2}".strip()
    
    # Area
    try:
        area_m2 = float(p.get('ProM2', 0)) if p.get('ProM2') else 250.00
        if area_m2 <= 0: area_m2 = 250.00
    except:
        area_m2 = 250.00
        
    # Price and Currency (Bimonetary logic approved by user)
    try:
        raw_price = float(p.get('ProPre', 0)) if p.get('ProPre') else 0.0
    except:
        raw_price = 0.0
        
    if raw_price > 100000:
        price = raw_price
        currency_code = 'ARS'
    elif raw_price > 0:
        price = raw_price
        currency_code = 'USD'
    else:
        # Estimated base list price if not specified: USD 18,500
        price = round(area_m2 * 72.5, 2)
        currency_code = 'USD'
        
    # Status
    raw_status = p.get('ProEId', '2')
    status_map = {
        '1': 'AVAILABLE', # EN ALQUILER
        '2': 'AVAILABLE', # EN VENTA
        '3': 'RENTED',    # ALQUILADO
        '4': 'SOLD',      # VENDIDO
        '5': 'AVAILABLE', # LEASING
        '6': 'RESERVED',  # RESERVADO
        '7': 'AVAILABLE', # NO VENDIBLE TEMPORAL -> mostrar como disponible o reservado
        '8': 'AVAILABLE'
    }
    status = status_map.get(raw_status, 'AVAILABLE')
    
    # Category
    cat_map = {
        '1': 'APARTMENT',
        '2': 'GARAGE',
        '3': 'LOCAL',
        '4': 'HOUSE',
        '33': 'HOUSE',
        '9': 'LOT',
        '11': 'TRADITIONAL',
        '12': 'LOT'
    }
    category = cat_map.get(p.get('ProTId', '9'), 'LOT')
    
    prop_uuid = str(uuid.uuid4())
    legacy_json = json.dumps(p).replace("'", "''")
    services_json = json.dumps(["Agua corriente", "Red eléctrica", "Alumbrado público", "Apertura de calles"]).replace("'", "''")
    commercial_json = json.dumps({
        "down_payment_min_pct": 30,
        "installments": [12, 24, 36, 48],
        "adjustment": "CAC",
        "cash_discount_pct": 10
    }).replace("'", "''")
    
    # Project ID subselect
    sql_prop = f"""
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = {ed_id} LIMIT 1),
        '{prop_uuid}', '{code}',
        {ed_id}, '{pis.replace("'", "''")}', '{dep.replace("'", "''")}',
        {p.get('ProEId', 2) if p.get('ProEId', '').isdigit() else 2},
        {p.get('ProTId', 9) if p.get('ProTId', '').isdigit() else 9},
        '{title.replace("'", "''")}', 'SALE', '{category}', '{status}', {price}, '{currency_code}',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = {ed_id} LIMIT 1),
        'Jujuy', '{p.get('ProUbic', '').strip().replace("'", "''")}',
        {area_m2}, '{sector_name.replace("'", "''")}', '{unit_number.replace("'", "''")}',
        '{full_desc.replace("'", "''")}', '{services_json}', '{commercial_json}', '{legacy_json}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    """
    sql_lines.append(sql_prop)

sql_lines.append("SET FOREIGN_KEY_CHECKS=1;\n")

sql_file = r'c:\Users\mauro\Documents\EverSys\Proyectos\EverProp\everprop-api\database\seeders\seed_bellomo_real_data.sql'
with open(sql_file, 'w', encoding='utf-8') as f:
    f.writelines(sql_lines)

print(f"Generated SQL file at {sql_file} with {len(sql_lines)} statements.")
