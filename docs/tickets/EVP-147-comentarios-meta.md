# EVP-147: comentarios de publicaciones de Instagram y Facebook

Rama `ticket/EVP-147-comentarios-meta`, creada desde `develop` @ `57af421` · 2026-11-16 · Ramiro Ruggeri con Claude

## Problema

Hallazgo CAP-21 de la auditoría QA de staging del 2026-11-12. Un webhook de Instagram con `changes[].field = "comments"` se aceptaba con 200 y se descartaba sin dejar rastro, porque solo se procesaban los mensajes directos (`messaging`). Los comentarios del tipo «¿precio?» en las publicaciones de Bellomo no quedaban registrados en ningún lado.

## Decisión

El usuario lo decidió el 2026-11-16: **alcance mínimo ahora**. Los comentarios se registran en vez de descartarse, sin permisos nuevos ni cambios en Meta.

Capturarlos como posibles leads requiere `instagram_business_manage_comments`, que pasa por App Review de Meta. Eso queda en **EVP-156**, bloqueado por esa revisión y por la autorización X04.

## Cambios

### `MetaWhatsAppWebhookController`

En los objetos `instagram` y `page`, además de `messaging`, ahora se recorre `entry[].changes[]`:
- **Comentarios:** son `instagram` con `field = comments`, o `page` con `field = feed` e `item = comment`. Cada uno se guarda como recibo durable en `webhook_receipts`:
  - `provider_object` `instagram_comments` o `facebook_comments`;
  - estado `VERIFIED`, que el esquema define como "firma verificada, sin procesar" y que el reconciliador nunca toma;
  - la misma deduplicación por contenido que los mensajes, así que un reenvío de Meta no duplica el recibo;
  - `expires_at` a 30 días.

  No se crea ninguna conversación ni se encola procesamiento. Queda un log `meta.webhook.comment_recorded`, solo con ids.
- **Cuenta no mapeada:** se cuenta como `UNMAPPED_ACCOUNT`, igual que los mensajes (EVP-138).
- **Cualquier otro campo** (por ejemplo una publicación propia en `feed`, `mentions`): solo log `meta.webhook.unhandled_change`, con objeto, campo y cuenta, nunca contenido.

### `ReconcileConversations`

La limpieza que borra el texto del cliente al vencer `expires_at` ahora también alcanza a los recibos de comentarios. No entran en el reprocesamiento.

### Por qué `VERIFIED`

El CHECK de `webhook_receipts.processing_status` no admite `IGNORED`. `VERIFIED` ya existe y describe exactamente este estado, así que no hace falta un forward SQL.

## Verificación

Stack aislado `everprop-rag` (PHP 8.4, MySQL 8.4), contenedor `everprop-rag-php147`. Test nuevo en `MetaSocialWebhookTest` con webhooks firmados simulados:
- **Instagram:** un comentario genera 1 recibo `instagram_comments` en `VERIFIED`. El reenvío idéntico no genera un segundo recibo.
- **Facebook:** un comentario en `feed` genera 1 recibo `facebook_comments`. Una publicación propia en `feed` no genera recibo.
- **Cuenta no mapeada:** no genera recibo.
- **Sin efectos de mensaje:** no se crea ninguna conversación ni se encola `ProcessMetaWebhookReceipt`.
- **Reconciliador:** con los recibos vencidos, no los reprocesa y borra el texto del comentario; el estado sigue en `VERIFIED`.
- **Sin regresiones:** `MetaSocialWebhookTest`, `MetaDroppedEventsTest` y `WhatsAppWebhookReceiptTest` dan 24 passed (191 assertions).
- **Calidad:** Pint PASS.
- **PHPStan:** sin errores.
- **Suite completa:** 603 passed, 1 skipped, 1 failed. La falla es `WhatsAppParallelQueueTest`, la carrera conocida del propio test (también en el CI de #133 y #137). Corrido solo, falló una vez y pasó la siguiente; no tiene relación con este cambio.

## Pendientes

- **En Meta:** para que lleguen comentarios reales hay que suscribir `comments` en Instagram y `feed` en Facebook. Hoy no está suscripto, así que en la práctica no llegan. Este cambio deja el código preparado para no perderlos cuando se suscriba, y eso requiere autorización.
- **Captura como posibles leads:** EVP-156.
- Sin forwards SQL ni variables nuevas.
