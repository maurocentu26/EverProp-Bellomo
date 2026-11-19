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

- En ejecución (se completará con resultados exactos de política CI, grep de exclusiones, MySQL/Docker backend, lint/build/tests de Next.js y QA visual con Playwright/browser).
