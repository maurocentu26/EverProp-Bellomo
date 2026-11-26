-- EVP-212: client QA role, limited to assistant test sessions and the conversations it created. Replay-safe.
SET SESSION lock_wait_timeout = 10;

ALTER TABLE users DROP CHECK ck_users_role;
ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role_code IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'SALES_MANAGER', 'SALES_ADVISOR', 'BOT_OPERATOR', 'READ_ONLY', 'ROTATOR', 'ASSISTANT_TESTER'));

INSERT IGNORE INTO schema_versions (version, description)
VALUES ('2026-11-26.002', 'Assistant tester role (EVP-212)');
