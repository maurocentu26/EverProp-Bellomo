-- EVP-204: optional residential details; safe to replay.
-- properties has a FULLTEXT index, so MySQL 8.4 requires a table copy for this ALTER.
-- Schedule the forward during a maintenance window if the table is large.
SET SESSION lock_wait_timeout = 10;
SET @sql = IF(NOT EXISTS (
 SELECT 1 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='rooms'
),
 'ALTER TABLE properties
  ADD COLUMN rooms SMALLINT UNSIGNED NULL AFTER address,
  ADD COLUMN covered_area_m2 DECIMAL(12,2) NULL AFTER area_m2,
  ADD COLUMN uncovered_area_m2 DECIMAL(12,2) NULL AFTER covered_area_m2,
  ADD COLUMN floor VARCHAR(40) NULL AFTER unit_number,
  ADD COLUMN orientation VARCHAR(80) NULL AFTER floor,
  ADD COLUMN disposition VARCHAR(80) NULL AFTER orientation,
  ADD COLUMN parking_spaces SMALLINT UNSIGNED NULL AFTER disposition,
  ADD COLUMN expenses DECIMAL(18,2) NULL AFTER parking_spaces,
  ADD COLUMN expenses_currency_code CHAR(3) NULL AFTER expenses,
  ADD CONSTRAINT ck_properties_covered_area CHECK (covered_area_m2 IS NULL OR covered_area_m2 > 0),
  ADD CONSTRAINT ck_properties_uncovered_area CHECK (uncovered_area_m2 IS NULL OR uncovered_area_m2 >= 0),
  ADD CONSTRAINT ck_properties_expenses CHECK (
   (expenses IS NULL AND expenses_currency_code IS NULL)
   OR (expenses >= 0 AND expenses_currency_code IN (''USD'', ''ARS''))
  ),
  ALGORITHM=COPY',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-11-25.001', 'Optional residential property details');
