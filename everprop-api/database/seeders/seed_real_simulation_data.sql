-- SEED DATA FOR REAL SIMULATION (BELLOMO REAL USE CASES)
SET FOREIGN_KEY_CHECKS=0;


    UPDATE users SET 
        display_name = 'Lucas Albarracín', 
        email = 'lucas.albarracin@bellomo.com', 
        role_code = 'SALES_ADVISOR', 
        password_hash = '$2y$12$85dtdzwvvgNbSoP8BFEVAeGRrlHkCXz8iF/x9tCxNpl/dp1SAaEH2',
        status = 'ACTIVE' 
    WHERE id = 1;

    UPDATE users SET 
        display_name = 'Valentina Morales', 
        email = 'valentina.morales@bellomo.com', 
        role_code = 'SALES_ADVISOR', 
        password_hash = '$2y$12$85dtdzwvvgNbSoP8BFEVAeGRrlHkCXz8iF/x9tCxNpl/dp1SAaEH2',
        status = 'ACTIVE' 
    WHERE id = 2;

    UPDATE users SET 
        display_name = 'Marcos Bellomo', 
        email = 'admin@bellomo.com', 
        role_code = 'TENANT_ADMIN', 
        password_hash = '$2y$12$85dtdzwvvgNbSoP8BFEVAeGRrlHkCXz8iF/x9tCxNpl/dp1SAaEH2',
        status = 'ACTIVE' 
    WHERE id = 3;

    UPDATE users SET 
        display_name = 'Ing. Sofía Bellomo', 
        email = 'sofia@bellomo.com', 
        role_code = 'SALES_MANAGER', 
        password_hash = '$2y$12$85dtdzwvvgNbSoP8BFEVAeGRrlHkCXz8iF/x9tCxNpl/dp1SAaEH2',
        status = 'ACTIVE' 
    WHERE id = 4;
    
DELETE FROM properties WHERE tenant_id = 1 AND category IN ('LOCAL', 'GARAGE', 'HOUSE', 'APARTMENT');


        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, '08f01a3e-f855-4305-9a77-5b3c9668bfbb', 'LOC-L-01', 70, 'Planta Baja', 'L-01',
            'Local Comercial 1 — San Pablo Plaza', 'RENT', 'LOCAL', 'AVAILABLE', 420000, 'ARS',
            'San Salvador de Jujuy', 'Jujuy', 'San Pablo 1', 'Planta Baja', 'L-01', 68.0,
            'Local comercial sobre avenida principal de acceso a San Pablo 1. Vidriera panorámica de 6m, baño instalado y conexión trifásica.', '{"showcaseLength": 6.0, "hasBathroom": true, "mezzanine": false, "dualAccess": false}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, '62e8f523-5f40-4f65-8341-a9de74111e54', 'LOC-L-02', 70, 'Planta Baja', 'L-02',
            'Local Comercial 2 — Esquina Gastronómica', 'RENT', 'LOCAL', 'RESERVED', 650000, 'ARS',
            'San Salvador de Jujuy', 'Jujuy', 'San Pablo 1', 'Planta Baja', 'L-02', 110.0,
            'Excelente esquina apta gastronomía con doble acceso y entrepiso. Espacio para mesas exteriores.', '{"showcaseLength": 12.0, "hasBathroom": true, "mezzanine": true, "dualAccess": true}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, '372a8320-04e5-4ab7-8869-1d67a95570f6', 'LOC-L-03', 70, 'Paseo Comercial', 'L-03',
            'Local Comercial 3 — San Pablo Paseo', 'RENT', 'LOCAL', 'AVAILABLE', 320000, 'ARS',
            'San Salvador de Jujuy', 'Jujuy', 'San Pablo 1', 'Paseo Comercial', 'L-03', 45.0,
            'Local para rubro servicios o estética en galería comercial. Muy bajas expensas.', '{"showcaseLength": 4.5, "hasBathroom": true, "mezzanine": false, "dualAccess": false}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, '52a0779e-48fa-4886-ad89-347745cb2356', 'LOC-L-04', 70, 'Planta Alta', 'L-04',
            'Local Comercial 4 — Showroom San Pablo', 'RENT', 'LOCAL', 'AVAILABLE', 480, 'USD',
            'San Salvador de Jujuy', 'Jujuy', 'San Pablo 1', 'Planta Alta', 'L-04', 95.0,
            'Showroom u oficinas corporativas con vista abierta al valle.', '{"showcaseLength": 8.0, "hasBathroom": true, "mezzanine": false, "dualAccess": false}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, '85f0dfda-a52c-4657-a222-dfe0edb57638', 'GAR-C-01', 70, 'Subsuelo', 'C-01',
            'Cochera Subsuelo C-01 — San Pablo', 'RENT', 'GARAGE', 'AVAILABLE', 35000, 'ARS',
            'San Salvador de Jujuy', 'Jujuy', 'San Pablo 1', 'Subsuelo', 'C-01', 14.0,
            'Cochera fija cubierta con portón automatizado y cámaras de seguridad 24 hs.', '{"isCovered": true}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, 'eaf33810-94c3-401d-9250-312fdec7ba8d', 'GAR-C-02', 70, 'Subsuelo', 'C-02',
            'Cochera Subsuelo C-02 — San Pablo', 'RENT', 'GARAGE', 'RESERVED', 35000, 'ARS',
            'San Salvador de Jujuy', 'Jujuy', 'San Pablo 1', 'Subsuelo', 'C-02', 14.0,
            'Cochera fija cubierta en subsuelo, excelente maniobrabilidad.', '{"isCovered": true}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, '591ad251-7069-4a49-b0d9-655d0485fe78', 'GAR-C-03', 70, 'Planta Baja', 'C-03',
            'Cochera PB Descubierta C-03', 'RENT', 'GARAGE', 'AVAILABLE', 28000, 'ARS',
            'San Salvador de Jujuy', 'Jujuy', 'San Pablo 1', 'Planta Baja', 'C-03', 12.5,
            'Cochera en playa de estacionamiento con vigilancia privada.', '{"isCovered": false}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, '2436bcf7-3b1e-4fba-8505-e6eef30fc6cd', 'GAR-C-04', 70, 'Planta Baja', 'C-04',
            'Cochera PB Descubierta C-04', 'RENT', 'GARAGE', 'AVAILABLE', 28000, 'ARS',
            'San Salvador de Jujuy', 'Jujuy', 'San Pablo 1', 'Planta Baja', 'C-04', 12.5,
            'Cochera en playa de estacionamiento acceso directo.', '{"isCovered": false}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, '018a1711-9f40-48dd-ab7c-5072f1ba323a', 'GAR-C-05', 70, 'Sector Cocheras', 'C-05',
            'Cochera Cubierta C-05 — Valle Verde', 'RENT', 'GARAGE', 'AVAILABLE', 30000, 'ARS',
            'San Salvador de Jujuy', 'Jujuy', 'Valle Verde', 'Sector Cocheras', 'C-05', 15.0,
            'Cochera techada en predio cerrado de Valle Verde.', '{"isCovered": true}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, 'ac352c91-225b-49d1-9b31-e4c45bffafe9', 'HOU-C-101', 70, 'Residencial', 'C-101',
            'Casa 3 Dormitorios Residencial — Los Perales', 'SALE', 'HOUSE', 'AVAILABLE', 145000, 'USD',
            'San Salvador de Jujuy', 'Jujuy', 'Los Perales', 'Residencial', 'C-101', 220.0,
            'Hermoso chalet con jardín parquizado, quincho con asador y pileta en barrio Los Perales.', '{"bedrooms": 3, "bathrooms": 2}'
        );
        

        INSERT INTO properties (
            tenant_id, project_id, public_id, code, legacy_ed_id, legacy_pis, legacy_dep,
            title, operation, category, status, price, currency_code,
            city, province, neighborhood, sector_name, unit_number, area_m2,
            description, commercial_features_json
        ) VALUES (
            1, 1, 'c2598fd2-1b68-488d-8ff4-802451420f9e', 'APA-3B', 70, 'Torre Nieva', '3B',
            'Departamento 2 Ambientes — Ciudad Nieva', 'SALE', 'APARTMENT', 'AVAILABLE', 58000, 'USD',
            'San Salvador de Jujuy', 'Jujuy', 'Ciudad Nieva', 'Torre Nieva', '3B', 55.0,
            'Departamento luminoso en piso 3 con balcón al frente. Living comedor y dormitorio con placard.', '{"bedrooms": 1, "bathrooms": 1}'
        );
        
DELETE FROM lead_touchpoints WHERE tenant_id = 1;
DELETE FROM visits WHERE tenant_id = 1;
DELETE FROM lead_properties WHERE tenant_id = 1;
DELETE FROM leads WHERE tenant_id = 1;
DELETE FROM contacts WHERE tenant_id = 1;


        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            1, 1, '769f0bf6-414a-416e-8b9f-3df8d60e0018', 'Esteban Benítez', 'esteban.benitez@gmail.com', '+54 9 388 456-7890', 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            1, 1, '9de97deb-8d1d-44ef-bf63-4fa1343f8a66', 1, 1, 1,
            'WhatsApp', 'INBOUND', 'Esteban Benítez — Interés Lote San Pablo 1', 'HIGH', 'QUALIFIED',
            25000, 'USD', 1, NOW(3), NOW(3), 'Ingresó por consulta de WhatsApp. Busca lote de 250m2 para construir vivienda familiar. Consulta por anticipo y 36 cuotas en pesos CAC.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 1, 1, 'b0885ec3-5b0b-427f-a196-2216b065759a', 'WHATSAPP_MESSAGE', 'INBOUND', 'Ingresó por consulta de WhatsApp. Busca lote de 250m2 para construir vivienda familiar. Consulta por anticipo y 36 cuotas en pesos CAC.', NOW(3)
        );
        

        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            2, 1, 'df027e6f-81b2-45ce-9e5c-fbc9c3e2499e', 'Dra. Mariana Tolaba', 'mariana.tolaba@saludjujuy.com', NULL, 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            2, 1, '3cf565f2-6b1d-4278-a116-32dc7839a089', 2, 1, 2,
            'Portal Inmobiliario', 'INBOUND', 'Dra. Mariana Tolaba — Búsqueda Local Médico', 'HIGH', 'QUALIFIED',
            400000, 'ARS', 1, NOW(3), NOW(3), 'Contactó por portal inmobiliario interesada en local comercial en PB para consultorio de kinesiología. Falta completar teléfono celular en ficha.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 2, 2, '6f24c4cb-08a3-4538-96c3-2f009c02a3c1', 'WEB_FORM', 'INBOUND', 'Contactó por portal inmobiliario interesada en local comercial en PB para consultorio de kinesiología. Falta completar teléfono celular en ficha.', NOW(3)
        );
        

        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            3, 1, 'd8c321b2-cb1c-4889-b61b-5d89ff180c75', 'Gonzalo Argañaraz', 'gonzalo.arganaraz@hotmail.com', '+54 9 388 512-3456', 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            3, 1, '570341f2-169c-4fd6-9bff-39fa143c6cb8', 3, 2, 1,
            'Instagram', 'INBOUND', 'Gonzalo Argañaraz — Manzana AP8 Lote 15', 'HIGH', 'QUALIFIED',
            22000, 'USD', 1, NOW(3), NOW(3), 'Primer llamado telefónico muy positivo. Vive en Palpalá y busca construir su primera vivienda en Loteo San Pablo 1. Se le envió plano por WhatsApp.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 3, 3, '2fb10e7f-6f6e-46b4-9c3d-14af03a0698c', 'PHONE_CALL', 'INBOUND', 'Primer llamado telefónico muy positivo. Vive en Palpalá y busca construir su primera vivienda en Loteo San Pablo 1. Se le envió plano por WhatsApp.', NOW(3)
        );
        

        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            4, 1, 'fdb7fd2c-6e98-498b-a913-9a19945b089b', 'Carlos & Viviana Pereyra', 'carlos.pereyra@empresa.com', '+54 9 388 498-1122', 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            4, 1, 'd0c86274-bd32-48d8-89ee-302dc22cc793', 4, 2, 2,
            'Referido', 'INBOUND', 'Familia Pereyra — Cochera y Lote Valle Verde', 'HIGH', 'QUALIFIED',
            18000, 'USD', 1, NOW(3), NOW(3), 'Interesados en combo de lote en Valle Verde + cochera mensual en centro de Jujuy. Acordaron revisar propuesta con su contador.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 4, 4, '9a0c3add-0869-45be-a8d4-74fa0da2d60c', 'PHONE_CALL', 'INBOUND', 'Interesados en combo de lote en Valle Verde + cochera mensual en centro de Jujuy. Acordaron revisar propuesta con su contador.', NOW(3)
        );
        

        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            5, 1, 'e149b2d4-5365-49a5-bd4a-710c91543a98', 'Arq. Jorge Bustos (Martín Fierro S.R.L.)', 'jbustos@bustosarq.com.ar', '+54 9 388 421-9988', 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            5, 1, 'e3f76592-9640-43b1-b06c-6b4d3ea46245', 5, 3, 1,
            'Web', 'INBOUND', 'Arq. Jorge Bustos — 2 Lotes contiguos San Pablo 1', 'HIGH', 'QUALIFIED',
            45000, 'USD', 1, NOW(3), NOW(3), 'Calificado financieramente. Disponen del 60% al contado y solicitan 12 cuotas fijas en dólares por los lotes 11 y 12 de Manzana AP14 para desarrollo propio.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 5, 5, '43400925-19dd-467c-8106-f6e2acd42cc5', 'MANUAL_NOTE', 'INBOUND', 'Calificado financieramente. Disponen del 60% al contado y solicitan 12 cuotas fijas en dólares por los lotes 11 y 12 de Manzana AP14 para desarrollo propio.', NOW(3)
        );
        

        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            6, 1, 'f00feb7e-c129-48f2-a8e4-8a5a9cc38c61', 'Facundo Carrillo', 'facundo.carrillo@outlook.com', '+54 9 388 587-6543', 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            6, 1, '891649ab-ceb8-4626-8a62-81434b10b300', 6, 4, 1,
            'Web', 'INBOUND', 'Facundo Carrillo — Visita a Obra San Pablo 1', 'HIGH', 'QUALIFIED',
            28000, 'USD', 1, NOW(3), NOW(3), 'Visita presencial coordinada para este sábado a las 10:30 hs en el pórtico de acceso de San Pablo 1.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 6, 6, 'b70dd11d-1c81-45d3-bc97-498e92380833', 'PHONE_CALL', 'INBOUND', 'Visita presencial coordinada para este sábado a las 10:30 hs en el pórtico de acceso de San Pablo 1.', NOW(3)
        );
        

        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            7, 1, 'e365a062-d3dd-4bdf-94d6-0a47202a3d8b', 'Ing. Fernando Quispe', 'fquispe@mineriajujuy.com', '+54 9 388 405-2233', 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            7, 1, '496b956a-873a-4ac2-97cf-5c0e42c6a050', 7, 4, 2,
            'WhatsApp', 'INBOUND', 'Ing. Fernando Quispe — Visita Local San Pablo Plaza', 'HIGH', 'QUALIFIED',
            450000, 'ARS', 1, NOW(3), NOW(3), 'Visita técnica agendada para el viernes a las 16:00 hs para revisar potencia eléctrica y acometidas de gas en Local Comercial 1.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 7, 7, 'b6cb61fe-9beb-4ef8-9270-ced6a5783b89', 'WHATSAPP_MESSAGE', 'INBOUND', 'Visita técnica agendada para el viernes a las 16:00 hs para revisar potencia eléctrica y acometidas de gas en Local Comercial 1.', NOW(3)
        );
        

        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            8, 1, '0da76bc6-fee3-49c4-abf5-569c2bc988b8', 'Romina Gutiérrez', 'romi.gutierrez@estudiocivil.com', '+54 9 388 477-8899', 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            8, 1, 'be102797-68a0-4ae5-ad0f-98c1d947c307', 8, 5, 1,
            'Web', 'INBOUND', 'Romina Gutiérrez — Reserva Lote 17 Manzana AP7', 'HIGH', 'QUALIFIED',
            24500, 'USD', 1, NOW(3), NOW(3), 'Propuesta comercial enviada: entrega inicial del 35% y saldo en 24 cuotas ajustables por CAC. Pendiente firma de reserva.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 8, 8, '728760fe-fcfa-41f8-b8b3-bca8c0fddc0c', 'MANUAL_NOTE', 'INBOUND', 'Propuesta comercial enviada: entrega inicial del 35% y saldo en 24 cuotas ajustables por CAC. Pendiente firma de reserva.', NOW(3)
        );
        

        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            9, 1, '19c025f0-b340-4b4c-9fdb-14380e421f78', 'Estudio Jurídico Morales & Asoc.', 'secretaria@moralesabogados.com', '+54 9 388 423-0011', 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            9, 1, 'b358afa5-4666-41ef-b59e-6f9f088cc648', 9, 5, 2,
            'Referido', 'INBOUND', 'Morales & Asoc. — Contrato Alquiler Local 2', 'HIGH', 'QUALIFIED',
            650000, 'ARS', 1, NOW(3), NOW(3), 'Borrador de contrato de locación comercial por 36 meses en revisión legal con garantías propietarias presentadas.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 9, 9, '5033abcb-f368-44c3-a393-edca38be5252', 'EMAIL', 'INBOUND', 'Borrador de contrato de locación comercial por 36 meses en revisión legal con garantías propietarias presentadas.', NOW(3)
        );
        

        INSERT INTO contacts (
            id, tenant_id, public_id, display_name, email, phone_e164, lifecycle_status, first_seen_at, last_seen_at
        ) VALUES (
            10, 1, 'a6dfc0bf-32b5-4cb8-a79a-1d43ca030466', 'Dr. Marcelo Iriarte', 'miriarte@clinicaperico.com.ar', '+54 9 388 501-4455', 'ACTIVE', NOW(3), NOW(3)
        );

        INSERT INTO leads (
            id, tenant_id, public_id, contact_id, stage_id, assigned_user_id,
            source_channel, source_kind, title, priority, qualification,
            budget_max, currency_code, is_open, first_touch_at, last_touch_at, notes
        ) VALUES (
            10, 1, 'f7366489-5f5c-487c-b214-9279709fcc90', 10, 6, 1,
            'WhatsApp', 'INBOUND', 'Dr. Marcelo Iriarte — Venta Lote 1 Manzana AP13', 'HIGH', 'QUALIFIED',
            21500, 'USD', 1, NOW(3), NOW(3), 'Operación cerrada con éxito. Firma de boleto de compraventa y pago de anticipo completados en escribanía.'
        );
        

        INSERT INTO lead_touchpoints (
            tenant_id, lead_id, contact_id, dedupe_key, touchpoint_type, direction, summary, occurred_at
        ) VALUES (
            1, 10, 10, '8081a869-ba58-4d32-b070-052a4cdc8498', 'MANUAL_NOTE', 'INBOUND', 'Operación cerrada con éxito. Firma de boleto de compraventa y pago de anticipo completados en escribanía.', NOW(3)
        );
        

    INSERT INTO visits (
        tenant_id, public_id, lead_id, assigned_user_id, created_by_user_id,
        visit_type, scheduled_at, status, notes
    ) VALUES 
    (1, '89b3bf75-5627-477d-aa0e-d4ae5aacee80', 6, 1, 3, 'PHYSICAL', DATE_ADD(NOW(3), INTERVAL 2 DAY), 'SCHEDULED', 'Recorrido por Manzana AP14 Lote 1 con Facundo Carrillo. Mostrar delimitación y postes de luz.'),
    (1, '37ce902f-4255-4b05-bb7c-b80da51bba48', 7, 2, 3, 'PHYSICAL', DATE_ADD(NOW(3), INTERVAL 1 DAY), 'SCHEDULED', 'Revisión técnica de Local Comercial 1 con Ing. Fernando Quispe.'),
    (1, 'b9c65437-ab67-4bfe-8aa6-bfefcaac3f5b', 3, 1, 3, 'PHYSICAL', DATE_ADD(NOW(3), INTERVAL 5 DAY), 'SCHEDULED', 'Visita de asesoramiento a Gonzalo Argañaraz en Loteo San Pablo 1.');
    
SET FOREIGN_KEY_CHECKS=1;
