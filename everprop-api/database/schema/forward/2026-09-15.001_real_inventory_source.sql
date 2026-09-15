-- Rerunnable preparation only. No inventory records or baseline are imported here.
CREATE TABLE IF NOT EXISTS inventory_source_imports (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL, source_sha256 CHAR(64) NOT NULL,
 source_name VARCHAR(255) NOT NULL, workbook_json JSON NOT NULL, report_json JSON NOT NULL,
 imported_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_inventory_source (tenant_id, source_sha256),
 FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS legacy_property_types (
 tenant_id BIGINT UNSIGNED NOT NULL, legacy_id INT UNSIGNED NOT NULL,
 label VARCHAR(160) NOT NULL, source_row INT UNSIGNED NOT NULL, data_json JSON NOT NULL,
 PRIMARY KEY (tenant_id, legacy_id), FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS legacy_property_statuses LIKE legacy_property_types;
CREATE TABLE IF NOT EXISTS legacy_localities LIKE legacy_property_types;
SET @inventory_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='legacy_property_statuses' AND CONSTRAINT_NAME='fk_legacy_status_tenant'), 'ALTER TABLE legacy_property_statuses ADD CONSTRAINT fk_legacy_status_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
SET @inventory_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='legacy_localities' AND CONSTRAINT_NAME='fk_legacy_locality_tenant'), 'ALTER TABLE legacy_localities ADD CONSTRAINT fk_legacy_locality_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
SET @inventory_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND INDEX_NAME='uq_properties_legacy_source'), 'ALTER TABLE properties ADD UNIQUE KEY uq_properties_legacy_source (tenant_id, legacy_ed_id, legacy_pis, legacy_dep)', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
SET @inventory_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_properties_status' AND CHECK_CLAUSE LIKE '%NOT_SELLABLE%'), 'ALTER TABLE properties DROP CHECK ck_properties_status, ADD CONSTRAINT ck_properties_status CHECK (status IN (''AVAILABLE'',''RESERVED'',''SOLD'',''RENTED'',''NOT_SELLABLE'',''NOT_MARKETED'',''UNKNOWN''))', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
SET @inventory_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_properties_operation' AND CHECK_CLAUSE LIKE '%UNKNOWN%'), 'ALTER TABLE properties DROP CHECK ck_properties_operation, ADD CONSTRAINT ck_properties_operation CHECK (operation IN (''SALE'',''RENT'',''TEMPORARY'',''LEASING'',''UNKNOWN''))', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
SET @inventory_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_properties_category' AND CHECK_CLAUSE LIKE '%UNKNOWN%'), 'ALTER TABLE properties DROP CHECK ck_properties_category, ADD CONSTRAINT ck_properties_category CHECK (category IN (''LOT'',''GARAGE'',''LOCAL'',''TRADITIONAL'',''APARTMENT'',''HOUSE'',''UNKNOWN''))', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
SET @inventory_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_projects_status' AND CHECK_CLAUSE LIKE '%UNKNOWN%'), 'ALTER TABLE projects DROP CHECK ck_projects_status, ADD CONSTRAINT ck_projects_status CHECK (status IN (''PLANNING'',''PRE_SALE'',''UNDER_CONSTRUCTION'',''COMPLETED'',''AVAILABLE'',''UNKNOWN''))', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
SET @inventory_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_user_inventory_scopes_category' AND CHECK_CLAUSE LIKE '%UNKNOWN%'), 'ALTER TABLE user_inventory_scopes DROP CHECK ck_user_inventory_scopes_category, ADD CONSTRAINT ck_user_inventory_scopes_category CHECK (category_code IS NULL OR category_code IN (''LOT'',''GARAGE'',''LOCAL'',''TRADITIONAL'',''APARTMENT'',''HOUSE'',''UNKNOWN''))', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
SET @inventory_sql = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='projects' AND COLUMN_NAME='progress' AND IS_NULLABLE='NO'), 'ALTER TABLE projects MODIFY progress TINYINT UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
INSERT IGNORE INTO schema_versions(version, description) VALUES ('2026-09-15.001', 'Inventory source archive, catalogs and non-commercial/unknown states');
