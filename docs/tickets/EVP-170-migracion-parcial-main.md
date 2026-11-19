# EVP-170 — Release parcial `develop` → `main`

**Rama:** `release/evp-170-migracion-parcial`, desde `origin/main` (`df243bd`, posterior a EVP-166 `#145` y EVP-167 `#144`). **PR:** hacia `main`.

## Estrategia

No se recorta `develop` ni se reutiliza `release/develop-a-main`: se parte de `origin/main` y se portan por bloques las funcionalidades aprobadas y los fixes de leads, conservando íntegros los hotfixes previos de producción (**EVP-123**, **EVP-166** y **EVP-167**).

## Qué entra

| Bloque | Alcance |
|---|---|
| Guardas de CI | `.github/workflows/ticket-branch.yml` y `.github/scripts/check-pr-policy{,.test}.mjs` para validar la política de `main` en el PR. |
| Base visual y EVP-73 | `admin-catalog.css`, `admin-design.css`, `panel-text-size.css`, `globals.css` (sin reglas de Conversaciones, Visitas ni Conocimiento), `inventoryPriceLabel`, `inventoryPrice`/`inventoryCurrency` y filtros de catálogo. |
| Mi Día | `AdvisorDayGuide`, `advisor-day-guide.ts`, `AdvisorCockpit` (con `agent_id` de EVP-123, filtro de cuotas y plantillas rotativas de EVP-167), navegación `advisor-top-menu`/`advisor-dock`/`advisor-mobile-shell` y botón **Mensaje por wpp** directo a `wa.me` con `cleanPhoneNumber`. |
| Proyectos | Vista de desarrollos y matriz de inventario con contadores por estado/operación (**EVP-106** / **EVP-109**), `UpdateProjectRequest` con `progress` nullable, y alta guiada `ProjectIntakeForm` / `ProjectIntakeController` reducida a **2 pasos** (Datos y Unidades), con forwards `2026-10-23.001` y `2026-10-23.002`. |
| Estadísticas | `/admin/estadisticas`, `StatisticsCharts`, `CommercialStatisticsController`, `LeadAccessPolicy::statistics()`, ruta `commercial-statistics` con `throttle:30,1`, y `is_open`/`won_at`/`lost_at` en `AdminLeadController`, limitado a **Resumen** y **Equipo** (sin métricas de Atención, conversaciones ni IA). |
| Fixes de leads | **EVP-124** (forward `2026-11-14.001_close_deleted_open_leads.sql`, `destroy()` transaccional, check en `ProductionCheck`), **EVP-129** (`ContactIdentityResolver` + concurrencia MySQL), **EVP-133** (`LeadAssignments` + historial/notificaciones), **EVP-134** (`version` + `409 LEAD_VERSION_CONFLICT`), **EVP-135** (`PhoneNumber` E.164, `Idempotency-Key`, reuso de contacto/lead abierto, canal `MANUAL`), **EVP-136** (`LeadAssignedNotification::sendUnassigned`), **EVP-137** (`PublicLeadRequest` exige email o `phone_e164`, más `openapi.yaml`). |
| CI y scripts | `everprop-public/package.json` (`test:statistics`, `test:mi-dia`, `test:projects`) y `.github/workflows/web.yml` alineados al subconjunto portado; `.github/workflows/api.yml` sin cambios. |

## Qué queda excluido

- Conversaciones, WhatsApp Cloud API, Asistente/IA (`AgentRuntime`, `Domain\Conversations`, `Domain\Usage`, `/admin/conversaciones`, `LeadMessagesLink`, `conversation-presentation.ts`, `ConversationKpis`).
- Módulo Web y Conocimiento IA (`ProjectWebEditor`, `project-landing.ts`, tabla/endpoints `project_landing`, `SeedBellomoOfficialCopy`, paso 3+ de material en alta de proyecto).
- Solicitudes de Visita (`VisitRequestsBoard`, `solicitudes-visita`).
- `SeedStatisticsDemo`.

## Pendiente para un segundo release

- **EVP-29** y **EVP-132** (y rediseño completo del panel / bandeja de notificaciones si aplica).
- **EVP-50** (alertas de seguimiento: requiere forward adicional, middleware `TouchLastActive` y web push).
- Paso 3+ de material y módulo Web de proyectos (`project_landing`, `ProjectWebEditor`).
- **EVP-107** / **EVP-110** (importación masiva de inventario).
- Conversaciones, Atención/IA y Solicitudes de Visita.

## Forwards de base de datos y contrato de esquema

En producción (`main`), ejecutar en orden antes o junto al deploy de la API:

1. `everprop-api/database/schema/forward/2026-10-23.001_project_intakes.sql`
2. `everprop-api/database/schema/forward/2026-10-23.002_project_intake_units.sql`
3. `everprop-api/database/schema/forward/2026-11-14.001_close_deleted_open_leads.sql` (solo datos; registra `schema_versions` `2026-11-14.001`)

`everprop-api/config/database-contract.php` parte de `main` y suma únicamente las 2 tablas de ingesta de proyectos: **53 tablas**, **50 con `tenant_id`** y **118 claves foráneas**.

## Verificación

- **Política de PR local (`check-pr-policy.mjs`, `BASE=main HEAD=release/evp-170-migracion-parcial`):** `OK: release/evp-170-migracion-parcial → main`.
- **Tests de política (`node --test .github/scripts/check-pr-policy.test.mjs`):** 4/4 passed.
- **Grep de exclusiones (`ProjectWebEditor|project-landing|project_landing|LeadMessagesLink|conversation-presentation|VisitRequestsBoard|solicitudes-visita|ConversationKpis|SeedBellomoOfficialCopy|SeedStatisticsDemo` en `everprop-api/{app,routes,config}` y `everprop-public/src`):** vacío (0 coincidencias).
- **Backend (`everprop-api`, Docker MySQL 8.4 + Redis 8.2 aislado `evp170-qa` tras importar baseline + 3 forwards):**
  - `php artisan everprop:schema:verify` (entorno desarrollo y `--env=testing`): `PASS` (`53` tablas, `50` con `tenant_id`, `118` FKs, `2` procedimientos, `3` vistas).
  - `vendor/bin/pint --test`: `PASS` (204 archivos).
  - `vendor/bin/phpstan analyse --no-progress --memory-limit=1G`: `[OK] No errors`.
  - Validación `openapi.yaml` (JSON 3.1.0, 35 paths) + `redocly lint /spec/openapi.yaml`: válido (0 errores; 5 warnings preexistentes de `operationId`).
  - `php artisan test --no-coverage`: `175 passed (1195 assertions)`. Incluye `CommercialStatisticsTest`, `DeletedLeadReentryTest`, `LeadAssignmentHistoryTest`, `LeadVersionConflictTest`, `ManualLeadContactTest`, `UnassignedLeadNotificationTest` (adaptado sin canal chatbot/conversaciones), `PublicLeadEndpointTest`, `ContactIdentityConcurrencyMySqlTest`, `TenantIsolationAndRbacTest`, `PublicInventoryTest`, `ProjectIntakeTest` y `ProductionEnvironmentTest`.
- **Frontend (`everprop-public`):**
  - `npm run lint`: 0 errores (solo warnings preexistentes).
  - `npm run build` (`next build` 16.3.6 Turbopack): compilación y chequeo TypeScript exitosos en las 29 rutas (sin `/admin/conversaciones`, `/admin/conocimiento` ni `/admin/solicitudes-visita`).
  - Tests unitarios Node: 99/99 passed (`test:statistics` 1/1, `test:mi-dia` 32/32, `test:projects` 23/23, `leads-api.test.mjs` 5/5, `test:materials` 6/6, `test:password-recovery` 3/3, `login-password`/`logout`/`notifications-worker`/`push-registration`/`text-size-preference` 25/25, `test:collections` 4/4).
- **QA funcional y visual en navegador (`http://127.0.0.1:3000` contra API Docker `127.0.0.1:18170`):**
  - **Asesor (`asesor1@bellomo.invalid`):** aterrizaje en Mi Día (`/admin`), cola priorizada según EVP-166 (`Camila Pereyra` sin contacto -> `Diego Villagra` vencido -> `Valeria Sosa` vence hoy), botón `Mensaje por wpp` como `<a target="_blank">` hacia `https://wa.me/549...` con texto rotativo prellenado, cero links a `Mensajes` o `/admin/conversaciones` en barra superior/menú/dock móvil, sin creación de proyectos en `/admin/desarrollos`.
  - **Administrador (`admin@bellomo.invalid`):** filtro por asesor EVP-123 en Mi Día, tarjetas de `/admin/desarrollos` con contadores de unidades por estado y precios en detalle (con fallback `Precio a confirmar` para precio nulo), matriz de unidades (`12`, `12A`, `13`, `14`), `/admin/desarrollos/nuevo` estrictamente en 2 pasos (`Datos básicos`, `Unidades`) sin paso de material ni etiqueta Publicado/Borrador, `/admin/estadisticas` con pestañas `Resumen` y `Equipo` sin métricas de Atención/IA/conversaciones, `/admin/leads/new` con opción `Carga manual`, y revisión visual en escritorio y móvil (`390x844`) en modo claro y oscuro en Leads, Cobranzas, Propiedades, Agenda y Configuración sin errores de consola ni 5xx.

