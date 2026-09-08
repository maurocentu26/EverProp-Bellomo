# Production readiness — EverProp Bellomo

**Veredicto: GO para CI/staging; NO-GO para habilitar mañana el despliegue actual.** Corte integrado: 8 de septiembre de 2026 ART. Fuente Mauro `origin/main@bf7018118ee683725c20d43e472b0722f05708af`; fixes en rama aislada `codex/preproduction-audit-20260908`.

El candidato local mejoró de forma sustancial y supera todos los gates backend, frontend y de imagen que pudieron ejecutarse. El NO-GO se mantiene porque lo desplegado continúa con readiness 503 y catálogo 404, y porque agenda, operación de colas/storage y recuperación no están listas.

## Gates obligatorios

| Gate | Estado | Evidencia / condición |
|---|---|---|
| Fuente trazable | PASS | Dos commits nuevos de Mauro integrados; 10 conflictos resueltos en rama aislada. |
| Baseline SQL inmutable | PASS | Hash `4C8B...472D`, sin modificación. |
| Frontend lint/types/build | PASS con deuda | 0 errores, 83 warnings; TypeScript/build PASS. |
| Frontend unitario | PASS | Vitest 21/21 en 6 archivos, incluidos RBAC, paginación, notificaciones e inventario de 73 lotes. |
| Frontend navegador mock | PASS | Playwright Chrome desktop 3/3 y mobile 3/3. |
| Frontend API real | PASS local | Build productivo, login, alta 201, render, reload, logout 204 y back/forward: 2/2 desktop/mobile. |
| Dependencias frontend | PASS | npm audit 0. |
| Backend Composer/Pint/PHPStan | PASS | validate/audit, 144 archivos Pint y PHPStan 0 errores. |
| Backend PHPUnit | PASS | 63 tests, 223 assertions; incluye tenant sin pipeline stage. |
| Dependencias backend | PASS | 0 advisories; commonmark 2.10.1. |
| Schema/tenancy/grants | PASS local | Dev+test verificados; runtime no-root; least privilege. |
| OpenAPI ↔ Laravel | PASS | 55/55; Redocly PASS. |
| Imagen backend production | PASS | 236.540.523 bytes, usuario no-root, sin env/test deps e incluyendo la migración forward. |
| Agenda/visitas API | FAIL | No hay API integral; UI real deshabilitada. |
| Configuración persistente | FAIL funcional / mitigado | Sin modelo API; UI real oculta/informativa. |
| Health live | PASS parcial | Railway 200; Vercel proxy health 404. |
| Readiness live | FAIL | Railway 503; Vercel proxy ready 404. |
| Auth live anónima | PASS | Ambos despliegues responden 401 sin credenciales. |
| Tenant/catalog live | PASS parcial | Projects 200 en Vercel y Railway; persiste mojibake en datos almacenados. |
| Worker de colas | FAIL / sin evidencia | Compose local healthy; proceso Railway supervisado no demostrado. |
| Storage persistente | BLOCKED | No se validó volumen/S3 productivo. |
| Backup y restore | BLOCKED | No hay backup reciente + restore ensayado. |
| Rollback operativo | BLOCKED | Runbook existe, sin simulacro. |
| Headers live | FAIL | En Vercel sólo se observó HSTS; faltan headers locales preparados. |

## Criterios exactos para GO

- Commit/PR del working tree revisado y CI raíz verde sobre el SHA candidato.
- Staging con `/healthz=200`, `/readyz=200`, `TENANT_HOST_MAP_JSON`/trusted hosts de Bellomo, login/me/logout y catálogo funcional.
- Agenda fuera de alcance aprobada explícitamente y no visible, o API/persistencia implementadas y probadas.
- Matriz mínima por seis roles y dos tenants completada; la preservación/guards de roles y capabilities ya tiene regresión local, falta E2E real por identidad.
- Worker supervisado, failed jobs, storage durable y alertas verificadas.
- Backup creado y restore/rollback ensayados con RPO/RTO registrados.
- CSP y demás headers validados en el dominio final.
- Smoke post-deploy de funciones críticas y ventana de rollback activa.

## Decisión operativa

No habilitar usuarios reales ni cargar información comercial en la versión live actual. Publicar y revisar `codex/preproduction-audit-20260908`, ejecutar CI y desplegar a staging; no saltar directamente a producción.
