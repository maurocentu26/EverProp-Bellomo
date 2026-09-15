import pandas as pd
import json
import uuid
import math
import datetime

def json_serial(obj):
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    # Handle NaT properly if it slips through
    if pd.isna(obj):
        return None
    raise TypeError(f'Type {type(obj)} not serializable')

df_dict = pd.read_excel(r'c:\Users\mauro\Documents\EverSys\Documentos\03 - Clientes\Bellomo Desarrollos\04_Documentacion_Provista_Cliente\tablas final.xlsx', sheet_name=None)
df = df_dict['Productos']

sql = ["USE bellomo_crm;", "SET FOREIGN_KEY_CHECKS=0;", "DELETE FROM properties WHERE tenant_id = 1;"]

for index, row in df.iterrows():
    row_dict = {k: (None if pd.isna(v) else v) for k, v in row.to_dict().items()}
    
    ed_id = row_dict.get('EdId')
    if ed_id is not None:
        ed_id = int(ed_id)

    pis = str(row_dict.get('ProPis') or '').strip()
    dep = str(row_dict.get('ProDep') or '').strip()
    title = str(row_dict.get('ProDes1') or f'Unidad {pis} {dep}')
    
    price = row_dict.get('ProPre')
    if price is None or price == '':
        price = row_dict.get('ProCoCV')
    if price is None or price == '':
        price = 0.0
    try:
        price = float(price)
    except:
        price = 0.0

    area_m2 = row_dict.get('ProM2')
    try:
        area_m2 = float(area_m2)
        if area_m2 <= 0:
            area_m2 = 'NULL'
    except:
        area_m2 = 'NULL'
        
    code = f"{ed_id}-{pis}-{dep}"
    public_id = str(uuid.uuid4())
    legacy_data_json = json.dumps(row_dict, default=json_serial)
    
    pro_eid = row_dict.get('ProEId')
    if pro_eid is not None:
        pro_eid = int(pro_eid)
        
    status = 'SOLD' if pro_eid == 4 else 'AVAILABLE'
    
    pro_tid = row_dict.get('ProTId')
    if pro_tid is not None:
        pro_tid = int(pro_tid)
        
    category = 'LOT'
    operation = 'SALE'
    
    currency_code = 'USD' if str(row_dict.get('ProComFor')).strip() == 'E' else 'ARS'
    
    sql.append(f"""
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = {ed_id} LIMIT 1),
        '{public_id}', '{code}',
        {ed_id}, '{pis}', '{dep}', {pro_eid if pro_eid is not None else 'NULL'}, {pro_tid if pro_tid is not None else 'NULL'},
        '{title.replace("'", "''")}', '{operation}', '{category}', '{status}', {price}, '{currency_code}',
        COALESCE((SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = {ed_id} LIMIT 1), 'San Salvador de Jujuy'),
        'Jujuy', '{str(row_dict.get('ProUbic') or '').replace("'", "''")}', {area_m2}, '{pis}', '{dep}',
        '{title.replace("'", "''")}', '[]', '{{}}', '{legacy_data_json.replace("'", "''")}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title), price = VALUES(price), status = VALUES(status), area_m2 = VALUES(area_m2), legacy_data_json = VALUES(legacy_data_json);
    """)

sql.append("SET FOREIGN_KEY_CHECKS=1;")

with open('seed-bellomo-final-actives.sql', 'w', encoding='utf-8') as f:
    f.write("\n".join(sql))

print("Done. Wrote seed-bellomo-final-actives.sql")
