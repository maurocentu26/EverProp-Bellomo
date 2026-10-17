# EVP-38 — Responder último mensaje del lead al delegar conversación a la IA

Rama `ticket/EVP-38-responder-al-delegar-ia`, desde `develop` `9dff877` · 2026-10-17 · Antigravity con Mauro Centurión.
Jira: https://eversys.atlassian.net/browse/EVP-38, asignado a Mauro Centurión.

## 1. Qué pedía el ticket

Cuando un asesor delega nuevamente la conversación a la IA (`resume`), el sistema debe verificar cuál fue el último mensaje de la conversación (ignorando notas internas `INTERNAL` y envíos cancelados `CANCELLED`). Si el último mensaje fue enviado por el lead (`INBOUND` de texto), la IA debe procesarlo y responder inmediatamente. Si el último mensaje fue enviado por el asesor o el bot (`OUTBOUND`), debe quedar a la espera de una nueva respuesta del lead.

## 2. Qué se implementó

- **`everprop-api/app/Domain/Conversations/Services/ConversationControl.php` (`resume`):**
  - Dentro de la transacción de reanudación (bajo el lock de la fila de `conversations`), consulta el último mensaje de la conversación que sea `INBOUND` o `OUTBOUND` con `delivery_status != 'CANCELLED'` (excluyendo notas internas `INTERNAL`).
  - Si ese último mensaje es `direction === 'INBOUND'`, `message_type === 'TEXT'` y posee texto no vacío, guarda su `sequence`, archiva cualquier `provider_run_id = turn:{conversationId}:{sequence}` de épocas previas (`:e{control_epoch}`) para preservar la idempotencia en la nueva época, y tras confirmar la transacción despacha `RunAgentJob::dispatch($tenantId, $conversationId, $pendingSequence)`.
  - Si el último mensaje fue `OUTBOUND` (por ejemplo, el asesor ya le contestó antes de delegar), no despacha `RunAgentJob` y espera a que el lead vuelva a escribir.
- **`everprop-api/tests/Feature/Conversations/HandoffAndDispatchTest.php`:**
  - Verifica que al delegar luego de una respuesta del asesor (`OUTBOUND`) no se encola `RunAgentJob` (`Queue::assertNothingPushed()`).
  - Verifica que al delegar cuando el último mensaje no interno es del lead (`INBOUND`, aun habiendo una nota interna `INTERNAL` posterior), sí se encola `RunAgentJob` apuntando a la secuencia del mensaje del lead.

## 3. Por qué esta solución

- **Filosofía Ponytail:** se resuelve en el único punto de escritura de la transición (`ConversationControl::resume`), reutilizando `RunAgentJob` y el mismo filtro de mensajes efectivos que usa `AgentCoordinator::history()`, sin agregar tablas, colas ni endpoints adicionales.

## 4. Cómo se verificó

- **PHPUnit (`tests/Feature/Conversations/HandoffAndDispatchTest.php`):** 10 tests pasados al 100%.
- **Laravel Pint (`vendor/bin/pint --dirty`):** PASS.
- **PHPStan (`vendor/bin/phpstan analyse`):** 0 errores.

## 5. Pendientes y riesgos

- Sin pendientes para este alcance. Los ajustes de UI de la bandeja (`EVP-39`) y la confirmación previa de alta de lead (`EVP-40`) se abordan en sus respectivos tickets.
