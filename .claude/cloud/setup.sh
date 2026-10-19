#!/usr/bin/env bash
# Setup script del entorno cloud de Claude Code (Ubuntu 24.04, root, se cachea si termina en ~5 min).
# Deja en disco lo caro: imágenes Docker (PHP 8.4, MySQL 8.4, Redis, nginx), vendor/ y node_modules/.
# No arranca servicios (el caché no guarda procesos): en cada sesión, `bash .claude/cloud/up.sh`.
# Red requerida: los dominios "Trusted" del entorno (Docker Hub, GitHub, Packagist, npm) + deb.debian.org + pecl.php.net
# (la imagen PHP instala paquetes y extensiones al construirse).
set -euo pipefail
log() { printf '[everprop-setup] %s\n' "$*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
start=$(date +%s)

# Panel Next.js en paralelo con la imagen PHP (no comparten nada).
( cd "$ROOT/everprop-public" && npm ci --no-audit --no-fund >/tmp/everprop-npm.log 2>&1 \
    && echo ok >/tmp/everprop-npm.status || echo fail >/tmp/everprop-npm.status ) &
npm_pid=$!

bash "$ROOT/.claude/cloud/up.sh" --prepare
( cd "$ROOT/everprop-api" && docker compose --project-name "${EVERPROP_CLOUD_PROJECT:-everprop-api}" pull --quiet everprop-api-mysql everprop-api-redis everprop-api-nginx )

wait "$npm_pid" || true
# npm no bloquea la sesión: el backend es lo que necesita el entorno; el log queda para diagnóstico.
[ "$(cat /tmp/everprop-npm.status 2>/dev/null)" = ok ] && log "npm ci listo." || log "AVISO: npm ci falló (ver /tmp/everprop-npm.log)."
log "Setup terminado en $(( $(date +%s) - start )) s (debe ser < ~300 s para que se cachee)."
