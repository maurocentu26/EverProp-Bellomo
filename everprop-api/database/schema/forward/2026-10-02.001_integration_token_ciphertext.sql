-- Per-tenant provider token stored encrypted (Laravel Crypt, APP_KEY) instead of a static config map:
-- needed for Meta Embedded Signup, where each business gets its own token (Tech Provider plan W3).
-- access_token_secret_ref stays as the development/legacy fallback. Expand-only, re-runnable,
-- metadata-only change (nullable column, ALGORITHM=INSTANT).

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='integration_connections' AND COLUMN_NAME='access_token_ciphertext'),
 'ALTER TABLE integration_connections ADD COLUMN access_token_ciphertext TEXT NULL AFTER access_token_secret_ref, ALGORITHM=INSTANT',
 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-10-02.001', 'Encrypted per-tenant provider access token');
