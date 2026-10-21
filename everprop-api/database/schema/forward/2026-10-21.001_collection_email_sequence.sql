-- EVP-53: Ecogas-style sequence per installment. Besides UPCOMING (days before) and the operator's OVERDUE reminder,
-- the scheduler sends DUE_TODAY (on the due date) and PAST_DUE (a few days after, once). Expand-only and re-runnable.

-- Fail fast instead of queueing the scheduler's writes behind a metadata lock (as in 2026-10-15.002). The CHECK
-- change and the STORED column copy this small audit table; run it in a quiet window.
SET SESSION lock_wait_timeout = 10;

-- Widen the kind CHECK in one atomic ALTER (never a window without it), only while it still lacks the new kinds.
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
  AND CONSTRAINT_NAME='ck_collection_email_kind' AND CHECK_CLAUSE NOT LIKE '%PAST_DUE%'),
 'ALTER TABLE collection_email_attempts DROP CHECK ck_collection_email_kind, ADD CONSTRAINT ck_collection_email_kind CHECK (kind IN (''UPCOMING'',''OVERDUE'',''DUE_TODAY'',''PAST_DUE''))', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_collection_email_kind'),
 'ALTER TABLE collection_email_attempts ADD CONSTRAINT ck_collection_email_kind CHECK (kind IN (''UPCOMING'',''OVERDUE'',''DUE_TODAY'',''PAST_DUE''))', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- At most one DUE_TODAY and one PAST_DUE per installment, enforced by the database like UPCOMING (2026-10-15.002):
-- the generated column is the installment for those kinds and NULL otherwise (NULLs never collide in a UNIQUE key).
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_email_attempts' AND COLUMN_NAME='sequence_installment_id'),
 'ALTER TABLE collection_email_attempts ADD COLUMN sequence_installment_id BIGINT UNSIGNED AS (IF(kind IN (''DUE_TODAY'',''PAST_DUE''), installment_id, NULL)) STORED', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collection_email_attempts' AND INDEX_NAME='uq_collection_email_sequence'),
 'ALTER TABLE collection_email_attempts ADD UNIQUE KEY uq_collection_email_sequence (tenant_id, sequence_installment_id, kind), ALGORITHM=INPLACE, LOCK=NONE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-21.001', 'Collection email sequence: DUE_TODAY and PAST_DUE notices, once per installment');
