-- EVP-15: pending human conversations received while the tenant was closed.
-- Historical rows remain unclassified; do not infer arrival hours from mutable last activity.
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='conversations' AND COLUMN_NAME='waiting_out_of_hours'),
 'ALTER TABLE conversations ADD COLUMN waiting_out_of_hours TINYINT(1) NOT NULL DEFAULT 0, ALGORITHM=INSTANT',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- Correlated inbox summary lookup must not scan the tenant's complete event history per row.
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='domain_outbox' AND INDEX_NAME='ix_domain_outbox_conversation_handoff'),
 'ALTER TABLE domain_outbox ADD INDEX ix_domain_outbox_conversation_handoff (tenant_id, aggregate_type, aggregate_id, event_type, id), ALGORITHM=INPLACE, LOCK=NONE',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-13.001', 'Conversations: out-of-hours pending queue marker');
