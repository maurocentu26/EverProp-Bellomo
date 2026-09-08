# Evidencia de gates backend

Corte final local: 8 de septiembre de 2026 ART. Proyecto Docker aislado `everprop-api-qa-20260908-c`; PHP 8.4, MySQL 8.4, Redis, Nginx y worker healthy. No se usó SQLite ni PHP/Composer del host.

| Gate | Resultado |
|---|---|
| `composer validate --strict` | PASS |
| `composer audit --locked --no-interaction` | PASS, 0 advisories |
| `vendor/bin/pint --test` | PASS, 144 archivos |
| `vendor/bin/phpstan analyse --no-progress` | PASS, 0 errores |
| `php artisan test --no-coverage` | PASS, 62 tests y 216 assertions |
| Schema desarrollo | PASS: 42 tablas, 39 tenant-scoped, 98 FK, 2 procedures, 3 views |
| Schema testing | PASS con los mismos conteos |
| Baseline SHA-256 | PASS: `4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D` |
| Runtime no-root | PASS |
| OpenAPI JSON | PASS |
| Redocly recommended lint | PASS |
| OpenAPI ↔ Laravel | PASS, 55/55 operaciones |
| HTTP local | PASS, 7/7 probes |
| Grants runtime | PASS, sólo DML + `EXECUTE` |
| Imagen production | PASS, 236,539,904 bytes, usuario `everprop`, sin `.env`, `.env.testing` ni PHPUnit |

## Smoke HTTP local

- `/healthz` 200.
- `/readyz` 200.
- `/api/v1/auth/me` anónimo 401.
- Catálogo público projects/properties 200 para `ci-smoke`.
- Query `tenant_id=1` rechazada 422.
- Tenant inexistente rechazado 404.

## Seguridad y datos

- `everprop_app`: `SELECT, INSERT, UPDATE, DELETE, EXECUTE` sólo en `bellomo_crm.*`.
- `everprop_test`: los mismos permisos sólo en `bellomo_crm_test.*`.
- Suite dinámica cubre sesión tenant-bound, logout, cross-tenant, READ_ONLY, advisor ajeno, reasignación, batch fuera de scope, precio sin capability, MIME real, traversal, idempotencia y paginación estable/validada.
- `league/commonmark` se actualizó de 2.9.0 a 2.10.1 y `nette/schema` de 1.3.5 a 1.3.6; audit final 0 advisories.

El bloqueo inicial de Docker fue corregido sin factory reset. Se purgaron 4.205 GB de build cache y se preservaron imágenes/volúmenes ajenos.

Al finalizar se desmontó únicamente `everprop-api-qa-20260908-c`, se eliminaron sus cuatro volúmenes, la imagen production final exacta y los `.env`/secretos/vendor regenerables. Se preservó la imagen local compartida y todo recurso ajeno. La evidencia permanece en este documento; para repetir los gates hay que ejecutar nuevamente el bootstrap aislado.
