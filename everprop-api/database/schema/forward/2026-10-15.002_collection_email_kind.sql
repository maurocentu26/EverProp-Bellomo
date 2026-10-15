-- EVP-31: the collection email audit records which notice was sent. UPCOMING = installment about to fall due
-- (automatic, at most once per installment); OVERDUE = reminder of an overdue installment (operator-triggered).
-- Existing rows were all overdue reminders. Additive, online and re-runnable.
SET SESSION lock_wait_timeout = 10;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_email_attempts' AND COLUMN_NAME='kind'),
 'ALTER TABLE collection_email_attempts ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT ''OVERDUE'' AFTER installment_id, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_collection_email_kind'),
 'ALTER TABLE collection_email_attempts ADD CONSTRAINT ck_collection_email_kind CHECK (kind IN (''UPCOMING'',''OVERDUE''))', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- "Was this installment already notified?" for the daily upcoming run.
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_email_attempts' AND INDEX_NAME='ix_collection_email_kind'),
 'ALTER TABLE collection_email_attempts ADD KEY ix_collection_email_kind (tenant_id, installment_id, kind), ALGORITHM=INPLACE, LOCK=NONE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-15.002', 'Collection email audit: notice kind (UPCOMING/OVERDUE)');
