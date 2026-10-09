# Bellomito staging — evidencia 2026-10-02

## Auditoría de despliegue y PWA — 2026-10-07, 22:49 ART

### Ampliación de la auditoría (misma fecha, posterior a las 22:49 ART)

- `everprop:production-check --connections --webpush` en API: salida OK y código de salida 0. En worker y scheduler: 27 comprobaciones OK y 0 FAIL en cada servicio. Solo diagnóstico; no se ejecutaron jobs ni se reiniciaron servicios.
- Configuración efectiva en API, worker y scheduler: `conversations.ai_enabled=false`, `conversations.copilot_enabled=false`, `agent.llm_provider=disabled`, `services.meta.send_enabled=false`, `services.meta.onboarding_enabled=false`. Una primera consulta del proveedor usó una clave de configuración incorrecta y devolvió null; se corrigió la consulta, no la configuración.
- Consulta de lectura en API: `jobs=0`, `failed_jobs=0`. No se leyeron ni imprimieron mensajes, credenciales o endpoints de suscripción.
- `/icon/512` y `/icon/maskable`: 200. `/admin`: shell 200 y CSP `frame-ancestors 'none'`; widget canónico: 200 con `frame-ancestors 'self' https://panel-staging-staging-62ec.up.railway.app`. Endpoints privados `/api/v1/auth/me` y `/api/v1/admin/conversations`: 401 sin sesión.
- Webhook WhatsApp: GET sin challenge/token devuelve 403; confirma rechazo de una solicitud no autenticada, NO confirma configuración en Meta, challenge correcto ni entrega.
- Navegador del panel redirige `/admin/conversaciones` a `/login`: sin sesión disponible. No se inició un recorrido S6 ni se envió un mensaje; S6 sigue NO verificado. No se sustituyó el aislamiento de visitante y asesor por dos pestañas con almacenamiento compartido.
- No se comprobaron restore de backup, persistencia de adjuntos tras redeploy, entrega push física ni recuperación del worker con envío en cola. No se declara todo staging validado por tener checks de configuración verdes.

- Solo proyecto `bellomito-staging`, entorno `staging`, IDs indicados abajo. No se creó otro staging ni se cambió el dominio del panel.
- Git local y remoto `origin/chore/agentic-setup`: `16d75b670f5cdbc5373d3b86c3c2e6d4805a23a6`. Sin commits pendientes de publicar al iniciar esta auditoría; `.claude/launch.json` sin seguimiento se preservó.
- Railway: panel, API, worker y scheduler muestran el mismo commit completo y rama `chore/agentic-setup`, despliegues exitosos y activos, iniciados el 2026-10-07 a las 17:50 ART. Panel deployment `f037c14a-a01f-48d0-9b52-f15f811fed90`; API `833d993a-371c-4abd-9b50-b747a779fb63`; worker `1b2cad7e-1821-484b-9d40-87eaf10034ca`. El SHA se comprobó en el enlace GitHub de Details de cada servicio, no se dedujo solo de la salud HTTP.
- PWA canónica: `https://panel-staging-staging-62ec.up.railway.app`. Manifest 200, `id=/admin`, `start_url=/admin/conversaciones`, `scope=/`, `display=standalone`. Service worker `/notifications-sw.js`, ícono `/icon/192` y `/healthz`: 200. API `/readyz`: 200, `status=ready`.
- CI: API, web, guard y evals exitosos para `078f1fd9504ca4cb0e31de4272cbb17cc8113dd0`; evals exitosos para `16d75b6` (último commit, cambios de dataset). No se afirma que las cuatro suites se hayan vuelto a ejecutar para ese SHA.
- No se ejecutaron los recorridos S6, consultas SQL, entrega push física, ni comprobaciones de conexiones dentro de contenedores en esta tanda. S6 sigue sin verificarse. La comprobación del manifest no verifica qué versión está cacheada en el iPhone.
- Sin cambios en producción, `main`, Vercel, variables de IA/Meta, base o servicios. No se inició Docker ni se ejecutó un nuevo deploy. Este registro documental no equivale a activar WhatsApp ni presentar App Review.

Producción Bellomo y `main` están fuera de alcance. No se modificaron. No se cambiaron proyectos ni variables de Vercel.

## Destino independiente

- Railway proyecto `bellomito-staging`: `5a26e066-0417-49cf-a1cb-9ed8b8c81f58`.
- Entorno `staging`: `63966360-15fe-4056-8282-a4c3b905d10b`.
- API: https://api-staging-30f3d.up.railway.app
- Panel de pruebas, también en Railway: https://panel-staging-staging-62ec.up.railway.app
- API, worker y panel conectados a `maurocentu26/EverProp-Bellomo`, rama `chore/agentic-setup`; despliegue inicial del código `30d9573`.
- MySQL 8.4.11 con volumen nuevo, red privada y usuario runtime exclusivo con SELECT/INSERT/UPDATE/DELETE/EXECUTE; sin privilegios de migración.
- APP_KEY propia compartida por API y worker. Credenciales y clave SSH privada fuera de Git.
- Tenant sintético `bellomito-staging`; no se importaron backups ni datos operativos de Bellomo.

## Verificado

- Baseline con SHA-256 canónico y los 16 forward aplicados sobre base inicialmente vacía. Cuatro versiones nuevas registradas; índices de deduplicación y barrido presentes; dos procedimientos.
- `cache`, `cache_locks`, `sessions`: SQL reutilizado de `SetupSimulationDatabaseCommand`; NO se ejecutó el comando ni su seed de simulación.
- `everprop:production-check --connections`: todas las comprobaciones OK en API. APP_ENV=production es el modo de la imagen, no el entorno de negocio.
- `/readyz` de API: 200.
- `/login` del panel: 200 y CSP `frame-ancestors 'none'`.
- `/healthz` a través del proxy del panel: 200.
- `/api/v1/auth/me` a través del panel sin sesión: 401.
- Login con cuenta temporal `smoke-test@e2e.invalid`: 200; `auth/me` devolvió tenant `bellomito-staging`. Cuenta luego DISABLED, contraseña aleatoria reemplazada y sesiones eliminadas. El primer intento de logout del script reutilizó un CSRF anterior al login y recibió 419; no se cuenta como prueba exitosa de logout.
- Worker consume `database`, igual que API: trabajo inocuo `DispatchOutboundJob` con ID de outbound inexistente terminó DONE; cola pendiente=0 y fallidos=0. Esto verifica consumo, NO entrega real visitante–asesor.
- IA y WhatsApp deshabilitados en API/worker: `CONVERSATIONS_AI_ENABLED=false`, `AGENT_LLM_PROVIDER=disabled`, `META_SEND_ENABLED=false`.
- Ambos backends del panel (`NEXT_PUBLIC_EVERPROP_API_URL` / `NEXT_PUBLIC_API_URL`) configurados explícitamente con API de staging; CORS y Sanctum de API limitados al panel de staging.
- Último despliegue de API, worker, panel y mysql84: SUCCESS. Logs de API registraron el login y auth/me de la cuenta temporal a través del panel.
- Widget de staging: 200 y CSP `frame-ancestors 'self' https://panel-staging-staging-62ec.up.railway.app`; `/admin`: shell HTML 200 con `frame-ancestors 'none'` (no es un rechazo HTTP de la página; la API privada sí devuelve 401 sin sesión).
- Sesión pública de chat y mensaje sintético creados mediante el proxy del panel. Repetir el mismo `client_message_id` devolvió `replayed=true` y la misma secuencia 1; polling mostró un solo mensaje. Hay datos sintéticos de esta prueba en staging, no datos reales.

## Pendiente / límites

- Widget de staging `8f32042b-a9b8-4a74-91c0-40837d962910` provisionado y CSP comprobada tras redeploy.
- Recorrido visitante → bandeja → asesor → respuesta y reinicio del worker con trabajo pendiente aún NO verificados.
- Cuenta humana sintética `admin-staging@e2e.invalid` habilitada; contraseña fuera del repositorio. Sitio de pruebas externo todavía pendiente.
- API tiene volumen privado persistente. Worker no comparte ese volumen: no considerar verificados flujos que requieren compartir archivos; antes de habilitarlos resolver almacenamiento común privado.
- Biblioteca de materiales es específica del tenant `bellomo`; el tenant sintético no está autorizado. No se habilitó ni se modificó ese contrato.
- Scheduler desplegado; ver actualización abajo.
- MySQL 9 de la plantilla inicial quedó sin despliegue; su volumen vacío se conserva. La base utilizada es `mysql84`, no `MySQL`.

Esta evidencia NO completa F0 de producción ni autoriza merge a `main`.

## Actualización verificada — PWA, push y scheduler (2026-10-02)

- Siete commits revisados y publicados en `chore/agentic-setup`, hasta `fb66065`. Revisión independiente de aislamiento y seguridad: sin vulnerabilidades nuevas identificadas en ese diff.
- API, worker, scheduler y panel desplegados con `fb66065`; todos SUCCESS en Railway.
- Redis independiente de staging, sin dominio público: sesiones y caché usan `redis`; conexión comprobada con PING. Cola general y web push siguen en `database`, consumida por el worker existente.
- Scheduler `77b6fa75-9557-4ef5-916c-8d04426e1003`: una réplica, sin dominio HTTP, arranque `entrypoint.sh scheduler`; logs muestran `everprop:conversations:reconcile` DONE en dos minutos consecutivos.
- VAPID generado dentro del contenedor y guardado únicamente en variables de staging para API, worker y scheduler. No se imprimieron ni guardaron claves en Git; subject HTTPS del panel de staging.
- `everprop:production-check --connections --webpush`: OK en API, worker y scheduler. API efectiva: IA false, proveedor disabled, Meta false; cola pendiente y fallida ambas 0 en la comprobación.
- Panel: `/login`, `/icon/192`, `/icon/512`, `/manifest.webmanifest`, `/notifications-sw.js` y `/healthz`: 200. API `/readyz`: 200. Consultas JSON sin sesión a `/api/v1/auth/me` y `/api/v1/admin/conversations`: 401.
- Verificación local: ConversationAlertsTest, 7 tests / 49 assertions, sin fallos (warnings por ausencia de .env); frontend 6 tests OK; Pint 5 archivos OK; lint frontend sin errores, con warnings existentes. El host map del contenedor E2E se vació solo para el proceso de test, sin cambiar archivos ni servicios.
- CI del commit: guard, evals y frontend en verde; backend todavía en curso al registrar esta evidencia. Preview Vercel automático generado, pero no se usó ni se modificaron sus variables: usar únicamente el panel Railway verificado.

S8 queda **parcial**: configuración y recursos PWA comprobados; instalación, permiso y entrega push en un celular físico NO verificados. S6 (respuesta asesor y reinicio con envío pendiente), logout en navegador y sitio externo continúan pendientes. Redis no borra las tablas auxiliares creadas antes; no se hizo ninguna eliminación.

## Corrección de activación push — 2026-10-02

- Prueba IP14-01: mensaje sintético visible una vez en el widget; el usuario reportó un aviso solamente al abrir la PWA, no en pantalla bloqueada. No cuenta como entrega push verificada.
- Consulta acotada a `admin-staging@e2e.invalid`: cero suscripciones push, notificación database creada y leída, cero jobs pendientes/fallidos. No se imprimieron endpoints ni claves.
- `5b766b1` unifica la activación: permiso desde el clic, suscripción local y registro confirmado por servidor. Campana dirige a Configuración; no existe falso éxito por permiso aislado.
- Correcciones adicionales: estado activo requiere permiso granted; errores síncronos de permiso recuperables; error de desactivación visible; conflicto 409 muestra recuperación por cuenta anterior sin exponer datos técnicos.
- Verificación local: 58 tests frontend, TypeScript y build OK. Lint completo: 0 errores, 153 advertencias. Revisión independiente de aislamiento/CSRF y recuperación: sin bloqueantes después de las correcciones.
- Entrega física pendiente: actualizar/reabrir PWA, activar desde Configuración, comprobar suscripción Apple registrada y repetir con iPhone bloqueado. No es necesario reinstalar de entrada; el service worker no cambió en este arreglo.

## S6 — preparación verificada, recorrido bloqueado (2026-10-05)

Registro cerrado a las 11:41 ART (UTC−03:00). Procedimiento: `staging-s6.md`. Rama local `chore/agentic-setup`, HEAD `8c5203155c3628b6d9341a14b4324a5dd8d4a77b`. Solo proyecto `bellomito-staging`, entorno `staging`.

**S6 NO verificado.** No se inició el recorrido porque P4 y P5 no están cumplidos. No confundir salud y despliegues correctos con una prueba de entrega.

### Preparación

| Paso | Resultado observado | Evidencia |
|---|---|---|
| P1 API | OK: ACTIVE, Deployment successful; enlace de commit `8c5203155c3628b6d9341a14b4324a5dd8d4a77b`, rama `chore/agentic-setup`; deployment `4e7a9a4c-0128-4784-b0b1-fc6120df0c71` | Detalle leído en Railway |
| P1 worker | OK: mismo SHA y rama, ACTIVE, Deployment successful; deployment `414de387-cda4-451d-b336-c2d6ab5cbaed` | [Captura](evidence/s6-2026-10-05/p1-worker.jpg) |
| P1 scheduler | OK: mismo SHA y rama, ACTIVE, Deployment successful; deployment `425728bf-00de-4c32-afab-8963ba090e17` | [Captura](evidence/s6-2026-10-05/p1-scheduler.jpg) |
| P1 panel | OK: mismo SHA y rama, ACTIVE, Deployment successful; deployment `df6bebda-60dc-4d7c-a06c-5f875136ea2b` | [Captura](evidence/s6-2026-10-05/p1-panel.jpg) |
| P2 | OK: API `/readyz` HTTP 200, `{"status":"ready"}`; `everprop:production-check --connections` ejecutado en API y worker: 24 OK, 0 FAIL en cada uno | [API](evidence/s6-2026-10-05/p2-api-check.jpg), [worker](evidence/s6-2026-10-05/p2-worker-check.jpg) |
| P3 | OK: `SELECT (SELECT COUNT(*) FROM jobs) AS pending, (SELECT COUNT(*) FROM failed_jobs) AS failed` devolvió `pending=0`, `failed=0` desde API staging | [Captura](evidence/s6-2026-10-05/p3-queue.jpg) |
| P4 | BLOQUEADO: panel muestra formulario de login vacío, no hay sesión del asesor disponible. No se verificó rol ni tenant del usuario. Se pidió al usuario iniciar sesión personalmente, sin compartir contraseña | [Captura sin credenciales](evidence/s6-2026-10-05/p4-login-pending.jpg) |
| P5 | BLOQUEADO: el navegador conectado es el integrado y no expone creación de ventana de incógnito. Se solicitó una ventana de incógnito conectada; no se sustituyó por otra pestaña con almacenamiento compartido | No se abrió sesión de visitante |

La CLI Railway no está disponible en PATH; los chequeos se ejecutaron en la consola web del servicio correcto. Un primer intento de consulta falló por pérdida de separadores de namespace al introducir el comando; se repitió con el alias `DB` y pegado literal. Fue un error del comando diagnóstico, no una excepción del worker. Ninguno de esos comandos escribió en la base.

### Recorridos y consultas pendientes

| Pasos | Estado | Motivo |
|---|---|---|
| A1, A2, A3, A4, A5, A6, A7 | NO EJECUTADOS | P4 y P5 pendientes; no se enviaron mensajes de S6 |
| B1, B2, B3, B4, B5, B6 | NO EJECUTADOS | Recorrido A no ejecutado; worker no detenido ni reiniciado |
| C1, C2, C3, C4, C5 | NO EJECUTADOS | Sin sesión de asesor ni conversación S6 |
| Consulta 1: duplicados | NO EJECUTADA | No hubo recorrido S6; no se declara resultado de 0 filas |
| Consulta 2: estados de envíos | NO EJECUTADA | No hubo envíos S6 |
| Consulta 3: nota interna sin jobs | NO EJECUTADA | No se creó la nota S6-C |
| Logs de reinicio B4–B5 | NO APLICA / pendiente | No hubo reinicio del worker |

No se observó un criterio de corte durante las verificaciones preparatorias; los criterios de entrega, duplicación, nota interna y recuperación de cola no fueron ejercitados. El impedimento actual es de acceso y aislamiento del navegador, no un resultado de aprobación ni una falla funcional demostrada.

No se corrigió nada a mano. No se modificaron datos mediante SQL, servicios, variables de IA/Meta, producción, `main` ni Vercel. No se inició Docker. El worker quedó corriendo. Las capturas no incluyen contraseñas, tokens, cookies ni valores de variables. La evidencia queda local, sin commit ni push de esta tanda.

### Operación separada de S6 — recuperación autorizada de cuenta (2026-10-05)

Después de la preparación anterior, el usuario autorizó expresamente recuperar la cuenta administradora de staging y cambiar su correo. Esto no forma parte de S6 ni cambia sus límites de solo lectura.

- Se comprobó el proyecto y entorno Railway exactos antes de escribir; tenant `bellomito-staging`, cuenta existente con rol `TENANT_ADMIN`, sin conflicto con el nuevo correo.
- Se cambió exclusivamente esa cuenta de `admin-staging@e2e.invalid` a `staging@eversyssolutions.com.ar`, conservando identidad y rol. Estado `PAUSED`, contraseña anterior eliminada; verificación posterior confirmó esos valores y ausencia de contraseña.
- Se preparó activación con el mecanismo existente: clave temporal en caché, vinculada a esa cuenta y tenant, válida por 24 horas y de un solo uso. No se registró el token en esta evidencia, archivos ni chat.
- Se dejó la pantalla de activación al usuario para que ingrese y confirme personalmente su contraseña. Activación y login nuevos todavía NO verificados. No se capturará la contraseña.
- Actualización posterior: el usuario completó personalmente la activación. Se verificó el mensaje visible «Tu cuenta está lista» y la URL `/activar` sin token. [Confirmación sin credenciales](evidence/staging-account-activated.jpg). Se abrió el login y se completó únicamente el correo; login, rol y tenant de la sesión siguen pendientes de verificar. No se leyó ni capturó la contraseña.
- [Pantalla de activación con campos vacíos](evidence/staging-account-activation.jpg). No hubo cambios de código, deploy, variables, producción, `main` ni Vercel. S6 sigue pendiente.

### S6 — P4 completado tras login personal (2026-10-05)

- El usuario inició sesión personalmente con la cuenta recuperada. `/admin` muestra «Administrador de pruebas staging · Bellomito Staging - DATOS FICTICIOS» y navegación administrativa, incluida Alta de usuarios. Se comprobó acceso a `/admin/conversaciones`: listado y filtros visibles, sin error de autorización. P4 queda OK; la comprobación anterior de rol `TENANT_ADMIN` corresponde a la misma cuenta recuperada.
- [Bandeja autenticada sin contraseñas, cookies ni tokens](evidence/s6-2026-10-05/p4-authenticated.jpg).
- P5 continúa bloqueado: el inventario de navegadores conectados solo contiene IAB y MCP Apps; no hay Chrome ni ventana de incógnito controlable. No se sustituyó el requisito del guion por una pestaña con almacenamiento compartido.
- A1–A7, B1–B6, C1–C5 y las tres consultas finales siguen NO EJECUTADOS. No se enviaron mensajes ni se detuvo el worker. S6 NO verificado; falta P5 para iniciar el recorrido. Los chequeos preparatorios registrados antes no constituyen una nueva comprobación de salud en este intento.
- Producción, `main`, Vercel y variables IA/Meta sin cambios. Se utilizó la skill computer-use como guía de interacción; no se usó automatización nativa de Windows ni se intentó eludir el aislamiento del navegador.
