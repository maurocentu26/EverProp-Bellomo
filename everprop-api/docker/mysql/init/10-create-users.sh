#!/bin/sh
(
set -eu

root_password="$(cat /run/secrets/mysql_root_password)"
app_password="$(cat /run/secrets/mysql_app_password)"
test_password="$(cat /run/secrets/mysql_test_password)"

MYSQL_PWD="${root_password}" mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS bellomo_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS bellomo_crm_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'everprop_app'@'%' IDENTIFIED BY '${app_password}';
CREATE USER IF NOT EXISTS 'everprop_test'@'%' IDENTIFIED BY '${test_password}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'everprop_app'@'%';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'everprop_test'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON bellomo_crm.* TO 'everprop_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON bellomo_crm_test.* TO 'everprop_test'@'%';
FLUSH PRIVILEGES;
SQL

unset root_password app_password test_password MYSQL_PWD
)
