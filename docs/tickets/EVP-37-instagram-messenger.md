# EVP-37 — Bellomito en Instagram DM y Facebook Messenger

Rama `ticket/EVP-37-instagram-messenger`, desde `develop` `4b3c894` · 2026-10-16 · Antigravity con Mauro Centurión.
Jira: https://eversys.atlassian.net/browse/EVP-37, asignado a Mauro Centurión.

## 1. Qué pedía el ticket

Extender el motor omnicanal de conversaciones y la IA (`Bellomito`) para operar en **Instagram Direct (`INSTAGRAM_DM`)** y **Facebook Messenger (`FACEBOOK_MESSENGER`)**, reutilizando la infraestructura de recepción firmada, cola durable de recibos, ventana de servicio de 24 horas y despacho con *fencing*, además de incorporar un modo de simulación local para probar el ciclo completo con la IA sin cuentas productivas de Meta.

## 2. Qué se implementó

- **Recepción de webhooks de Instagram y Messenger (`MetaWhatsAppWebhookController.php` y `routes/api.php`):**
  - Soporta `object = "instagram"` y `object = "page"` además de `whatsapp_business_account`, compartiendo validación de firma `X-Hub-Signature-256` (HMAC-SHA256) y límite de payload.
  - Rutas neutrales `GET/POST /api/v1/webhooks/meta` junto con las existentes `/api/v1/webhooks/meta/whatsapp`.
  - Almacenamiento durable previo al HTTP 200 en `webhook_receipts` con `provider_object = instagram_messages | messenger_messages` e idempotencia por `meta-social:<sha256>`.
- **Procesamiento e identidades (`MetaWebhookProcessor.php`, `ProcessMetaWebhookReceipt.php`, `ReconcileConversations.php`):**
  - `socialChannelFor(string $channelType, string $accountId)`: resuelve la cuenta (`INSTAGRAM_DM` o `FACEBOOK_MESSENGER`) verificando estado `ACTIVE` e integración `META` `ACTIVE`. Si el mismo ID de cuenta estuviera asociado a más de un tenant activo, falla cerrado (`null`) para impedir filtraciones entre tenants.
  - `social(...)`: procesa `entry[].messaging[]`, ignora ecos (`message.is_echo`), deduplica por `mid` y delega en `InboundMessageService::accept()` creando conversaciones `ig:<IGSID>` y `fb:<PSID>` e identidades `INSTAGRAM` y `FACEBOOK`.
  - Re-verificación de titularidad del canal en `ProcessMetaWebhookReceipt` antes de aplicar el recibo, y barrido de reconciliación y redacción de PII en `ReconcileConversations`.
- **Transporte saliente y políticas (`MetaMessengerTransport.php`, `TransportRegistry.php`, `ChannelPolicy.php`, `OutboundDispatcher.php`):**
  - `MetaMessengerTransport`: envía respuestas de texto mediante `POST https://graph.facebook.com/{version}/me/messages` (`messaging_type = RESPONSE`). Maneja estados ambiguos (`5xx` / corte de red → `DeliveryAmbiguous`), revocación automática de token ante error OAuth `190` (`META_TOKEN_REVOKED`) y rechazo explícito de adjuntos (`MEDIA_UNSUPPORTED`).
  - `ChannelPolicy`: aplica la ventana de atención al cliente de 24 horas a `INSTAGRAM_DM` y `FACEBOOK_MESSENGER` (además de `WHATSAPP`), expuesta también en `reply_window` de `AdminConversationController`.
  - `OutboundDispatcher`: extrae el destinatario removiendo los prefijos `wa:`, `ig:` y `fb:`.
- **Modo de simulación local (`MetaSimulateInbound.php`, `config/services.php`, `WhatsAppCloudTransport.php`):**
  - Flag `META_SEND_FAKE=true` (ignorado estrictamente cuando `APP_ENV=production`) para que los transportes de Meta devuelvan `accepted('fake:<nonce>')` en entorno local y permitan conversar múltiples turnos con la IA dejando los mensajes en estado `SENT`.
  - Comando `php artisan meta:simulate {channel} {sender} {text} {--tenant=} {--setup}` (bloqueado en producción) que aprovisiona canales sintéticos locales y despacha webhooks firmados con HMAC-SHA256 contra el pipeline real.
- **Panel web (`everprop-public/src/lib/conversations-api.ts`):**
  - Etiquetas `INSTAGRAM_DM: "Instagram"` y `FACEBOOK_MESSENGER: "Messenger"` en `CHANNEL_LABELS`.

## 3. Por qué esta solución

- **Filosofía Ponytail:** cero tablas nuevas ni abstracciones paralelas; reutiliza `webhook_receipts`, `InboundMessageService`, `ContactIdentityResolver`, `RunAgentJob`, `AgentCoordinator`, `ChannelPolicy` y `OutboundDispatcher`.
- Un único transporte (`MetaMessengerTransport`) cubre ambos canales de Messenger Platform (Instagram DM y Facebook Messenger usan el mismo contrato `/me/messages`).

## 4. Cómo se verificó

- **`MetaSocialWebhookTest` (6 tests, 32 assertions):**
  1. Rechazo de firma inválida (401) en `/api/v1/webhooks/meta` sin escrituras.
  2. Creación de conversaciones `ig:` / `fb:`, identidades `INSTAGRAM` / `FACEBOOK`, descarte de ecos (`is_echo`), idempotencia ante reentregas y encolado de `RunAgentJob`.
  3. Descarte seguro (*fail closed*) ante cuentas no mapeadas o ambiguas entre dos tenants.
  4. Rechazo (`REJECTED` / `CHANNEL_CHANGED`) si una cuenta cambia de tenant antes de procesarse el recibo.
  5. `MetaMessengerTransport` + `OutboundDispatcher`: bloqueo por defecto (`CHANNEL_SEND_DISABLED`), rechazo de adjuntos (`MEDIA_UNSUPPORTED`), modo `send_fake`, respuestas Graph API (`200` → `SENT`, `190` → revocación de token, `502` → `DeliveryAmbiguous`) y bloqueo por ventana de 24 h vencida (`OUTSIDE_SERVICE_WINDOW`).
  6. Comando `meta:simulate --setup` de punta a punta.
- **PHPStan (`vendor/bin/phpstan analyse --memory-limit=1G`):** 0 errores.
- **Laravel Pint (`vendor/bin/pint --test`):** 100% aprobado (305 archivos).
- **TypeScript (`npx tsc --noEmit` en `everprop-public`):** 0 errores.
