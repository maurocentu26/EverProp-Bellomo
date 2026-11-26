# EVP-214 — Unificar Loteo San Pablo 1 y Loteo San Pablo 2 en un único proyecto (Loteo San Pablo)

Rama `ticket/EVP-214-unificar-loteo-san-pablo` · fecha 2026-11-26 · autor Antigravity + Mauro Centurión

## 1. Qué pedía el ticket
Unificar en EverProp los proyectos **Loteo San Pablo 1** (`legacy_id = 70`, slug `loteo-san-pablo-1`) y **Loteo San Pablo 2** (`legacy_id = 73`, slug `loteo-san-pablo-2`) bajo un único proyecto canónico **`Loteo San Pablo`** (slug **`loteo-san-pablo`**) para los tenants de Bellomo (`bellomo` y `bellomito-staging`), sin perder unidades, assets, documentos de conocimiento, intereses de leads ni permisos de inventario, y sin afectar a ningún otro tenant.

Fuera de alcance:
- Baja de Colinas 1 y plantilla estándar de ficha pública (`EVP-162`).
- Redirecciones 301 en la landing externa `everprop-bellomo` (`EVP-164`).
- Unificación de las dos tablas de condiciones comerciales en `bellomo-financing.ts` (se mantienen ambas planes y se agrega el alias `'loteo san pablo'`).

## 2. Qué se implementó
- [2026-11-26.002_unify_loteo_san_pablo.sql](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/database/schema/forward/2026-11-26.002_unify_loteo_san_pablo.sql): forward SQL data-only, transaccional, auditado e idempotente que opera únicamente sobre los tenants `bellomo` y `bellomito-staging`:
  - Identifica el proyecto canónico (`legacy_id = 70` / slug `loteo-san-pablo-1` / nombre `LOTEO SAN PABLO 1`) y el duplicado (`legacy_id = 73` / slug `loteo-san-pablo-2` / nombre `LOTEO SAN PABLO 2`). Si solo existe etapa 2, la promueve a canónica.
  - Audita los cambios en `audit_logs` (`PROJECT_UNIFIED` y `PROJECT_MERGED_INTO_CANONICAL`) antes de modificar filas.
  - Reasigna al proyecto canónico: `properties`, `project_landing_assets` (deduplicando URLs repetidas), `knowledge_documents`, `lead_interests`, `user_inventory_scopes` (combinando permisos con `GREATEST` cuando un usuario ya tenía ambos scopes para evitar colisiones en `uq_user_inventory_scopes_scope`), `project_intakes` (respetando `uq_project_intakes_project`), `project_intake_units` y `project_landing`.
  - Normaliza `projects.name = 'Loteo San Pablo'`, actualiza `projects.total_units`, actualiza `project_landing.slug = 'loteo-san-pablo'` y `project_landing.content.name = 'Loteo San Pablo'`, y hace soft-delete (`deleted_at`) de San Pablo 2.
  - Registra `2026-11-26.002` en `schema_versions`.
- [SeedBellomoOfficialCopy.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/app/Console/Commands/SeedBellomoOfficialCopy.php): reemplaza las entradas `loteo-san-pablo-1` y `loteo-san-pablo-2` por una única entrada `loteo-san-pablo` (`Loteo San Pablo`) mapeada a `legacy_id = 70`, evitando recrear el duplicado en futuras corridas del seeder.
- [ProductionCheck.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/app/Console/Commands/ProductionCheck.php) y [ProductionEnvironmentTest.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/tests/Feature/ProductionEnvironmentTest.php): registra el check `Schema: Loteo San Pablo unified` exigiendo `schema_versions.version = '2026-11-26.002'` en `everprop:production-check --connections`.
- [bellomo-financing.ts](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-public/src/lib/bellomo-financing.ts): agrega el alias `'loteo san pablo' => 'san pablo 1'` en `findFinancingPlan()` para resolver el nuevo nombre canónico.
- [UnifyLoteoSanPabloForwardTest.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/tests/Feature/Inventory/UnifyLoteoSanPabloForwardTest.php): prueba de integración contra MySQL que valida reasignación en todas las tablas FK, manejo de colisiones de llaves únicas, aislamiento de tenants externos, idempotencia en re-ejecución y compatibilidad posterior con `everprop:seed-bellomo-copy`.

## 3. Por qué esta solución
- Se reutilizó el patrón de forward data-only auditado de `EVP-124` (`2026-11-14.001_close_deleted_open_leads.sql`) y el contrato de verificación en `ProductionCheck.php` / `ForwardScriptsTest.php`.
- Se eligió soft-delete (`deleted_at`) sobre el proyecto duplicado en lugar de `DELETE` físico para preservar trazabilidad de `legacy_id = 73` y auditoría; además, `InventorySourceImport` ya fuerza `status = 'UNKNOWN'` si un proyecto borrado reapareciera en un Excel legacy, evitando republicarlo.
- No se modificaron los nombres/planes individuales de financiación (`San Pablo 1` y `San Pablo 2`) porque tienen condiciones comerciales distintas; queda documentado como pendiente si el cliente decide unificar también el plan de financiación.

## 4. Cómo se verificó
Ejecutado sobre `everprop-api-php:local` contra `bellomo_crm_test` (MySQL 8 + Redis):
- `php vendor/bin/phpunit tests/Unit/ForwardScriptsTest.php tests/Feature/Inventory/UnifyLoteoSanPabloForwardTest.php tests/Feature/Inventory/SeedBellomoCopyStatusTest.php tests/Feature/ProductionEnvironmentTest.php` → **OK (11 tests, 162 assertions)**.
- `php vendor/bin/pint --test app/Console/Commands/SeedBellomoOfficialCopy.php app/Console/Commands/ProductionCheck.php tests/Feature/ProductionEnvironmentTest.php tests/Feature/Inventory/UnifyLoteoSanPabloForwardTest.php` → **PASS (4 files)**.
- `php vendor/bin/phpstan analyse app/Console/Commands/SeedBellomoOfficialCopy.php app/Console/Commands/ProductionCheck.php --memory-limit=512M` → **[OK] No errors**.
- `php artisan everprop:schema:verify --env=testing` → **PASS (9/9 checks)**.

Revisión de aislamiento multi-tenant:
- Todas las sentencias del forward filtran explícitamente por `tenants.slug IN ('bellomo', 'bellomito-staging')` y hacen `JOIN` por `tenant_id`; validado en `UnifyLoteoSanPabloForwardTest` con un tenant ajeno que tiene los mismos `legacy_id` (`70` y `73`) y permanece intacto.

No verificado aún:
- Aplicación del forward `2026-11-26.002_unify_loteo_san_pablo.sql` en `staging` ni en `production` (requiere autorización expresa y despliegue posterior al merge).

## 5. Pendientes y riesgos
- **Despliegue a staging (`bellomito-staging`)**: aplicar `2026-11-26.002_unify_loteo_san_pablo.sql` previa autorización expresa del usuario antes o durante el despliegue del código (de lo contrario `everprop:production-check --connections` bloqueará el arranque como está diseñado), y luego correr `php artisan everprop:schema:verify` y `php artisan everprop:production-check --connections`.
- **Paso a producción**: recordar verificar antes del despliegue a producción los forwards SQL pendientes (`schema_versions`), dominios definitivos, CORS/R2, hosts/Sanctum/cookies (`tenant_domains`), credenciales/permisos de proveedores, base de datos y storage.
- **Financiación**: confirmar con el cliente si desea unificar también los planes de financiación `San Pablo 1` (30% / 36 cuotas) y `San Pablo 2` (10% / 48 cuotas) en `bellomo-financing.ts`.
- **Landing externa (`EVP-164`)**: una vez aplicado este forward en staging/producción, desbloquea la ficha unificada y redirecciones 301 de `loteo-san-pablo-1` y `loteo-san-pablo-2` → `loteo-san-pablo`.
