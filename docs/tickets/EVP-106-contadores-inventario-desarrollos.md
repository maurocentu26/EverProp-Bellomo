# EVP-106 — Inventario y Desarrollos: exponer contadores por estado en API, eliminar N+1 de 75 requests y unificar proyectos duplicados vacíos

Rama `ticket/EVP-106-contadores-inventario-desarrollos` · commits `2040d2e`, `a3ca6fa` · fecha 2026-11-03 · autor Antigravity y Mauro Centurión

## 1. Qué pedía el ticket
En local y en staging, las pantallas de Desarrollos (`/admin/desarrollos`) y Matriz de Inventario (`/admin/inventory-matrix`) no mostraban las cantidades reales de unidades disponibles, reservadas y vendidas por tres causas combinadas:
1. `SeedBellomoOfficialCopy` (`everprop:seed-bellomo-copy`) buscaba proyectos únicamente por el nombre comercial en formato título (`Las Colinas 1`, `San Pablo 1`, `Valle Verde`, `Los Cardinales`, etc.), creando duplicados vacíos (`#43` a `#56`) con `0` propiedades y reasignando `project_landing.project_id` a esos duplicados en lugar de los proyectos originales (`#1` a `#30`) donde residen las 3.578 unidades reales.
2. `InventoryFilters::projects()` ordenaba por `created_at DESC, id DESC`, posicionando primero los proyectos recién creados sin inventario por delante de los proyectos con unidades cargadas.
3. `DesarrollosPage` ejecutaba `Promise.all(fetchedProjects.map(project => loadEverpropPropertiesByProject(project.id)))`, disparando ~75 requests HTTP paginadas concurrentes para contar unidades en el navegador y superando el timeout de 10 segundos de `apiFetch`.

### Criterios de aceptación
- `GET /api/v1/admin/projects` y `GET /api/v1/admin/projects/{id}` exponen `available_units_count`, `reserved_units_count`, `sold_units_count` y `properties_count` calculados en SQL (`withCount`).
- Por defecto (cuando no se solicita un `sort` explícito), `InventoryFilters::projects()` prioriza los proyectos con unidades cargadas.
- `/admin/desarrollos` y `ProjectCard` renderizan las cantidades disponibles, reservadas y vendidas en **1 sola petición HTTP** a `/api/v1/admin/projects`.
- `/admin/inventory-matrix` selecciona inicialmente el primer proyecto con `propertiesCount > 0` sin disparar llamadas secuenciales por cada proyecto vacío.
- `everprop:seed-bellomo-copy` resuelve los proyectos canónicos por `legacy_id` / `legacy_name` y limpia duplicados huérfanos sin unidades.

## 2. Qué se implementó
- `everprop-api/app/Domain/Inventory/Http/Controllers/AdminProjectController.php`: agrega `propertyCounts()` con `withCount` por estado (`AVAILABLE`, `RESERVED`, `SOLD`) en `index`, `store`, `show`, `update` y `publish`.
- `everprop-api/app/Domain/Inventory/Http/Resources/ProjectResource.php`: expone `available_units_count`, `reserved_units_count` y `sold_units_count` mediante `whenCounted`.
- `everprop-api/app/Domain/Inventory/Services/InventoryFilters.php`: prioriza los proyectos que tienen propiedades cargadas (`EXISTS (...) DESC`) cuando no se especifica un parámetro `sort` explícito.
- `everprop-api/app/Console/Commands/SeedBellomoOfficialCopy.php`: incorpora `LEGACY_PROJECT_MAP`, `findCanonicalProject()` y `deleteIfOrphanDuplicate()` para vincular cada `slug` de `project_landing` a su proyecto real con inventario y eliminar duplicados huérfanos sin unidades.
- `everprop-public/src/data/admin-sample.ts` y `everprop-public/src/lib/everprop-api.ts`: mapean `available_units_count`, `reserved_units_count` y `sold_units_count` en `Project`.
- `everprop-public/src/components/admin/ProjectCard.tsx`: utiliza los contadores precalculados del proyecto cuando no se pasan unidades cargadas en memoria, manteniendo compatibilidad con el modo mock y tests unitarios.
- `everprop-public/src/app/admin/desarrollos/page.tsx`: solo solicita `loadEverpropPropertiesByProject` para proyectos que no traigan `availableUnitsCount` desde la API (0 requests adicionales en producción/staging/local con la API actualizada).
- `everprop-public/src/app/admin/inventory-matrix/page.tsx`: usa `project.propertiesCount > 0` para elegir el proyecto inicial con unidades sin iterar llamadas de red sobre proyectos vacíos.

## 3. Por qué esta solución
- Calcular los contadores en SQL mediante `withCount` en `AdminProjectController` reduce la carga de `/admin/desarrollos` de ~75 peticiones HTTP (varios MB de JSON) a **1 sola petición**.
- Hacer que `everprop:seed-bellomo-copy` sea idempotente y autolimpiante permite ejecutar el mismo comando en local y en staging para reasociar `project_landing` a los proyectos con inventario real y eliminar los duplicados vacíos de forma segura dentro de una transacción.

## 4. Cómo se verificó
- `docker exec everprop-api-php php artisan everprop:seed-bellomo-copy`: consolidó los 14 proyectos duplicados vacíos (`#43`..`#56`) sobre sus proyectos originales (`#1`, `#2`, `#4`, `#8`, `#9`, `#10`, `#13`, `#16`, `#17`, `#19`, `#20`, `#23`, `#24`, `#28`).
- `node --test tests/projects-redesign.test.mjs tests/lots-matrix-redesign.test.mjs tests/inventory-api.test.mjs`: 18/18 tests en verde.
- `docker exec everprop-api-php php artisan test --filter=TenantIsolationAndRbacTest`: 5/5 tests en verde (42 assertions).
- `docker exec everprop-api-php ./vendor/bin/pint --test ...`: 5/5 archivos en verde.

## 5. Pendientes y riesgos
- Al desplegar en **staging**, ejecutar `php artisan everprop:seed-bellomo-copy` para aplicar la misma consolidación de `project_landing` y limpieza de proyectos duplicados vacíos en la base de datos de staging.
- En la base importada del sistema legado de Bellomo existen 1.264 unidades `AVAILABLE` y 2.314 `SOLD` (`0` en estado `RESERVED`), por lo que el contador de reservadas continuará mostrando `0` hasta que se registren reservas sobre unidades.
