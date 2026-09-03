SET @password_hash_exists = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND column_name = 'password_hash'
);

SET @password_hash_ddl = IF(
    @password_hash_exists = 0,
    'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER auth_subject',
    'SELECT 1'
);

PREPARE password_hash_statement FROM @password_hash_ddl;
EXECUTE password_hash_statement;
DEALLOCATE PREPARE password_hash_statement;

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-08-07.001', 'Add nullable password hash to the canonical users table');
