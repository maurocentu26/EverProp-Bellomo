-- EVP-23: monthly AI usage per tenant (admin usage panel and the copilot's monthly ceiling, which runs on every
-- draft) filters chatbot_runs by tenant and started_at. The existing indexes start with (tenant_id, session_id) or
-- (tenant_id, conversation_id), so those queries read every run the tenant ever had. Additive, online, re-runnable.
-- Fail fast instead of queueing every query on the table behind a long transaction holding a metadata lock.
SET SESSION lock_wait_timeout = 10;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='chatbot_runs' AND INDEX_NAME='ix_chatbot_runs_tenant_started'),
 'ALTER TABLE chatbot_runs ADD KEY ix_chatbot_runs_tenant_started (tenant_id, started_at), ALGORITHM=INPLACE, LOCK=NONE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-15.001', 'chatbot_runs: index (tenant_id, started_at) for monthly AI usage per tenant');
