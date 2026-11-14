# EVP-127 — Conversaciones: si falla el envío de la respuesta del bot, derivar a un asesor y avisar

Rama `ticket/EVP-127-derivar-si-falla-envio-bot` (desde `develop` @ `36a0474`) · fecha 2026-11-14 · autor Claude (subagente) · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P1 de QA en staging: con la IA encendida, si la respuesta del bot no se puede enviar a Meta (token vencido o revocado, 4xx, canal sin configurar), el mensaje queda `FAILED`, la conversación sigue en `AI_ACTIVE`, el cliente no recibe nada y nadie se entera. Staging tiene 9 envíos fallidos reales (`META_HTTP_400` ×7, `META_TOKEN_REVOKED` ×2).

Criterios de aceptación:

1. `CHANNEL_NOT_CONFIGURED`, `META_TOKEN_REVOKED` y `META_HTTP_400` en una respuesta del bot → `WAITING_HUMAN` y 1 aviso.
2. Dos fallos seguidos → 1 solo aviso.
3. Un fallo de un mensaje de asesor (`USER`) no cambia el control.
4. Tests en `HandoffAndDispatchTest` o en uno nuevo.

Además: con `CHANNEL_NOT_CONFIGURED` o `META_TOKEN_REVOKED`, avisar a los usuarios con `manageIntegrations`. El asesor tiene que ver en la bandeja que la última respuesta automática no llegó.

Fuera de alcance: los `FAILED` asincrónicos que informa Meta por webhook de estado, después de aceptar el envío (ver la sección 5).

## 2. Qué se implementó

- `everprop-api/app/Domain/Conversations/Services/OutboundDispatcher.php:198`, `handOffUndelivered()`: cuando un envío del bot (job con `control_epoch`, es decir `sender_type = BOT`) termina en `FAILED` o `UNKNOWN`, deriva la conversación con `ConversationControl::requestHuman()`. El motivo es `DELIVERY_FAILED: <código>` para `FAILED` y `DELIVERY_UNKNOWN: <código>` para `UNKNOWN` (`:207`). Solo actúa si el bot todavía tiene el control **con el mismo epoch del job**; en cualquier otro caso no hace nada. Quien lo llama debe tener una transacción abierta.
  - Lo llaman tres lugares:
    - `settle()`: rechazo del proveedor, reintentos agotados o envío ambiguo.
    - `claim()` (`:107`): la política del canal bloquea el envío antes de salir (canal pausado, ventana de 24 h cerrada, adjunto faltante).
    - El barrido de lease vencido de `ReconcileConversations`.
  - `claim()` ahora devuelve también el `control_epoch` del job.
  - Credenciales: con `CHANNEL_NOT_CONFIGURED` o `META_TOKEN_REVOKED`, registra un evento `CHANNEL_CANNOT_SEND` en `domain_outbox` con la clave `channel-cannot-send:<integración>:<día UTC>`. Usa `insertOrIgnore` sobre el `UNIQUE(tenant_id, idempotency_key)` que ya existía.
    - Si es el primero del día y el código es `CHANNEL_NOT_CONFIGURED`, avisa a quienes tienen `manageIntegrations`.
    - Con `META_TOKEN_REVOKED` no avisa: ese aviso ya lo manda `IntegrationTokens::revoke()` desde el transporte, una sola vez, al revocar el token. Este registro solo evita un segundo aviso ese día.
- `OutboundDispatcher.php:38-56`, `dispatch()`: el `try` solo envuelve la llamada al transporte. `settle()` se llama una sola vez, afuera (`:54`). Una excepción del transporte sigue contando como envío ambiguo (`UNKNOWN`). En cambio, un error al registrar un resultado conocido ya no se reescribe como `UNKNOWN/DELIVERY_UNKNOWN`: se propaga, el job queda en `PROCESSING` y el barrido de lease lo recupera.
- `everprop-api/app/Console/Commands/ReconcileConversations.php:37-52`: busca los jobs del bot en `UNKNOWN/LEASE_EXPIRED` cuya conversación sigue en `BOT_STATES` con el mismo epoch, y para cada uno llama a `handOffUndelivered(..., 'UNKNOWN', 'LEASE_EXPIRED', 0)` en su propia transacción. Si una fila falla, se reporta el error y el barrido sigue.
  - Los jobs se eligen por estado, no por lo que actualizó el barrido en curso. Si una derivación falla, se reintenta en el barrido siguiente. Una vez derivada, la conversación ya no cumple el filtro, así que nunca se avisa dos veces.
- `everprop-api/app/Domain/Conversations/Notifications/ConversationNeedsAttention.php:109-110`: dos motivos canónicos, ninguno con texto del cliente.
  - `DELIVERY_FAILED`: "La última respuesta automática en <canal> no le llegó al cliente: necesita a un asesor."
  - `DELIVERY_UNKNOWN`: "No pudimos confirmar si la última respuesta automática en <canal> llegó al cliente: revisala antes de responder."
- `everprop-api/app/Domain/Integrations/Notifications/IntegrationRevoked.php:13-53`: reutiliza la notificación de canal caído que ya existía y le agrega el parámetro opcional `cannotSend`. El texto es neutro ("Un canal no puede enviar mensajes: revisá su conexión en Configuración…") y no afirma que sea un problema de acceso, porque `CHANNEL_NOT_CONFIGURED` también sale por un canal mal configurado.
  - Los destinatarios no cambian: usuarios activos del tenant cuyo `role_code` permite `Capability::MANAGE_INTEGRATIONS` (D05, sin RBAC paralelo).
  - El `event_type` sigue siendo `INTEGRATION_REVOKED`, que la campana del panel ya muestra como "Requiere acción".
- Frontend: sin cambios. La bandeja ya muestra la burbuja "IA" con la marca roja "No enviado" (`FAILED`) o "Envío sin confirmar" (`UNKNOWN`) (`ConversationInbox.tsx`, `DeliveryMark`, y `deliveryLabel` en `conversations-api.ts`). La conversación pasa a `WAITING_HUMAN` con `unread_count ≥ 1`, así que aparece en el filtro "esperando".
- Sin cambios de esquema ni variables nuevas.

Flujo:

1. El worker hace `claim`: toma el lock de la conversación y pasa el job a `PROCESSING`.
2. El envío corre fuera de toda transacción.
3. `settle` toma el lock de la conversación y registra `FAILED` o `UNKNOWN`. Si el bot sigue al mando con el epoch del job, `requestHuman`:
   - sube el epoch;
   - cancela los borradores pendientes del bot;
   - pasa la conversación a `WAITING_HUMAN`/`HUMAN_FIRST`;
   - cierra la sesión del asistente;
   - escribe `CONVERSATION_HANDOFF_REQUESTED`.
4. Después del commit salen `ConversationNeedsAttention` y, si corresponde, `IntegrationRevoked`, por `DB::afterCommit`.

Si el worker muere después de enviar, el reconciliador marca el job `UNKNOWN/LEASE_EXPIRED` y lo deriva igual.

## 3. Por qué esta solución

- **Carrera con el asesor:** la derivación corre en la misma transacción que registra el resultado del envío y bajo el lock de la fila de la conversación, que es el mismo serializador que usa `takeover()` (D11).
  - Si el asesor toma el control antes del `settle`, el epoch subió y el estado es `TRANSITION_PENDING` o `HUMAN_ACTIVE`. La comparación `control_epoch == epoch del job` y `estado ∈ BOT_STATES` falla y no se hace nada; `settleTransition` confirma la toma como siempre.
  - Si el `settle` va primero, la conversación queda en `WAITING_HUMAN` y la toma que llega después funciona normalmente desde ese estado.
  - Nunca se pisa a un asesor que ya tiene el control.
  - El reconciliador usa la misma función, con el mismo lock y la misma comparación.
- **Un aviso por episodio:** la primera falla sube el epoch y deja `WAITING_HUMAN`. Cualquier otra falla del mismo episodio ve un epoch distinto o un estado no-bot, así que no deriva ni avisa. Además, `requestHuman` cancela los borradores pendientes del bot. Un aviso de derivación (`handoff_notice`) que falle bajo `WAITING_HUMAN` tampoco deriva.
- **Transacción y avisos:** la derivación va en la misma transacción que el `FAILED`/`UNKNOWN`: se guardan ambas cosas o ninguna. Las notificaciones usan `DB::afterCommit`, como ya lo hacían `ConversationNeedsAttention::sendFor` e `IntegrationRevoked::sendFor`; si la transacción se revierte, no sale ningún aviso.
  - En producción, `settle` corre en una transacción de primer nivel con 3 intentos, así que un deadlock se reintenta y se registra el resultado real.
  - Si el error no es un deadlock, el job queda en `PROCESSING` hasta que vence el lease y termina en `UNKNOWN/LEASE_EXPIRED` con derivación. Se pierde el código exacto del rechazo, pero el resultado nunca se inventa como ambiguo dentro del dispatcher.
- **`UNKNOWN` (D10):** se deriva, pero no se reintenta. El ticket pide "UNKNOWN final". Sin embargo, `UNKNOWN_FINAL` solo se puede marcar con `resolve-unknown`, que exige que un asesor ya tenga el control, y en ese punto la derivación no haría nada. Para el bot, un `UNKNOWN` ya es final: el sistema nunca lo reintenta.
  - El aviso dice que no se pudo confirmar la entrega, no que el mensaje no llegó, porque puede haber llegado.
  - Si el asesor toma el control, queda en `TRANSITION_PENDING` hasta resolver el `UNKNOWN` manualmente, como antes. No se tocó `resolveUnknown`.
- **Aviso de credenciales una vez por integración y por día:** el aviso es del canal, no de cada conversación; si fallan 20 conversaciones llega uno solo. Como la clave incluye el id de la integración, cada tenant recibe el suyo. Es una simplificación deliberada, marcada con `ponytail:`: el límite es un día, no la caída concreta.
- **Alternativas descartadas:**
  - Crear una notificación nueva para administradores: ya existía `IntegrationRevoked`.
  - Deduplicar con un lock de `channel_accounts`: riesgo de deadlock con `startWithTemplate`, que bloquea el canal antes que la conversación.
  - Avisar `META_TOKEN_REVOKED` desde el dispatcher: duplicaría el aviso de `revoke()`.
  - En el reconciliador, derivar solo los jobs que actualizó el barrido en curso: si la derivación fallaba, no se reintentaba nunca.

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-rag`, contenedor `everprop-rag-php127` (PHP 8.4, MySQL 8.4, base `bellomo_crm_test`, compartida con `everprop-rag-php124`), 2026-11-14.

Tests nuevos en `everprop-api/tests/Feature/Conversations/HandoffAndDispatchTest.php`:

| Test | Cubre |
|---|---|
| `test_undeliverable_bot_reply_hands_off_to_a_person_once` (`:298`, 3 casos: `CHANNEL_NOT_CONFIGURED`, `META_TOKEN_REVOKED`, `META_HTTP_400`) | CA1 y CA2. La segunda respuesta se reclama, falla y se asienta **mientras la primera está en vuelo** (barrera dentro del transporte falso, sin `sleep`). Resultado: `WAITING_HUMAN`, epoch 2, un solo `CONVERSATION_HANDOFF_REQUESTED` (`DELIVERY_FAILED: <código>`), un solo `ConversationNeedsAttention` por destinatario y ningún texto del cliente en el push. `IntegrationRevoked` llega al admin solo con `CHANNEL_NOT_CONFIGURED`, y nunca al gerente. |
| `test_channel_credential_alert_goes_once_per_integration_and_never_to_another_tenant` (`:342`) | Dos conversaciones del mismo canal: dos derivaciones y un solo aviso de credenciales. Negativo cross-tenant: el admin del otro tenant no recibe nada y su conversación sigue en `AI_ACTIVE`. |
| `test_whatsapp_revoked_token_on_a_bot_reply_hands_off_and_tells_integration_admins_once` (`:373`) | Transporte real de WhatsApp con `Http::fake` (error 190 de Meta): `META_TOKEN_REVOKED`, integración `REVOKED`, `WAITING_HUMAN`, un `IntegrationRevoked` y un `ConversationNeedsAttention`. |
| `test_failed_advisor_reply_does_not_change_control` (`:396`) | CA3: un `FAILED` de un mensaje `USER` deja `HUMAN_ACTIVE` y no genera avisos. |
| `test_takeover_during_a_failing_bot_send_keeps_the_advisor_in_control` (`:412`) | Carrera: el asesor toma el control durante un envío que falla. Queda `HUMAN_ACTIVE` con ese asesor, sin derivación ni aviso. |
| `test_bot_reply_blocked_by_the_channel_at_claim_time_hands_off` (`:431`) | Rama de `claim()`: con el canal `PAUSED`, la conversación pasa a `WAITING_HUMAN`. |
| `test_ambiguous_bot_send_hands_off_saying_it_is_unconfirmed` (`:443`) | Envío ambiguo: motivo `DELIVERY_UNKNOWN`. El push dice "No pudimos confirmar" y nunca "no le llegó". |
| `test_error_while_handing_off_does_not_rewrite_a_known_rejection_as_unknown` (`:461`) | Falla inyectada con `DB::beforeExecuting` en el primer insert a `domain_outbox` durante el `settle` de un `META_HTTP_400`. La excepción se propaga y el job no queda en `UNKNOWN/DELIVERY_UNKNOWN`: sigue en `PROCESSING` y la conversación en `AI_ACTIVE`, sin nada escrito a medias. |
| `test_lease_expired_bot_send_is_handed_off_once_by_the_reconciler` (`:490`) | Job del bot en `PROCESSING` con lease vencido; se corre `reconcile` dos veces. Resultado: `UNKNOWN/LEASE_EXPIRED`, `WAITING_HUMAN`, un solo `CONVERSATION_HANDOFF_REQUESTED` (`DELIVERY_UNKNOWN: LEASE_EXPIRED`) y un solo `ConversationNeedsAttention`. |
| `test_two_tenants_failing_the_same_day_each_get_their_own_credential_alert` (`:509`) | Dos tenants fallan con `CHANNEL_NOT_CONFIGURED` el mismo día: cada admin recibe su aviso. |
| `test_ambiguous_delivery_is_never_retried_and_needs_manual_resolution` (ajustado) | `UNKNOWN` del bot: no se reintenta (1 llamada) y deriva. La toma posterior sigue quedando en `TRANSITION_PENDING` hasta `resolve-unknown`. |

Comandos (dentro del contenedor):

```
MSYS_NO_PATHCONV=1 docker exec everprop-rag-php127 sh -c 'HOME=/tmp php artisan test --filter=HandoffAndDispatchTest'
MSYS_NO_PATHCONV=1 docker exec everprop-rag-php127 sh -c 'HOME=/tmp php artisan test --filter="AgentTurnTest|CopilotTest|AiSettingsTest|QueueDispatchFlowTest|WhatsAppGeminiFlowTest|WhatsAppWebhookReceiptTest"'
MSYS_NO_PATHCONV=1 docker exec everprop-rag-php127 sh -c 'HOME=/tmp php artisan test'
MSYS_NO_PATHCONV=1 docker exec everprop-rag-php127 sh -c 'HOME=/tmp vendor/bin/pint --test'
MSYS_NO_PATHCONV=1 docker exec everprop-rag-php127 sh -c 'HOME=/tmp vendor/bin/phpstan analyse --memory-limit=1G'
```

Resultados después de la revisión:

- `HandoffAndDispatchTest`: 23 passed (195 assertions).
- Tests que ejercitan `everprop:conversations:reconcile` (`AgentTurnTest`, `CopilotTest`, `AiSettingsTest`, `QueueDispatchFlowTest`, `WhatsAppGeminiFlowTest`, `WhatsAppWebhookReceiptTest`): 69 passed (896 assertions).
- Suite completa: 1 failed, 1 skipped, 577 passed (5258 assertions), 219 s. La única falla, `WhatsAppParallelQueueTest > four workers drain two hundred conversations…` (15 de 100 runs `SUCCEEDED`), lanza workers reales sobre la base compartida. Repetida sola dio 1 passed (1015 assertions); se atribuye a interferencia de `everprop-rag-php124`.
- Pint: PASS (340 files).
- PHPStan: `[OK] No errors`.
- Frontend: sin cambios; no se corrieron `lint` ni `build`.

Antes de la revisión, la suite completa se corrió dos veces:

- Primera corrida: 5 failed, 569 passed. Los errores fueron deadlocks y sesiones de widget sin token. Las 4 clases afectadas, repetidas juntas: 54 passed.
- Segunda corrida: 1 failed, 573 passed. Fue un deadlock en `ContactIdentityResolver`; `AgentTurnTest` repetido: 24 passed.

En ambos casos se atribuye a la interferencia del otro contenedor que usa la misma base.

### Revisión `tenant-isolation-reviewer`

Sin bloqueantes ni hallazgos altos: aislamiento, D10/D11, orden de locks y atomicidad, sin observaciones. Hallazgos cerrados:

| Hallazgo | Cambio |
|---|---|
| 1 (medio): el worker que muere después de enviar no deriva | `ReconcileConversations.php:37-52` + `handOffUndelivered` público (`OutboundDispatcher.php:198`); test `:490`. |
| 2 (medio): `settle()` dentro del `try`, así que un error en la derivación reescribía un rechazo conocido como `UNKNOWN` | `OutboundDispatcher.php:38-56`, `settle` fuera del `try`; test `:461`. |
| 3 (medio): con `UNKNOWN`, el aviso afirmaba "no le llegó" | Motivo `DELIVERY_UNKNOWN` (`OutboundDispatcher.php:207`, `ConversationNeedsAttention.php:110`); test `:443`. |
| 4 (bajo): el texto del aviso de credenciales afirmaba un problema de acceso | Texto neutro en `IntegrationRevoked.php:51`. |
| 5 (bajo): faltaba el test de dos tenants el mismo día | Test `:509`. |

No verificado: comportamiento en staging con tokens reales de Meta (no se conectó a Meta ni a staging).

## 5. Pendientes y riesgos

- **`FAILED` asincrónico de Meta** (`MetaWebhookProcessor::applyStatus`): Meta acepta el envío (`SENT`) y después informa `failed` por webhook. En WhatsApp es el modo de falla más común: 131047 (fuera de la ventana de 24 h) y 131026 (destinatario no alcanzable). Hoy eso no deriva. Agregarlo exige tomar el lock de la conversación antes del de `messages`, invirtiendo el orden actual de ese camino. Se propone como ticket aparte.
- Si `settle` falla por algo que no es un deadlock, el resultado conocido (por ejemplo `META_HTTP_400`) termina como `UNKNOWN/LEASE_EXPIRED` cuando vence el lease. Se deriva igual, pero se pierde el código exacto.
- `CHANNEL_INACTIVE` (canal pausado o desconectado a propósito) deriva, pero no avisa a los administradores de integraciones. Se interpretó como una decisión del tenant.
- Revisar en el PR que el aviso diario de credenciales (`ponytail:`) sea suficiente para producto.
- Producción: este módulo no va a `main`. Para staging no hay forwards ni variables nuevas.
