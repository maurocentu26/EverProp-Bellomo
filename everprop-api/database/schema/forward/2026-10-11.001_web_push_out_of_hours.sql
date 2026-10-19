-- EVP-L02: each advisor chooses per device whether web push still arrives outside the tenant's business hours.
-- 1 = receive (current behaviour, so existing devices keep getting alerts). Expand-only, re-runnable,
-- metadata-only change (NOT NULL with a constant default, ALGORITHM=INSTANT on MySQL 8.4).

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='web_push_subscriptions' AND COLUMN_NAME='out_of_hours'),
 'ALTER TABLE web_push_subscriptions ADD COLUMN out_of_hours TINYINT(1) NOT NULL DEFAULT 1, ALGORITHM=INSTANT',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-11.001', 'Web push: per-device choice to receive alerts outside business hours');
