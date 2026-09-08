# NO-GO live — Informe global preproducción EverProp Bellomo

La versión desplegada **no debe habilitarse todavía para uso empresarial real**. El candidato local quedó mucho más sólido y supera los gates técnicos principales, pero Railway continúa con `/readyz` 503 y el catálogo responde 404 tanto por Railway como por Vercel. Agenda/visitas, operación de colas/storage y recuperación siguen sin certificarse.

## Resumen ejecutivo

- **Fuente auditada:** `main@11e93b15acf97241b7720de9d518905fadc54db2`, último `origin/main` verificado al iniciar el trabajo.
- **Trabajo:** rama local `qa/full-audit-20260907`, sin commit, push, PR ni deploy.
- **Alcance correcto:** panel Bellomo `/admin` mostrado por el usuario, no otro panel.
- **Backend local:** VERDE; 62 tests/216 assertions, PHPStan 0, Pint 144 archivos, Composer audit 0, schema/hash/grants/smoke PASS.
- **Frontend local:** AMARILLO; build/typecheck/audit/unit/browser mock PASS, 0 errores y 87 warnings de lint.
- **Integración browser→API:** VERDE local; build productivo, login real 200, alta 201, render, reload, logout 204 y back/forward completados 2/2 en desktop/mobile.
- **Contrato API:** VERDE; OpenAPI/Laravel 55/55 y Redocly PASS.
- **Imagen backend production:** VERDE; build PASS, 236.5 MB, usuario no-root, sin `.env`, `.env.testing` ni PHPUnit.
- **Live:** ROJO; HTML `/admin` 200 no compensa readiness y catálogo fallidos.

## Ambiente y controles de seguridad

- Corte final: 8 de septiembre de 2026, zona `America/Buenos_Aires`.
- Backend: PHP 8.4, MySQL 8.4, Redis, Nginx y worker en proyecto Docker aislado `everprop-api-qa-20260908-c`.
- Frontend: Next 16.3.4, Chrome desktop/mobile, modos mock identificado y API local.
- Datos: sólo fixtures sintéticos. No se hicieron login ni mutaciones en producción.
- Producción: únicamente GET/HEAD no destructivos.
- Baseline SQL inmutable: SHA-256 `4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D`.
- No se usó SQLite ni PHP/Composer host para certificar backend.

## Scorecard de release

| Área | Estado | Evidencia y lectura |
|---|---|---|
| Frontend | AMARILLO | Unit, typecheck, build, audit y Chrome mock/API PASS; persiste deuda de 87 warnings. |
| Backend | VERDE local | 62/62 tests, análisis estático, formato, schema, grants y smoke PASS. |
| Integración local | VERDE | HTTP 7/7 y E2E navegador→API productivo 2/2 completos. |
| Integración live | ROJO | Railway ready 503; catálogo 404 en ambos destinos. |
| Seguridad | AMARILLO | P0 setup, CSRF, RBAC/IDOR, tenancy, supply chain y least privilege verificados localmente; rotación histórica/staging pendientes. |
| Datos | ROJO | Schema e integridad local PASS; agenda real, backup/restore y storage durable ausentes. |
| Accesibilidad | ROJO | Chrome móvil parcial; sin axe, lector, zoom 200% ni motores múltiples. |
| Performance | BLOQUEADO | Sin Lighthouse/carga/SLO; el host local sufrió presión severa de disco/memoria. |
| Despliegue | ROJO | Imagen lista, pero CI remoto, staging, worker, storage, backup y rollback no ejecutados. |

## Resultados cuantitativos

### Inventario funcional

Se localizaron 513 marcadores estáticos de interacción y se normalizaron 90 comportamientos/controles únicos. Las instancias repetidas de tablas, cards y lotes comparten componente y no se cuentan como funciones independientes.

| Estado | Casos | Proporción |
|---|---:|---:|
| PASS | 67 | 74,4% |
| FAIL | 9 | 10,0% |
| BLOCKED | 14 | 15,6% |
| Total | 90 | 100% |

El detalle por botón/acción está en `INTERACTION_INVENTORY.csv`. Un PASS mock certifica comportamiento visual aislado; no se presenta como persistencia real.

### Gates automáticos y dinámicos

| Suite/gate | Resultado final |
|---|---|
| Vitest | 15/15 PASS en 4 archivos, incluidas capacidades READ_ONLY/BOT_OPERATOR, navegación RBAC y paginación |
| Playwright mock Chrome desktop | 3/3 PASS |
| Playwright mock Chrome mobile | 3/3 PASS |
| E2E API Chrome | 2/2 PASS: build productivo, login 200, alta 201, render, reload, logout 204 y back/forward |
| TypeScript | PASS |
| Next production build API | PASS; 17 entradas, 14 `/admin` |
| ESLint | 0 errores, 87 warnings |
| npm audit | 0 vulnerabilidades |
| Composer validate/audit | PASS; 0 advisories |
| Pint | PASS, 144 archivos |
| PHPStan | PASS, 0 errores |
| PHPUnit | 62 PASS, 216 assertions |
| Schema dev/testing | PASS, 42 tablas, 39 tenant, 98 FK, 2 procedures, 3 views |
| OpenAPI/Redocly/paridad | PASS, 55/55 |
| HTTP local | 7/7 PASS |
| MySQL least privilege | PASS |
| Imagen production | PASS |

## Flujos críticos recorridos

- Sin sesión → ruta admin → login: PASS desktop/mobile mock.
- Login Sanctum real local → dashboard: PASS 200 desktop/mobile.
- Login → alta de lead → POST 201 → lead visible tras navegación y reload: PASS local desktop/mobile.
- Logout 204/sesión tenant-bound/cross-tenant/back-forward: PASS en Playwright API y PHPUnit.
- Dashboard admin/asesor, navegación lateral, tema, búsqueda y rutas: PASS mock.
- Proyectos/inventario/batch: UI mock PASS; RBAC, price capability y proyecto cross-tenant PASS backend.
- Propiedades: alta Casa y filtros/detalle mock PASS; contratos de versión/estado y seguridad backend PASS; faltan cinco categorías completas UI→API.
- Leads: alta, filtros, detalle, intereses, reasignación y seguimiento mock PASS; alta/reload API real y autorización backend PASS; listados/follow-ups paginados sin truncamiento silencioso.
- Media: MIME real, path traversal y cross-tenant PASS unitario; CRUD UI no existe.
- Agenda/visitas: FAIL como función empresarial real; sólo demo/localStorage, oculta en API.
- Settings: FAIL funcional; controles decorativos mitigados/ocultos en API.
- Producción read-only: admin 200; auth anónima 401; readiness y catálogo FAIL.

## Seguridad, tenancy y datos

Quedaron verificados localmente:

- Eliminación de tres endpoints HTTP de setup/DDL/seed.
- Comando de simulación restringido a local/testing, hash canónico y sin impresión de credenciales.
- CSRF stateful restaurado.
- 401 seguro sin file/trace.
- READ_ONLY sin mutación; advisor no accede a lead ajeno ni reasigna sin capability.
- Sesión no reutilizable entre tenants.
- `tenant_id` enviado por el cliente se rechaza 422.
- Batch no acepta proyecto de otro tenant ni precio sin permiso.
- Catálogo público oculta borradores, no disponibles y otros tenants.
- Webhooks y lead público idempotentes; firma y replay verificados.
- Usuarios MySQL runtime limitados a DML + `EXECUTE` sobre su base.

La UI ahora preserva `apiRole` y usa las capabilities de la sesión para ocultar/bloquear creación, edición, asignación, settings, seguimientos y kanban. Pendiente para cierre total: E2E dinámico de los seis roles, estados inactive/paused, auditoría histórica de cuentas demo y validación de cookies/CORS/hosts en el dominio final.

## Defectos por severidad

| Severidad | Total | Cerrados verificados | Mitigados/parciales | Abiertos |
|---|---:|---:|---:|---:|
| P0 | 2 | 1 | 0 | 1 |
| P1 | 13 | 7 | 4 | 2 |
| P2 | 6 | 1 | 2 | 3 |
| P3 | 1 | 0 | 0 | 1 |
| Total | 22 | 9 | 6 | 7 |

Bloqueantes reales restantes:

1. Producción no supera readiness ni catálogo tenant.
2. Agenda/visitas no tiene persistencia server-side.
3. Worker, failed jobs y scheduler productivos no están demostrados.
4. Storage durable, backup+restore y rollback no fueron ensayados.
5. Falta ejecutar la matriz UI/API dinámica completa con identidades reales de los seis roles.

## Estado live final

| Destino | Resultado |
|---|---|
| Vercel `/admin` | 200 |
| Vercel `/healthz`, `/readyz` | 404 / 404 |
| Vercel auth/me anónimo | 401 correcto |
| Vercel catálogo | 404 |
| Railway `/healthz`, `/readyz` | 200 / 503 |
| Railway auth/me anónimo | 401 correcto |
| Railway catálogo | 404 |

La corrección de auth 500→401 observada durante la auditoría es positiva, pero no convierte al sistema en operativo. En Vercel sólo se observó HSTS; los headers defensivos del working tree aún no están live.

## Cambios de alto impacto realizados

- Actualización de dependencias frontend y backend hasta 0 advisories.
- Fixes de CSRF, errores seguros, tenant resolution y rechazo de `tenant_id`.
- Capabilities/scope en leads, follow-ups y batch.
- Eliminación de setup HTTP y DELETE lead inválido.
- Correcciones de project ID, versionado y estados de property.
- Separación estricta mock/API y eliminación de falsos éxitos/fallbacks demo.
- Ocultamiento de agenda/settings/simulador cuando no son reales o autorizados.
- OpenAPI completo 55/55 y CI raíz con gate bidireccional.
- Tests backend/frontend, Playwright mock y harness API real.
- Sesión frontend capability-aware: READ_ONLY sin controles de escritura y BOT_OPERATOR sin privilegios de manager.
- Paginación determinista para leads/follow-ups y consumo multipágina de catálogo/CRM con cap explícito de 10.000.
- Imagen production no-root sin secretos ni dependencias de test.

El archivo exacto por archivo está documentado en `CHANGE_MANIFEST.md`.

## Limpieza y recursos

- Se eliminaron cachés `.next`, reportes/traces/resultados Playwright, `tsconfig.tsbuildinfo` y `node_modules` regenerable.
- Se purgaron además 1.25 GB de caché npm antes de repetir el build final.
- Se purgaron 4.205 GB de build cache Docker durante la auditoría, otros 882.3 MB en la pasada de capabilities y 1.191 GB tras la imagen final.
- Se preservaron imágenes/volúmenes ajenos; no hubo factory reset.
- Tras capturar evidencia se desmontó únicamente `everprop-api-qa-20260908-c`, se borraron sus cuatro volúmenes y la imagen QA final exacta.
- Se eliminaron `vendor`, `.env`, `.env.testing` y secretos locales QA regenerables; ningún secreto quedó versionado.
- Los sockets Docker corruptos se movieron a backups recuperables con sufijo `codex-backup-*`.
- El disco C: volvió a quedar por debajo de 300 MiB durante las corridas; se liberaron artefactos regenerables antes de completar E2E API e imagen final. Tras el teardown quedaron aproximadamente 1,22 GiB libres, sin artefactos QA pesados ignorados.

## Condiciones exactas antes de producir

1. Crear commit/PR del working tree, revisión humana del diff y CI raíz verde sobre el SHA exacto.
2. Desplegar primero a staging con el dominio/tenant Bellomo real.
3. Exigir `/healthz=200`, `/readyz=200`, host→tenant confiable, csrf/login/me/logout y catálogo 200.
4. Decidir agenda: implementar API/persistencia o aprobarla explícitamente fuera de alcance y no visible.
5. Completar matriz de seis roles y dos tenants, más E2E UI por capability.
6. Configurar worker/scheduler supervisados, failed jobs y alertas.
7. Configurar storage durable y probar upload/download/delete/restart.
8. Crear backup, ejecutar restore y ensayar rollback; registrar RPO/RTO.
9. Validar CSP/headers, cookies, CORS, trusted hosts y tenant map en el dominio final.
10. Repetir Playwright API 2/2 en staging y sumar axe/teclado/zoom y navegadores/viewports faltantes.
11. Autorizar recién entonces el deploy y correr smoke post-deploy con ventana de rollback.

## Recomendación final

Mantener **NO-GO para la versión live actual**. El candidato local está listo para una fase seria de PR/CI/staging y ya no tiene el bloqueo backend original, pero habilitar usuarios mañana sin resolver readiness, tenant/catalog, agenda y recuperación sería asumir riesgo operativo conocido.
