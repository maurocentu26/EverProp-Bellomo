# EVP-142: mensajes que llegan fuera de orden

Rama `ticket/EVP-142-orden-mensajes`, creada desde `develop` @ `57af421` · 2026-11-16 · Ramiro Ruggeri con Claude

## Problema

Hallazgo RES-07 de la auditoría QA de staging del 2026-11-12. Meta puede entregar los webhooks fuera de orden. En la prueba, el mensaje 2 llegó antes que el mensaje 1, aunque el 1 se había escrito un minuto antes. Como `sequence` se asigna al recibir, el 2 quedó con `sequence` 1 y la bandeja mostró la conversación invertida.

Hay además un efecto que el ticket no mencionaba: **el asistente también leía el historial por `sequence`**. Recibía la conversación invertida y podía entender mal qué le preguntaban.

## Decisión

`sequence` sigue siendo el orden de recepción y el cursor del polling, y no se toca, porque reasignarlo rompería la idempotencia, los cursores y las referencias. El orden real se calcula aparte con una sola regla:

- **Mensajes entrantes:** cuentan desde el timestamp del canal (`occurred_at`), con un tope en el momento en que lo recibimos (`created_at`). Un timestamp con fecha futura no puede adelantarse a mensajes que ya recibimos; es el mismo tope que ya usa `ChannelPolicy`.
- **Mensajes propios** (asistente, asesor, notas): cuentan desde su `occurred_at`.
- **Empates:** decide `sequence`.

La regla vive en un solo lugar, `InboundMessageService::chronologicalAt()`. La usan el panel y el asistente.

## Cambios

| Dónde | Qué |
|---|---|
| `InboundMessageService::chronologicalAt()` | La regla de arriba. |
| `AdminConversationController::messages` | Agrega `order_at` a cada mensaje. Las páginas siguen en orden de `sequence`, así que el polling no pierde mensajes. |
| `AgentCoordinator::history()` | Toma la misma ventana de mensajes que antes. Los mensajes del cliente se ordenan por momento real, pero solo dentro del grupo que respondió cada respuesta (los entrantes recibidos antes de ella). Las respuestas no se mueven y un mensaje tardío nunca salta por encima de una respuesta. Así cada turno se lee como lo vio el modelo al responder, y el grupo sin responder cierra el turno con lo que escribió el cliente. |
| `conversations-api.ts` | `mergeMessages` ordena por `order_at` y desempata por `sequence`. `threadCursor` toma el `sequence` más alto, porque el último que se dibuja ya no es siempre el último recibido. `lateSequences` detecta los entrantes que llegaron tarde. |
| `ConversationInbox.tsx` + `admin-design.css` | Los mensajes que llegaron tarde muestran "Llegó tarde", con un ícono y un texto que lo explica. El asesor entiende por qué aparece un mensaje más arriba de lo que esperaba, aunque ya haya respondido. |

## Verificación

Stack aislado `everprop-rag` (PHP 8.4, MySQL 8.4), contenedor `everprop-rag-php142`.

### Backend

`AgentTurnTest::test_messages_delivered_out_of_order_reach_the_model_in_real_order` cubre:
- "¿y el precio?" llega antes que "Me interesa el L-101" y el modelo los recibe en el orden real. Sin el cambio, el test falla.
- El último mensaje que recibe el modelo es del cliente.
- La API de la bandeja mantiene las páginas por `sequence` y devuelve un `order_at` correcto.
- Un timestamp futuro queda acotado a la recepción; los mensajes propios conservan su hora.

También:
- `AgentTurnTest` completo: 26 passed.
- Pint PASS y PHPStan sin errores.
- El mismo test cubre un mensaje escrito una hora antes que llega después de una respuesta: se responde al final y, en el turno siguiente, sigue pegado a su propia respuesta. No salta por encima de turnos anteriores.
- Suite completa: **604 passed, 1 skipped** (5704 assertions).

### Frontend

- Test nuevo en `tests/conversations-api.test.mjs`: el mensaje que llega tarde se dibuja donde corresponde y se marca; el polling retoma desde el `sequence` más alto; con la misma hora, decide el orden de recepción y no se marca nada.
- Se agregó `lateSequences` al stub de la API en `conversation-composer.test.mjs`.
- `node --test` sobre todos los archivos `tests/*.test.mjs`: 223 pasan y 1 falla. La falla, `assistant-trace.test.mjs`, ocurre igual en `develop` sin este cambio: la regex marca un comentario de `AssistantTrace.tsx` que menciona `innerHTML`. Queda fuera de este ticket.
- `tsc --noEmit` sin errores.
- ESLint sin errores sobre los archivos tocados. Queda 1 advertencia previa, que no es de este cambio (`react-hooks/set-state-in-effect`, línea 378).

## Revisiones

### `llm-security-reviewer`

No encontró hallazgos altos.

| Hallazgo | Severidad | Resolución |
|---|---|---|
| M1: reordenar por momento real lo ya respondido separaba cada respuesta de su pregunta. Un entrante con fecha vieja podía quedar pegado al "sí" de una respuesta anterior. | Media | Se ordena solo dentro del grupo de cada respuesta. Test de dos turnos. |
| B3: los timestamps de Meta no tienen milisegundos y los nuestros sí, así que aparecía "Llegó tarde" en falso dentro del mismo segundo. | Baja | El panel compara al segundo; en un empate decide `sequence`. |
| B4: la hora y el separador de día usaban `at` sin el tope. | Baja | Se muestra `order_at`, la misma hora por la que se ordena. |
| B5: quedó un docblock fuera de lugar en `InboundMessageService`. | Baja | Corregido. |
| B1: si el último mensaje entrante es solo una foto, el historial puede terminar en `assistant`. | Baja, previo al cambio | Pasaba igual antes. Este cambio no lo empeora (lo verificó el revisor). Queda como pendiente. |
| B2: un envío del asesor que es solo un adjunto no cuenta como respuesta. | Baja, previo al cambio | Pendiente. Como mucho, el modelo vuelve a considerar mensajes ya atendidos. |

### Aislamiento

No cambia ningún filtro de tenant ni de conversación; solo cambia el orden de filas que ya estaban filtradas. El revisor lo verificó.

## Pendientes y límites

- **Vista previa de la bandeja y estado "esperando respuesta":** siguen usando `sequence`. Un mensaje que llega tarde sí es lo último que recibimos y sí espera respuesta, así que es correcto.
- **Chat web:** no cambia. Sus mensajes los genera nuestro servidor y llegan en orden.
- **Producción:** no hay forwards SQL ni variables nuevas. El cambio de bandeja va con el módulo de conversaciones; lo que toca la IA no va a `main`.
