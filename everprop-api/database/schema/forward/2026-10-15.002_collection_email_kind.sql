-- EVP-31: the collection email audit records which notice was sent. UPCOMING = installment about to fall due
-- (automatic, at most once per installment); OVERDUE = reminder of an overdue installment (operator-triggered).
-- Existing rows were all overdue reminders. Additive, online and re-runnable.
SET SESSION lock_wait_timeout = 10;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_email_attempts' AND COLUMN_NAME='kind'),
 'ALTER TABLE collection_email_attempts ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT ''OVERDUE'' AFTER installment_id, ALGORITHM=INSTANT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Adding a CHECK cannot be INPLACE in MySQL 8: this copies the table (blocking writes). Fine for this small audit
-- table; kept apart from ADD COLUMN so the column stays INSTANT.
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_collection_email_kind'),
 'ALTER TABLE collection_email_attempts ADD CONSTRAINT ck_collection_email_kind CHECK (kind IN (''UPCOMING'',''OVERDUE''))', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- At most one UPCOMING notice per installment, enforced by the database and not only by the code: the generated
-- column is the installment for UPCOMING rows and NULL otherwise (NULLs never collide in a UNIQUE key).
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_email_attempts' AND COLUMN_NAME='upcoming_installment_id'),
 'ALTER TABLE collection_email_attempts ADD COLUMN upcoming_installment_id BIGINT UNSIGNED AS (IF(kind = ''UPCOMING'', installment_id, NULL)) STORED', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_email_attempts' AND INDEX_NAME='uq_collection_email_upcoming'),
 'ALTER TABLE collection_email_attempts ADD UNIQUE KEY uq_collection_email_upcoming (tenant_id, upcoming_installment_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- "Was this installment already notified?" for the daily upcoming run.
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_email_attempts' AND INDEX_NAME='ix_collection_email_kind'),
 'ALTER TABLE collection_email_attempts ADD KEY ix_collection_email_kind (tenant_id, installment_id, kind), ALGORITHM=INPLACE, LOCK=NONE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-15.002', 'Collection email audit: notice kind (UPCOMING/OVERDUE)');
