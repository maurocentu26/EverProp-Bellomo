-- Migration: Add Bellomo legacy interoperability columns to projects and properties
-- Allows both legacy ERP and EverProp platform to reference and sync records seamlessly

-- 1. Projects: add legacy_id and legacy_data_json
SET @projects_legacy_exists = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'projects'
      AND column_name = 'legacy_id'
);

SET @projects_legacy_ddl = IF(
    @projects_legacy_exists = 0,
    'ALTER TABLE projects 
        ADD COLUMN legacy_id INT UNSIGNED NULL AFTER code,
        ADD COLUMN legacy_data_json JSON NULL AFTER masterplan_image_url,
        ADD UNIQUE KEY uq_projects_tenant_legacy (tenant_id, legacy_id)',
    'SELECT 1'
);

PREPARE projects_legacy_stmt FROM @projects_legacy_ddl;
EXECUTE projects_legacy_stmt;
DEALLOCATE PREPARE projects_legacy_stmt;

-- 2. Properties: add legacy composite fields (EdId, ProPis, ProDep) and metadata
SET @properties_legacy_exists = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'properties'
      AND column_name = 'legacy_ed_id'
);

SET @properties_legacy_ddl = IF(
    @properties_legacy_exists = 0,
    'ALTER TABLE properties 
        ADD COLUMN legacy_ed_id INT UNSIGNED NULL AFTER code,
        ADD COLUMN legacy_pis VARCHAR(40) NULL AFTER legacy_ed_id,
        ADD COLUMN legacy_dep VARCHAR(40) NULL AFTER legacy_pis,
        ADD COLUMN legacy_status_id INT UNSIGNED NULL AFTER legacy_dep,
        ADD COLUMN legacy_type_id INT UNSIGNED NULL AFTER legacy_status_id,
        ADD COLUMN legacy_data_json JSON NULL AFTER commercial_features_json,
        ADD INDEX idx_properties_legacy_lookup (tenant_id, legacy_ed_id, legacy_pis, legacy_dep)',
    'SELECT 1'
);

PREPARE properties_legacy_stmt FROM @properties_legacy_ddl;
EXECUTE properties_legacy_stmt;
DEALLOCATE PREPARE properties_legacy_stmt;

-- 3. Register schema version
INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-09-02.001', 'Add Bellomo legacy interop columns (EdId, ProPis, ProDep, status, data_json) to projects and properties');
