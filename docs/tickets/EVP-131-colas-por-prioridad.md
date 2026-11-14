# EVP-131 — Cola: separar los webhooks de los turnos de IA

Rama `ticket/EVP-131-colas-prioridad` (desde `develop` @ `36a0474`) · fecha 2026-11-12 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P2-1 de la auditoría `QA_STAGING_BELLOMO.md`. Todos los trabajos usaban una sola cola (`default`) y un solo worker. Los turnos de IA (`RunAgentJob`, que espera varios segundos a Gemini) quedaban delante de `ProcessMetaWebhookReceipt`:

- en una ráfaga de 15 webhooks, cada recibo tardó 20,6 s en promedio en llegar a `PROCESSED`;
- algunos avisos de derivación tardaron hasta 2 min 5 s.

Se pedían colas separadas (`webhooks`, `outbound`, `agent`) consumidas por prioridad, y al menos 2 workers en producción.

## 2. Qué se implementó

- **`config/queue.php`:** nueva clave `lanes` con las colas `webhooks`, `outbound` y `agent`.
- **Jobs:** cada uno elige su cola en el constructor, así que también la respetan los reencolados del reconciliador:
  - `ProcessMetaWebhookReceipt` → `webhooks`;
  - `DispatchOutboundJob` → `outbound`;
  - `RunAgentJob` → `agent`.
- **Webhooks genéricos:** `ProcessWebhookReceipt` (`WebhookReceiver`) también va a `webhooks`. Se quitó `services.webhooks.queue` (`WEBHOOK_QUEUE`), que duplicaba el dato.
- **Worker** (`docker/production/entrypoint.sh`):
  - consume `--queue=webhooks,outbound,agent,default` en ese orden;
  - `default` va última y cubre Web Push y los trabajos que ya estaban encolados al momento del deploy;
  - `QUEUE_WORKER_QUEUES` cambia la lista. Un segundo servicio con `webhooks,outbound` deja una vía rápida que nunca corre turnos de IA.
- **Desarrollo local:** `compose.yaml` usa el mismo orden de colas.
- **Documentación:** `environment.example`, `docs/railway-backend.md` y `docs/eversys-conversations/go-live.md` explican el segundo worker.
- **Tests existentes:** los que aíslan su propia cola (`WhatsAppGeminiFlowTest`, `WhatsAppParallelQueueTest`) ahora mandan todas las colas a esa cola. `QueueDispatchFlowTest` consume `outbound`.

## 3. Por qué esta solución

- **Mínimo cambio:** Laravel ya consume varias colas por prioridad con `--queue=a,b,c`. No hace falta Horizon, Redis ni otro driver: funciona igual con `database` (staging) y `redis`.
- **Con un solo worker:** un webhook espera como máximo el trabajo que está corriendo, no toda la cola. En una ráfaga, los recibos se procesan antes que los turnos de IA que generan.
- **Para no esperar nunca un turno de IA** (criterio de < 3 s): segundo servicio de worker con `QUEUE_WORKER_QUEUES=webhooks,outbound`. Es configuración de Railway, no código. Así se cumple también «al menos 2 workers».
- **`railway-worker.json` no cambia:** ya delega en `entrypoint.sh worker`. El segundo servicio usa el mismo archivo y se distingue solo por la variable.

## 4. Cómo se verificó

En el contenedor `everprop-api-php` (PHP 8.4, MySQL 8.4, Redis), con una copia aislada del worktree en `/tmp/evp131`:

- **`tests/Feature/Conversations/QueueLanesTest.php` (nuevo): 2 tests, PASS.**
  - Cada job queda en su cola.
  - El orden del worker en `entrypoint.sh` y `compose.yaml` coincide con `config/queue.php`.
  - Con un turno de IA encolado *antes* que un webhook, `queue:work --once` procesa el webhook y deja el turno esperando.
- **Tests de cola existentes:** PASS.
  - `WhatsAppGeminiFlowTest`: webhook firmado → Gemini → envío, con la cola real `database`.
  - `WhatsAppParallelQueueTest`: 4 workers, 200 conversaciones, 1015 assertions.
  - `QueueDispatchFlowTest`.
  - `ProductionWorkerEntrypointTest`.
- **Suites `tests/Feature/Conversations`, `tests/Feature/Integrations` y `tests/Unit`:** 324/325. La falla es `WebChatAndUsageTest::test_whatsapp_transport_is_disabled_by_default_and_maps_provider_outcomes`, que **ya fallaba sobre `develop`** con el mismo `.env.testing` local (ver EVP-125). No es de este ticket.
- **Calidad:** Pint PASS, PHPStan sin errores en los archivos tocados, `sh -n entrypoint.sh` OK.

## 5. Pendientes y riesgos

- **Sin medir en staging:** el criterio de aceptación (15 DMs → recibos `PROCESSED` en < 3 s; derivación avisada en < 30 s) se mide después de desplegar.
- **Segundo worker:** para cumplir < 3 s con la IA encendida, hay que crear en Railway (staging y producción) otro servicio con `railway-worker.json` y `QUEUE_WORKER_QUEUES=webhooks,outbound`. No se hizo: es un cambio de infraestructura que necesita autorización. Producción (`awake-dedication`) hoy no tiene ningún worker.
- **Deploy:** si la API nueva arranca antes que el worker nuevo, el worker viejo solo consume `default` y los trabajos nuevos esperan unos segundos. El reconciliador los reencola igual. Conviene desplegar el worker junto con la API.
- **`WEBHOOK_QUEUE`:** si está definida en Railway, ya no tiene efecto. Se puede borrar.
- **Pausa de emergencia:** `queue:pause <conexión>:default`, propuesta en `handoff-codex-meta.md` (S6-B), ahora tiene que aplicarse a cada cola (`webhooks`, `outbound`, `agent`).
