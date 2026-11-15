# EVP-138 — Webhooks Meta: los eventos descartados se cuentan y alertan

Rama `ticket/EVP-138-meta-descartados` (desde `develop` @ `81de372`) · fecha 2026-11-14 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P2-8 de la auditoría `QA_STAGING_BELLOMO.md` (RES-08 y RES-05). La API descartaba eventos de Meta sin avisar:

- **Cuenta no mapeada:** un webhook firmado de un número de WhatsApp, página o cuenta de Instagram sin canal (o con el canal mal cargado) recibía 200 y solo dejaba un `Log::warning`. El mensaje se perdía sin alerta.
- **Evento incompleto:** un evento sin `sender` se descartaba y el recibo quedaba `PROCESSED`, sin rastro.
- **`REJECTED CHANNEL_CHANGED`:** también se descartaba en silencio.

## 2. Qué se implementó

**API** (`everprop-api`)

- **`App\Domain\Conversations\Support\DroppedMetaEvents`** (nuevo). `record($reason, $channelType, $accountId)` hace tres cosas:
  - suma 1 a un contador por motivo y por hora en la caché (Redis), con vencimiento de 2 horas;
  - escribe el log `meta.webhook.dropped_event` con el motivo, el tipo de canal, el ID de cuenta y el conteo de la hora;
  - cuando un motivo llega a **5 en la hora**, escribe **una** vez el log de error `meta.webhook.dropped_events_alert` con una pista de qué revisar.
- **Motivos y dónde se registran:**

  | Motivo | Dónde | Antes |
  |---|---|---|
  | `UNMAPPED_ACCOUNT` | controller, sin canal para el número o la cuenta | `Log::warning` sin la cuenta |
  | `INCOMPLETE_EVENT` | processor, mensaje sin remitente, sin id o con remitente inválido (Instagram, Messenger y WhatsApp) | nada |
  | `CHANNEL_CHANGED` | job, recibo rechazado porque el canal cambió | solo el estado del recibo |

- **Lo que no se cuenta,** porque se descarta a propósito: los ecos (`is_echo`), los mensajes que manda la propia cuenta y los eventos que no son mensajes (lecturas, entregas).
- **`php artisan everprop:meta:dropped-events`** (nuevo): muestra los descartes de esta hora y de la anterior, por motivo.
- **Runbook** (`docs/eversys-conversations/meta-checklist.md` §6c): al conectar cada cuenta, verificar que el primer mensaje real llega a la bandeja. Si no llega, el comando y el log dicen por qué y qué ID mandó Meta.

## 3. Por qué esta solución

- **Contador en la caché en vez de una fila en `webhook_receipts`,** que es lo que sugería el ticket. Esa tabla exige `tenant_id` e `integration_id`, y una cuenta no mapeada no tiene ninguno de los dos. Una tabla nueva implicaba una migración para algo que solo necesita conteos por hora y un log con la cuenta. Está marcado con `ponytail:` por si más adelante hace falta historial.
- **Sin texto del cliente:** el log lleva solo el motivo, el tipo de canal y el ID de la cuenta del negocio (página, número o cuenta de Instagram), que es el dato que hay que corregir en el canal.
- **La alerta es un log de error:** los admins de plataforma no son usuarios de ningún tenant, así que no hay a quién mandarle una notificación del panel. El log de error es lo que se puede alertar en Railway. Sale una sola vez por motivo y por hora (al llegar a 5), para no llenar los logs.
- **Si la caché falla, el webhook igual responde 200.** El conteo va dentro de `rescue`, y el log se escribe igual. Un 500 haría que Meta reenvíe el lote sin fin.

## 4. Cómo se verificó

**API**, en el contenedor `everprop-api-php` (PHP 8.4, MySQL 8.4, Redis; Laravel 13.40), con una copia aislada en `/tmp/evp138`:

- **`tests/Feature/Conversations/MetaDroppedEventsTest.php`** (nuevo): **3 tests y 21 assertions, PASS**.
  - **Cuenta no mapeada:** 1 webhook de WhatsApp y 5 de Instagram dan `UNMAPPED_ACCOUNT` = 6. No se guarda ningún recibo. Hay 5 warnings con la cuenta de Instagram y **un** solo error de alerta, cuando el contador del motivo llega a 5. El comando muestra el motivo.
  - **Evento incompleto:** un webhook trae un evento sin `sender`, un eco y un mensaje válido. Solo el primero cuenta como `INCOMPLETE_EVENT`, solo el válido llega a `messages` y el recibo queda `PROCESSED`.
  - **Canal cambiado:** se desactiva el canal antes de procesar el recibo. El recibo queda `REJECTED` con `CHANNEL_CHANGED` y el contador suma 1.
- **`MetaSocialWebhookTest`:** sigue pasando (11 tests).
- **Suite completa:** 591 tests. Las 14 fallas son las mismas que en `develop` sin este cambio (`CollectionEmailTest` ×11, `WebChatAndUsageTest`, `PrepareMetaReviewTest`, `ProductionEnvironmentTest`). Vienen del `.env.testing` local.
- **Calidad:** Pint PASS (350 archivos) y PHPStan sin errores.

## 5. Pendientes y riesgos

- **Alerta en Railway:** hay que configurar que el log `meta.webhook.dropped_events_alert` avise (mail, Slack o el canal que use el equipo). Es infraestructura, así que queda para Mauro.
- **Umbral fijo (5 por hora y por motivo):** sirve para detectar un canal mal cargado. Si hace falta ajustarlo, se puede pasar a config.
- **El contador vive en la caché:** si se vacía, se pierde el conteo de la hora, pero los logs quedan.
- **El conteo es por motivo, no por cuenta.** El log `dropped_event` sí trae la cuenta.
