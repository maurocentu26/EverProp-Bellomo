UPDATE users SET password_hash = '$2y$12$mTfLSozwK3zY.3UVysmk2OCYoBMseJVAzg04a5RvMxX2jW5yM5cfK' WHERE id IN (1, 2);

INSERT INTO users (tenant_id, public_id, display_name, email, role_code, status, password_hash)
VALUES (1, UUID(), 'Marcos Bellomo', 'admin@bellomo.com', 'TENANT_ADMIN', 'ACTIVE', '$2y$12$mTfLSozwK3zY.3UVysmk2OCYoBMseJVAzg04a5RvMxX2jW5yM5cfK');

INSERT INTO users (tenant_id, public_id, display_name, email, role_code, status, password_hash)
VALUES (1, UUID(), 'Ing. Sofia', 'sofia@bellomo.com', 'SALES_MANAGER', 'ACTIVE', '$2y$12$mTfLSozwK3zY.3UVysmk2OCYoBMseJVAzg04a5RvMxX2jW5yM5cfK');

SELECT id, public_id, display_name, email, role_code FROM users;
