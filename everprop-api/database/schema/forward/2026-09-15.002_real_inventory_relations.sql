-- Optional post-import constraints. Leave pending on empty catalogs or unmatched legacy IDs.
SET @inventory_sql = IF(EXISTS (SELECT 1 FROM inventory_source_imports) AND NOT EXISTS (SELECT 1 FROM properties p LEFT JOIN legacy_property_types c ON c.tenant_id=p.tenant_id AND c.legacy_id=p.legacy_type_id WHERE p.legacy_type_id IS NOT NULL AND c.legacy_id IS NULL) AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND CONSTRAINT_NAME='fk_properties_legacy_type'), 'ALTER TABLE properties ADD CONSTRAINT fk_properties_legacy_type FOREIGN KEY (tenant_id, legacy_type_id) REFERENCES legacy_property_types(tenant_id, legacy_id)', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
SET @inventory_sql = IF(EXISTS (SELECT 1 FROM inventory_source_imports) AND NOT EXISTS (SELECT 1 FROM properties p LEFT JOIN legacy_property_statuses c ON c.tenant_id=p.tenant_id AND c.legacy_id=p.legacy_status_id WHERE p.legacy_status_id IS NOT NULL AND c.legacy_id IS NULL) AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND CONSTRAINT_NAME='fk_properties_legacy_status'), 'ALTER TABLE properties ADD CONSTRAINT fk_properties_legacy_status FOREIGN KEY (tenant_id, legacy_status_id) REFERENCES legacy_property_statuses(tenant_id, legacy_id)', 'SELECT 1');
PREPARE inventory_stmt FROM @inventory_sql;
EXECUTE inventory_stmt;
DEALLOCATE PREPARE inventory_stmt;
INSERT IGNORE INTO schema_versions(version, description)
SELECT '2026-09-15.002', 'Tenant-scoped source type and status foreign keys'
WHERE (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND CONSTRAINT_NAME IN ('fk_properties_legacy_type','fk_properties_legacy_status'))=2;
