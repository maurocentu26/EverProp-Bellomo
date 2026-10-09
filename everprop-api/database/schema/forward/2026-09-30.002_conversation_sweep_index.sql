-- Index for the AI-off sweep in everprop:conversations:reconcile (runs every minute, global across
-- tenants): status = 'OPEN' AND last_inbound_at >= now - N hours ORDER BY last_inbound_at LIMIT 500.
-- Every existing conversations index starts with tenant_id, so that query scanned the table.
-- Expand-only and re-runnable. Apply with a low lock_wait_timeout (go-live.md, "Aplicar el SQL").

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='conversations' AND INDEX_NAME='ix_conversations_sweep'),
 'ALTER TABLE conversations ADD KEY ix_conversations_sweep (status, last_inbound_at), ALGORITHM=INPLACE, LOCK=NONE',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-09-30.002', 'Index for the AI-off conversation sweep');
