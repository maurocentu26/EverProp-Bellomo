USE bellomo_crm;
SET FOREIGN_KEY_CHECKS=0;

    INSERT INTO projects (
        tenant_id, public_id, code, legacy_id, name, project_type, status,
        progress, total_units, city, province, address, description, masterplan_image_url, legacy_data_json
    ) VALUES (
        1, '95b45059-b614-426e-a2c8-4f2015db24a2', 'SP1', 70, 'Loteo San Pablo 1', 'LAND_DEVELOPMENT', 'UNDER_CONSTRUCTION',
        65, 35, 'San Salvador de Jujuy', 'Jujuy',
        'Ruta Provincial 1, km 9', 'Desarrollo residencial abierto Loteo San Pablo 1 en San Salvador de Jujuy. Lotes con posesión y servicios.', 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1200', '{"EdId": "70", "EdNom": "LOTEO SAN PABLO 1", "EdDir": "", "EdBar": "", "LocCod": "1", "RubCod": "2", "ConCod": "1", "EdIUIL": "0", "EdUIL1": "0", "EdEst": "", "EdEFec": "44256", "EdDueId": "4", "EdComi": "", "EdRetImp": "5.8", "EdRem": "N", "EdRemOrig": "", "EdIUlL": "0", "EdUlL1": "0"}'
    ) ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        city = VALUES(city),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO projects (
        tenant_id, public_id, code, legacy_id, name, project_type, status,
        progress, total_units, city, province, address, description, masterplan_image_url, legacy_data_json
    ) VALUES (
        1, '9dfebc25-b12b-4ddc-9521-01d058b8f831', 'VV', 83, 'Valle Verde Loteo', 'LAND_DEVELOPMENT', 'PRE_SALE',
        30, 40, 'San Salvador de Jujuy', 'Jujuy',
        'Acceso Norte, San Salvador de Jujuy', 'Loteo residencial Valle Verde, parcelas amplias de más de 250 m² en entorno natural consolidado.', 'https://images.unsplash.com/photo-1524813686514-a57563d77d61?q=80&w=1200', '{"EdId": "83", "EdNom": "VALLE VERDE LOTEO", "EdDir": "", "EdBar": "", "LocCod": "1", "RubCod": "2", "ConCod": "2", "EdIUIL": "0", "EdUIL1": "0", "EdEst": "", "EdEFec": "44256", "EdDueId": "4", "EdComi": "", "EdRetImp": "5.8", "EdRem": "N", "EdRemOrig": "84", "EdIUlL": "0", "EdUlL1": "0"}'
    ) ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        city = VALUES(city),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO projects (
        tenant_id, public_id, code, legacy_id, name, project_type, status,
        progress, total_units, city, province, address, description, masterplan_image_url, legacy_data_json
    ) VALUES (
        1, '12e3d498-742b-4e5f-8b1e-7e3ed6b23244', 'ROCIO', 77, 'Remanente El Rocío', 'LAND_DEVELOPMENT', 'COMPLETED',
        100, 20, 'El Carmen', 'Jujuy',
        'El Carmen, Valle de los Pericos', 'Remanente de lotes exclusivos El Rocío en El Carmen, Jujuy. Disponibilidad inmediata para escriturar.', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1200', '{"EdId": "77", "EdNom": "REMANENTE EL ROCIO", "EdDir": "", "EdBar": "EL CARMEN", "LocCod": "5", "RubCod": "2", "ConCod": "1", "EdIUIL": "", "EdUIL1": "", "EdEst": "", "EdEFec": "36892", "EdDueId": "4", "EdComi": "0", "EdRetImp": "0", "EdRem": "S", "EdRemOrig": "57", "EdIUlL": "0", "EdUlL1": "0"}'
    ) ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        city = VALUES(city),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '86634fca-fc83-4c43-920d-7b5b4c2fcec1', '70-AP7-15',
        70, 'AP7', '15',
        7,
        9,
        'Lote 15 — Manzana AP7', 'SALE', 'LOT', 'AVAILABLE', 19428.55, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        267.98, 'Manzana AP7', 'Lote 15',
        'LOTE DE 267.98 OCH. 4.79 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "15", "ProDes1": "LOTE DE 267.98", "ProDes2": "OCH. 4.79 M2", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "267.98", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '3872c68a-bab6-48ac-b1fd-519ebfa72d70', '70-AP7-16',
        70, 'AP7', '16',
        7,
        9,
        'Lote 16 — Manzana AP7', 'SALE', 'LOT', 'AVAILABLE', 21292.53, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        293.69, 'Manzana AP7', 'Lote 16',
        'LOTE 293.69 M2 OCH. 3.35 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "16", "ProDes1": "LOTE 293.69 M2", "ProDes2": "OCH. 3.35 M2", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "293.69", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'febe3708-ffc5-47f0-a465-ff865fac5d93', '70-AP7-17',
        70, 'AP7', '17',
        7,
        9,
        'Lote 17 — Manzana AP7', 'SALE', 'LOT', 'AVAILABLE', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 17',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "17", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'c922b50f-a2f3-4d37-8e7d-f40617a572fa', '70-AP7-18',
        70, 'AP7', '18',
        7,
        9,
        'Lote 18 — Manzana AP7', 'SALE', 'LOT', 'AVAILABLE', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 18',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "18", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '3c157af0-e111-4fc0-865b-4476c8ac5304', '70-AP7-19',
        70, 'AP7', '19',
        7,
        9,
        'Lote 19 — Manzana AP7', 'SALE', 'LOT', 'AVAILABLE', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 19',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "19", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '137f929c-5010-4278-8e92-1a692d6c4834', '70-AP7-2',
        70, 'AP7', '2',
        4,
        9,
        'Lote 2 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        250.0, 'Manzana AP7', 'Lote 2',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "2", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '0d104bf8-e294-401e-9c25-1358537ad5e3', '70-AP7-20',
        70, 'AP7', '20',
        2,
        9,
        'Lote 20 — Manzana AP7', 'SALE', 'LOT', 'AVAILABLE', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 20',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "20", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "2", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "mcruz", "ProCamFec": "45513"}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '5287137d-93a1-4d1a-930a-c2f78a95fcf9', '70-AP7-21',
        70, 'AP7', '21',
        4,
        9,
        'Lote 21 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 21',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "21", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'be6db9cd-3d4e-48d7-bc72-68aee238eca4', '70-AP7-22',
        70, 'AP7', '22',
        4,
        9,
        'Lote 22 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 22',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "22", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '4f0dfc6c-5fa0-433d-820d-ec6ab86c6afb', '70-AP7-23',
        70, 'AP7', '23',
        4,
        9,
        'Lote 23 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 23',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "23", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'e3b56e1e-b668-42b6-86ce-87f464425869', '70-AP7-24',
        70, 'AP7', '24',
        4,
        9,
        'Lote 24 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 24',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "24", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '9e7a8a18-f61e-41d3-b2a9-342e9342084a', '70-AP7-25',
        70, 'AP7', '25',
        4,
        9,
        'Lote 25 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 25',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "25", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '48093c2b-c300-4711-9898-73ea5bb480c8', '70-AP7-26',
        70, 'AP7', '26',
        4,
        9,
        'Lote 26 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18487.5, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.0, 'Manzana AP7', 'Lote 26',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "26", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '600cacd4-16d2-4af9-8f45-7b6f77ab3a8c', '70-AP7-27',
        70, 'AP7', '27',
        2,
        9,
        'Lote 27 — Manzana AP7', 'SALE', 'LOT', 'AVAILABLE', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 27',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "27", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "2", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "mcruz", "ProCamFec": "45513"}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '82a874f1-6bdd-446e-8e8c-ec0e38ab6d38', '70-AP7-28',
        70, 'AP7', '28',
        4,
        9,
        'Lote 28 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 28',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "28", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'b0bd8ab5-a369-4bde-9b6a-f7ee21bd6828', '70-AP7-29',
        70, 'AP7', '29',
        4,
        9,
        'Lote 29 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 29',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "29", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'b98dd7c4-023d-44bd-af70-cc71c2c0f10f', '70-AP7-3',
        70, 'AP7', '3',
        4,
        9,
        'Lote 3 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 3',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "3", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'ccf8f018-5c60-45bb-85f1-b5537af53982', '70-AP7-30',
        70, 'AP7', '30',
        4,
        9,
        'Lote 30 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18193.88, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        250.95, 'Manzana AP7', 'Lote 30',
        'LOTE DE 250.95 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "30", "ProDes1": "LOTE DE 250.95 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "250.95", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '2406a312-3a1c-4e0a-acab-858b8a146ac3', '70-AP7-4',
        70, 'AP7', '4',
        4,
        9,
        'Lote 4 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        250.0, 'Manzana AP7', 'Lote 4',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "4", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'a6112106-821d-40cc-96e2-19b777e9a3bb', '70-AP7-5',
        70, 'AP7', '5',
        4,
        9,
        'Lote 5 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        250.0, 'Manzana AP7', 'Lote 5',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "5", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '6ee3555c-79ef-4662-837a-068e0feaa78b', '70-AP7-6',
        70, 'AP7', '6',
        4,
        9,
        'Lote 6 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 6',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "6", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '73cb8123-727d-484d-894c-438fc26b6fc9', '70-AP7-7',
        70, 'AP7', '7',
        4,
        9,
        'Lote 7 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 7',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "7", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '4bf95f21-7a8a-47e2-a7ce-2458b3840cf3', '70-AP7-8',
        70, 'AP7', '8',
        4,
        9,
        'Lote 8 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18487.5, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.0, 'Manzana AP7', 'Lote 8',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "8", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '8d4043ac-461c-4418-9e58-cb2e5cec88a4', '70-AP7-9',
        70, 'AP7', '9',
        4,
        9,
        'Lote 9 — Manzana AP7', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP7', 'Lote 9',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP7", "ProDep": "9", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'bc18f745-d19d-4fa3-a6b5-29ba3fb4a0d9', '70-AP8-1',
        70, 'AP8', '1',
        4,
        9,
        'Lote 1 — Manzana AP8', 'SALE', 'LOT', 'SOLD', 18320.75, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        252.7, 'Manzana AP8', 'Lote 1',
        'LOTE DE 252.70 M2 OCH. 3.22 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "1", "ProDes1": "LOTE DE 252.70 M2", "ProDes2": "OCH. 3.22 M2", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "252.7", "ProCamUsuId": "mcruz", "ProCamFec": "45467"}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '6e54ca4c-e162-47f6-9dee-c3ef48f2751f', '70-AP8-10',
        70, 'AP8', '10',
        4,
        9,
        'Lote 10 — Manzana AP8', 'SALE', 'LOT', 'SOLD', 959700.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        250.0, 'Manzana AP8', 'Lote 10',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "10", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "959700", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '7fbf4a25-c45b-4d5c-8608-e0629fb8bc10', '70-AP8-11',
        70, 'AP8', '11',
        4,
        9,
        'Lote 11 — Manzana AP8', 'SALE', 'LOT', 'SOLD', 959700.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.0, 'Manzana AP8', 'Lote 11',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "11", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "959700", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '778e97a2-55f8-4bae-a580-09010ec6552f', '70-AP8-12',
        70, 'AP8', '12',
        7,
        9,
        'Lote 12 — Manzana AP8', 'SALE', 'LOT', 'AVAILABLE', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP8', 'Lote 12',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "12", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '3bda11ef-732e-41ce-96d6-f1f735c6ba5f', '70-AP8-13',
        70, 'AP8', '13',
        4,
        9,
        'Lote 13 — Manzana AP8', 'SALE', 'LOT', 'SOLD', 1500000.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.0, 'Manzana AP8', 'Lote 13',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "13", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "1500000", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '57ffb649-256d-47b6-b727-bc7684304517', '70-AP8-14',
        70, 'AP8', '14',
        7,
        9,
        'Lote 14 — Manzana AP8', 'SALE', 'LOT', 'AVAILABLE', 33336.22, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        459.81, 'Manzana AP8', 'Lote 14',
        'LOTE DE 459.81 M2 OCH. 4.79 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "14", "ProDes1": "LOTE DE 459.81 M2", "ProDes2": "OCH. 4.79 M2", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "459.81", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '4d88c258-2be9-47ae-bfa8-d4b45da320a7', '70-AP8-15',
        70, 'AP8', '15',
        7,
        9,
        'Lote 15 — Manzana AP8', 'SALE', 'LOT', 'AVAILABLE', 35200.92, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        485.53, 'Manzana AP8', 'Lote 15',
        'LOTE DE 485.53 M2 OCH. 3.35 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "15", "ProDes1": "LOTE DE 485.53 M2", "ProDes2": "OCH. 3.35 M2", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "485.53", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '5764ce34-689e-4cbc-b985-77d20fb7cd42', '70-AP8-16',
        70, 'AP8', '16',
        7,
        9,
        'Lote 16 — Manzana AP8', 'SALE', 'LOT', 'AVAILABLE', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP8', 'Lote 16',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "16", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '26732dea-70a2-453a-a356-bc7f13a6d560', '70-AP8-17',
        70, 'AP8', '17',
        7,
        9,
        'Lote 17 — Manzana AP8', 'SALE', 'LOT', 'RESERVED', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP8', 'Lote 17',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "17", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'ea981881-ab3c-408f-b8d9-93b74a909fd3', '70-AP8-18',
        70, 'AP8', '18',
        7,
        9,
        'Lote 18 — Manzana AP8', 'SALE', 'LOT', 'RESERVED', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP8', 'Lote 18',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "18", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "7", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '653d5644-f5b2-4b74-95d4-75d7dde74202', '70-AP8-19',
        70, 'AP8', '19',
        4,
        9,
        'Lote 19 — Manzana AP8', 'SALE', 'LOT', 'SOLD', 1300000.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP8', 'Lote 19',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "19", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "1300000", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '7a3b5744-bb2b-4d9d-a66c-750d0ec871cc', '70-AP8-2',
        70, 'AP8', '2',
        4,
        9,
        'Lote 2 — Manzana AP8', 'SALE', 'LOT', 'SOLD', 18554.2, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.92, 'Manzana AP8', 'Lote 2',
        'LOTE DE 255.92 M2 OCH.', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "2", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "OCH.", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255.92", "ProCamUsuId": "mcruz", "ProCamFec": "45467"}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        '662d4b5c-a849-424f-b85a-b870810ef1d7', '70-AP8-20',
        70, 'AP8', '20',
        4,
        9,
        'Lote 20 — Manzana AP8', 'SALE', 'LOT', 'SOLD', 18487.5, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        255.0, 'Manzana AP8', 'Lote 20',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "20", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "255", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'd44ccd4c-b998-4907-bf6f-6db4bb0c5998', '70-AP8-21',
        70, 'AP8', '21',
        4,
        9,
        'Lote 21 — Manzana AP8', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        250.0, 'Manzana AP8', 'Lote 21',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "21", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'ba30645f-c067-488b-9ee3-a0627b787e33', '70-AP8-22',
        70, 'AP8', '22',
        4,
        9,
        'Lote 22 — Manzana AP8', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 70 LIMIT 1),
        'Jujuy', 'SAN GUILLERMO II',
        250.0, 'Manzana AP8', 'Lote 22',
        'LOTE DE 255.92 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "70", "ProPis": "AP8", "ProDep": "22", "ProDes1": "LOTE DE 255.92 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "SAN GUILLERMO II", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "6", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "ffortuni", "ProCamFec": "45485"}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'fec3a1c2-ad21-4071-bac8-4941468b522b', '83-AP14-11',
        83, 'AP14', '11',
        4,
        9,
        'Lote 11 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 1317580.8, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP14', 'Lote 11',
        'LOTE DE 296 M2 OCH. 4 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "11", "ProDes1": "LOTE DE 296 M2", "ProDes2": "OCH. 4 M2", "ProTId": "9", "ProEId": "4", "ProPre": "1317580.8", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "52911.519999999997", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '48d23467-233a-4dfe-96df-0a1b7e79b74f', '83-AP14-12',
        83, 'AP14', '12',
        4,
        9,
        'Lote 12 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 1200000.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        300.0, 'Manzana AP14', 'Lote 12',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "12", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "1200000", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "50316", "ProM2": "300", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '42674946-faa2-4803-8e26-a4bf31a99ecc', '83-AP14-13',
        83, 'AP14', '13',
        4,
        9,
        'Lote 13 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP14', 'Lote 13',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "13", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '7a6cc82e-4743-4d04-baf6-0bab15f8ccc2', '83-AP14-14',
        83, 'AP14', '14',
        4,
        9,
        'Lote 14 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 21750.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        300.0, 'Manzana AP14', 'Lote 14',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "14", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "300", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '28e674e4-a42a-420a-a1f2-2e18031b9e35', '83-AP14-15',
        83, 'AP14', '15',
        4,
        9,
        'Lote 15 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP14', 'Lote 15',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "15", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '1ecc575d-e2fb-463d-b5f1-fda916f2962e', '83-AP14-16',
        83, 'AP14', '16',
        4,
        9,
        'Lote 16 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 21750.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        300.0, 'Manzana AP14', 'Lote 16',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "16", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "300", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '85b862e4-bc2b-4653-870e-44e5d2d419cf', '83-AP14-17',
        83, 'AP14', '17',
        4,
        9,
        'Lote 17 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 1200000.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP14', 'Lote 17',
        'LOTE DE 300 M2 VENTA CABA CON AP4 L4', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "17", "ProDes1": "LOTE DE 300 M2", "ProDes2": "VENTA CABA CON AP4 L4", "ProTId": "9", "ProEId": "4", "ProPre": "1200000", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "53481.31", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '3a4ee040-9cba-4844-b724-5c356e118df4', '83-AP14-18',
        83, 'AP14', '18',
        4,
        9,
        'Lote 18 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 21750.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        300.0, 'Manzana AP14', 'Lote 18',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "18", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "300", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'd66ee610-c41a-4f1e-9dc2-4748bc61037c', '83-AP14-19',
        83, 'AP14', '19',
        4,
        9,
        'Lote 19 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP14', 'Lote 19',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "19", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '09e38bd2-bb6a-4970-9ab1-11cdf6338036', '83-AP14-2',
        83, 'AP14', '2',
        4,
        9,
        'Lote 2 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 850000.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        300.0, 'Manzana AP14', 'Lote 2',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "2", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "850000", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "42392.52", "ProM2": "300", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'a6ee9597-59d5-4d36-b1e6-3a622bbf920c', '83-AP14-20',
        83, 'AP14', '20',
        4,
        9,
        'Lote 20 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP14', 'Lote 20',
        'LOTE DE 296 M2 OCH. 4 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "20", "ProDes1": "LOTE DE 296 M2", "ProDes2": "OCH. 4 M2", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '33b705fd-0dee-4f19-af1c-11febbcd2ab2', '83-AP14-3',
        83, 'AP14', '3',
        4,
        9,
        'Lote 3 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 21750.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        300.0, 'Manzana AP14', 'Lote 3',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "3", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "300", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '5a8ce6da-db1e-4904-9399-371cc56a4b61', '83-AP14-4',
        83, 'AP14', '4',
        4,
        9,
        'Lote 4 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP14', 'Lote 4',
        'LOTE DE 300 M2 CAMBIO POR AP30 L13', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "4", "ProDes1": "LOTE DE 300 M2", "ProDes2": "CAMBIO POR AP30 L13", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '2604520b-05e0-46cf-a31e-aebe95c02f7c', '83-AP14-5',
        83, 'AP14', '5',
        4,
        9,
        'Lote 5 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP14', 'Lote 5',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "5", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'fdbab130-40f3-4b39-a204-5d1693383d90', '83-AP14-6',
        83, 'AP14', '6',
        4,
        9,
        'Lote 6 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP14', 'Lote 6',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "6", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '141b5107-610c-411c-8f5a-0a156274b1e6', '83-AP14-7',
        83, 'AP14', '7',
        4,
        9,
        'Lote 7 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 850000.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        300.0, 'Manzana AP14', 'Lote 7',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "7", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "850000", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "55958.13", "ProM2": "300", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'abbf96f3-0a7a-4b3d-b06a-d772230cb1f1', '83-AP14-8',
        83, 'AP14', '8',
        4,
        9,
        'Lote 8 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 21750.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        300.0, 'Manzana AP14', 'Lote 8',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "8", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "300", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'cbdacd79-f161-479d-8bb8-d161379768d0', '83-AP14-9',
        83, 'AP14', '9',
        4,
        9,
        'Lote 9 — Manzana AP14', 'SALE', 'LOT', 'SOLD', 850000.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        300.0, 'Manzana AP14', 'Lote 9',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP14", "ProDep": "9", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "850000", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "55958.17", "ProM2": "300", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        '9d5fbf36-e76d-4b49-a198-c43ab18e4b2d', '83-AP15-1',
        83, 'AP15', '1',
        4,
        9,
        'Lote 1 — Manzana AP15', 'SALE', 'LOT', 'SOLD', 21460.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        296.0, 'Manzana AP15', 'Lote 1',
        'LOTE DE 296 M2 OCH. 4 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP15", "ProDep": "1", "ProDes1": "LOTE DE 296 M2", "ProDes2": "OCH. 4 M2", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "296", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'b2831604-ae23-4072-8f34-63ad2e931a0e', '83-AP15-10',
        83, 'AP15', '10',
        4,
        9,
        'Lote 10 — Manzana AP15', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 83 LIMIT 1),
        'Jujuy', 'ALTO COMEDERO',
        250.0, 'Manzana AP15', 'Lote 10',
        'LOTE DE 300 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "83", "ProPis": "AP15", "ProDep": "10", "ProDes1": "LOTE DE 300 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "ALTO COMEDERO", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "7", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'a2f93ed3-08b9-4ff1-a2d8-5a242710d049', '77-AP12-9',
        77, 'AP12', '9',
        4,
        9,
        'Lote 9 — Manzana AP12', 'SALE', 'LOT', 'SOLD', 17835.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        246.0, 'Manzana AP12', 'Lote 9',
        'LOTE DE 246 M2 OCH. 4 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP12", "ProDep": "9", "ProDes1": "LOTE DE 246 M2", "ProDes2": "OCH. 4 M2", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "246", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        '047524a5-09df-4566-b1b9-52f1aa42d3ff', '77-AP13-1',
        77, 'AP13', '1',
        4,
        9,
        'Lote 1 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 122789.54, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 1',
        'LOTE DE 347,89 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "1", "ProDes1": "LOTE DE 347,89 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "122789.54", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "38612.82", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        '12111de6-7d9c-41e3-9e9f-5ddc5479684d', '77-AP13-10',
        77, 'AP13', '10',
        4,
        9,
        'Lote 10 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 19056.07, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 10',
        'LOTE DE 250M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "10", "ProDes1": "LOTE DE 250M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "19056.07", "ProPor": "0", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "36892", "ProComFor": "", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "0", "ProAlqFDesc": "", "ProCoC": "0", "ProCoCV": "15471.96", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'ecce9781-616f-4ee2-8f6c-0e2d8c781e35', '77-AP13-11',
        77, 'AP13', '11',
        4,
        9,
        'Lote 11 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 146520.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 11',
        'LOTE DE: 250M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "11", "ProDes1": "LOTE DE: 250M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "146520", "ProPor": "0", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "36892", "ProComFor": "E", "SocId": "3", "ProComiVend": "0", "ProAlqDesc": "0", "ProAlqFDesc": "0", "ProCoC": "0", "ProCoCV": "12127.5", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        '37e5a048-facf-45cb-b1a5-bbad5d3bfb63', '77-AP13-12',
        77, 'AP13', '12',
        4,
        9,
        'Lote 12 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 207500.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 12',
        'LOTE DE 246M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "12", "ProDes1": "LOTE DE 246M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "207500", "ProPor": "0", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "36892", "ProComFor": "", "SocId": "3", "ProComiVend": "0", "ProAlqDesc": "0", "ProAlqFDesc": "0", "ProCoC": "0", "ProCoCV": "14525", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'a334fcf8-9350-43b6-8e9d-c1d1df3b3956', '77-AP13-13',
        77, 'AP13', '13',
        4,
        9,
        'Lote 13 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 350000.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 13',
        'LOTE DE 250 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "13", "ProDes1": "LOTE DE 250 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "350000", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "5", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'd28cd699-a381-4f1f-a3c4-1b3a453fb658', '77-AP13-14',
        77, 'AP13', '14',
        4,
        9,
        'Lote 14 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 182425.23, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 14',
        'LOTE DE 250 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "14", "ProDes1": "LOTE DE 250 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "182425.23", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "18634.88", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        '702b4632-a1e6-4fbd-96b0-201ccfbbefa0', '77-AP13-16',
        77, 'AP13', '16',
        4,
        9,
        'Lote 16 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 217757.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 16',
        'LOTE DE 250 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "16", "ProDes1": "LOTE DE 250 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "217757", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "28621.51", "ProM2": "250", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        '80f0cd99-ba7b-4d37-a8f8-2bca64eb96d3', '77-AP13-17',
        77, 'AP13', '17',
        4,
        9,
        'Lote 17 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 217757.0, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 17',
        'LOTE DE 250 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "17", "ProDes1": "LOTE DE 250 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "217757", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "28621.5", "ProM2": "250", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        '0b4d1fb4-1f51-481c-ac18-208f2b063233', '77-AP13-18',
        77, 'AP13', '18',
        4,
        9,
        'Lote 18 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 18',
        'LOTE DE: 411,60 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "18", "ProDes1": "LOTE DE: 411,60 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        '273adfcd-7a55-4939-bdc3-665e35efbec0', '77-AP13-2',
        77, 'AP13', '2',
        4,
        9,
        'Lote 2 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'CARMEN',
        250.0, 'Manzana AP13', 'Lote 2',
        '', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "2", "ProDes1": "", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        '4eb16dbf-8cc9-4571-bbc1-6106b49817a2', '77-AP13-3',
        77, 'AP13', '3',
        4,
        9,
        'Lote 3 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 182990.65, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 3',
        'LOTE DE 250M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "3", "ProDes1": "LOTE DE 250M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "182990.65", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "16904.669999999998", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        '35025eea-1c55-4908-be95-fd1d331b1654', '77-AP13-5',
        77, 'AP13', '5',
        4,
        9,
        'Lote 5 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 148890.43, 'ARS',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 5',
        'LOTE DE 250M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "5", "ProDes1": "LOTE DE 250M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "148890.43", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "19211.169999999998", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    
    INSERT INTO properties (
        tenant_id, project_id, public_id, code,
        legacy_ed_id, legacy_pis, legacy_dep, legacy_status_id, legacy_type_id,
        title, operation, category, status, price, currency_code,
        city, province, neighborhood, area_m2, sector_name, unit_number,
        description, services_json, commercial_features_json, legacy_data_json
    ) VALUES (
        1, (SELECT id FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'e7b8a8b9-e62b-41a8-8221-162e05e549c6', '77-AP13-6',
        77, 'AP13', '6',
        4,
        9,
        'Lote 6 — Manzana AP13', 'SALE', 'LOT', 'SOLD', 18125.0, 'USD',
        (SELECT city FROM projects WHERE tenant_id = 1 AND legacy_id = 77 LIMIT 1),
        'Jujuy', 'EL CARMEN',
        250.0, 'Manzana AP13', 'Lote 6',
        'LOTE DE 250 M2', '["Agua corriente", "Red el\u00e9ctrica", "Alumbrado p\u00fablico", "Apertura de calles"]', '{"down_payment_min_pct": 30, "installments": [12, 24, 36, 48], "adjustment": "CAC", "cash_discount_pct": 10}', '{"EdId": "77", "ProPis": "AP13", "ProDep": "6", "ProDes1": "LOTE DE 250 M2", "ProDes2": "", "ProTId": "9", "ProEId": "4", "ProPre": "", "ProPor": "", "ProPro": "", "AdmCod": "1", "ProUbic": "EL CARMEN", "ProIEId": "1", "ProIFec": "", "ProComFor": "E", "SocId": "3", "ProComiVend": "", "ProAlqDesc": "", "ProAlqFDesc": "", "ProCoC": "", "ProCoCV": "0", "ProM2": "", "ProCamUsuId": "", "ProCamFec": ""}'
    ) ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        price = VALUES(price),
        status = VALUES(status),
        area_m2 = VALUES(area_m2),
        legacy_data_json = VALUES(legacy_data_json);
    SET FOREIGN_KEY_CHECKS=1;
