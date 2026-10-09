ALTER TABLE users DROP CHECK ck_users_role;
UPDATE user_inventory_settings s JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
SET s.can_manage_inventory = 0, s.can_manage_prices = 0 WHERE u.role_code = 'INVENTORY_MANAGER';
UPDATE users SET role_code = 'ROTATOR' WHERE role_code = 'INVENTORY_MANAGER';
ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role_code IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'SALES_MANAGER', 'SALES_ADVISOR', 'BOT_OPERATOR', 'READ_ONLY', 'ROTATOR'));
