#!/usr/bin/env bash
# Levanta el stack local de everprop-api en una sesión cloud (o en cualquier Linux con Docker).
# Mismo camino que el CI (.github/workflows/api.yml): PHP 8.4 + MySQL 8.4 + Redis en Docker Compose,
# baseline inmutable + scripts forward. Sin SQLite (CLAUDE.md) y sin conexiones a staging/producción.
#
# Uso:  bash .claude/cloud/up.sh            # prepara, levanta e importa el esquema
#       bash .claude/cloud/up.sh --prepare  # solo secretos locales + dependencias (lo usa setup.sh)
# Al terminar: docker compose --project-name everprop-api stop   (nunca down --volumes)
set -euo pipefail

log() { printf '[everprop-cloud] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

API="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../everprop-api" && pwd)"
PROJECT="${EVERPROP_CLOUD_PROJECT:-everprop-api}"
PORT="${EVERPROP_CLOUD_HTTP_PORT:-18080}"
COMPOSER_CACHE="${EVERPROP_COMPOSER_CACHE:-/var/cache/everprop-composer}"
BASELINE_SHA256="4c8b170bc6f8b6827e9b85e756acb2254ccf392b0ff4c11459c775366bae472d" # = scripts/import-schema.ps1
cd "$API"
export COMPOSE_PROJECT_NAME="$PROJECT" EVERPROP_RESOURCE_PREFIX="$PROJECT" EVERPROP_PHP_IMAGE="$PROJECT-php:local" HTTP_PORT="$PORT"
dc() { docker compose --project-name "$PROJECT" "$@"; }

ensure_docker() {
  docker info >/dev/null 2>&1 && return
  command -v dockerd >/dev/null || die "Docker no está instalado."
  log "Iniciando dockerd…"
  (dockerd >/var/log/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && return; sleep 1; done
  die "dockerd no respondió en 30 s (ver /var/log/dockerd.log)."
}

# Port de scripts/bootstrap-local.ps1: secretos aleatorios solo para esta VM; nunca se imprimen.
bootstrap_secrets() {
  local dir=.docker/secrets
  [ -f "$dir/initialized" ] && [ -f .env ] && [ -f .env.testing ] && { log "Secretos locales ya presentes."; return; }
  hex() { openssl rand -hex 32; }
  key() { printf 'base64:%s' "$(openssl rand -base64 32)"; }
  local root app test redis webhook
  root=$(hex); app=$(hex); test=$(hex); redis=$(hex); webhook=$(hex)
  # set KEY VALUE FILE: reemplaza la línea KEY=… sin interpretar el valor (base64 trae / y +).
  set_kv() { awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k{print k "=" v; next} {print}' "$3" >"$3.tmp" && mv "$3.tmp" "$3"; }
  fill() { # fill FILE APPKEY DBPASS PORT
    sed -e "s/CHANGE_ME_DB_PASSWORD/$3/" -e "s/CHANGE_ME_REDIS_PASSWORD/$redis/" -e "s/CHANGE_ME_WEBHOOK_SECRET/$webhook/" .env.example >"$1"
    set_kv APP_KEY "$2" "$1"
    set_kv COMPOSE_PROJECT_NAME "$PROJECT" "$1"; set_kv EVERPROP_RESOURCE_PREFIX "$PROJECT" "$1"
    set_kv EVERPROP_PHP_IMAGE "$PROJECT-php:local" "$1"; set_kv HTTP_PORT "$4" "$1"
    set_kv APP_URL "http://127.0.0.1:$4" "$1"
    set_kv SANCTUM_STATEFUL_DOMAINS "127.0.0.1:$4,localhost:$4,127.0.0.1:3000,localhost:3000,127.0.0.1:5173,localhost:5173" "$1"
  }
  umask 077
  fill .env "$(key)" "$app" "$PORT"
  fill .env.testing "$(key)" "$test" "$((PORT + 1))"
  set_kv APP_ENV testing .env.testing; set_kv DB_DATABASE bellomo_crm_test .env.testing; set_kv DB_USERNAME everprop_test .env.testing
  mkdir -p "$dir"
  printf '%s' "$root" >"$dir/mysql_root_password.txt"
  printf '%s' "$app" >"$dir/mysql_app_password.txt"
  printf '%s' "$test" >"$dir/mysql_test_password.txt"
  printf 'user default on >%s ~* &* +@all\n' "$redis" >"$dir/redis.acl"
  printf 'initialized' >"$dir/initialized"
  chmod 0700 "$dir"; chmod 0444 "$dir"/* .env .env.testing # como el CI: los contenedores corren sin root
  grep -qE 'CHANGE_ME_(APP_KEY|DB_PASSWORD|REDIS_PASSWORD|WEBHOOK_SECRET)' .env .env.testing && die "Quedaron placeholders CHANGE_ME_ sin reemplazar."
  log "Secretos locales generados (no se muestran)."
}

prepare() {
  ensure_docker
  bootstrap_secrets
  docker image inspect "$EVERPROP_PHP_IMAGE" >/dev/null 2>&1 || { log "Construyendo imagen PHP 8.4…"; dc build everprop-api-php; }
  if [ ! -f vendor/autoload.php ]; then
    log "composer install…"
    mkdir -p "$COMPOSER_CACHE"
    # Same user as the checkout (CI: api.yml), or composer cannot write vendor/ nor the cache.
    dc run --rm --no-deps --user "$(id -u):$(id -g)" -v "$COMPOSER_CACHE:/tmp/composer" -e COMPOSER_HOME=/tmp/composer -e COMPOSER_PROCESS_TIMEOUT=900 \
      -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/var/www/html \
      everprop-api-php composer install --no-interaction --prefer-dist --no-progress --no-scripts
  fi
  dc run --rm --no-deps everprop-api-init >/dev/null
  dc run --rm --no-deps everprop-api-php php artisan package:discover --ansi >/dev/null
}

mysql_root() { dc exec -T everprop-api-mysql sh -c 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" mysql -uroot --default-character-set=utf8mb4 "$@"' sh "$@"; }

# Port de scripts/import-schema.ps1, idempotente: solo importa si la base está vacía.
import_schema() {
  local tables
  # Done = both databases pass schema:verify; a table count would also skip a half-imported schema.
  if dc exec -T everprop-api-php php artisan everprop:schema:verify >/dev/null 2>&1      && dc exec -T everprop-api-php php artisan everprop:schema:verify --env=testing >/dev/null 2>&1; then
    log "Esquema ya importado y verificado."; return
  fi
  tables=$(mysql_root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema IN ('bellomo_crm','bellomo_crm_test')")
  # Never drop data automatically: a partial import is resolved by hand.
  [ "$tables" = "0" ] || die "Esquema incompleto ($tables tablas) y schema:verify falla: revisar a mano."
  local baseline=database/schema/bellomo_crm_omnichannel_mysql8.baseline.sql
  echo "$BASELINE_SHA256  $baseline" | sha256sum -c --quiet - || die "El baseline no coincide con el hash canónico."
  log "Importando baseline en bellomo_crm y bellomo_crm_test…"
  mysql_root <"$baseline"
  sed -e 's/CREATE DATABASE IF NOT EXISTS bellomo_crm/CREATE DATABASE IF NOT EXISTS bellomo_crm_test/' -e 's/USE bellomo_crm;/USE bellomo_crm_test;/' "$baseline" | mysql_root
  local change db
  for change in $(ls database/schema/forward/*.sql | sort); do
    for db in bellomo_crm bellomo_crm_test; do mysql_root "$db" <"$change" || die "Falló $change en $db."; done
  done
  dc exec -T everprop-api-php php artisan everprop:schema:verify
  dc exec -T everprop-api-php php artisan everprop:schema:verify --env=testing
  log "Baseline y forward importados y verificados."
}

prepare
[ "${1:-}" = "--prepare" ] && { log "Preparación lista."; exit 0; }
log "Levantando stack $PROJECT…"
# nginx brings php, mysql, redis and init; worker and scheduler wait for the schema.
dc up -d --no-build --wait --wait-timeout 240 everprop-api-nginx
import_schema
dc up -d --no-build --wait --wait-timeout 240
log "Listo. Tests: docker compose --project-name $PROJECT exec -T everprop-api-php php artisan test"
