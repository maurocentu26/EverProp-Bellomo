# EVP-123 — Mi Día y Leads: unificar datos entre vista de asesor y vista de administrador filtrada por asesor

Rama `hotfix/evp-123-leads-por-asesor` (→ `main`, desde `origin/main` `d87be50`) · fecha 2026-11-11 · autor: Antigravity (agente) con Mauro Centurión
Ticket Jira [EVP-123](https://eversys.atlassian.net/browse/EVP-123).

## 1. Qué pedía el ticket

En producción (`main`), los contadores y colas de trabajo que veía una administradora al filtrar por un asesor (por ejemplo, **79** "Nuevos sin contactar" para María Jimena Caruso Territoriale) no coincidían con los que veía la propia asesora en su sesión (**145** "Nuevos sin contactar" sobre **160** leads totales, mientras que otro asesor tenía **94**).

Criterios de aceptación:
1. `loadEverpropLeads()` recorre todas las páginas de `/api/v1/admin/leads` (igual que `loadEverpropAllFollowUps()`), y `/api/v1/admin/leads` soporta además filtro opcional `agent_id` para usuarios con permiso de administración.
2. `GET /api/v1/admin/visits/today` y `AdvisorCockpit` respetan el asesor seleccionado (`globalSelectedAgentId`) cuando un administrador filtra por asesor.
3. El contador de cuotas vencidas, el widget `Balance del Mes & Números` en `AdvisorCockpit`, la vista `/admin/leads` (`stageCounts`) y `/admin/cobranzas` reflejan el total real de leads y cuotas del asesor seleccionado sin truncarse en los primeros 200 registros globales.
4. Verificación con carga masiva (>250 leads distribuidos entre asesores) comprobando coincidencia 1:1 entre la sesión del administrador filtrada por cada asesor y la sesión propia de cada asesor.

Fuera de alcance: cambios en el motor de IA/Conversaciones o en las reglas de asignación del rotador.

## 2. Qué se implementó

- [`everprop-public/src/lib/everprop-api.ts`](../../everprop-public/src/lib/everprop-api.ts):
  - `loadEverpropLeads()` deja de fijar `maxPages = 1` en `loadAllCrmPages<ApiLead>("/api/v1/admin/leads")`, descargando todas las páginas hasta `meta.next_page === null` y admitiendo opcionalmente `filters?.agentId`.
  - `loadEverpropTodayVisits(agentId?: string)` envía `?agent_id=` cuando se filtra por un asesor específico.
- [`everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php`](../../everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php):
  - `index()` mantiene el aislamiento obligatorio `leads.assigned_user_id = $user->id` para `RoleCode::SALES_ADVISOR` y agrega soporte opcional de `?agent_id=` (`unassigned` o UUID/ID de asesor activo del mismo tenant) para roles administrativos.
- [`everprop-api/app/Domain/CRM/Http/Controllers/AdminVisitController.php`](../../everprop-api/app/Domain/CRM/Http/Controllers/AdminVisitController.php):
  - `query()` aplica el mismo filtro de asesor (`v.assigned_user_id` y consistencia con `l.assigned_user_id`) cuando un rol no asesor envía `?agent_id=`, unificando el conteo de `GET /api/v1/admin/visits/today` con la sesión del asesor.
- [`everprop-public/src/components/admin/advisor/AdvisorCockpit.tsx`](../../everprop-public/src/components/admin/advisor/AdvisorCockpit.tsx):
  - Pasa el asesor seleccionado (`globalSelectedAgentId`) a `loadEverpropTodayVisits(...)` y recarga las citas del día al cambiar el selector.
  - Filtra `overdueInstallmentsCount` por `globalSelectedAgentId` cuando el usuario es `ADMIN`.
  - Pasa `leads={myLeads}` (en lugar de `leads` sin filtrar) a `AdminMonthBalanceWidget`.
  - Agrega el selector de asesor también en la cabecera móvil (`sm:hidden`) para usuarios `ADMIN`.
- [`everprop-public/src/app/admin/leads/page.tsx`](../../everprop-public/src/app/admin/leads/page.tsx):
  - Sincroniza `advisorFilter` con `globalSelectedAgentId` (`useDashboardMode`), incorpora la nómina completa de `useLeadAdvisors` en el selector, filtra `stageCounts` por `advisorFilter` y elimina el botón manual `handleLoadMore` que re-consultaba `page=2` sobre una lista ya completa.
- [`everprop-public/src/app/admin/cobranzas/page.tsx`](../../everprop-public/src/app/admin/cobranzas/page.tsx):
  - Filtra `visibleAgreements` y `visibleInstallments` por `globalSelectedAgentId` cuando un administrador tiene seleccionado un asesor.
- Tests:
  - [`everprop-public/tests/leads-api.test.mjs`](../../everprop-public/tests/leads-api.test.mjs)
  - [`everprop-api/tests/Feature/CRM/TodayVisitsTest.php`](../../everprop-api/tests/Feature/CRM/TodayVisitsTest.php)

Sin cambios de esquema, migraciones ni variables de entorno.

## 3. Por qué esta solución

- Reutiliza `loadAllCrmPages` ya existente en `everprop-api.ts` (usado por `loadEverpropAllFollowUps`, `loadEverpropVisits` y `loadEverpropNotifications`), evitando que el filtro en memoria de `AdvisorCockpit` opere sobre una muestra truncada de 200 leads globales.
- Reutiliza en `AdminVisitController::query()` la misma condición SQL que ya rige para `RoleCode::SALES_ADVISOR`, garantizando que `meta.total` y `data` de `/api/v1/admin/visits/today` coincidan exactamente entre ambas vistas.

## 4. Cómo se verificó

- **Frontend (`everprop-public`)**:
  - `npx eslint src tests` → **0 errores**.
  - `node --test tests/*.test.mjs` → **60 tests ejecutados, 60 aprobados, 0 fallos** (incluyendo el escenario de 266 leads en 2 páginas donde un asesor tiene 160 leads totales / 145 nuevos repartidos entre la página 1 y la página 2).
- **Backend (`everprop-api` en contenedor Docker PHP 8.4 + MySQL 8.4)**:
  - `vendor/bin/pint --test` → **PASS** (3 archivos).
  - `vendor/bin/phpstan analyse` sobre los controladores modificados → **[OK] No errors**.
  - `php artisan test --filter=TodayVisitsTest` → **11 tests aprobados (117 aserciones)**, incluyendo `test_bulk_multi_advisor_leads_match_exactly_between_admin_filter_and_advisor_views` con **254 leads** cargados (160 de la asesora 1 —145 nuevos y 15 contactados repartidos entre las páginas 1 y 2— y 94 nuevos del asesor 2), verificando identidad 1:1 de IDs y conteos por etapa entre la vista de Admin filtrada por cada asesor y la sesión propia de cada asesor.

## 5. Pendientes y riesgos

- Después de revisar e integrar el hotfix en `main`, sincronizar `main` hacia `develop` (según `TICKETS.md`).
- Riesgo bajo: la paginación recorre páginas de 200 registros igual que `follow-ups` y `visits`, manteniendo el aislamiento por tenant y por rol de asesor intacto.
