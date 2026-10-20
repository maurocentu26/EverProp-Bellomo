-- EVP-50: follow-up alerts for open leads and re-engagement nudges for advisors.
-- Expand-only and re-runnable. last_active_at records real panel use (sessions outlive logins);
-- last_nudged_at lets one atomic UPDATE claim the single nudge of the day.

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='last_active_at'),
 'ALTER TABLE users ADD COLUMN last_active_at DATETIME(3) NULL, ADD COLUMN last_nudged_at DATETIME(3) NULL, ALGORITHM=INSTANT',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- One row per alert sent. touch_at is the last logged commercial contact (or lead creation), so a new
-- follow-up restarts the cycle and the unique key stops duplicates across overlapping runs.
CREATE TABLE IF NOT EXISTS lead_follow_up_alerts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 lead_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 level VARCHAR(16) NOT NULL,
 touch_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_lead_follow_up_alert (tenant_id, lead_id, user_id, level, touch_at),
 KEY ix_lead_follow_up_alerts_user (tenant_id, user_id, created_at),
 CONSTRAINT fk_lead_follow_up_alerts_lead FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id),
 CONSTRAINT fk_lead_follow_up_alerts_user FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id),
 CONSTRAINT ck_lead_follow_up_alerts_level CHECK (level IN ('DAY2', 'DAY5', 'DAY8', 'DAY10', 'MANAGER_DAY8', 'MANAGER_DAY10'))
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-20.001', 'Lead follow-up alerts and advisor re-engagement nudges');
