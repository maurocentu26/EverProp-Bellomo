# EVP-214 — Unificar Loteo San Pablo 1 y Loteo San Pablo 2 en un único proyecto (Loteo San Pablo)

Rama `ticket/EVP-214-unificar-loteo-san-pablo` · fecha 2026-11-26 · autor Antigravity + Mauro Centurión

## 1. Qué pedía el ticket
Unificar en EverProp los proyectos **Loteo San Pablo 1** (`legacy_id = 70`, slug `loteo-san-pablo-1`) y **Loteo San Pablo 2** (`legacy_id = 73`, slug `loteo-san-pablo-2`) bajo un único proyecto canónico **`Loteo San Pablo`** (slug **`loteo-san-pablo`** cuando exista `project_landing`) para los tenants de Bellomo (`bellomo` y `bellomito-staging`), sin perder unidades, assets, documentos de conocimiento, intereses de leads ni permisos de inventario, y sin afectar a ningún otro tenant.

Fuera de alcance:
- Baja de Colinas 1 y plantilla estándar de ficha pública (`EVP-162`).
- Redirecciones 301 en la landing externa `everprop-bellomo` (`EVP-164`).
- Unificación de las dos tablas de condiciones comerciales en `bellomo-financing.ts` (se mantienen ambos planes y se agrega el alias `'loteo san pablo'`).

## 2. Qué se implementó
- [2026-11-26.003_unify_loteo_san_pablo.sql](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/database/schema/forward/2026-11-26.003_unify_loteo_san_pablo.sql): forward SQL data-only, transaccional, auditado e idempotente que opera únicamente sobre los tenants `bellomo` y `bellomito-staging`:
  - Usa versión `2026-11-26.003` porque `2026-11-26.002` ya estaba aplicada en staging (`EVP-212`).
  - Protege con `information_schema.tables` + `PREPARE`/`EXECUTE` las 4 tablas opcionales aún no presentes en producción (`project_landing`, `project_landing_assets`, `knowledge_documents`, `lead_interests`), manteniendo una única migración atómica para staging y producción.
  - Audita los cambios en `audit_logs` (`PROJECT_UNIFIED` y `PROJECT_MERGED_INTO_CANONICAL`) antes de modificar filas.
  - Reasigna al proyecto canónico (`legacy_id = 70`): `properties`, `project_landing_assets` (deduplicando URLs), `knowledge_documents`, `lead_interests`, `user_inventory_scopes` (combinando permisos con `GREATEST` para evitar colisiones en `uq_user_inventory_scopes_scope`), `project_intakes` (respetando `uq_project_intakes_project`), `project_intake_units` y `project_landing`.
  - Normaliza `projects.name = 'Loteo San Pablo'`, actualiza `projects.total_units`, actualiza `project_landing.slug = 'loteo-san-pablo'` y `project_landing.content.name = 'Loteo San Pablo'`, y hace soft-delete (`deleted_at`) de San Pablo 2.
  - Registra `2026-11-26.003` en `schema_versions`.
- [SeedBellomoOfficialCopy.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/app/Console/Commands/SeedBellomoOfficialCopy.php): reemplaza las entradas `loteo-san-pablo-1` y `loteo-san-pablo-2` por una única entrada `loteo-san-pablo` (`Loteo San Pablo`) mapeada a `legacy_id = 70`.
- [ProductionCheck.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/app/Console/Commands/ProductionCheck.php) y [ProductionEnvironmentTest.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/tests/Feature/ProductionEnvironmentTest.php): registra el check `Schema: Loteo San Pablo unified` exigiendo `schema_versions.version = '2026-11-26.003'` en `everprop:production-check --connections`.
- [bellomo-financing.ts](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-public/src/lib/bellomo-financing.ts): agrega el alias `'loteo san pablo' => 'san pablo 1'` en `findFinancingPlan()`.
- [UnifyLoteoSanPabloForwardTest.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/wt-EVP-214/everprop-api/tests/Feature/Inventory/UnifyLoteoSanPabloForwardTest.php): prueba de integración contra MySQL (reasignación, colisiones de llaves únicas, aislamiento multi-tenant, idempotencia y `everprop:seed-bellomo-copy`).

## 3. Por qué esta solución
- Se reutilizó el patrón de forward data-only auditado de `EVP-124` (`2026-11-14.001_close_deleted_open_leads.sql`) y el patrón de guardas por `information_schema.tables` de `2026-09-02.001`.
- Se eligió soft-delete (`deleted_at`) sobre el proyecto duplicado para preservar trazabilidad de `legacy_id = 73` y auditoría; además `InventorySourceImport` fuerza `status = 'UNKNOWN'` si un proyecto borrado reapareciera en un Excel legacy.
- No se unificaron los dos planes de financiación (`San Pablo 1` y `San Pablo 2`) porque tienen condiciones comerciales distintas.

## 4. Cómo se verificó
### Local (`bellomo_crm_test` en MySQL 8 + Redis)
- `php vendor/bin/phpunit tests/Unit/ForwardScriptsTest.php tests/Feature/Inventory/UnifyLoteoSanPabloForwardTest.php tests/Feature/Inventory/SeedBellomoCopyStatusTest.php tests/Feature/ProductionEnvironmentTest.php` → **OK (11 tests, 162 assertions)**.
- `php vendor/bin/pint --test` (4 archivos PHP modificados/nuevos) → **PASS**.
- `php vendor/bin/phpstan analyse app/Console/Commands/SeedBellomoOfficialCopy.php app/Console/Commands/ProductionCheck.php --memory-limit=512M` → **[OK] No errors**.
- `php artisan everprop:schema:verify --env=testing` → **PASS (9/9 checks)**.

### Staging (`bellomito-staging` / `mysql84`, aplicado con autorización expresa del usuario)
- Forward `2026-11-26.003_unify_loteo_san_pablo.sql` aplicado vía `mysql84`:
  - `projects.id = 33` (`legacy_id = 70`) → `name = 'Loteo San Pablo'`, `total_units = 226`, `project_landing.slug = 'loteo-san-pablo'`, `is_visible = 1`, `content.name = 'Loteo San Pablo'`.
  - `properties`: 226 unidades asignadas a `project_id = 33` (0 remanentes en `id = 9`).
  - `projects.id = 9` (`legacy_id = 73`) → soft-deleted (`deleted_at = 2026-11-26 16:22:28.272`), `project_landing` duplicado eliminado.
  - `schema_versions`: `2026-11-26.003` registrada; `audit_logs` `#20` y `#21` creados.
  - `php artisan everprop:production-check --connections` → **OK**.

### Producción (`awake-dedication` / `MySQL`, aplicado con autorización expresa del usuario)
- Forward `2026-11-26.003_unify_loteo_san_pablo.sql` aplicado vía `MySQL`:
  - `projects.id = 1` (`legacy_id = 70`) → `name = 'Loteo San Pablo'`, `total_units = 226`.
  - `properties`: 226 unidades asignadas a `project_id = 1` (0 remanentes en `id = 44`).
  - `projects.id = 44` (`legacy_id = 73`) → soft-deleted (`deleted_at = 2026-11-26 16:23:23.458`).
  - `schema_versions`: `2026-11-26.003` registrada; `audit_logs` `#10` y `#11` creados.
  - `php artisan everprop:production-check --connections` → **OK**.

## 5. Pendientes y riesgos
- **PR abierto para revisión (sin merge):** [#190](https://github.com/maurocentu26/EverProp-Bellomo/pull/190) hacia `develop`.
- **Verificación en navegador:** probar en el panel y catálogo público de staging/producción que `Loteo San Pablo` muestra los 226 lotes y ya no aparece `San Pablo 2`.
- **Paso de código a producción:** al preparar la próxima release a `main`, recordar verificar el resto de los forwards pendientes, dominios definitivos, CORS/R2, hosts/Sanctum/cookies (`tenant_domains`), credenciales y storage.
- **Financiación:** confirmar con el cliente si desea unificar también los planes `San Pablo 1` y `San Pablo 2` en `bellomo-financing.ts`.
- **Landing externa (`EVP-164`):** ya queda desbloqueada en base de datos para completar la ficha unificada y las redirecciones 301 hacia `loteo-san-pablo`.
