# Registro de defectos

Ambiente base inicial: `main@11e93b15acf97241b7720de9d518905fadc54db2`. Corte integrado: `origin/main@64003ba2d849519a5f030b56d582f16e5d3e523b`, 8 de septiembre de 2026 ART, en `codex/preproduction-audit-20260908`. Toda evidencia live fue GET no destructiva y sanitizada.

## EP-QA-001 — P0 — Setup destructivo público

- **Módulo/estado:** backend, `FIXED_VERIFIED_LOCAL`.
- **Precondición/pasos:** baseline desplegado; invocar GET `/setup-simulation-database`, `/api/setup-simulation-database` o `/api/v1/setup-simulation-database`.
- **Esperado/actual:** no debe existir fuera de local/testing; baseline registraba rutas anónimas que ejecutaban DDL/seed y mostraban credenciales predecibles.
- **Impacto:** corrupción/reinicialización de datos y acceso no autorizado.
- **Evidencia:** diff `routes/web.php`, `routes/api.php`; test `ReleaseSecurityRegressionTest`.
- **Causa/archivos:** setup operativo expuesto como controlador inline y comando sin guard de entorno; `SetupSimulationDatabaseCommand.php`.
- **Corrección/test:** rutas eliminadas; comando sólo local/testing, hash canónico y sin output de passwords. Regresiones PHPUnit PASS.
- **Riesgo residual:** auditar invocaciones históricas y rotar/inactivar cuentas demo ya sembradas.

## EP-QA-002 — P0 — Producción no está lista

- **Módulo/estado:** integración/release, `OPEN`.
- **Precondición/pasos:** GET a Vercel/Railway desplegados.
- **Esperado/actual:** readiness, auth y tenant operativos; Railway `/readyz` 503 y catálogo 404; Vercel health/ready y catálogo 404. Auth/me anónimo ahora responde 401 correctamente en ambos.
- **Impacto:** sistema inutilizable o intermitente para operación real.
- **Evidencia:** `docs/qa/evidence/live-readonly-smoke.md`.
- **Causa/archivos:** configuración runtime/dependencias/tenant no verificable desde repo; versión desplegada no contiene rewrites/fixes.
- **Corrección/test:** rewrites y fixes preparados localmente; falta corregir DB/Redis/tenant/config, desplegar un SHA aprobado y repetir smoke.
- **Riesgo residual:** pérdida operativa inmediata si se habilitan usuarios.

## EP-QA-003 — P1 — CSRF exento en toda la API

- **Módulo/estado:** seguridad backend, `FIXED_VERIFIED_LOCAL`.
- **Pasos/esperado/actual:** inspeccionar `bootstrap/app.php`; Sanctum stateful debe exigir CSRF, pero baseline exceptuaba `api/v1/*`.
- **Impacto:** mutaciones con sesión expuestas a CSRF.
- **Evidencia/causa:** configuración global contradictoria con el contrato 419.
- **Corrección/test:** exención removida; regresión PASS; login Sanctum real devolvió 200 en navegador local.
- **Riesgo residual:** CORS/cookies/stateful domains aún deben validarse en staging.

## EP-QA-004 — P1 — IDOR/RBAC en leads y follow-ups

- **Módulo/estado:** CRM, `FIXED_VERIFIED_LOCAL`.
- **Pasos:** READ_ONLY muta o advisor usa UUID de lead ajeno/reasigna sin capability.
- **Esperado/actual:** 403/404 no enumerable; baseline no aplicaba capabilities/scope de asesor consistentemente.
- **Impacto:** modificación no autorizada y fuga entre usuarios/tenants.
- **Evidencia:** `AdminLeadAuthorizationTest.php`, diffs de controladores.
- **Causa:** queries/controladores sin políticas explícitas y errores atrapados como 500 con file/line.
- **Corrección/test:** capabilities, tenant y asignación aplicados; tests READ_ONLY, IDOR, ASSIGN y 422 PASS.
- **Riesgo residual:** falta matriz dinámica completa de seis roles y dos tenants.

## EP-QA-005 — P1 — Fallback API→mock y falsos éxitos

- **Módulo/estado:** frontend/integración, `MITIGATED_VERIFIED_LOCAL`.
- **Pasos:** provocar error de catálogo/lead/etapa/follow-up; baseline mostraba muestra/localStorage o mutaba UI como éxito.
- **Esperado/actual:** error visible y estado servidor como autoridad; baseline degradaba silenciosamente.
- **Impacto:** operadores creen haber guardado cambios inexistentes.
- **Evidencia:** recorrido humano y diffs en dashboard, leads, inventario, búsqueda y formularios.
- **Causa:** catch con datos demo y actualizaciones optimistas sin rollback.
- **Corrección/test:** fallbacks removidos, alertas visibles y UI sólo cambia después de éxito. Vitest/Playwright pasan; el E2E API productivo local completó login, alta 201, render, reload, logout 204 y back/forward en desktop/mobile.
- **Riesgo residual:** realizar simulación 4xx/5xx/red lenta contra staging.

## EP-QA-006 — P1 — Credenciales/demo visibles en producción

- **Módulo/estado:** login/simulador, `FIXED_VERIFIED_FRONTEND`.
- **Pasos:** abrir login/sidebar del baseline productivo; aparecía quick access con password conocido y Simulador QA.
- **Esperado/actual:** ninguna credencial ni herramienta QA en producción.
- **Impacto:** facilita acceso indebido y mutaciones demo.
- **Evidencia:** captura del usuario, revisión de baseline y `data-mode.test.ts`.
- **Causa:** controles siempre renderizados y password embebido.
- **Corrección/test:** no se embebe contraseña; QA requiere development+mock+opt-in. Tests 3/3 del gate local pasan.
- **Riesgo residual:** inspeccionar bundle/despliegue real y rotar cuentas históricas.

## EP-QA-007 — P1 — Contrato de propiedad rompe versión/estado/proyecto

- **Módulo/estado:** inventario, `FIXED_VERIFIED_LOCAL`.
- **Pasos:** crear con proyecto, mutar estado y volver a editar; baseline enviaba `project_id=1`, descartaba `version` y usaba `/publish` para reservado/vendido.
- **Esperado/actual:** ID backend real, versión vigente y PATCH normal para estados; baseline podía dar 409/422 o asociar mal.
- **Impacto:** datos incorrectos y flujo central roto.
- **Evidencia:** `everprop-api.test.ts` 3 casos PASS.
- **Corrección:** preservar `backendId/version`, exigir versión y usar endpoint correcto; suites de inventario/backend PASS.
- **Riesgo residual:** persistencia MySQL y políticas pasan en backend; falta concurrencia UI real.

## EP-QA-008 — P1 — Agenda/visitas sin API

- **Módulo/estado:** agenda/CRM, `OPEN_MITIGATED_UI`.
- **Pasos:** crear visita y recargar/cambiar dispositivo; componentes usan localStorage y “Agendar visita” era acción muerta.
- **Esperado/actual:** persistencia server-side transaccional; no existen rutas REST integrales.
- **Impacto:** citas se pierden o difieren entre usuarios.
- **Evidencia:** recorrido humano y análisis de `CalendarAgenda.tsx`, `NewVisitModal.tsx`.
- **Causa:** implementación sólo demo.
- **Corrección/test:** UI real quedó oculta/deshabilitada; falta diseñar API, migración, políticas y E2E.
- **Riesgo residual:** no hay agenda utilizable para mañana.

## EP-QA-009 — P1 — Settings decorativo sin persistencia

- **Módulo/estado:** configuración, `MITIGATED_VERIFIED_FRONTEND`.
- **Pasos:** Duplicate, Preview, Save y pills del baseline no producían efecto.
- **Esperado/actual:** controles reales con feedback o no visibles; página declaraba ser placeholder.
- **Impacto:** falso guardado/configuración.
- **Evidencia:** QA humano + Playwright carga de ruta.
- **Causa:** diseño de muestra sin handlers/modelo.
- **Corrección/test:** en API se oculta nav y se informa indisponibilidad; mock deshabilita acciones sin implementación.
- **Riesgo residual:** funcionalidad sigue ausente.

## EP-QA-010 — P1 — CI no se ejecutaba

- **Módulo/estado:** DevOps, `FIXED_UNVERIFIED_REMOTE`.
- **Pasos:** revisar workflows y `gh run list`; workflow estaba bajo `everprop-api/.github`, ubicación ignorada por GitHub, sin runs.
- **Esperado/actual:** workflow raíz sobre PR/main.
- **Impacto:** regresiones y dependencias vulnerables sin gate.
- **Evidencia:** `.github/workflows/ci.yml`, YAML/action validation local PASS.
- **Corrección/test:** CI raíz agrega frontend, Playwright, Docker backend, audit, OpenAPI, imagen y smoke; gates equivalentes se ejecutaron localmente en verde.
- **Riesgo residual:** aún no fue pusheado ni ejecutado por GitHub Actions.

## EP-QA-011 — P1 — Dependencias vulnerables

- **Módulo/estado:** supply chain, `FIXED_VERIFIED`.
- **Pasos:** audits de lockfiles.
- **Esperado/actual:** cero moderate+ runtime; frontend baseline 15 (12 high), backend 4 high en commonmark.
- **Impacto:** exposición conocida y gate de release rojo.
- **Evidencia:** npm audit final 0; Composer audit final 0 dentro de PHP 8.4.
- **Corrección/test:** Next 16.3.4; `league/commonmark` 2.10.1 y `nette/schema` 1.3.6.
- **Riesgo residual:** mantener Dependabot/audits y revisar futuras advisories.

## EP-QA-012 — P1 — OpenAPI incompleto

- **Módulo/estado:** contrato API, `FIXED_VERIFIED_LOCAL`.
- **Pasos:** comparar método/path en ambos sentidos.
- **Esperado/actual:** 100% paridad; baseline 59 vs 34, final 55 vs 55.
- **Impacto:** integraciones/tests/clientes sin contrato confiable.
- **Evidencia:** `API_TRACEABILITY_MATRIX.md`.
- **Causa:** CRM/notificaciones/batch/PUT agregados sin documentación.
- **Corrección/test:** se documentaron las 21 operaciones y se ejecutaron JSON parse, Redocly y gate bidireccional 55/55.
- **Riesgo residual:** falta contract testing automático de cada schema/status contra respuestas reales.

## EP-QA-013 — P1 — Worker/storage/backup no preparados

- **Módulo/estado:** operación, `OPEN`.
- **Pasos:** revisar Dockerfile/README/config; Railway sólo inicia `artisan serve`, storage default local y no hay restore probado.
- **Esperado/actual:** worker supervisado, failed jobs, storage durable, backup+restore; evidencia ausente.
- **Impacto:** webhooks pendientes y pérdida de archivos/datos sin recuperación.
- **Evidencia:** análisis de release y runbooks.
- **Causa:** despliegue incompleto.
- **Corrección/test:** runbooks preparados; implementación/ensayo pendientes.
- **Riesgo residual:** RPO/RTO desconocidos.

## EP-QA-014 — P1 — Backend no pudo certificarse

- **Módulo/estado:** ambiente de prueba, `CLOSED`.
- **Pasos:** Docker Desktop perdió pipe `dockerDesktopLinuxEngine`; `vendor/autoload.php` quedó ausente.
- **Esperado/actual:** el engine se recuperó; PHP 8.4/MySQL/Redis y todos los gates quedaron ejecutables.
- **Impacto:** fixes críticos sin validación dinámica.
- **Evidencia:** `evidence/backend-gates.md`.
- **Causa:** Docker Desktop local caído; no se violó la prohibición de PHP host.
- **Corrección/test:** Docker reparado sin factory reset; corte integrado 63 tests/223 assertions, PHPStan/Pint/schema/smoke/imagen PASS.
- **Riesgo residual:** el host continúa con poco espacio libre; los artefactos QA pesados se eliminan al finalizar cada corrida.

## EP-QA-015 — P1 — Roles incompletos en UI

- **Módulo/estado:** frontend RBAC, `MITIGATED_VERIFIED_LOCAL`.
- **Pasos:** hidratar usuario READ_ONLY/BOT_OPERATOR; modelo frontend los colapsa a advisor.
- **Esperado/actual:** conservar `role_code` y capabilities; la sesión preserva `apiRole` y usa el allowlist devuelto por API.
- **Impacto:** se retiraron controles de escritura para READ_ONLY y privilegios de manager para BOT_OPERATOR; backend sigue siendo la autoridad final.
- **Evidencia:** `auth-sample.test.ts`, `navigation.test.ts`, Vitest 15/15, TypeScript/build PASS.
- **Causa:** modelo de sesión reducido.
- **Corrección/test:** helper fail-closed y guards en navbar/sidebar, altas directas, settings, leads, propiedades, seguimientos, intereses, asignación y kanban.
- **Riesgo residual:** falta E2E real positivo/negativo con las seis identidades; nunca confiar autorización a la UI.

## EP-QA-016 — P2 — Headers defensivos ausentes live

- **Módulo/estado:** HTTP frontend, `FIXED_LOCAL_PENDING_DEPLOY`.
- **Actual:** el probe final de Vercel sólo observó HSTS; faltan CSP, nosniff, anti-frame, Referrer y Permissions.
- **Corrección/evidencia:** `next.config.ts`; smoke local `/login` 200 con headers.
- **Riesgo:** validar CSP contra todos los recursos en dominio final.

## EP-QA-017 — P2 — Accesibilidad parcial

- **Módulo/estado:** UI, `OPEN`.
- **Actual:** celdas/lotes repetidos tienen nombres “1”, botones volver sin nombre claro y labels de varios formularios no están asociados de forma robusta.
- **Impacto:** navegación por lector/teclado ambigua.
- **Evidencia:** snapshot accesible y QA humano.
- **Corrección/test:** pendiente nombres contextuales, axe, teclado, zoom y motores múltiples.

## EP-QA-018 — P2 — Métricas demo pueden parecer reales

- **Módulo/estado:** dashboard, `MITIGATED_PARTIAL`.
- **Actual:** varios KPIs/wigets usan muestras/números fijos; mock ahora se identifica y API oculta algunos.
- **Impacto:** decisiones comerciales basadas en cifras ficticias.
- **Corrección/test:** completar fuentes API y reconciliación; no certificar métricas actuales.

## EP-QA-019 — P2 — Paginación/límites silenciosos

- **Módulo/estado:** API/listados, `FIXED_VERIFIED_LOCAL`.
- **Baseline:** leads y follow-ups usaban `limit(200/500)` y el frontend pedía una sola página de catálogo, con truncamiento silencioso al crecer la base.
- **Impacto:** registros operativos podían faltar sin aviso.
- **Corrección/test:** leads y follow-ups ahora exponen paginación determinista con metadata y máximo de 100 por página; el cliente recorre todas las páginas de catálogo/CRM y falla explícitamente por encima de 10.000 registros. OpenAPI documenta parámetros, metadata y 422.
- **Evidencia:** `AdminLeadPaginationTest` 2 casos/24 aserciones, Vitest multipágina/cap 2 casos, PHPUnit 63/63, Vitest 22/22, PHPStan, TypeScript, Redocly y paridad 55/55 PASS.
- **Riesgo residual:** para más de 10.000 registros hace falta paginación/filtros visibles server-side; no hay truncamiento silencioso.

## EP-QA-020 — P2 — Runtime web de Railway no usa hardening Nginx

- **Módulo/estado:** deploy backend, `OPEN`.
- **Actual:** documentación/imagen inician `artisan serve`; configuración Nginx no gobierna el proceso live.
- **Impacto:** divergencia de performance/headers/timeouts.
- **Corrección/test:** definir servidor productivo soportado y probar imagen bajo carga acotada.

## EP-QA-021 — P2 — Readiness incompleta

- **Módulo/estado:** observabilidad, `OPEN`.
- **Actual:** sólo DB+Redis; no valida schema version, worker, storage, config tenant ni escritura.
- **Impacto:** puede declarar listo un sistema funcionalmente incompleto.
- **Corrección/test:** ampliar checks sin filtrar secretos y definir dependencias críticas.

## EP-QA-022 — P3 — Idioma y deuda de frontend

- **Módulo/estado:** UX/mantenibilidad, `OPEN`.
- **Actual:** textos ingleses en panel español y 83 warnings (unused, any, hooks, imágenes), sin errores de lint.
- **Impacto:** inconsistencia y riesgo técnico menor frente a bloqueantes.
- **Corrección/test:** limpieza incremental después de P0/P1.

## EP-QA-023 — P0 — Gateway de notificaciones Next sin autenticación ni tenant

- **Módulo/estado:** frontend/API incorporado desde Mauro, `FIXED_VERIFIED_LOCAL`.
- **Actual detectado:** dos Route Handlers y un emisor SSE mantenían una lista global en memoria y permitían listar, crear, marcar o borrar notificaciones sin sesión, tenant, CSRF ni límites.
- **Impacto:** lectura/manipulación cross-tenant, pérdida de eventos y superficie de denegación de servicio.
- **Corrección/test:** se eliminaron los endpoints Next y SSE; el navbar vuelve a consultar exclusivamente la API Laravel autenticada y tenant-scoped.
- **Evidencia:** TypeScript, build, Playwright mock/API y regresiones de `notifications.test.ts` PASS.

## EP-QA-024 — P1 — Fallback local y navegación insegura en notificaciones

- **Módulo/estado:** frontend, `FIXED_VERIFIED_LOCAL`.
- **Actual detectado:** una respuesta API vacía o fallida podía reponer notificaciones de `localStorage`; `actionUrl` aceptaba destinos externos o esquemas peligrosos.
- **Impacto:** datos viejos de otro usuario, falsos positivos operativos y navegación no confiable.
- **Corrección/test:** la API es autoritativa incluso para `[]`, los fallos se muestran sin fallback y sólo se permiten rutas same-origin bajo `/admin`.
- **Evidencia:** 6 archivos/22 tests Vitest PASS, incluidos error propagado, allowlist de URL y destinatario estricto sin override/alias/broadcast.

## EP-QA-025 — P1 — Regresiones del merge en navegación, filtros y permisos

- **Módulo/estado:** panel admin, `FIXED_VERIFIED_LOCAL`.
- **Actual detectado:** el merge produjo una declaración duplicada que rompía compilación, preservaba una manzana incompatible al cambiar proyecto y mostraba fugazmente controles de alta/etapa sin capability.
- **Corrección/test:** navegación unificada por capability, reset de filtro dependiente, guard temprano de alta y selectores de etapa deshabilitados en desktop/mobile; chips con semántica ARIA y cierre por Escape.
- **Evidencia:** typecheck, lint estricto, build productivo y Playwright Chrome desktop/mobile PASS.

## EP-QA-026 — P1 — Alta de lead sin etapa del tenant devolvía 500

- **Módulo/estado:** CRM/tenancy, `FIXED_VERIFIED_LOCAL`.
- **Pasos:** crear un tenant válido sin `pipeline_stages` e intentar `POST /api/v1/admin/leads`.
- **Actual detectado:** el controlador usaba `stage_id=1`, que podía pertenecer a otro tenant, y MySQL rechazaba la FK con 500.
- **Corrección/test:** sólo se aceptan etapas activas del tenant; si no existe una etapa solicitada o `NEW`, la transacción revierte y devuelve 422 sin stack ni residuos.
- **Evidencia:** nueva regresión PHPUnit; suite final 63/63 y 223 aserciones; E2E API posterior 2/2.

## EP-QA-027 — P1 — Estados AP8 divergentes entre fixture y despliegue

- **Módulo/estado:** inventario Bellomo, `FIXED_VERIFIED_LOCAL`.
- **Actual detectado:** el fixture visual marcaba AP8 lotes 12/14/15/16 como reservados aunque la fuente SQL los define disponibles; el cambio de Mauro para 17/18 vivía sólo en un seeder y no alcanzaba bases ya creadas.
- **Corrección/test:** fixture alineado a 6 disponibles, 7 reservados y 60 vendidos; migración forward-only idempotente reserva AP8 17/18 por UUID y tenant sin alterar el baseline.
- **Evidencia:** 73 UUID únicos, totales por proyecto y distribución 6/7/60 verificados en Vitest; importación/schema dev+test PASS.
