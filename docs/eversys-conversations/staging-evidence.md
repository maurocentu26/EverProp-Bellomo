# Bellomito staging — evidencia 2026-10-02

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
- No hay cuenta humana de acceso habilitada ni sitio de pruebas externo integrado todavía.
- API tiene volumen privado persistente. Worker no comparte ese volumen: no considerar verificados flujos que requieren compartir archivos; antes de habilitarlos resolver almacenamiento común privado.
- Biblioteca de materiales es específica del tenant `bellomo`; el tenant sintético no está autorizado. No se habilitó ni se modificó ese contrato.
- Scheduler no desplegado.
- MySQL 9 de la plantilla inicial quedó sin despliegue; su volumen vacío se conserva. La base utilizada es `mysql84`, no `MySQL`.

Esta evidencia NO completa F0 de producción ni autoriza merge a `main`.
