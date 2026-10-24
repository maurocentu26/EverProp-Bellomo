# EVP-61 — Implementar flujo guiado de ingreso de proyectos e integración con Web

Rama `ticket/EVP-61-ingreso-proyectos` · commits pendientes de autorización · fecha 2026-10-23 · autor (Antigravity + Mauro)

## 1. Qué pedía el ticket
El objetivo de **EVP-61** es permitir que el equipo de inventario dé de alta un proyecto real en un único recorrido guiado de 5 pasos desde `/admin/desarrollos/nuevo`, integrando la carga de unidades y la preparación de la presentación pública sin publicar nada antes de una decisión explícita.

### Criterios de aceptación
1. **Recorrido guiado de 5 pasos en `/admin/desarrollos/nuevo`:**
   - **1. Datos básicos:** nombre, tipo de proyecto, ubicación, etapa del desarrollo (por defecto `UNKNOWN`), avance de obra opcional (`null` si no fue confirmado) y cantidad de unidades declaradas opcional (`0` si no se informa).
   - **2. Unidades:** carga manual de unidades individuales y generador de lotes por manzana (para loteos) vinculados al proyecto creado, sin crear unidades ficticias al guardar el paso 1.
   - **3. Material comercial:** subida y confirmación de imágenes y documentos PDF aprobados en Cloudflare R2 y descripción pública.
   - **4. Presentación Web:** datos editoriales de la landing (nombre público, categoría editorial, resumen, URL/slug, ubicación pública, portada, logo, galería, características y documentos).
   - **5. Revisión y publicación:** resumen de datos, unidades (cargadas vs. declaradas) y material, distinción clara entre faltantes informativos y requisitos que bloquean la publicación con acciones para volver a corregirlos, guardado de borrador independiente y acción explícita de publicación.
2. **Sin valores inventados ni publicación accidental:**
   - Se elimina el helper que enviaba `status: "UNDER_CONSTRUCTION"`, `progress: 0` o `total_units` ficticios.
   - Crear o guardar un proyecto en el flujo de ingreso registra `project_landing.is_visible = false`. Ni el proyecto ni sus unidades (aunque tengan estado `AVAILABLE` y el proyecto pase a `PRE_SALE` o `UNDER_CONSTRUCTION`) se exponen en `/api/v1/public/*` ni en `PublicInventory` (Bellomito) hasta que un usuario con permiso de publicación publique explícitamente en el paso 5.
3. **Idempotencia durable y reanudación:**
   - Clave de idempotencia (`request_key` UUID) persistida por tenant para el alta de proyectos (`project_intakes`) y el alta manual de unidades (`project_intake_units`), protegiendo ante reintentos de red, recargas o doble envío, y devolviendo `409 Conflict` si se reutiliza la misma clave con otro payload.
   - Posibilidad de retomar ingresos previos desde `/admin/desarrollos/nuevo`.

### Fuera de alcance
- Modificar el catálogo público de la landing fuera del contrato `1.0` existente (`EVP-55`).
- Crear flujos de aprobación multi-etapa o versionado histórico de borradores editoriales.

---

## 2. Qué se implementó

### Esquema de base de datos (scripts forward y contrato)
- [`everprop-api/database/schema/forward/2026-10-23.001_project_intakes.sql`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/database/schema/forward/2026-10-23.001_project_intakes.sql): tabla `project_intakes` con aislamiento por `tenant_id`, `request_key` (`CHAR(36)`), `payload_hash` (`CHAR(64)`) y clave foránea compuesta `(tenant_id, project_id)` hacia `projects`.
- [`everprop-api/database/schema/forward/2026-10-23.002_project_intake_units.sql`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/database/schema/forward/2026-10-23.002_project_intake_units.sql): tabla `project_intake_units` con aislamiento por `tenant_id`, `request_key` (`CHAR(36)`), `payload_hash` (`CHAR(64)`) y claves foráneas compuestas hacia `projects` y `properties`.
- [`everprop-api/config/database-contract.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/config/database-contract.php#L10-L85): actualización del contrato estructural (`tables: 66`, `tenant_tables: 60`, `foreign_keys: 143`).

### Backend (`everprop-api`)
- [`everprop-api/app/Domain/Inventory/Http/Controllers/ProjectIntakeController.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/app/Domain/Inventory/Http/Controllers/ProjectIntakeController.php#L24-L165):
  - `GET /api/v1/admin/project-intakes` (`index`): lista los ingresos del tenant visibles para el usuario autenticado con sus banderas `is_visible`, `can_edit`, `can_publish` y `can_create`.
  - `GET /api/v1/admin/project-intakes/{project}` (`show`): recupera el proyecto, su configuración de `project_landing`, sus `assets` y permisos para reanudar cualquier paso del flujo.
  - `POST /api/v1/admin/project-intakes` (`store`): crea el proyecto dentro de una transacción con idempotencia durable en `project_intakes`, `status = UNKNOWN` por defecto, `progress` anulable y fila inicial en `project_landing` con `is_visible = false`.
  - `POST /api/v1/admin/project-intakes/{project}/units` (`storeUnit`): registra unidades manuales asociadas al proyecto en ingreso con idempotencia durable en `project_intake_units`, estado `UNKNOWN` por defecto y verificación de `ProjectPolicy` + `PropertyPolicy`.
- [`everprop-api/app/Domain/Inventory/Http/Requests/UpdateProjectRequest.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/app/Domain/Inventory/Http/Requests/UpdateProjectRequest.php#L24-L32): permite `progress` nulo (`nullable`) al actualizar datos básicos de un proyecto cuando el avance de obra aún no fue confirmado.
- [`everprop-api/routes/api.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/routes/api.php#L130-L135) y [`everprop-api/openapi.yaml`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/openapi.yaml): registro y documentación de los endpoints `/api/v1/admin/project-intakes`.
- [`everprop-api/tests/Feature/Inventory/ProjectIntakeTest.php`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-api/tests/Feature/Inventory/ProjectIntakeTest.php#L15-L202): suite de pruebas integrales que cubre el recorrido completo (alta → unidades → multimedia R2 → borrador → publicación → consulta en landing y `PublicInventory`), idempotencia durable, conflictos `409`, rollback ante errores `422` y negativas de RBAC y aislamiento multi-tenant.

### Frontend (`everprop-public`)
- [`everprop-public/src/lib/project-intake.ts`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/lib/project-intake.ts#L1-L29) y [`everprop-public/tests/project-intake.test.mjs`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/tests/project-intake.test.mjs#L1-L38): estado inicial sin supuestos comerciales (`status: "UNKNOWN"`, `progress: ""`, `total_units: ""`) y serialización validada (`intakePayload`, `intakeBasics`).
- [`everprop-public/src/app/admin/desarrollos/nuevo/page.tsx`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/app/admin/desarrollos/nuevo/page.tsx#L1-L6) y [`everprop-public/src/components/admin/ProjectIntakeForm.tsx`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/components/admin/ProjectIntakeForm.tsx#L20-L160): flujo guiado de 5 pasos con persistencia de `request_key` en `sessionStorage` ante cortes de red, selector para retomar ingresos existentes, bloqueo de navegación con cambios sin guardar (`dirty` / `beforeunload`) e integración de carga manual y por lotes en el paso 2.
- [`everprop-public/src/components/admin/ProjectWebEditor.tsx`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/components/admin/ProjectWebEditor.tsx#L12-L216) y [`everprop-public/src/app/admin/web/page.tsx`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/app/admin/web/page.tsx#L1-L5): componente compartido entre `/admin/web` y los pasos 3 (`material`), 4 (`presentation`) y 5 (`review`) del ingreso guiado. En el paso 5 presenta el resumen de datos, unidades y material, distingue faltantes informativos de requisitos que bloquean la publicación con botones para volver al paso correspondiente, y ofrece acciones independientes para **Guardar borrador** y **Publicar en Web**.
- [`everprop-public/src/app/admin/desarrollos/page.tsx`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/app/admin/desarrollos/page.tsx), [`everprop-public/src/components/admin/GenerateLotsModal.tsx`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/components/admin/GenerateLotsModal.tsx), [`everprop-public/src/components/admin/NewPropertyForm.tsx`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/components/admin/NewPropertyForm.tsx) y [`everprop-public/src/lib/everprop-api.ts`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/lib/everprop-api.ts): reemplazo del modal de creación con defaults ficticios por el enlace a `/admin/desarrollos/nuevo`, soporte de `intakeMode` en el generador de lotes y soporte de `intakeRequestKey` en el alta manual de unidades.

---

## 3. Por qué esta solución
- **Reutilización máxima (Ponytail):**
  - El paso 2 reutiliza `NewPropertyForm` y `GenerateLotsModal` en lugar de duplicar formularios de inventario.
  - Los pasos 3, 4 y 5 reutilizan `ProjectWebEditor` (extraído de `/admin/web/page.tsx`) y el servicio `ProjectLanding` de `EVP-55` para que las reglas de validación de R2, borradores y publicación web existan en un único lugar.
  - El aislamiento de visibilidad pública reutiliza `Project::scopePubliclyVisible()`, que ya excluye cualquier proyecto y sus unidades de la API pública y de `PublicInventory` cuando existe una fila en `project_landing` con `is_visible = false`.
- **Alternativas descartadas:**
  - *Guardar el borrador solo en `localStorage` hasta el paso 5:* descartado porque impide subir material a R2 con paths aislados por `project.public_id`, impide generar lotes en el paso 2 y pierde el avance si el usuario cambia de dispositivo o navegador.
  - *Idempotencia en memoria/Redis con TTL corto:* descartado porque una recarga o reintento tras expirar el TTL duplicaría el proyecto o la unidad; las tablas `project_intakes` y `project_intake_units` garantizan idempotencia durable con integridad referencial por tenant.

---

## 4. Cómo se verificó

### Backend (`everprop-api` en contenedor `everprop-api-php`)
- `php artisan test --filter=ProjectIntakeTest`: **PASS** (6 tests, 84 assertions).
- `php artisan test --filter=ProjectLandingTest`: **PASS** (20 tests, 161 assertions).
- `php artisan test tests/Feature/Schema/ForwardScriptsTest.php tests/Feature/Inventory/InventoryContractTest.php tests/Feature/Inventory/InventoryWriteGuardsTest.php tests/Feature/Inventory/PublicInventoryTest.php tests/Feature/Identity/TenantIsolationAndRbacTest.php`: **PASS** (22 tests, 124 assertions).
- `vendor/bin/pint --test`: **PASS**.
- `vendor/bin/phpstan analyse --memory-limit=1G`: **PASS** (`[OK] No errors`).

### Frontend (`everprop-public`)
- `node --test tests/project-intake.test.mjs`: **PASS** (3 tests).
- `npx tsc --noEmit`: **PASS** (0 errores).
- `npx eslint` sobre los archivos del ticket: **PASS** (0 errores).
- `npm run build`: **PASS** (compilación de producción y generación de rutas estáticas/dinámicas exitosa, incluyendo `/admin/desarrollos/nuevo` y `/admin/web`).

### Revisiones de seguridad y aislamiento
- **Tenant Isolation & RBAC:** todas las lecturas y escrituras en `ProjectIntakeController` filtran explícitamente por `$this->tenantContext->id()`, usan claves foráneas compuestas `(tenant_id, project_id)` / `(tenant_id, property_id)` y revalidan `ProjectPolicy` y `PropertyPolicy` incluso en reintentos idempotentes (`test_other_tenants_and_roles_cannot_create_or_resume_private_intakes` y `test_retries_recheck_current_creation_and_project_permissions`).
- **Exposición al asistente IA (`PublicInventory`):** verificado mediante aserciones explícitas que `app(PublicInventory::class)->find($tenant->id, $propertyUuid)` devuelve `null` durante los pasos 1 a 4 (incluso con proyecto en `PRE_SALE` y unidad en `AVAILABLE`) y solo devuelve la unidad tras publicar explícitamente en el paso 5 (`is_visible = true`).

---

## 5. Pendientes y riesgos
- **Aplicación de scripts forward en entornos desplegados:** antes de usar el flujo en staging o producción, deben aplicarse en orden `2026-10-23.001_project_intakes.sql` y `2026-10-23.002_project_intake_units.sql`.
- **Verificación de accesos por entorno (staging / producción):** la subida de material comercial en el paso 3 utiliza tickets prefirmados hacia Cloudflare R2 (`EVP-55`). Antes de pasar a producción, verificar orígenes CORS del bucket R2, dominios definitivos de panel/API/landing, Sanctum/cookies y permisos de almacenamiento del entorno correspondiente.
- **Límite del listado de ingresos (`1000`):** `GET /api/v1/admin/project-intakes` aplica un tope explícito de 1000 ingresos por tenant (respondiendo `503` si se supera, en línea con `ProjectLandingController`). Si un tenant supera ese volumen histórico de ingresos guiados, deberá paginarse en un ticket futuro.
