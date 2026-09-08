#!/bin/sh
set -eu
cd /var/www/html
if [ "${APP_ENV:-}" != "production" ]; then
    echo 'Production image requires APP_ENV=production.' >&2
    exit 1
fi
php artisan config:cache
php artisan everprop:production-check --connections
php artisan route:cache
case "${1:-web}" in
    web)
        case "${PORT:-8080}" in *[!0-9]*|'') echo 'PORT must be numeric' >&2; exit 1;; esac
        test "${PORT:-8080}" -ge 1024 && test "${PORT:-8080}" -le 65535
        sed "s/@PORT@/${PORT:-8080}/g" docker/production/nginx.conf > /tmp/everprop-nginx.conf
        nginx -t -c /tmp/everprop-nginx.conf
        exec /usr/bin/supervisord -c docker/production/supervisord.conf
        ;;
    worker) exec php artisan queue:work redis --sleep=2 --tries=3 --timeout=60 --max-time=3600 ;;
    scheduler) exec php artisan schedule:work ;;
    *) exec "$@" ;;
esac
