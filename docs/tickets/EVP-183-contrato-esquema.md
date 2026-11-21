# EVP-183: alinear el contrato de esquema con producción

Rama `hotfix/evp-183-contrato-esquema` desde `main` @ `63a7cd5` · 2026-11-21 · Mauro Centurión con Claude

## Problema

`php artisan everprop:schema:verify` fallaría en `awake-dedication` aunque la base está bien. El contrato compara números exactos, y producción tiene dos diferencias legítimas con una importación limpia:

| Diferencia | Producción | Contrato de `main` | Por qué |
| --- | --- | --- | --- |
| Tablas | 58 | 55 | `cache`, `cache_locks` y `sessions` las crea Laravel porque ese despliegue guarda sesiones y caché en MySQL. No vienen de los forwards. |
| FKs | 120 | 118 | `fk_properties_legacy_type` y `fk_properties_legacy_status` las crea el forward de inventario solo después de importar el Excel. |

El verificador no corre al arrancar, así que hoy no rompe nada, pero no servía para revisar producción.

## Cambios

- **`SchemaContractVerifier`:**
  - **FKs de inventario:** se porta de `develop` la lógica condicional. Se exigen cuando `inventory_source_imports` tiene filas, y se suma el chequeo `inventory_foreign_keys`. En `develop` entró dentro del commit grande `ea944b5`, que no se portó a `main`.
  - **Tablas de Laravel (nuevo):** `runtime_tables` lista cada tabla y la clave de configuración de su driver. Si `session.driver` o `cache.default` es `database`, esas tablas se suman a las esperadas (cantidad y globales). Si no, no se esperan. Así el contrato pasa en una importación limpia y en `awake-dedication`, y además detecta si faltan cuando el driver las necesita (`production-check` solo mira el driver, no las tablas).
- **`config/database-contract.php`:** agrega `inventory_foreign_keys` y `runtime_tables`. Los números base (55, 50, 118) no cambian.
- **`tests/Feature/SchemaContractVerifierTest.php`:**
  - El test de inventario de `develop`.
  - Un caso nuevo: con drivers `database`, el contrato espera 3 tablas más y falla si no están.
- **`docs/database-contract.md`:** explica los dos casos condicionales.
- **`docs/railway-backend.md`:** la API de `awake-dedication` tiene healthcheck `/readyz` desde el 21/11, y `healthcheck.railway.app` tiene que seguir en `TRUSTED_HOSTS`. Antes decía que no tenía healthcheck.

## Verificación

En un contenedor descartable con el código de esta rama, sobre el MySQL local de `evp174-qa`. Esas bases se habían importado antes de EVP-173, así que primero se les aplicó el forward `2026-09-30.001`.

- `php artisan test --filter SchemaContractVerifierTest`: 2 passed (19 assertions).
- `everprop:schema:verify` en desarrollo y en testing: todo PASS (55 tablas, 50 por tenant, 118 FKs, 0 FKs de inventario sin importación).
- `pint --test` y `phpstan` sobre los archivos tocados: sin errores.
- **Cuenta esperada para producción:**
  - Tablas: 55 + 3 de Laravel = 58.
  - FKs: 118 + 2 de inventario = 120.
  - Globales: las 5 del contrato más `cache`, `cache_locks` y `sessions`.
  - Coincide con lo medido el 19 y el 21/11. Después del deploy se puede correr `schema:verify` en la consola de la API, que solo lee, para confirmarlo.

## Pendiente

- Correr `everprop:schema:verify` en producción después del merge. Además del contrato, revisa que el usuario de la API no sea root (`runtime_not_root`), y ese chequeo no se miró en este ticket.
