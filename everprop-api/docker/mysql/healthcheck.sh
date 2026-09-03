#!/bin/sh
set -eu
MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" mysqladmin ping --protocol=socket -uroot --silent >/dev/null
