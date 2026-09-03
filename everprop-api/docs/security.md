# Seguridad

## Autenticación SPA

El backoffice usa Sanctum stateful con cookie de sesión y protección CSRF; no se emiten tokens bearer. El flujo es:

1. `GET /sanctum/csrf-cookie` con `credentials: include`.
2. Leer la cookie `XSRF-TOKEN`, decodificarla y enviarla como `X-XSRF-TOKEN`.
3. `POST /api/v1/auth/login` con `email` y `password` desde un origen incluido en `CORS_ALLOWED_ORIGINS`.
4. Mantener `credentials: include` en las llamadas administrativas.
5. `POST /api/v1/auth/logout` invalida la sesión y rota el token CSRF.

La cookie de sesión es HttpOnly, cifrada y `SameSite=Lax`. `SESSION_SECURE_COOKIE=true` es obligatorio con HTTPS. El registro público y el reset de contraseña no están expuestos.

## Tenant confiable

En producción el tenant se resuelve por hostname mediante `TENANT_HOST_MAP_JSON`; una sesión autenticada debe pertenecer al mismo tenant. `X-Everprop-Tenant` sólo funciona cuando el entorno es `local` o `testing` y `TENANT_ALLOW_LOCAL_RESOLVER=true`. `tenant_id` está prohibido en body y query.

## Webhooks

El emisor firma `timestamp.idempotency_key.raw_body` con HMAC-SHA256. Encabezados:

- `X-Everprop-Timestamp`: Unix epoch de 10 dígitos.
- `X-Everprop-Signature`: `sha256=<hex>`.
- `X-Webhook-Idempotency-Key`: clave estable del delivery.
- `X-Request-Id`: opcional.

La referencia almacenada en `integration_connections.webhook_secret_ref` debe coincidir con `WEBHOOK_SECRET_REF`; el secreto vive únicamente en `WEBHOOK_SECRET`. Se aplican ventana temporal, comparación constante, deduplicación por integración y persistencia durable antes de encolar.

## Controles operativos

- MySQL y Redis no publican puertos al host; PHP-FPM tampoco.
- La aplicación usa DML/`EXECUTE`, no root ni DDL.
- Errores tenant-aware devuelven 404 sin confirmar existencia cross-tenant.
- Validación por allowlist, límites de payload, paginación máxima 100 y rate limits.
- Archivos privados, MIME inspeccionado, nombres aleatorios y paths tenant-safe.
- No se registran payloads de leads, firmas, cookies, contraseñas ni secretos. Los receipts conservan el cuerpo raw por contrato de auditoría; su retención es configurable.
- `APP_DEBUG=false` fuera de desarrollo y trusted hosts obligatorios en producción.

## Variables sensibles

`.env`, `.env.testing` y `.docker/secrets/` están ignorados. `.env.example` sólo contiene placeholders. Los secretos se generan localmente con `scripts/bootstrap-local.ps1` y no se imprimen.

Variables operativas principales:

- App/HTTP: `APP_KEY`, `APP_URL`, `HTTP_PORT`, `TRUSTED_HOSTS`.
- Tenant/CORS: `TENANT_HOST_MAP_JSON`, `TENANT_ALLOW_LOCAL_RESOLVER`, `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS`.
- MySQL: `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.
- Redis: `REDIS_HOST`, `REDIS_PASSWORD`, DBs separados para cache, sesión y queue.
- Cookies: `SESSION_SECURE_COOKIE`, `SESSION_DOMAIN`, `SESSION_SAME_SITE`.
- Webhooks: `WEBHOOK_SECRET_REF`, `WEBHOOK_SECRET`, tolerancia, payload máximo, retención y queue.
- Medios: `PRIVATE_FILES_DISK` y placeholders AWS/R2 cuando el disk sea `s3`.
