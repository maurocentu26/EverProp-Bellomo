# EVP-126 — Notificaciones: avisar cuando entra una conversación nueva de redes con la IA apagada

Rama `ticket/EVP-126-aviso-conversacion-nueva` (desde `develop` `6f412ca`) · commits: sin commit todavía (pendiente de autorización) · fecha 2026-11-14 · autor: Claude (subagente) para Ramiro Ruggeri

## 1. Qué pedía el ticket

Con la IA apagada, una conversación nueva de Instagram, Messenger o WhatsApp entraba directo en `WAITING_HUMAN` sin campana ni push. Desde EVP-120, `InboundMessageService::persist` solo avisaba al reabrir una conversación `CLOSED`, y el aviso por derivación (`ConversationControl::requestHuman`) solo ocurre con la IA encendida. En producción la IA se apaga sola mientras la cola sea `sync` (`InboundMessageService::aiAvailable`), así que el hueco es crítico.

Criterios de aceptación:

1. IA apagada, DM nuevo de IG, Messenger o WA → 1 notificación a los destinatarios correctos (los de `sendFor`).
2. Segundo y tercer mensaje del mismo episodio → 0 notificaciones nuevas.
3. Conversación cerrada que se reabre → 1 aviso, como hoy.
4. IA encendida → sin cambios.
5. El push no incluye PII.
6. Tests en `ConversationAlertsTest`.

Fuera de alcance: el apartado "Posibles leads sin respuesta" (EVP-125, ya en `develop`) y los motivos de entrega fallida (EVP-127).

## 2. Qué se implementó

- `everprop-api/app/Domain/Conversations/Services/InboundMessageService.php:51` — `aiEnabled` se lee una sola vez por mensaje, antes de la transacción (con `rescue`; si la lectura falla se toma como IA apagada). Ese valor se pasa a `persist` (`:54`) y a `lockOrCreateConversation` (`:83`, `:168`), que ya no vuelve a leerlo para decidir `control_state` y `bot_mode` de la conversación nueva (comentario en `:190`). Después de la transacción se usa la misma variable para `RunAgentJob` y para derivar conversaciones que estaban con el bot.
- `InboundMessageService.php:121-138` — el disparador, con una sola llamada a `sendFor` por mensaje:
  - Reapertura (motivo `REOPENED`, como siempre), o primer mensaje sin respuesta del episodio (`waiting_episode`) con la IA apagada en IG, Messenger o WA: aviso directo (`:132`).
  - El mismo caso en `WEB_CHAT`: aviso con tope por tenant (`:137`). Usa `RateLimiter::attempt('new-conv-alert:{tenant}', N, …, 600)` y se cuenta dentro de `DB::afterCommit`, para que un reintento de la transacción no consuma cupo dos veces. Pasado el tope no se avisa, y la conversación igual aparece en "Esperan asesor".
- `everprop-api/config/conversations.php:27` — `web_new_conversation_alerts_per_10_minutes` (env `CONVERSATIONS_WEB_NEW_CONVERSATION_ALERTS_PER_10_MINUTES`, por defecto 30). No es un secreto.
- `everprop-api/app/Domain/Conversations/Notifications/ConversationNeedsAttention.php:105` — brazo `NEW_CONVERSATION` en el `match`, con mensaje fijo ("Entró un mensaje nuevo por {canal} y nadie lo respondió todavía."). En `:117`, título fijo "Nueva conversación en {canal}". No incluye nombre, teléfono ni texto del cliente, ni siquiera para el dueño.

Flujo: webhook de Meta o widget web → `InboundMessageService::accept` → una lectura del interruptor de IA → transacción: bloquear o crear la conversación, guardar el mensaje, calcular `waiting_episode` y registrar el aviso para después del commit, además del `domain_outbox` del mensaje → commit → notificación `database` → el listener `NotificationSent` encola `SendWebPush`. El payload de pantalla bloqueada es genérico: nombre del tenant y "Un cliente espera respuesta…".

Destinatarios (sin cambios, los de `sendFor`): el dueño activo (en control o asignado) si puede atender; si es de alguien inactivo, gerentes y admins; si no tiene dueño, asesores, gerentes y admins activos del tenant.

Sin cambios de esquema. Hay una clave de configuración nueva (arriba).

## 3. Por qué esta solución

- **Reutiliza lo existente.** `waiting_episode` (EVP-L02, el mismo criterio que el aviso fuera de horario), `sendFor` (destinatarios, `afterCommit`, push sin PII) y el `RateLimiter` de Laravel que ya se usa en el login.
- **Idempotencia sin mecanismo nuevo.**
  - Las reentregas del webhook no llegan a `persist`: el mensaje se deduplica por `(tenant, channel_account, provider_message_id)`, con `existing()` y la clave única.
  - Dos mensajes simultáneos del primer contacto también dan un solo aviso. `persist` toma `FOR UPDATE` sobre la conversación (y sobre `channel_accounts` al crearla), el mismo bloqueo que ya evita repetir `sequence`. Por eso solo el primer mensaje ve `unread_count = 0`.
- **El aviso sale después del commit.** Si la transacción se revierte o se reintenta, no se avisa.
- **Chat web: avisa, con tope.** Ningún otro camino avisaba con la IA apagada: `PublicChatController` y `MetaWebhookProcessor` no notifican, y lo único que avisaba era la reapertura. Abrir sesiones anónimas es barato, así que el web lleva un tope por tenant además del throttle `public-chat` por IP. Las redes no llevan tope, porque la identidad del remitente la verifica Meta.
- **Alternativas descartadas.**
  - Avisar desde `accept` después de la transacción: obligaba a releer la conversación y abría una carrera con una toma de control.
  - Pasar el aviso por `domain_outbox`: hoy no hay un consumidor que envíe notificaciones, y la reapertura y la derivación usan el mismo `afterCommit` en proceso.
- **Límites conocidos.**
  - Si el proceso muere entre el commit y el envío, ese aviso se pierde, igual que hoy con la reapertura y la derivación. La conversación queda visible en la bandeja y en "Posibles leads sin respuesta".
  - El tope del web depende del store de caché del entorno. Con `file` y varios contenedores, cada contenedor cuenta por separado; en producción se espera Redis.

## 4. Cómo se verificó

Entorno: contenedor `everprop-rag-php126` (PHP 8.4, MySQL 8.4, base `bellomo_crm_test`), stack Docker aislado `everprop-rag`. Fecha 2026-11-14.

Tests nuevos en `everprop-api/tests/Feature/Conversations/ConversationAlertsTest.php`. Usan webhooks firmados reales de punta a punta, salvo el `:318`, que llama a `accept` directo. Ninguno se conecta a Meta.

- `:177` `test_assistant_off_first_social_message_alerts_once_per_episode` — WA, IG y Messenger, con reentrega del primer mensaje: 3 avisos (uno por conversación) a asesor, gerente y admin, con título, mensaje y `action_url` correctos. Nada para `READ_ONLY` ni para el asesor de otro tenant. Los mensajes 2 y 3 no agregan avisos. Corre con el tope del web en 0, lo que prueba que las redes no tienen tope.
- `:234` `test_assistant_off_new_episode_alerts_only_the_owner_without_client_data` — avisa solo al dueño, sin nombre, teléfono ni texto del cliente.
- `:257` `test_assistant_off_reopened_social_conversation_alerts_once` — la reapertura avisa una sola vez.
- `:273` `test_assistant_on_first_social_message_does_not_alert` — con la IA encendida, ningún aviso al entrar.
- `:286` `test_assistant_off_web_chat_alerts_once_like_social_channels` — chat web: un aviso para dos mensajes.
- `:298` `test_web_chat_new_conversation_alerts_are_capped_per_tenant` — con tope 2, tres sesiones con un mensaje cada una dan 2 avisos y 3 conversaciones en `WAITING_HUMAN`.
- `:318` `test_assistant_switched_off_between_reads_still_ends_in_exactly_one_alert` — un listener `DB::listen` actúa como barrera y apaga la IA del tenant justo después de la primera lectura del interruptor. La conversación se crea `AI_ACTIVE` y se encola el turno. El coordinador (`AgentCoordinator::handle`) ve la IA apagada y deriva. Resultado: exactamente 1 aviso.
- `:344` `test_bot_conversation_with_assistant_switched_off_alerts_once_as_handoff` — conversación con el bot, IA apagada y dos mensajes seguidos: 1 aviso de derivación (`AI_DISABLED`, título "Cliente derivado en WhatsApp") y ningún `NEW_CONVERSATION`.
- `:364` `test_new_episode_of_an_inactive_owner_alerts_only_managers_and_admins` — `NEW_CONVERSATION` con dueño inactivo: avisa a gerente y admin, no al asesor ni al dueño inactivo.

Resultados:

- `php artisan test --filter=ConversationAlertsTest`: 16 passed (125 assertions).
- Controles negativos:
  - Sin el cambio de `InboundMessageService.php` fallan los tests de redes, dueño y web.
  - Con la segunda lectura de `aiEnabled` restaurada en `lockOrCreateConversation`, `:318` falla: "Failed asserting that 0 is identical to 1".
- Suite completa (`php artisan test`, una vez): 576 passed, 7 failed, 1 skipped (5547 assertions), 265.71 s. Las 7 fallas fueron 5 de `QueueDispatchFlowTest` (deadlock 1213 al insertar en la tabla compartida `jobs` y respuestas 500 derivadas), 1 de `InstagramOnboardingTest` y 1 de `WhatsAppOnboardingTest` (409 en lugar de 201), todas sobre la base compartida `bellomo_crm_test`. Repetidas una vez (`--filter="QueueDispatchFlowTest|InstagramOnboardingTest|WhatsAppOnboardingTest"`): 48 passed (456 assertions). Se atribuyen a interferencia de otros contenedores; ninguna toca el código de este ticket. La primera corrida de la suite, antes de la revisión, dio 579 passed, 1 skipped (5568 assertions).
- `vendor/bin/pint --test`: PASS (345 files).
- `vendor/bin/phpstan analyse --memory-limit=1G`: No errors.

### Revisión

Una revisión independiente no encontró bloqueantes ni fugas entre tenants. Hallazgos y cierre:

1. **MEDIO, doble lectura de la IA.** `lockOrCreateConversation` volvía a leer `aiEnabled`. Si la IA se apagaba entre las dos lecturas, la conversación quedaba en `WAITING_HUMAN` sin ningún aviso. Cerrado en `InboundMessageService.php:83`, `:168` y `:190`: una sola decisión por mensaje. Lo prueba el test `:318`, con control negativo.
2. **MEDIO, spam desde el chat web.** Cada sesión nueva avisaba a todo el equipo, sin tope por tenant. Cerrado en `InboundMessageService.php:132-138` y `config/conversations.php:27`: tope por tenant solo para `NEW_CONVERSATION` de `WEB_CHAT`. Lo prueban los tests `:298` y `:177`.
3. **Tests que faltaban.** Se agregaron `:344` (bot con IA apagada, un solo aviso `AI_DISABLED`) y `:364` (dueño inactivo).

Revisión obligatoria pendiente: `tenant-isolation-reviewer` sobre el diff final (queries tenant-scoped, notificaciones, clave de rate limit por tenant). No toca prompts ni herramientas de IA.

No verificado: concurrencia real con dos workers en paralelo (no hay un harness multiproceso; la garantía se apoya en el bloqueo de fila existente), el push real en un dispositivo y el comportamiento en staging.

## 5. Pendientes y riesgos

- **Re-aviso al dueño por el polling de la bandeja.** El polling vuelve `unread_count` a 0 (`AdminConversationController::messages`), así que cada mensaje nuevo del cliente le avisa otra vez al dueño asignado aunque no haya respondido. Queda para otro ticket, por ejemplo usando la última respuesta humana para definir el episodio.
- **Merge con EVP-127.** Los dos tickets agregan brazos al mismo `match` de `ConversationNeedsAttention.php`. Este solo agrega una línea al principio del `match` y cambia el `return`.
- **Durabilidad del aviso** ante una caída entre el commit y el envío (ver sección 3). Hacerlo durable pide un ticket propio con un consumidor de `domain_outbox`.
- **Tope del web en staging y producción.** Confirmar que el store de caché sea compartido (Redis) y, si hace falta, ajustar `CONVERSATIONS_WEB_NEW_CONVERSATION_ALERTS_PER_10_MINUTES`.
