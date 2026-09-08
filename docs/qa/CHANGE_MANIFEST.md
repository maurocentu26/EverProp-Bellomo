# Manifiesto de cambios de la rama de auditoría

La rama `codex/preproduction-audit-20260908` integra `origin/main@bf7018118ee683725c20d43e472b0722f05708af` sobre el checkpoint QA `9e43ee8`. No se modificó `main` ni una rama de Mauro; no hubo deploy.

## Backend

| Archivo | Razón |
|---|---|
| `everprop-api/app/Console/Commands/SetupSimulationDatabaseCommand.php` | Restringir setup a local/testing, verificar baseline y no imprimir credenciales. |
| `everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php` | Capabilities, scope advisor, tenancy explícita, asignación segura, paginación y rechazo 422 si el tenant no tiene etapa activa. |
| `everprop-api/database/schema/forward/2026-09-08.001_reserve_bellomo_ap8_lots_17_18.sql` | Aplicar a bases existentes la reserva AP8 17/18 sin alterar el baseline. |
| `everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadFollowUpController.php` | RBAC/tenant, errores seguros, eliminación de DDL durante request y paginación global/por lead. |
| `everprop-api/app/Domain/CRM/Services/PublicLeadService.php` | Construir nombre de notificación desde el payload validado. |
| `everprop-api/app/Domain/Identity/Http/Controllers/AdminNotificationController.php` | Ajustar el contrato real de datos tipados de notificaciones. |
| `everprop-api/app/Domain/Inventory/Http/Controllers/AdminPropertyController.php` | Autorizar batch por scope y flags de precio; rechazar tenant inyectado. |
| `everprop-api/app/Domain/Inventory/Models/Project.php` | Documentar atributos legacy para análisis estático. |
| `everprop-api/app/Domain/Inventory/Models/Property.php` | Documentar atributos legacy para análisis estático. |
| `everprop-api/app/Domain/Tenancy/Http/Middleware/ResolveTenant.php` | Rechazar `tenant_id` controlado por cliente. |
| `everprop-api/bootstrap/app.php` | Restaurar CSRF stateful y devolver 401 JSON seguro. |
| `everprop-api/docker/mysql/init/10-create-users.sh` | Least privilege para usuarios app/test. |
| `everprop-api/composer.lock` | Resolver cuatro advisories HIGH: commonmark 2.10.1 y nette/schema 1.3.6. |
| `everprop-api/config/database-contract.php` | Alinear conteos verificables con baseline más SQL forward-only. |
| `everprop-api/openapi.yaml` | Documentar 55/55 operaciones, schemas CRM/batch/notificaciones, paginación/422 y alias PUT deprecated. |
| `everprop-api/routes/api.php` | Eliminar setup HTTP y DELETE lead sin controller. |
| `everprop-api/routes/web.php` | Eliminar setup HTTP público. |
| `everprop-api/tests/Feature/Identity/AuthenticationTest.php` | Afirmar 401 estable sin stack/file/trace. |
| `everprop-api/tests/Feature/CRM/AdminLeadAuthorizationTest.php` | Regresiones READ_ONLY, IDOR advisor, ASSIGN, validación y tenant sin pipeline. |
| `everprop-api/tests/Feature/CRM/AdminLeadPaginationTest.php` | Regresiones multipágina, metadata, orden estable y límites 422. |
| `everprop-api/tests/Feature/CRM/PublicLeadEndpointTest.php` | Alinear la aserción con el rechazo global de `tenant_id`. |
| `everprop-api/tests/Feature/Inventory/AdminPropertyBatchAuthorizationTest.php` | Regresiones scope y permisos de precio. |
| `everprop-api/tests/Feature/Security/ReleaseSecurityRegressionTest.php` | Regresión de rutas setup, entorno del comando y CSRF. |

## Frontend

| Archivo | Razón |
|---|---|
| `everprop-public/.env.example` | Documentar gates QA/local seguros. |
| `everprop-public/.gitignore` | Excluir traces/reportes generados de Playwright. |
| `everprop-public/next.config.ts` | Rewrites health/ready y headers defensivos. |
| `everprop-public/package.json` | Actualizar dependencias, agregar Vitest/Playwright y scripts. |
| `everprop-public/package-lock.json` | Lock reproducible de dependencias corregidas. |
| `everprop-public/src/app/admin/agenda/page.tsx` | No mostrar agenda local como real en modo API. |
| `everprop-public/src/app/admin/comercial/page.tsx` | Fallo de catálogo visible, sin demo silenciosa. |
| `everprop-public/src/app/admin/desarrollos/[id]/page.tsx` | Datos API estrictos y batch con ID backend. |
| `everprop-public/src/app/admin/inventory-matrix/page.tsx` | Catálogo/API estrictos y mensajes de error. |
| `everprop-public/src/app/admin/leads/page.tsx` | Sin fallback demo; etapas/follow-ups post-éxito y acciones según capabilities. |
| `everprop-public/src/app/admin/page.tsx` | Dashboard correcto por rol/modo y fallos visibles. |
| `everprop-public/src/app/admin/properties/page.tsx` | Catálogo estricto, feedback de error y alta según capability. |
| `everprop-public/src/app/admin/settings/page.tsx` | Guard `manageUsers`; deshabilitar falso guardado y aviso API. |
| `everprop-public/src/app/login/page.tsx` | Separación mock/API, sin password embebido, perfiles locales gated. |
| `everprop-public/src/components/admin/AdminNavbar.tsx` | Acciones por capability, polling Laravel autenticado y navegación de notificaciones segura; sin SSE global. |
| `everprop-public/src/components/admin/EditPropertyModal.tsx` | Propagar versión/error real. |
| `everprop-public/src/components/admin/EnterpriseDashboard.tsx` | Evitar métricas/fallbacks ficticios en API. |
| `everprop-public/src/components/admin/GenerateLotsModal.tsx` | Project backend ID, validación y error visible. |
| `everprop-public/src/components/admin/LeadDetailView.tsx` | Mutaciones sólo tras éxito/capability; sin fallback demo; visitas deshabilitadas. |
| `everprop-public/src/components/admin/LeadKanban.tsx` | Rollback/error visible y drag deshabilitado sin `update`. |
| `everprop-public/src/components/admin/LeadTable.tsx` | Etapas y seguimiento deshabilitados sin `update`. |
| `everprop-public/src/components/admin/NewLeadDrawer.tsx` | Validación/mutación API sin falso éxito y lint. |
| `everprop-public/src/components/admin/NewLeadForm.tsx` | API estricta, asociación real, guard create/update y asignación sólo con `assign`. |
| `everprop-public/src/components/admin/NewPropertyForm.tsx` | Guard create/inventario, project ID real y error visible. |
| `everprop-public/src/components/admin/PropertyCard.tsx` | Estado default coherente. |
| `everprop-public/src/components/admin/PropertyDetailView.tsx` | Versión/estado correctos, visita no falsa y edición capability-aware. |
| `everprop-public/src/components/admin/VisitManager.tsx` | Validación/lint y separación de función demo. |
| `everprop-public/src/components/admin/advisor/AdvisorCockpit.tsx` | Datos API estrictos, mensajes de error y modo consulta para READ_ONLY. |
| `everprop-public/src/components/admin/kanban/KanbanCard.tsx` | Sortable inactivo cuando falta `update`. |
| `everprop-public/src/components/admin/dashboard-widgets/ProjectsOverviewWidget.tsx` | Convertir “Ver detalle” muerto en link funcional. |
| `everprop-public/src/components/admin/navbar/GlobalSearch.tsx` | Sin fallback mock en API y error visible. |
| `everprop-public/src/components/sidebar/navigation.ts` | Ocultar módulos sin persistencia/capability. |
| `everprop-public/src/components/sidebar/sidebar-simulations.tsx` | Simulador sólo development+mock+opt-in. |
| `everprop-public/src/data/admin-sample.ts` | Inventario Bellomo de 73 lotes, textos corregidos y AP8 alineado a la fuente SQL. |
| `everprop-public/src/data/auth-sample.ts` | Tipos de roles/capabilities API y autorización UI fail-closed. |
| `everprop-public/src/hooks/use-current-session.ts` | Exponer guards de capability derivados de la sesión. |
| `everprop-public/src/lib/data-mode.ts` | Gates no-productivos y modo API por defecto. |
| `everprop-public/src/lib/everprop-api.ts` | Project ID/version, status PATCH, contratos de error y lectura multipágina sin truncamiento silencioso. |
| `everprop-public/src/lib/data-mode.test.ts` | Tres regresiones de gates QA/tenant. |
| `everprop-public/src/lib/everprop-api.test.ts` | Regresiones project/version/status, agregación multipágina y cap explícito. |
| `everprop-public/src/lib/notifications.ts` | API autoritativa, sin fallback local cross-user y allowlist de destinos `/admin`. |
| `everprop-public/src/lib/notifications.test.ts` | Regresiones de respuesta vacía, error propagado y URL segura. |
| `everprop-public/src/data/admin-sample.test.ts` | 73 lotes únicos, totales por proyecto y distribución 6 disponibles/7 reservados/60 vendidos. |
| `everprop-public/src/data/auth-sample.test.ts` | Cuatro regresiones READ_ONLY/BOT_OPERATOR/SALES_MANAGER/sin sesión. |
| `everprop-public/src/components/sidebar/navigation.test.ts` | Tres regresiones de shortcuts y settings por capability. |
| `everprop-public/vitest.config.ts` | Configuración unitaria aislada de E2E. |
| `everprop-public/playwright.config.ts` | Chrome desktop/mobile, build productivo también en modo API, trazas y screenshots. |
| `everprop-public/e2e/admin-mock-smoke.spec.ts` | Guard, login, 10 rutas estáticas, validaciones y logout. |
| `everprop-public/e2e/admin-api-smoke.spec.ts` | Login Sanctum, alta/persistencia de lead, reload, responsive y logout/back-forward contra stack QA aislado. |

## QA y CI

| Archivo | Razón |
|---|---|
| `.github/workflows/ci.yml` | CI raíz: frontend, Playwright, Docker backend, audits, contrato, imagen y smokes. |
| `docs/qa/QA_MASTER_REPORT.md` | Informe maestro y veredicto. |
| `docs/qa/INTERACTION_INVENTORY.csv` | Inventario normalizado de interacciones. |
| `docs/qa/API_TRACEABILITY_MATRIX.md` | Paridad de rutas/contrato y uso UI. |
| `docs/qa/RBAC_TENANCY_MATRIX.md` | Matriz de roles, scopes y casos negativos. |
| `docs/qa/BUG_REGISTER.md` | Registro de 27 defectos, incluidos cinco hallazgos del merge. |
| `docs/qa/PRODUCTION_READINESS.md` | Gates de salida. |
| `docs/qa/DEPLOYMENT_RUNBOOK.md` | Preparación y smoke de deploy. |
| `docs/qa/ROLLBACK_RUNBOOK.md` | Disparadores y procedimiento de reversión. |
| `docs/qa/CHANGE_MANIFEST.md` | Trazabilidad completa de archivos modificados/agregados y su motivo. |
| `docs/qa/evidence/source-and-scope.md` | SHA canónico, rama aislada, alcance correcto y protección del baseline. |
| `docs/qa/evidence/frontend-gates.md` | Comandos y resultados reproducibles de build, tests, lint, tipos, audit y E2E. |
| `docs/qa/evidence/backend-gates.md` | Gates backend finales: 63 tests, schema, audit, OpenAPI, smoke, grants e imagen production. |
| `docs/qa/evidence/live-readonly-smoke.md` | Respuestas live GET sanitizadas de Vercel y Railway. |
| `docs/qa/evidence/human-charters.md` | Recorridos humanos, datos sintéticos y resultados por módulo. |
| `docs/qa/evidence/report-chart-map.md` | Pregunta, mapeo, proveniencia y validación de la visual de severidades. |

## Delta de Mauro preservado

Se conservaron sus dos commits de inventario/loteos y rediseño móvil: 39 archivos, 3.311 altas y 1.083 bajas. La resolución manual abarcó 10 archivos con conflictos y preservó modo oscuro, filtros, navegación de propiedades, quick schedule, audio y experiencia responsive. Se excluyeron únicamente los Route Handlers/SSE de notificaciones globales por riesgo P0; la función quedó conectada a la API Laravel existente.
